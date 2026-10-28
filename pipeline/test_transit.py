import unittest

from build_dataset import _aggregate_stop_service, _stops_collection, _transit_for_point, TransitIndex


class UniqueTransitEvidence(unittest.TestCase):
    def setUp(self):
        self.trips = {"a": {"route_id": "56", "direction_id": "0"}, "b": {"route_id": "56", "direction_id": "0"},
                      "c": {"route_id": "56", "direction_id": "1"}, "d": {"route_id": "75", "direction_id": "0"}}
        self.rows = [dict(trip_id=t, stop_id=s, departure_time=time) for t, s, time in [
            ("a", "1", "06:00:00"), ("a", "2", "06:02:00"), ("a", "1", "06:04:00"),
            ("b", "1", "07:00:00"), ("b", "2", "07:02:00"), ("c", "3", "25:05:00"), ("d", "4", "09:00:00")]]
        self.rows += [dict(trip_id="c", stop_id="1", pickup_type="1"), dict(trip_id="inactive", stop_id="1")]
        aggregate = _aggregate_stop_service(self.rows, self.trips, {})
        self.stops = [{"stop_id": key, "name": key, "lon": 0, "lat": 0, "x": i * 50, "y": 0, **value} for i, (key, value) in enumerate(aggregate.items())]

    def test_loops_and_nonboardable_visits_do_not_inflate_stop_trips(self):
        first = self.stops[0]
        self.assertEqual(first["trips"], 2)
        self.assertEqual(first["stop_visits"], 3)
        self.assertEqual(first["first_departure"], "06:00:00")
        self.assertEqual(first["last_departure"], "07:00:00")
        self.assertEqual(self.stops[2]["last_departure"], "25:05:00")

    def test_nearby_stops_count_unique_trips_per_route_in_both_directions(self):
        result = _transit_for_point((0, 0), self.stops)
        self.assertEqual(result["trips_within_400m"], 4)
        self.assertEqual(result["trips_by_route_400m"], {"56": 3, "75": 1})
        self.assertEqual(result, _transit_for_point((0, 0), TransitIndex(self.stops)))
        self.assertEqual(_transit_for_point((1000, 0), self.stops)["trips_within_400m"], 0)

    def test_public_groups_keep_exact_route_direction_identities_once(self):
        collection = _stops_collection(self.stops)
        groups = collection["service_groups"]
        self.assertEqual(len(groups), 3)
        self.assertEqual(sorted(t for group in groups.values() for t in group["trip_ids"]), ["a", "b", "c", "d"])
        self.assertEqual(collection["features"][0]["properties"]["service_groups"], collection["features"][1]["properties"]["service_groups"])
        self.assertNotEqual(collection["features"][0]["properties"]["service_groups"], collection["features"][2]["properties"]["service_groups"])
        self.assertEqual(_stops_collection(list(reversed(self.stops)))["service_groups"], groups)

    def test_missing_trip_identity_is_unknown_instead_of_stop_sum(self):
        stops = [{"x": 0, "y": 0, "trips": 60, "routes": ["56"], "name": "legacy"}]
        self.assertIsNone(_transit_for_point((0, 0), stops)["trips_within_400m"])


if __name__ == "__main__":
    unittest.main()
