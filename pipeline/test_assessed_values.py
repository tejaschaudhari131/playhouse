"""Assessed land and building values: approved columns only, parsed and merged onto parcels."""

import csv
import tempfile
import unittest
from pathlib import Path

import config
from data_io import parcel_features
from refresh_assessed_values import VALUE_KEYS, assessed_values, merge, read_values


class AssessedValueTests(unittest.TestCase):
    def test_value_request_is_parcel_id_status_and_values_only(self):
        self.assertEqual(config.ASSESSMENT_VALUE_FIELDS.split(","), ["PARID", "TAXCODE", "LOCALLAND", "LOCALBUILDING"])
        for fragment in config.FORBIDDEN_OUTPUT_FRAGMENTS:
            self.assertNotIn(fragment, config.ASSESSMENT_VALUE_FIELDS.lower())
        self.assertTrue(set(config.ASSESSMENT_VALUE_FIELDS.split(",")) <= set(config.ASSESSMENT_FIELDS.split(",")))

    def test_parse_values_and_tax_status(self):
        self.assertEqual(assessed_values({"LOCALLAND": "155900", "LOCALBUILDING": "177500.0", "TAXCODE": "T"}),
                         {"assessed_land": 155900, "assessed_building": 177500, "tax_status": "taxable"})
        self.assertEqual(assessed_values({"LOCALLAND": "", "LOCALBUILDING": "-5", "TAXCODE": "e"}),
                         {"assessed_land": None, "assessed_building": None, "tax_status": "exempt"})
        self.assertEqual(assessed_values({"TAXCODE": "P"})["tax_status"], "purta")
        self.assertIsNone(assessed_values({"TAXCODE": "X"})["tax_status"])

    def test_reader_rejects_unexpected_columns_and_merge_nulls_unmatched(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "values.csv"
            with path.open("w", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["PARID", "TAXCODE", "LOCALLAND", "LOCALBUILDING"])
                writer.writerow(["A1", "T", "100", "400"])
                writer.writerow(["B2", "E", "50", "0"])
            values = read_values(path, {"A1"})
            self.assertEqual(list(values), ["A1"])
            collection = {"features": [{"properties": {"pin": "A1"}}, {"properties": {"pin": "C3", "assessed_land": 9}}]}
            self.assertEqual(merge(collection, values), 1)
            self.assertEqual(collection["features"][0]["properties"]["assessed_building"], 400)
            self.assertEqual({k: collection["features"][1]["properties"][k] for k in VALUE_KEYS}, dict.fromkeys(VALUE_KEYS))
            with path.open("w", newline="") as handle:
                csv.writer(handle).writerows([["PARID", "OWNERDESC"], ["A1", "x"]])
            with self.assertRaises(RuntimeError):
                read_values(path, {"A1"})

    def test_published_parcels_carry_values(self):
        taxable = with_values = 0
        for feature in parcel_features():
            props = feature["properties"]
            self.assertIn(props.get("tax_status"), (None, "taxable", "exempt", "purta"))
            for key in ("assessed_land", "assessed_building"):
                self.assertTrue(props.get(key) is None or (isinstance(props[key], int) and props[key] >= 0))
            taxable += props.get("tax_status") == "taxable"
            with_values += props.get("assessed_land") is not None
        self.assertGreater(taxable, 100000)
        self.assertGreater(with_values, 130000)


if __name__ == "__main__":
    unittest.main()
