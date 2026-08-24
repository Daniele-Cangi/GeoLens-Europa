import importlib.util
from pathlib import Path
import struct
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "materialize_emilia_xdbtr_masks.py"
SPEC = importlib.util.spec_from_file_location("emilia_xdbtr", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def square_gpkg():
    ring = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0), (0.0, 0.0)]
    wkb = struct.pack("<BI", 1, 3) + struct.pack("<II", 1, len(ring))
    wkb += b"".join(struct.pack("<dd", *point) for point in ring)
    return b"GP" + bytes((0, 1)) + struct.pack("<i", 32632) + wkb


class EmiliaXdbtrMaterializerTest(unittest.TestCase):
    def test_decodes_geopackage_polygon_and_preserves_geometry(self):
        polygons = MODULE.decode_geopackage_geometry(square_gpkg())
        self.assertEqual(len(polygons), 1)
        self.assertTrue(MODULE.point_in_polygon((5.0, 5.0), polygons[0]))
        self.assertFalse(MODULE.point_in_polygon((15.0, 5.0), polygons[0]))
        self.assertEqual(
            MODULE.clipped_polygon_area(polygons[0], (5.0, 5.0, 15.0, 15.0)),
            25.0,
        )

    def test_scanline_rasterization_uses_frozen_row_order(self):
        polygon = MODULE.decode_geopackage_geometry(square_gpkg())[0]
        grid = {
            "bounds": [0, 0, 20, 20],
            "cellSizeM": 10,
            "width": 2,
            "height": 2,
        }
        aoi = bytes((1, 1, 1, 1))
        center = bytearray(4)
        samples = bytearray(4)
        MODULE.rasterize_polygon(polygon, center, samples, aoi, grid)
        self.assertEqual(list(center), [0, 0, 1, 0])
        self.assertEqual(list(samples), [0, 0, 16, 0])

    def test_temporal_filter_never_turns_unknown_into_zero(self):
        self.assertEqual(MODULE.integer_date(20230515112233), 20230515)
        self.assertIsNone(MODULE.integer_date(None))
        self.assertIsNone(MODULE.integer_date(2023))


if __name__ == "__main__":
    unittest.main()