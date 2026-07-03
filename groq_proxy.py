"""
Proxy local para a API do Groq.
Roda na porta 8001 e repassa requisicoes para api.groq.com.
Isso contorna o firewall corporativo que bloqueia o dominio externo.
Execute: python groq_proxy.py
"""
import http.server
import urllib.request
import urllib.error
import json
import sys

GROQ_URL = "https://api.cloudflare.com/client/v4/accounts/17add9f645d8586ef4b9e895df1ec9ea/ai/v1/chat/completions"
PORT = 8001

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[Groq Proxy] {format % args}")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/groq":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        auth = self.headers.get("Authorization", "")

        try:
            req = urllib.request.Request(
                GROQ_URL,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": auth,
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                response_body = resp.read()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(response_body)

        except urllib.error.HTTPError as e:
            error_body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(error_body)
            print(f"[Groq Proxy] Erro HTTP {e.code}: {error_body[:200]}")

        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(msg)
            print(f"[Groq Proxy] Erro: {e}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

if __name__ == "__main__":
    server = http.server.HTTPServer(("127.0.0.1", PORT), ProxyHandler)
    print(f"[Groq Proxy] Rodando em http://localhost:{PORT}/groq")
    print(f"[Groq Proxy] Repassa para: {GROQ_URL}")
    print(f"[Groq Proxy] Pressione Ctrl+C para parar.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Groq Proxy] Encerrado.")
        sys.exit(0)
