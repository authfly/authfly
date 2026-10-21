# Unit test of the Python SDK's JSON API client against a local stub server (no network).
import json, os, sys, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from authfly import AuthflyApi, AuthflyError
import authfly_contract


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body):
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps(body).encode())
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/api/v1/sign-in" and body["password"] == "pw":
            return self._send(200, {"token": "t1", "user": {"sub": "s", "email": "a@x.test"}})
        self._send(401, {"error": "invalid_credentials", "message": "no"})
    def do_GET(self):
        if self.path == "/api/v1/me" and self.headers.get("Authorization") == "Bearer t1":
            return self._send(200, {"user": {"email": "a@x.test"}})
        self._send(401, {"error": "unauthenticated", "message": "no"})


class ApiTest(unittest.TestCase):
    def test_api(self):
        srv = HTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        api = AuthflyApi(f"http://127.0.0.1:{srv.server_port}")
        tok = api.sign_in("a", "pw")["token"]
        self.assertEqual(api.me(tok)["user"]["email"], "a@x.test")
        with self.assertRaises(AuthflyError) as e:
            api.sign_in("a", "bad")
        self.assertEqual(e.exception.code, "invalid_credentials")
        srv.shutdown()

    def test_contract_types(self):
        self.assertEqual(authfly_contract.CONTRACT_VERSION, "1.0.0")
        self.assertIn("magicLink", authfly_contract.Capabilities.__annotations__)


if __name__ == "__main__":
    unittest.main()
