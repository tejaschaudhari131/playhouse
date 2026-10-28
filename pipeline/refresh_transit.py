"""Correct trip counting from the frozen source feed without refreshing other data.

    python pipeline/refresh_transit.py --gtfs pipeline/data/raw/gtfs.zip

The recorded summary service date is required. Only transit evidence fields are
patched. The older six-factor score snapshot is intentionally not recomputed;
its archived status is separate from live Studio scoring.
"""
import argparse
import hashlib
import json
from pathlib import Path

import shapely

import config
from build_dataset import TransitIndex, _stops_collection, _transit_for_point, download_transit, xy
from data_io import read_gzip, write_gzip


def refresh(gtfs_path):
    summary = json.loads((config.PROCESSED_DIR / "summary.json").read_text())
    service_date = summary.get("transit_service_date")
    if not service_date:
        raise ValueError("A recorded service date is required; do not silently use today's service")
    features = json.loads((config.PROCESSED_DIR / "neighborhoods.geojson").read_text())["features"]
    neighborhoods = [{"geom": shapely.geometry.shape(f["geometry"])} for f in features]
    transit = download_transit(neighborhoods, False, source_path=gtfs_path, service_date=service_date)
    stops = _stops_collection(transit["stops"])
    stops["feed_version"] = transit["feed_version"]
    stops["feed_valid_until"] = transit["feed_end"]
    stops["input_sha256"] = transit["input_sha256"]
    index, counts = TransitIndex(transit["stops"]), {"parcels": 0, "changed_trip_counts": 0}
    for path in sorted((config.PROCESSED_DIR / "parcels").glob("*.geojson.gz")):
        collection = read_gzip(path)
        for feature in collection["features"]:
            point = shapely.geometry.shape(feature["geometry"]).representative_point()
            evidence = _transit_for_point(xy(point.x, point.y), index)
            counts["parcels"] += 1
            counts["changed_trip_counts"] += feature["properties"].get("trips_within_400m") != evidence["trips_within_400m"]
            # Keep prior stop-distance fields intact: recomputing them from the
            # rounded published outline can move the representative point. This
            # correction is only the unique trip inventory within the radius.
            feature["properties"].update({key: evidence[key] for key in ("trips_within_400m", "trips_by_route_400m", "transit_count_method")})
        write_gzip(path, collection)
    payload = json.dumps(stops, separators=(",", ":")) + "\n"
    provenance = {
        "source": config.GTFS_URL,
        "publisher": "Pittsburgh Regional Transit",
        "license_url": "https://www.rideprt.org/business-center/developer-resources/",
        "service_date": service_date,
        "feed_version": transit["feed_version"],
        "feed_valid_until": transit["feed_end"],
        "input_sha256": transit["input_sha256"],
        "output_sha256": hashlib.sha256(payload.encode()).hexdigest(),
        "count_method": stops["count_method"],
        "counts": counts,
        "note": "Frozen schedule evidence for the recorded service date, not current live service. Unique boardable trip IDs are unioned by route across stops within 400 metres. Direction IDs, source stop names and source trip IDs are retained. Pickup prohibited rows are excluded; repeated loop visits count once. Original six-factor score snapshots are archived and are not recomputed by this evidence-only correction.",
    }
    for folder in (config.PROCESSED_DIR, config.WEB_DATA_DIR):
        (folder / "stops.geojson").write_text(payload)
        (folder / "stops.sources.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps(provenance, indent=2))
    return provenance


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gtfs", type=Path, required=True)
    refresh(parser.parse_args().gtfs)
