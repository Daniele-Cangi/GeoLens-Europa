import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "materialize_cumbria_evaluation_references.py"
SPEC = importlib.util.spec_from_file_location(
    "materialize_cumbria_evaluation_references", MODULE_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaEvaluationReferenceMaterializerTests(unittest.TestCase):
    def test_current_manifest_authorizes_reference_acquisition(self):
        manifest = json.loads(MODULE.MANIFEST_PATH.read_text(encoding="utf-8"))
        MODULE.validate_manifest(manifest)

    def test_dry_run_opens_no_reference_and_runs_no_evaluation(self):
        result = MODULE.plan()
        self.assertEqual(result["networkRequests"], 0)
        self.assertEqual(result["filesWritten"], 0)
        self.assertEqual(result["evaluationRuns"], 0)
        self.assertEqual(result["eaSelection"]["eventGroupId"], 4175)
        self.assertEqual(
            result["eaSelection"]["featureId"],
            "Recorded_Flood_Outlines.26355",
        )

    def test_ea_selection_rejects_another_event(self):
        payload = {
            "type": "FeatureCollection",
            "numberMatched": 1,
            "numberReturned": 1,
            "features": [
                {
                    "id": "Recorded_Flood_Outlines.other",
                    "properties": {},
                    "geometry": {
                        "type": "MultiPolygon",
                        "coordinates": [[[[-3.0, 54.9], [-2.99, 54.9], [-3.0, 54.9]]]],
                    },
                }
            ],
        }
        with self.assertRaisesRegex(ValueError, "identity drifted"):
            MODULE.validate_ea_geojson(json.dumps(payload).encode())

    def test_zip_inventory_rejects_traversal(self):
        payload = io.BytesIO()
        with zipfile.ZipFile(payload, "w") as archive:
            archive.writestr("../escape.shp", b"bad")
        with self.assertRaisesRegex(ValueError, "Unsafe ZIP entry"):
            MODULE.safe_zip_inventory(payload.getvalue())

    def test_zip_inventory_requires_vector_components(self):
        payload = io.BytesIO()
        with zipfile.ZipFile(payload, "w") as archive:
            archive.writestr("metadata/readme.txt", b"no vector")
        with self.assertRaisesRegex(ValueError, "shapefile components"):
            MODULE.safe_zip_inventory(payload.getvalue())

    def test_data_root_rejects_repository_and_organization_onedrive(self):
        with self.assertRaisesRegex(ValueError, "outside the Git repository"):
            MODULE.ensure_external_data_root(REPOSITORY_ROOT / "data", REPOSITORY_ROOT)
        organization_onedrive = (
            Path(REPOSITORY_ROOT.anchor)
            / "Users"
            / "example"
            / "OneDrive - Example Org"
            / "cumbria"
        )
        with self.assertRaisesRegex(ValueError, "outside OneDrive"):
            MODULE.ensure_external_data_root(
                organization_onedrive,
                REPOSITORY_ROOT,
            )

    def test_check_rejects_artifact_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            data_root = Path(directory)
            artifact = data_root / "evaluation-references" / "sources" / "sha256" / "x.zip"
            artifact.parent.mkdir(parents=True)
            artifact.write_bytes(b"drift")
            receipt = {
                "schemaVersion": MODULE.RECEIPT_SCHEMA,
                "receiptSha256": None,
                "sources": [
                    {
                        "id": "copernicus-fixture",
                        "relativePath": artifact.relative_to(data_root).as_posix(),
                        "bytes": 5,
                        "sha256": "0" * 64,
                        "inspection": {},
                    }
                ],
            }
            receipt["receiptSha256"] = MODULE.canonical_identity(
                receipt, "receiptSha256"
            )
            receipt_path = data_root / "evaluation-references" / MODULE.RECEIPT_NAME
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "identity drifted"):
                MODULE.check(data_root)


if __name__ == "__main__":
    unittest.main()
