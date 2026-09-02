import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "materialize_cumbria_dtm.py"
SPEC = importlib.util.spec_from_file_location("materialize_cumbria_dtm", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CumbriaDtmMaterializerTests(unittest.TestCase):
    def test_frozen_manifest_protocol_passes_preflight(self):
        manifest = json.loads(
            (
                REPOSITORY_ROOT
                / "tests"
                / "ground-truth"
                / "cumbria-2015"
                / "manifest.json"
            ).read_text(encoding="utf-8")
        )

        protocol = MODULE.validate_protocol(manifest)

        self.assertEqual(protocol["terrainAcquisition"]["archiveCount"], 6)
        self.assertFalse(protocol["execution"]["solverExecutionAllowed"])
        self.assertFalse(protocol["selectionIsolation"]["observedFloodGeometryLoaded"])

    def test_zip_inventory_keeps_only_supported_raster_candidates(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "fixture.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("tiles/ny3258_DTM_1m.tif", b"II-fixture")
                archive.writestr("tiles/ny3259_DTM_1m.tif", b"II-other")
            with zipfile.ZipFile(archive_path) as archive:
                entries = MODULE.validate_zip_entries(archive)
                selected = [
                    entry
                    for entry in entries
                    if Path(entry.filename).suffix.lower() in MODULE.RASTER_EXTENSIONS
                ]

        self.assertEqual(
            [entry.filename for entry in selected],
            ["tiles/ny3258_DTM_1m.tif", "tiles/ny3259_DTM_1m.tif"],
        )

    def test_zip_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "fixture.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("../escape.tif", b"unsafe")
            with zipfile.ZipFile(archive_path) as archive:
                with self.assertRaisesRegex(ValueError, "Unsafe ZIP entry"):
                    MODULE.validate_zip_entries(archive)

    def test_zip_rejects_case_insensitive_duplicate_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "fixture.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("tiles/NY3258.tif", b"one")
                archive.writestr("TILES/ny3258.TIF", b"two")
            with zipfile.ZipFile(archive_path) as archive:
                with self.assertRaisesRegex(ValueError, "Duplicate normalized"):
                    MODULE.validate_zip_entries(archive)

    def test_data_root_cannot_be_inside_repo_or_onedrive(self):
        with self.assertRaisesRegex(ValueError, "outside the Git repository"):
            MODULE.ensure_external_data_root(
                REPOSITORY_ROOT / "data" / "cumbria",
                REPOSITORY_ROOT,
            )
        with self.assertRaisesRegex(ValueError, "outside OneDrive"):
            MODULE.ensure_external_data_root(
                Path("C:/Users/example/OneDrive/cumbria"),
                REPOSITORY_ROOT,
            )

    def test_existing_archive_receipt_rejects_protocol_drift(self):
        archive = {
            "product": "lidar_tiles_dtm",
            "year": "2013",
            "resolutionMetres": 1,
            "tile": "NY3055",
            "uri": "https://example.test/terrain.zip",
            "gridRefs": ["NY3356"],
        }
        receipt = {
            "archiveIdentity": "lidar_tiles_dtm/2013/1/NY3055",
            "sourceUri": archive["uri"],
            "mappedGridRefs": archive["gridRefs"],
            "protocolSha256": "b" * 64,
            "archiveSelectionSha256": "c" * 64,
        }
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / "fixture.archive.receipt.json"
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "protocol identity drifted"):
                MODULE.find_existing_archive_receipt(
                    Path(directory),
                    archive,
                    "a" * 64,
                    "c" * 64,
                )


if __name__ == "__main__":
    unittest.main()
