import json
import threading
import unittest
import urllib.error
import urllib.request

import server


def report(**kw):
    return {"seller": "Trip.com", "displayed": 100000, "final": 104000, "baggage": False, "card": False, **kw}


class ValidateTest(unittest.TestCase):
    def test_ok(self):
        self.assertEqual(server.validate_report(report()), ("Trip.com", 100000, 104000, 0, 0))

    def test_rejects_bad_input(self):
        for bad in (report(seller=""), report(displayed="100"), report(final=10), report(card="yes"), report(displayed=True)):
            with self.assertRaises(ValueError):
                server.validate_report(bad)


class CalibrationTest(unittest.TestCase):
    def test_median_markup_after_min_samples(self):
        db = server.connect(":memory:")
        rows = [("Trip.com", 100000, 104000, 0, 0), ("Trip.com", 200000, 210000, 0, 0)]
        db.executemany("insert into reports (seller, displayed, final, baggage, card) values (?, ?, ?, ?, ?)", rows)
        self.assertFalse(server.load_rules(db)["sellers"]["Trip.com"]["verified"])  # 2건은 부족
        db.execute("insert into reports (seller, displayed, final, baggage, card) values ('Trip.com', 100000, 104000, 0, 0)")
        # 수하물 포함 신고는 보정에서 제외, 카드 수수료는 나눠서 제거
        db.execute("insert into reports (seller, displayed, final, baggage, card) values ('Trip.com', 100000, 190000, 1, 0)")
        rule = server.load_rules(db)["sellers"]["Trip.com"]
        self.assertEqual((rule["pct"], rule["verified"], rule["samples"]), (0.04, True, 3))


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.srv = server.make_server(server.connect(":memory:"), port=0)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_port}"

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def post(self, body):
        req = urllib.request.Request(self.base + "/api/reports", json.dumps(body).encode(), {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_report_roundtrip_updates_rules(self):
        for _ in range(3):
            self.assertEqual(self.post(report(seller="마이리얼트립")), (201, {"ok": True}))
        with urllib.request.urlopen(self.base + "/api/rules") as r:
            rules = json.load(r)
        self.assertTrue(rules["sellers"]["마이리얼트립"]["verified"])
        self.assertIn("대한항공", rules["airlines"])

    def test_bad_report_is_400(self):
        status, body = self.post(report(final=1))
        self.assertEqual(status, 400)
        self.assertIn("error", body)


if __name__ == "__main__":
    unittest.main()
