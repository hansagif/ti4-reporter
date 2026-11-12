"""Loopback-only static server with local CSV editing for the Season 2 admin."""

import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
DATA_PATHS = {
    f"{season}/data/{name}.csv"
    for season in ("season2", "season2-simulation")
    for name in ("games", "bans")
}
WRITE_LOCK = threading.Lock()


def digest(content):
    return hashlib.sha256(content).hexdigest()


class ReporterHandler(SimpleHTTPRequestHandler):
    def api_path(self):
        prefix = "/api/local-data/"
        path = urlsplit(self.path).path
        if not path.startswith(prefix):
            return None
        name = path[len(prefix):]
        hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        if self.headers.get("Host") not in hosts:
            self.reply(403, {"message": "Local API requires a localhost address."})
            return False
        if name not in DATA_PATHS:
            self.reply(404, {"message": "Unknown local data path."})
            return False
        return Path(self.directory) / name

    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.api_path()
        if path is False:
            return
        if path is None:
            return super().do_GET()
        try:
            content = path.read_bytes()
            self.reply(200, {"content": base64.b64encode(content).decode(), "sha": digest(content)})
        except OSError as error:
            self.log_error("Local read failed: %s", error)
            self.reply(500, {"message": "Could not read the local CSV. Check the server log."})

    def do_PUT(self):
        path = self.api_path()
        if path is False:
            return
        if path is None:
            return self.reply(404, {"message": "Unknown local data path."})
        origin = f"http://{self.headers.get('Host')}"
        if self.headers.get("Origin") != origin:
            return self.reply(403, {"message": "Local writes require a same-origin browser request."})
        if self.headers.get("Content-Type") != "application/json":
            return self.reply(415, {"message": "Expected application/json."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1_000_000:
                return self.reply(413, {"message": "Invalid or oversized local update."})
            update = json.loads(self.rfile.read(length))
            if not isinstance(update, dict) or not isinstance(update.get("content"), str) or not isinstance(update.get("sha"), str):
                raise ValueError("Expected CSV content and its original SHA.")
            content = update["content"].encode("utf-8")
            reader = csv.DictReader(io.StringIO(update["content"]), strict=True)
            required = {"game_id", "race", "type"} if path.name == "bans.csv" else {
                "game_id", "game_name", "status", "player_name", "race", "victory_points",
                "ranking", "winner", "pick_order", "speaker", "duration_days"
            }
            if not reader.fieldnames or not required.issubset(reader.fieldnames) or len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError("Missing or duplicate CSV columns.")
            rows = list(reader)
            if any(None in row or None in row.values() for row in rows):
                raise ValueError("CSV rows must match the column count.")
            with WRITE_LOCK:
                original = path.read_bytes()
                if digest(original) != update["sha"]:
                    return self.reply(409, {"message": "Local data changed. Reselect the game before retrying."})
                if path.name == "games.csv":
                    old_rows = list(csv.DictReader(io.StringIO(original.decode("utf-8"))))
                    if [(r["game_id"], r["player_name"]) for r in rows] != [(r["game_id"], r["player_name"]) for r in old_rows]:
                        raise ValueError("Games and player lineups cannot be changed.")
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
                        temporary = Path(file.name)
                        file.write(content)
                    temporary.chmod(path.stat().st_mode & 0o777)
                    os.replace(temporary, path)
                finally:
                    if temporary is not None and temporary.exists():
                        temporary.unlink()
            self.reply(200, {"content": {"sha": digest(content)}})
        except (ValueError, UnicodeError, csv.Error) as error:
            self.reply(400, {"message": str(error)})
        except OSError as error:
            self.log_error("Local save failed: %s", error)
            self.reply(500, {"message": "Could not save the local CSV. Check the server log."})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(ReporterHandler, directory=str(ROOT)))
    print(f"TI4 local reporting: http://127.0.0.1:{args.port}/season2/admin.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
