"""Verify the small, versioned HUD reference and retain its source on rebuilds.

The app imports the checked-in JSON directly. Rebuilding parcel data does not
download, refresh or reinterpret this separately dated published reference.
Run ``python pipeline/hud_income_limits.py`` to validate its shape and provenance.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


REFERENCE_PATH = Path(__file__).resolve().parents[1] / "web/lib/hudIncomeLimits.json"


def load_reference(path=REFERENCE_PATH):
    data = json.loads(Path(path).read_text())
    if data.get("schemaVersion") != 1 or data.get("program") != "HOME":
        raise ValueError("Unsupported HUD reference schema or program")
    if data.get("currency") != "USD" or data.get("period") != "annual":
        raise ValueError("HUD reference must contain annual USD income limits")
    if data.get("householdSizes") != list(range(1, 9)):
        raise ValueError("HUD reference must explicitly cover household sizes 1–8")
    limits = data.get("incomeLimits", {})
    if set(limits) != {"30", "50", "60", "80"}:
        raise ValueError("HUD reference must include the published 30/50/60/80 bands")
    for band, values in limits.items():
        if len(values) != 8 or any(type(value) is not int or value <= 0 for value in values):
            raise ValueError(f"Invalid published income values for band {band}")
        if any(a > b for a, b in zip(values, values[1:])):
            raise ValueError(f"Income limits decrease with household size for band {band}")
    for household in range(8):
        if any(limits[a][household] > limits[b][household] for a, b in zip(["30", "50", "60"], ["50", "60", "80"])):
            raise ValueError("Income bands are not ordered for a household size")
    area = data.get("area", {})
    if area.get("id") != "METRO38300M38300" or "42003" not in area.get("countyFips", []):
        raise ValueError("HUD reference must cover Pittsburgh and Allegheny County")
    if type(data.get("fiscalYear")) is not int:
        raise ValueError("HUD fiscal year is required")
    for key in ["effectiveDate", "verifiedAt"]:
        date.fromisoformat(data[key])
    sources = [data["source"], area["source"], data["medianFamilyIncome"]["source"]]
    for source in sources:
        parsed = urlparse(source["url"])
        if parsed.scheme != "https" or parsed.hostname != "www.huduser.gov" or type(source.get("page")) is not int or source["page"] < 1:
            raise ValueError("HUD reference needs an official source URL and one-based PDF page")
    if not data.get("caveats"):
        raise ValueError("HUD reference limitations are required")
    return data


def source_record(data=None):
    data = load_reference() if data is None else data
    source = data["source"]
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "id": data["id"],
        "name": source["name"],
        "url": source["url"],
        "publisher": source["publisher"],
        "pulled_at": data["verifiedAt"],
        "license": source["license"],
        "status": "published_reference",
        "notes": "Studio household-income reference only; not a parcel score input. " + source["method"],
        "fiscal_year": data["fiscalYear"],
        "effective_date": data["effectiveDate"],
        "program": data["program"],
        "area": data["area"],
        "source_page": source["page"],
        "local_reference_path": "web/lib/hudIncomeLimits.json",
        "snapshot_sha256": digest,
        "caveat": " ".join(data["caveats"]),
        "related_sources": [data["medianFamilyIncome"]["source"], *data["relatedSources"]],
    }


def register_source(sources):
    """Return a new catalog with one current HUD snapshot and its original date."""
    record = source_record()
    return [source for source in sources if source.get("id") != record["id"] and source.get("name") != record["name"]] + [record]


if __name__ == "__main__":
    reference = load_reference()
    print(f"Verified FY{reference['fiscalYear']} {reference['program']} reference: {reference['area']['name']}, 4 bands × 8 household sizes.")
