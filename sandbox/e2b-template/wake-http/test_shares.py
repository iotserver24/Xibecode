#!/usr/bin/env python3
"""Unit tests for wake-http workspace shares (no network)."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import server


class SharePathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.wd = os.path.join(self.tmp.name, "workspace")
        os.makedirs(self.wd)
        self.ok = os.path.join(self.wd, "reports")
        os.makedirs(self.ok)
        self.file = os.path.join(self.ok, "out.pdf")
        with open(self.file, "wb") as f:
            f.write(b"%PDF-1.4 test")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_relative_ok(self) -> None:
        abs_path, err = server.validate_share_path("reports/out.pdf", self.wd)
        self.assertIsNone(err)
        self.assertEqual(abs_path, os.path.realpath(self.file))

    def test_traversal_blocked(self) -> None:
        abs_path, err = server.validate_share_path("../../../../etc/passwd", self.wd)
        self.assertIsNone(abs_path)
        self.assertIn(err, ("path outside workspace", "system path blocked", "sensitive path blocked"))

    def test_env_blocked(self) -> None:
        envp = os.path.join(self.wd, ".env")
        with open(envp, "w", encoding="utf-8") as f:
            f.write("KEY=1")
        abs_path, err = server.validate_share_path(".env", self.wd)
        self.assertIsNone(abs_path)
        self.assertEqual(err, "sensitive path blocked")

    def test_missing(self) -> None:
        abs_path, err = server.validate_share_path("nope.bin", self.wd)
        self.assertIsNone(abs_path)
        self.assertEqual(err, "file not found")


class ShareStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.wd = os.path.join(self.tmp.name, "workspace")
        os.makedirs(self.wd)
        self.file = os.path.join(self.wd, "notes.txt")
        with open(self.file, "w", encoding="utf-8") as f:
            f.write("hello")
        self.store = os.path.join(self.tmp.name, "shares.json")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_create_and_reload(self) -> None:
        rec, err = server.create_share(
            "notes.txt",
            workdir=self.wd,
            shares_path=self.store,
        )
        self.assertIsNone(err)
        assert rec is not None
        self.assertEqual(rec["name"], "notes.txt")
        self.assertIn(rec["token"], rec["url"])
        self.assertTrue(rec["url"].endswith("/notes.txt") or "/notes.txt" in rec["url"])

        loaded = server.lookup_share(rec["token"], shares_path=self.store)
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertEqual(loaded["path"], os.path.realpath(self.file))

        with open(self.store, encoding="utf-8") as f:
            disk = json.load(f)
        self.assertIn(rec["token"], disk["tokens"])

    def test_url_includes_sandbox_and_name(self) -> None:
        prev = os.environ.get("E2B_SANDBOX_ID")
        os.environ["E2B_SANDBOX_ID"] = "iabc123"
        try:
            rec, err = server.create_share(
                "notes.txt",
                name="My Notes.txt",
                workdir=self.wd,
                shares_path=self.store,
            )
        finally:
            if prev is None:
                os.environ.pop("E2B_SANDBOX_ID", None)
            else:
                os.environ["E2B_SANDBOX_ID"] = prev
        self.assertIsNone(err)
        assert rec is not None
        self.assertIn("8788-iabc123.e2b.app", rec["url"])
        self.assertIn(rec["token"], rec["url"])
        self.assertIn("My%20Notes.txt", rec["url"])


class HttpShareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.wd = os.path.join(self.tmp.name, "workspace")
        os.makedirs(self.wd)
        self.file = os.path.join(self.wd, "app.zip")
        payload = b"PK\x03\x04 hello-zip"
        with open(self.file, "wb") as f:
            f.write(payload)
        self.payload = payload
        self.store = os.path.join(self.tmp.name, "shares.json")
        self._prev = (server.WORKDIR, server.SHARES_PATH)
        server.WORKDIR = self.wd
        server.SHARES_PATH = self.store
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        server.WORKDIR, server.SHARES_PATH = self._prev
        self.tmp.cleanup()

    def test_share_and_download(self) -> None:
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/share",
            data=json.dumps({"path": "app.zip"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3) as res:
            body = json.loads(res.read().decode("utf-8"))
        self.assertTrue(body.get("ok"))
        token = body["token"]
        self.assertEqual(body["name"], "app.zip")

        with urllib.request.urlopen(
            f"http://127.0.0.1:{self.port}/f/{token}/app.zip",
            timeout=3,
        ) as res:
            data = res.read()
            disp = res.headers.get("Content-Disposition") or ""
        self.assertEqual(data, self.payload)
        self.assertIn("app.zip", disp)

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(
                f"http://127.0.0.1:{self.port}/f/nope/app.zip",
                timeout=3,
            )
        self.assertEqual(ctx.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
