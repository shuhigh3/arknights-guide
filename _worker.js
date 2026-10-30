// Cloudflare Pages 高级模式中继（文件名必须是 _worker.js，且与 index.html 放在同一上传目录/仓库根）
//
// 作用：让「罗德岛攻略检索终端」页面和它需要的转发端点同源。
// 部署后打开 https://<项目名>.pages.dev 即可直接扫码登录、直接检索，无需本机代理、无需任何设置——
// 页面内置的 autoCandidates() 首选 {prefix:"/proxy?url="}、skRelayCandidates 首选 {url:"/skland"}，
// 二者都会命中本文件，因此同源即零配置。
//
// 安全：无状态转发，不记录、不落盘任何凭据；仅放行白名单目标域名（森空岛三域 + B 站两域）。
// 提示：不要把这个站点挂到 *.workers.dev 域名上（该域名在部分网络被 DNS 污染，不可达）。

const ALLOW_SKLAND = ["https://as.hypergryph.com/", "https://zonai.skland.com/", "https://web-api.skland.com/"];
const ALLOW_BILI = ["https://api.bilibili.com/", "https://search.bilibili.com/"];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function fail(msg, status) {
  return new Response(JSON.stringify({ __relay_error: msg }), { status: status || 400, headers: CORS });
}

// ---- 森空岛：POST /skland，请求体 {"method","url","headers","body"} ----
async function relaySkland(request) {
  let payload;
  try { payload = await request.json(); } catch (e) { return fail("bad request"); }
  const target = String((payload && payload.url) || "");
  if (!ALLOW_SKLAND.some((a) => target.startsWith(a))) return fail("blocked target");
  const method = String((payload && payload.method) || "GET").toUpperCase();
  const headers = Object.assign({ "User-Agent": UA, "Accept": "application/json, text/plain, */*" }, (payload && payload.headers) || {});
  const body = payload && payload.body;
  const hasBody = body !== null && body !== undefined && method !== "GET";
  if (hasBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  try {
    const r = await fetch(target, {
      method: method,
      headers: headers,
      body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
    });
    return new Response(await r.arrayBuffer(), { status: r.status, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ __relay_error: "upstream failed" }), { status: 502, headers: CORS });
  }
}

// ---- B 站检索：GET /proxy?url=<encoded> ----
async function relayBili(target) {
  if (!ALLOW_BILI.some((a) => target.startsWith(a))) return fail("blocked");
  const base = {
    "User-Agent": UA,
    "Referer": "https://www.bilibili.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9"
  };
  // 检索接口缺少 buvid3/buvid4 会返回 412，先取一次设备指纹再带上
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
  return new Response(await r.arrayBuffer(), { status: r.status, headers: CORS });
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (u.pathname === "/skland" || u.pathname === "/skland/") {
      if (request.method !== "POST") return fail("POST only", 405);
      return relaySkland(request);
    }

    if (u.pathname === "/proxy" || u.pathname === "/proxy/") {
      const target = u.searchParams.get("url");
      if (!target) return fail("missing ?url=");
      return relayBili(target);
    }

    // 其余请求交给静态资源（index.html 及其它站点文件）
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("not found", { status: 404 });
  }
};