from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "materialize_emilia_arpae_comparison.py"
)
SPEC = importlib.util.spec_from_file_location("emilia_arpae_comparison", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def declared(root, path):
    return {
        "relativePath": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": digest(path),
    }


def timestamp(start, minutes):
    return (start + timedelta(minutes=minutes)).isoformat(sep=" ")


def rainfall_rows(name, values):
    start = datetime(2023, 5, 16, tzinfo=timezone.utc)
    rows = [name, f"Inizio validità (UTC),Fine validità (UTC),{MODULE.RAINFALL_HEADER}"]
    for index, value in enumerate(values):
        rows.append(
            f"{timestamp(start, index * 60)},{timestamp(start, (index + 1) * 60)},{value}"
        )
    rows.append("")
    return rows


def hydrometry_rows(name, values):
    start = datetime(2023, 5, 16, tzinfo=timezone.utc)
    rows = [name, f"Inizio validità (UTC),Fine validità (UTC),{MODULE.HYDROMETRY_HEADER}"]
    for index, value in enumerate(values):
        point = timestamp(start, index * 15)
        rows.append(f"{point},{point},{value}")
    rows.append("")
    return rows


class EmiliaArpaeComparisonTest(unittest.TestCase):
    def fixture(self, root, rainfall_count=48):
        source = root / "source" / "arpae-dext3r"
        inputs = root / "inputs"
        source.mkdir(parents=True)
        inputs.mkdir(parents=True)
        csv_path = source / "response.csv"
        zip_path = source / "response.zip"
        rows = ["Arpae-SIMC", ""]
        rows += rainfall_rows("Forli' urbana", [0.0] + [1.0] * (rainfall_count - 1))
        forli = [2.0 + index / 100 for index in range(192)]
        forli[61] = ""
        forli[62] = ""
        forli[72:] = [""] * 120
        rows += hydrometry_rows("Forli'", forli)
        predappio = [0.5 + index / 100 for index in range(75)] + [""] * 117
        rows += hydrometry_rows("Predappio", predappio)
        rows += [
            "Nome della stazione,Rete di misura,Comune,Provincia,Regione,Nazione,Altezza (Metri sul livello del mare),Longitudine (Gradi Centesimali),Latitudine (Gradi Centesimali),Bacino",
            "Predappio,spdsra,PREDAPPIO,FORLI-CESENA,EMILIA-ROMAGNA,ITALY,124.0,11.98305,44.105018,MONTONE",
            "",
            "Nome della variabile,Unita' di misura",
            "Precipitazione cumulata su 1 ora,KG/M**2",
            "Livello idrometrico,M",
        ]
        csv_path.write_text("\n".join(rows), encoding="utf8")
        with ZipFile(zip_path, "w") as archive:
            archive.write(csv_path, csv_path.name)

        grid_path = inputs / "imerg-v07-final-48h-source-grid.json"
        grid_path.write_text(
            json.dumps(
                {
                    "status": "available",
                    "unit": "mm",
                    "sourceResolution": "0.1 degree",
                    "sourceGrid": {
                        "longitude": [11.95, 12.05],
                        "latitude": [44.15, 44.25],
                        "valueOrder": MODULE.EXPECTED_IMERG_VALUE_ORDER,
                        "precipitationMm": [[90.0, 91.0], [92.0, 93.0]],
                    },
                    "temporal": {
                        "actualWindowStart": "2023-05-16T00:00:00Z",
                        "actualWindowEnd": "2023-05-18T00:00:00Z",
                    },
                    "provenance": {
                        "dataset": "GPM_3IMERGHH",
                        "datasetVersion": "07",
                        "runType": "final",
                    },
                }
            ),
            encoding="utf8",
        )
        rain_station = {
            "stationId": "-/1204182,4422039/urbane",
            "name": "Forli' urbana",
            "latitude": 44.22039,
            "longitude": 12.04182,
        }
        hydro_stations = [
            {
                "stationId": "-/1202757,4422698/spdsra",
                "name": "Forli'",
                "latitude": 44.22698,
                "longitude": 12.02757,
            },
            {
                "stationId": "-/1198305,4410502/spdsra",
                "name": "Predappio",
                "latitude": 44.10502,
                "longitude": 11.98305,
            },
        ]
        manifest = {
            "benchmark": {
                "observationComparisonProtocols": [
                    {
                        "id": MODULE.PROTOCOL_ID,
                        "state": "protocol_frozen",
                        "calibration": False,
                        "window": {
                            "start": "2023-05-16T00:00:00Z",
                            "endExclusive": "2023-05-18T00:00:00Z",
                        },
                        "rainfall": {
                            "variableId": MODULE.EXPECTED_RAINFALL_VARIABLE,
                            "stations": [rain_station],
                        },
                        "hydrometry": {
                            "variableId": MODULE.EXPECTED_HYDROMETRY_VARIABLE,
                            "stations": hydro_stations,
                        },
                    }
                ]
            },
            "datasets": [
                {
                    "id": MODULE.OBSERVATION_DATASET_ID,
                    "requestId": "fixture-request",
                    "acquiredAt": "2026-08-25T09:58:56Z",
                    "localArtifacts": [declared(root, zip_path), declared(root, csv_path)],
                },
                {
                    "id": MODULE.IMERG_DATASET_ID,
                    "localArtifacts": [declared(root, grid_path)],
                },
            ],
        }
        manifest_path = root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf8")
        return manifest_path, zip_path, csv_path

    def test_materializes_frozen_rainfall_and_retains_blank_values_as_missing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _, _ = self.fixture(root)
            result = MODULE.materialize(root, manifest_path)
            receipt = result["receipt"]
            rainfall = receipt["rainfall"][0]
            self.assertEqual(rainfall["recordCount"], 48)
            self.assertEqual(rainfall["gaugeTotalMm"], 47.0)
            self.assertEqual(rainfall["imergTotalMm"], 93.0)
            self.assertEqual(rainfall["imergMinusGaugeMm"], 46.0)
            self.assertEqual(rainfall["sampledImergCell"]["longitude"], 12.05)
            self.assertEqual(receipt["hydrometry"][0]["missingRecordCount"], 122)
            self.assertEqual(receipt["hydrometry"][1]["recordCount"], 75)
            self.assertEqual(receipt["quality"], "available_with_incomplete_hydrometry")
            self.assertTrue((root / MODULE.RECEIPT_RELATIVE_PATH).is_file())

    def test_incomplete_rainfall_never_becomes_a_partial_valid_total(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _, _ = self.fixture(root, rainfall_count=47)
            receipt = MODULE.materialize(root, manifest_path)["receipt"]
            rainfall = receipt["rainfall"][0]
            self.assertEqual(rainfall["quality"], "incomplete_window")
            self.assertIsNone(rainfall["gaugeTotalMm"])
            self.assertIsNone(rainfall["imergMinusGaugeMm"])
            self.assertEqual(
                receipt["quality"], "incomplete_rainfall_and_hydrometry"
            )

    def test_zero_is_preserved_for_a_station_without_response_specific_rule(self):
        start = datetime(2023, 5, 16, tzinfo=timezone.utc)
        records = [
            {"start": start + timedelta(minutes=15 * index), "value": value, "line": index}
            for index, value in enumerate([0.0, 0.1, 0.2, 0.3, 0.4])
        ]
        for record in records:
            record["end"] = record["start"]
        self.assertEqual(MODULE.maximum_one_hour_rise(records), 0.4)
        result = MODULE.hydrometry_result(
            {"stationId": "zero-valid", "name": "Zero valid"},
            {"records": records},
            start,
            start + timedelta(minutes=75),
        )
        self.assertEqual(result["recordCount"], 5)
        self.assertEqual(result["missingRecordCount"], 0)

    def test_rejects_incomplete_hydrometry_timestamp_schedule(self):
        start = datetime(2023, 5, 16, tzinfo=timezone.utc)
        records = []
        for index in range(192):
            point = start + timedelta(minutes=15 * index)
            records.append(
                {"start": point, "end": point, "value": 1.0, "line": index}
            )
        records.pop(10)
        with self.assertRaisesRegex(ValueError, "192-point quarter-hour"):
            MODULE.hydrometry_result(
                {"stationId": "fixture", "name": "Fixture"},
                {"records": records},
                start,
                start + timedelta(hours=48),
            )

    def test_rejects_zip_that_does_not_match_the_pinned_csv(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, zip_path, _ = self.fixture(root)
            with ZipFile(zip_path, "w") as archive:
                archive.writestr("response.csv", "changed")
            manifest = json.loads(manifest_path.read_text(encoding="utf8"))
            manifest["datasets"][0]["localArtifacts"][0] = declared(root, zip_path)
            manifest_path.write_text(json.dumps(manifest), encoding="utf8")
            with self.assertRaisesRegex(ValueError, "differs from the pinned CSV"):
                MODULE.materialize(root, manifest_path)


if __name__ == "__main__":
    unittest.main()
