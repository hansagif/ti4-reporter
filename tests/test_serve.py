import base64
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest

from serve import ReporterHandler


class LocalServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for season in ("season2", "season2-simulation"):
            directory = self.root / season / "data"
            directory.mkdir(parents=True)
            (directory / "games.csv").write_text(
                "game_id,game_name,status,player_name,race,victory_points,ranking,winner,pick_order,speaker,duration_days\n"
                "G01,Meciul 1,scheduled,Keyser,,,,false,,,\n"
            )
            (directory / "bans.csv").write_text("game_id,race,type\n")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(ReporterHandler, directory=str(self.root)))
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, method="GET", path="season2/data/games.csv", body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request(method, "/api/local-data/" + path,
                           json.dumps(body) if body is not None else None,
                           headers if headers is not None else {"Origin": self.origin, "Content-Type": "application/json"})
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_roundtrip_and_stale_sha(self):
        status, original = self.request()
        self.assertEqual(status, 200)
        csv = base64.b64decode(original["content"]).decode()
        update = {"sha": original["sha"], "content": csv.replace("scheduled", "ongoing")}
        self.assertEqual(self.request("PUT", body=update)[0], 200)
        self.assertEqual(self.request("PUT", body=update)[0], 409)
        _, saved = self.request()
        self.assertIn("ongoing", base64.b64decode(saved["content"]).decode())
        self.assertIn("scheduled", (self.root / "season2-simulation/data/games.csv").read_text())

    def test_simulation_saves_never_change_real_season(self):
        path = "season2-simulation/data/bans.csv"
        _, original = self.request(path=path)
        self.assertEqual(self.request("PUT", path=path, body={
            "sha": original["sha"], "content": "game_id,race,type\nG01,Arborec,banned\n"
        })[0], 200)
        self.assertEqual((self.root / "season2/data/bans.csv").read_text(), "game_id,race,type\n")

    def test_rejects_cross_origin_and_missing_origin(self):
        _, original = self.request()
        body = {"sha": original["sha"], "content": base64.b64decode(original["content"]).decode()}
        for headers in [
            {"Origin": "https://example.com", "Content-Type": "application/json"},
            {"Content-Type": "application/json"},
        ]:
            self.assertEqual(self.request("PUT", body=body, headers=headers)[0], 403)

    def test_path_allowlist_and_host_check(self):
        for path in ["season1/data/games.csv", "../README.md", "season2/data/../../admin.html"]:
            self.assertEqual(self.request(path=path)[0], 404)
        self.assertEqual(self.request(headers={"Host": "example.com"})[0], 403)

    def test_invalid_csv_and_changed_lineup_do_not_write(self):
        _, original = self.request()
        csv = base64.b64decode(original["content"]).decode()
        for content in ["invalid\n", csv.replace("Keyser", "Different player"), csv.replace("Keyser", "Keyser,extra")]:
            self.assertEqual(self.request("PUT", body={"sha": original["sha"], "content": content})[0], 400)
        self.assertEqual(self.request()[1]["sha"], original["sha"])

    def test_wrong_content_type_and_invalid_body(self):
        self.assertEqual(self.request("PUT", body={}, headers={"Origin": self.origin})[0], 415)
        self.assertEqual(self.request("PUT", body={})[0], 400)
        self.assertEqual(self.request("PUT", body=[])[0], 400)


if __name__ == "__main__":
    unittest.main()
