"""Add County assessed land and building values to the processed parcels without refreshing other data.

    python pipeline/refresh_assessed_values.py
    python pipeline/refresh_assessed_values.py --csv pipeline/data/raw/assessment_values_citywide.csv

Only ASSESSMENT_VALUE_FIELDS are requested: parcel ID, tax status and the local
(City and school) land and building values. Owner, mailing and billing fields are
never requested or written. Values feed the illustrative land value tax shift.
"""
import argparse
import csv
import datetime
import json
from pathlib import Path

import config
from data_io import read_gzip, write_gzip
from util import cached_download

TAX_STATUS = {"T": "taxable", "E": "exempt", "P": "purta"}
VALUE_KEYS = ("assessed_land", "assessed_building", "tax_status")


def _number(value):
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return int(round(number)) if number >= 0 else None


def assessed_values(record):
    """Published value fields for one assessment row: local land, local building and tax status."""
    return {
        "assessed_land": _number(record.get("LOCALLAND")),
        "assessed_building": _number(record.get("LOCALBUILDING")),
        "tax_status": TAX_STATUS.get(str(record.get("TAXCODE") or "").strip().upper()),
    }


def read_values(path, pins):
    allowed = set(config.ASSESSMENT_VALUE_FIELDS.split(",")) | {"_id"}
    rows = {}
    with Path(path).open(newline="", encoding="utf-8-sig", errors="replace") as handle:
        reader = csv.DictReader(handle)
        if not set(reader.fieldnames or []).issubset(allowed):
            raise RuntimeError("Assessment value dump returned unexpected fields")
        for record in reader:
            pin = str(record.get("PARID") or "").strip()
            if pin in pins:
                rows[pin] = assessed_values(record)
    return rows


def merge(collection, values):
    """Patch value fields onto parcel features in place; unmatched parcels get explicit nulls."""
    matched = 0
    for feature in collection["features"]:
        found = values.get(feature["properties"].get("pin"))
        matched += found is not None
        feature["properties"].update(found or dict.fromkeys(VALUE_KEYS))
    return matched


def refresh(csv_path=None, refresh_download=False):
    paths = sorted((config.PROCESSED_DIR / "parcels").glob("*.geojson.gz"))
    collections = {path: read_gzip(path) for path in paths}
    pins = {f["properties"].get("pin") for c in collections.values() for f in c["features"]}
    if csv_path is None:
        csv_path = config.RAW_DIR / "assessment_values_citywide.csv"
        url = config.WPRDC_DUMP_URL.format(resource_id=config.ASSESSMENT_RESOURCE_ID) + "?fields=" + config.ASSESSMENT_VALUE_FIELDS
        cached_download(url, csv_path, refresh=refresh_download)
    values = read_values(csv_path, pins)
    counts = {"parcels": 0, "matched": 0, "taxable": 0}
    for path, collection in collections.items():
        counts["parcels"] += len(collection["features"])
        counts["matched"] += merge(collection, values)
        counts["taxable"] += sum(f["properties"].get("tax_status") == "taxable" for f in collection["features"])
        write_gzip(path, collection)
    entry = {
        "name": "Allegheny County assessed land and building values",
        "url": "https://data.wprdc.org/dataset/property-assessments",
        "publisher": "Allegheny County Office of Property Assessments, via Western Pennsylvania Regional Data Center",
        "pulled_at": datetime.date.today().isoformat(),
        "license": "See the WPRDC property assessments dataset page",
        "status": "ok",
        "notes": (
            f"Fields {config.ASSESSMENT_VALUE_FIELDS} only. LOCALLAND and LOCALBUILDING are the assessed values for local "
            "(City and school) tax purposes; TAXCODE T is taxable, E exempt and P PURTA. "
            f"{counts['matched']} of {counts['parcels']} parcels matched; {counts['taxable']} taxable. "
            "Used only for the illustrative land value tax shift. Assessed value is not market value."
        ),
    }
    for folder in (config.PROCESSED_DIR, config.WEB_DATA_DIR):
        sources_path = folder / "sources.json"
        sources = [s for s in json.loads(sources_path.read_text()) if s.get("name") != entry["name"]]
        sources_path.write_text(json.dumps([*sources, entry], indent=2) + "\n")
    print(json.dumps(counts))
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, help="Use an existing value-field dump instead of downloading")
    parser.add_argument("--refresh", action="store_true", help="Ignore the cached download")
    args = parser.parse_args()
    refresh(args.csv, args.refresh)
