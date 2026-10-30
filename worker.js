export default {
  async fetch(request) {
    const u = new URL(request.url);
    const CORS = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json; charset=utf-8"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // ---- 森空岛转发：POST /skland，请求体 {"method","url","headers","body"} ----
    if (u.pathname.endsWith("/skland") && request.method === "POST") {
      let payload;
      try { payload = await request.json(); } catch (e) { return new Response(JSON.stringify({ __relay_error: "bad request" }), { status: 400, headers: CORS }); }
      const st = String((payload && payload.url) || "");
      const skAllow = ["https://as.hypergryph.com/", "https://zonai.skland.com/", "https://web-api.skland.com/"];
      if (!skAllow.some((a) => st.startsWith(a)))
        return new Response(JSON.stringify({ __relay_error: "blocked target" }), { status: 400, headers: CORS });
      const smethod = String((payload && payload.method) || "GET").toUpperCase();
      const sh = Object.assign({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
      }, (payload && payload.headers) || {});
      const sb = payload && payload.body;
      const hasBody = sb !== null && sb !== undefined && smethod !== "GET";
      if (hasBody && !sh["Content-Type"]) sh["Content-Type"] = "application/json";
      try {
        const r = await fetch(st, { method: smethod, headers: sh, body: hasBody ? (typeof sb === "string" ? sb : JSON.stringify(sb)) : undefined });
        const b = await r.arrayBuffer();
        return new Response(b, { status: r.status, headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ __relay_error: "upstream failed" }), { status: 502, headers: CORS });
      }
    }

    const target = u.searchParams.get("url");
    if (!target) return new Response("missing ?url=", { status: 400 });
    if (!target.startsWith("https://api.bilibili.com/") && !target.startsWith("https://search.bilibili.com/"))
      return new Response("blocked", { status: 400 });
    const base = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Referer": "https://www.bilibili.com/",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9"
    };
    // B 站检索接口缺少 buvid3/buvid4 会返回 412，先取一次设备指纹再带上
    let cookie = "";
    try {
      const spi = await fetch("https://api.bilibili.com/x/frontend/finger/spi", { headers: base });
      const j = await spi.json();
      const d = (j && j.data) || {};
      if (d.b_3 && d.b_4) cookie = "buvid3=" + d.b_3 + "; buvid4=" + d.b_4;
    } catch (e) {}
    const headers = Object.assign({}, base);
    if (cookie) headers["Cookie"] = cookie;
    const r = await fetch(target, { headers });
    const body = await r.arrayBuffer();
    return new Response(body, { status: r.status, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json; charset=utf-8"
    } });
  }
};