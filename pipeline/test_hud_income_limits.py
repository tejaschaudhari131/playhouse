import copy
import json
import tempfile
import unittest
from pathlib import Path

from hud_income_limits import REFERENCE_PATH, load_reference, register_source, source_record


class HudIncomeReference(unittest.TestCase):
    def test_published_pittsburgh_rows_and_geography(self):
        data = load_reference()
        self.assertEqual(data["incomeLimits"], {
            "30": [23200, 26500, 29800, 33100, 35750, 38400, 41050, 43700],
            "50": [38650, 44200, 49700, 55200, 59650, 64050, 68450, 72900],
            "60": [46380, 53040, 59640, 66240, 71580, 76860, 82140, 87480],
            "80": [61850, 70650, 79500, 88300, 95400, 102450, 109500, 116600],
        })
        self.assertEqual(data["area"]["countyFips"], ["42003", "42007", "42019", "42051", "42125", "42129"])
        self.assertEqual(data["effectiveDate"], "2026-06-01")
        self.assertEqual(data["source"]["page"], 2)
        self.assertEqual(data["medianFamilyIncome"]["value"], 110400)
        self.assertEqual(data["medianFamilyIncome"]["effectiveDate"], "2026-05-01")
        self.assertIn("poverty-guideline", " ".join(data["caveats"]))
        self.assertIn("not a published HOME or LIHTC rent limit", " ".join(data["caveats"]))

    def test_source_registration_preserves_other_records_and_verification_date(self):
        originals = [{"name": "Existing source", "pulled_at": "2026-09-27"}]
        original_copy = copy.deepcopy(originals)
        first = register_source(originals)
        self.assertEqual(originals, original_copy)
        self.assertEqual(first[:-1], originals)
        self.assertEqual(register_source(first), first)
        record = first[-1]
        self.assertEqual(record, source_record())
        self.assertEqual(record["pulled_at"], "2026-10-26")
        self.assertEqual(record["status"], "published_reference")
        self.assertEqual(len(record["snapshot_sha256"]), 64)
        self.assertEqual(record["local_reference_path"], "web/lib/hudIncomeLimits.json")

    def test_missing_household_values_and_unofficial_provenance_are_rejected(self):
        for patch in [
            lambda data: data["incomeLimits"]["30"].pop(),
            lambda data: data["source"].update(url="https://example.com/limits.pdf"),
            lambda data: data["area"].update(countyFips=["42005"]),
            lambda data: data["incomeLimits"]["60"].__setitem__(0, 0),
        ]:
            data = load_reference()
            patch(data)
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "limits.json"
                path.write_text(json.dumps(data))
                with self.assertRaises(ValueError):
                    load_reference(path)

    def test_served_and_processed_catalogs_match_the_versioned_reference(self):
        root = REFERENCE_PATH.parents[2]
        expected = source_record()
        for relative in ["pipeline/data/processed/sources.json", "web/public/data/sources.json"]:
            records = json.loads((root / relative).read_text())
            self.assertEqual([record for record in records if record.get("id") == expected["id"]], [expected], relative)


if __name__ == "__main__":
    unittest.main()
