# -*- coding: utf-8 -*-
# 保存为 proxy.py，与 HTML 放在同一文件夹，运行：python proxy.py
# 然后浏览器访问 http://127.0.0.1:8787/ 打开页面（同源，或把检索通道选为“本机代理”）
import http.server, socketserver, urllib.request, urllib.parse, urllib.error, json, os

PORT = 8787
ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
ALLOW = ("https://api.bilibili.com/", "https://search.bilibili.com/")
# 森空岛只转发这三个域名；凭据随请求体穿过代理，代理无状态、不留存、不写日志
SK_ALLOW = ("https://as.hypergryph.com/", "https://zonai.skland.com/", "https://web-api.skland.com/")
SPI = "https://api.bilibili.com/x/frontend/finger/spi"
_cookie = {"v": ""}

def _headers():
    h = {"User-Agent": UA, "Referer": "https://www.bilibili.com/",
         "Accept": "application/json, text/plain, */*", "Accept-Language": "zh-CN,zh;q=0.9"}
    if _cookie["v"]:
        h["Cookie"] = _cookie["v"]
    return h

def _ensure_cookie():
    # B 站检索接口缺少 buvid3/buvid4 会直接返回 412，这里先取一次并全程复用
    if _cookie["v"]:
        return
    try:
        req = urllib.request.Request(SPI, headers=_headers())
        with urllib.request.urlopen(req, timeout=15) as r:
            d = (json.loads(r.read().decode("utf-8")) or {}).get("data") or {}
            if d.get("b_3") and d.get("b_4"):
                _cookie["v"] = "buvid3=%s; buvid4=%s" % (d["b_3"], d["b_4"])
    except Exception as e:
        print("获取 buvid 失败（检索可能返回 412）:", e)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        # 不写访问日志：请求路径里可能有检索关键词，森空岛凭据在请求体里
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, dict):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code); self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/proxy":
            return super().do_GET()
        target = urllib.parse.parse_qs(u.query).get("url", [""])[0]
        if not target.startswith(ALLOW):
            self._send(400, b"blocked target"); return
        if target.startswith("https://api.bilibili.com/"):
            _ensure_cookie()
        try:
            try:
                req = urllib.request.Request(target, headers=_headers())
                r = urllib.request.urlopen(req, timeout=20)
            except urllib.error.HTTPError as he:
                self._send(he.code, he.read()); return
            with r:
                self._send(200, r.read())
        except Exception as e:
            self._send(502, str(e).encode("utf-8", "ignore"))

    def do_POST(self):
        # 森空岛转发：请求体 {"method","url","headers","body"}
        # body 为字符串时原样发送，保证与页面端签名串逐字节一致
        u = urllib.parse.urlparse(self.path)
        if u.path != "/skland":
            self._send(404, b"not found"); return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
            target = (req.get("url") or "").strip()
            method = (req.get("method") or "GET").upper()
            body = req.get("body")
        except Exception as e:
            self._send(400, {"__relay_error": "bad request: %s" % e}); return
        if not target.startswith(SK_ALLOW):
            self._send(400, {"__relay_error": "blocked target"}); return
        data = None
        if body is not None and method != "GET":
            data = body.encode("utf-8") if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        h = {"User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "zh-CN,zh;q=0.9"}
        if data is not None:
            h["Content-Type"] = "application/json"
        for k, v in (req.get("headers") or {}).items():
            if isinstance(k, str) and isinstance(v, str) and v != "":
                h[k] = v
        try:
            try:
                rq = urllib.request.Request(target, data=data, headers=h, method=method)
                r = urllib.request.urlopen(rq, timeout=25)
            except urllib.error.HTTPError as he:
                self._send(he.code, he.read()); return
            with r:
                self._send(200, r.read())
        except Exception as e:
            self._send(502, {"__relay_error": "upstream failed: %s" % e})

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

print("代理已启动： http://127.0.0.1:%d/" % PORT)
Server(("127.0.0.1", PORT), Handler).serve_forever()