// Live chat between visitors on esbjugconsult.com and the owner's iPhone app.
//
// One Durable Object (ChatHub, instance "hub") holds every WebSocket: visitors (one per open tab)
// and the owner app. It knows who is on the site right now, stores conversations in its SQLite
// storage and sends a push to the owner's phone (APNs) when a visitor writes.
//
//   GET  /chat/ws?vid=<id>        visitor socket (the page opens it on load, for presence)
//   GET  /chat/admin/ws           owner socket    (Authorization: Bearer ADMIN_TOKEN)
//   POST /chat/admin/device       {token, env, topic?}  register the phone for push (topic <app>.voip: VoIP for calls,
//                                                 <app>.watchkitapp: the watch app)
//   POST /chat/admin/test-push                    send a test push to every registered phone
//   POST /chat/admin/test-call                    ring the owner's phone (VoIP) and watch as if a visitor called
//   POST /chat/admin/callcmd      {cmd, id, vid, on}  answer/decline/end/mute from the watch, passed to the phone app's socket
//   POST /chat/admin/ctl          {vid, action, on}   turn «Ring» (ring) or «Mer chat» (extras) on/off for a visitor (the watch)
//   GET  /chat/admin/devices                      registered push devices (app, env, added, token end)
//   POST /chat/admin/reset-teller                 start the unique-visitor counter over
//   POST /chat/admin/upload?vid=&name=            owner sends a file (raw body, Content-Type)
//   GET  /chat/admin/gifs?q=&offset=              Giphy search (trending when q is empty); the key (GIPHY_KEY) stays on the server
//   POST /chat/admin/gif          {vid, id}           send a Giphy GIF: the mp4 is copied to R2 and sent as a file with gif: true
//   GET  /chat/gifs?q=&offset=                    Giphy search for visitors (cached, rating pg-13)
//   POST /chat/gif                {vid, id}           a visitor sends a Giphy GIF (rate-limited in the hub)
//   POST /chat/upload?vid=&name=                  visitor sends a file (only after the owner turned on «Mer chat»)
//   GET  /chat/file/<key>                         a file from R2, with Range support (Safari needs it for audio)
//   GET  /chat/ice                                STUN + short-lived Cloudflare TURN credentials for calls
//   GET  /chat/status                             the owner's status (available/meeting/sleeping) + whether the app is open
//   POST /chat/admin/pos          {pts:[{ts,lat,lon,acc,spd,alt,hdg}]}  the owner's iPhone reports where he is (live, in the background)
//   POST /chat/admin/tele         {kilde, d}          latest readings from the owner's iPhone/watch (battery, steps, pressure …)
//   POST /chat/admin/sted-her     {navn, r}           name the place he is at now (e.g. «hjemme hos moren sin»), radius r m
//   POST /chat/kast               {k: "le" | "tomat"} a visitor laughs or throws a tomato at the map card (shared counters)
//   GET  /chat/spor                               the public map: live position, today's trail, place name and the readings
//   GET  /chat/hr                                 today's heart rate from the owner's Apple Watch (Oslo day, per minute) + live bpm
//   POST /chat/besok                              the page was shown from a prefetch/prerender: same visit push as a page load
//   POST /chat/rec                                last batch of a visit recording (sendBeacon when the page closes)
//   GET  /chat/admin/sessions[?vid=]              recorded visits (consented visitors only, kept 30 days)
//   GET  /chat/admin/session?sid=                 one recording's events, for replay in the app
//
// Location is Cloudflare's IP lookup (city/region/country/lat/lon), never the browser's GPS.

const MAX_TEXT = 2000;
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const HISTORY = 200;
const MAX_FILE = 25 * 1024 * 1024;        // visitors
const MAX_FILE_OWNER = 95 * 1024 * 1024;  // the owner (video from the phone)

export async function handleChat(request, env, url) {
  const hub = env.CHAT.get(env.CHAT.idFromName("hub"));
  const path = url.pathname;

  if (path === "/chat/ws") {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const origin = request.headers.get("Origin") || "";
    if (origin && !/^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    const vid = url.searchParams.get("vid") || "";
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(vid)) return new Response("Bad vid", { status: 400 });
    const cf = request.cf || {};
    const geo = {
      city: cf.city || "", region: cf.region || "", country: cf.country || "",
      lat: cf.latitude ? Number(cf.latitude) : null, lon: cf.longitude ? Number(cf.longitude) : null,
      tz: cf.timezone || "", org: cf.asOrganization || "",
    };
    const headers = new Headers(request.headers);
    headers.set("x-role", "visitor");
    headers.set("x-vid", vid);
    headers.set("x-geo", encodeURIComponent(JSON.stringify(geo)));
    headers.set("x-ip", request.headers.get("CF-Connecting-IP") || "");
    return hub.fetch(new Request(request.url, { headers }));
  }

  if (path.startsWith("/chat/file/")) return serveFile(request, env, path.slice("/chat/file/".length));

  if (path === "/chat/status") {
    return hub.fetch(new Request("https://hub/internal/status", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
  }

  if (path === "/chat/spor") {
    return hub.fetch(new Request("https://hub/internal/spor", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
  }

  if (path === "/chat/kast" && request.method === "POST") {
    if (!/^https:\/\/(www\.)?esbjugconsult\.com$/.test(request.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
    const body = await request.text();
    return hub.fetch(new Request("https://hub/internal/kast", { method: "POST", headers: { "x-role": "internal", "x-ip": request.headers.get("CF-Connecting-IP") || "",
      "x-by": encodeURIComponent((request.cf && request.cf.city) || "") }, body }));
  }

  if (path === "/chat/hr") {
    const r = ["dag", "uke", "mnd"].includes(url.searchParams.get("r")) ? url.searchParams.get("r") : "dag";
    return hub.fetch(new Request("https://hub/internal/hr", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ r }) }));
  }

  if (path === "/chat/besok" && request.method === "POST") {
    const origin = request.headers.get("Origin") || "";
    if (!/^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) return new Response("Forbidden", { status: 403 });
    await pageVisit(request, env, url, true);
    return new Response(null, { status: 204 });
  }

  if (path === "/chat/ice") {
    // TURN costs money per GB, so relay credentials go only to the owner app or to a visitor the owner is
    // calling right now (the hub knows). Everyone else gets STUN only.
    const owner = env.ADMIN_TOKEN && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
    let allowed = owner;
    if (!owner) {
      const origin = request.headers.get("Origin") || "";
      const vid = url.searchParams.get("vid") || "";
      // Browsers send no Origin on same-origin GETs; Sec-Fetch-Site says the same. The real gate is the in-call check.
      const ours = /^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin) || request.headers.get("Sec-Fetch-Site") === "same-origin";
      if (ours && /^[a-zA-Z0-9-]{8,64}$/.test(vid)) {
        const r = await hub.fetch(new Request("https://hub/internal/in-call", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ vid }) }));
        allowed = r.ok;
      }
    }
    return Response.json({ iceServers: allowed ? await iceServers(env) : [STUN] }, { headers: { "cache-control": "no-store" } });
  }

  if (path === "/chat/rec" && request.method === "POST") {
    const origin = request.headers.get("Origin") || "";
    if (origin && !/^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin)) return new Response("Forbidden", { status: 403 });
    const body = await request.text();
    if (body.length > 200000) return new Response("Too large", { status: 413 });
    return hub.fetch(new Request("https://hub/internal/rec", { method: "POST", headers: { "x-role": "internal" }, body }));
  }

  // GIFs for visitors: search is cached at the edge (Giphy's key has an hourly limit), sending is counted in the hub.
  if (path === "/chat/gifs") {
    const ours = /^https:\/\/(www\.)?esbjugconsult\.com$/.test(request.headers.get("Origin") || "") || request.headers.get("Sec-Fetch-Site") === "same-origin";
    if (!ours) return new Response("Forbidden", { status: 403 });
    const q = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 50);
    const key = new Request(`https://esbjugconsult.com/chat/gifs?q=${encodeURIComponent(q)}&offset=${Number(url.searchParams.get("offset")) || 0}`);
    const hit = await caches.default.match(key);
    if (hit) return hit;
    const r = await gifSearch(env, url, "pg-13");
    if (!r.ok) return r;
    const res = new Response(r.body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=900" } });
    await caches.default.put(key, res.clone());
    return res;
  }

  if (path === "/chat/gif" && request.method === "POST") {
    if (!/^https:\/\/(www\.)?esbjugconsult\.com$/.test(request.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
    const r = await gifSend(request, env, hub, false);
    if (!r.ok) console.log("chat/gif feilet", r.status, await r.clone().text());
    return r;
  }

  if (path === "/chat/upload" && request.method === "POST") {
    const origin = request.headers.get("Origin") || "";
    if (!/^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin)) return new Response("Forbidden", { status: 403 });
    return upload(request, env, url, hub, false);
  }

  if (path.startsWith("/chat/admin/")) {
    // The apps send the token as a Bearer header. The Mac panel (/panel/) is a web page, and a browser cannot set headers
    // on a WebSocket, so it sends the token as the second subprotocol: "esbjug, <token>".
    const proto = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",").map((x) => x.trim());
    const auth = request.headers.get("Authorization") || (proto[0] === "esbjug" && proto[1] ? `Bearer ${proto[1]}` : "");
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    if (path === "/chat/admin/upload" && request.method === "POST") return upload(request, env, url, hub, true);
    if (path === "/chat/admin/gifs") return gifSearch(env, url);
    if (path === "/chat/admin/gif" && request.method === "POST") return gifSend(request, env, hub);
    const headers = new Headers(request.headers);
    headers.set("x-role", "owner");
    return hub.fetch(new Request(request.url, { method: request.method, headers, body: request.body }));
  }

  return new Response("Not found", { status: 404 });
}

// ICE servers for calls: STUN always; TURN from Cloudflare Realtime when TURN_KEY_ID/TURN_KEY_TOKEN are set.
// Fresh credentials per call, valid 1 hour, so a leaked set is worthless soon after.
const STUN = { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] };
async function iceServers(env) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return [STUN];
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 3600 }),
    });
    if (!r.ok) return [STUN];
    const j = await r.json();
    const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    // TURN only (Cloudflare's reply may also contain its STUN entry, which STUN already covers).
    const servers = list.map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => u.startsWith("turn")) })).filter((s) => s.urls.length);
    return [STUN, ...servers];
  } catch {
    return [STUN];
  }
}

// Upload: the hub says yes/no (visitor needs «Mer chat»), the bytes go to R2, then the hub posts the message.
async function upload(request, env, url, hub, fromOwner) {
  const vid = url.searchParams.get("vid") || "";
  const name = (url.searchParams.get("name") || "fil").replace(/[\u0000-\u001f\/\\]/g, "").slice(0, 120) || "fil";
  const mime = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim().slice(0, 100);
  const size = Number(request.headers.get("Content-Length") || 0);
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(vid)) return new Response("Bad vid", { status: 400 });
  if (!size || size > (fromOwner ? MAX_FILE_OWNER : MAX_FILE)) return new Response("Too large", { status: 413 });
  const internal = (p, body) => hub.fetch(new Request(`https://hub${p}`, {
    method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify(body) }));
  const ok = await internal("/internal/can-upload", { vid, fromOwner });
  if (!ok.ok) return new Response(await ok.text(), { status: ok.status });
  const key = `${vid}/${crypto.randomUUID()}`;
  const obj = await env.FILES.put(key, request.body, {
    httpMetadata: { contentType: mime, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}` },
    customMetadata: { vid, name, owner: fromOwner ? "1" : "0" },
  });
  const r = await internal("/internal/file", { vid, fromOwner, key, mime, name, size: obj.size });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

// GIFs from Giphy. Search returns small animated previews for the app's picker; sending copies the GIF's mp4
// into R2 like any other file, so the visitor's page never talks to Giphy and old messages keep working.
async function giphy(env, path, params = {}) {
  const q = new URLSearchParams({ api_key: env.GIPHY_KEY, ...params });
  const r = await fetch(`https://api.giphy.com/v1/gifs${path}?${q}`);
  if (!r.ok) throw new Error(`Giphy ${r.status}`);
  return r.json();
}

async function gifSearch(env, url, rating = "r") {
  if (!env.GIPHY_KEY) return new Response("GIPHY_KEY mangler", { status: 503 });
  const q = (url.searchParams.get("q") || "").trim().slice(0, 50);
  const offset = String(Math.max(0, Math.min(4999, Number(url.searchParams.get("offset")) || 0)));
  try {
    const j = await giphy(env, q ? "/search" : "/trending", { ...(q ? { q } : {}), limit: "30", offset, rating, bundle: "messaging_non_clips" });
    const gifs = (j.data || []).map((g) => {
      const im = g.images || {}, p = im.fixed_width_small || im.fixed_width || im.original || {};
      return { id: g.id, title: g.title || "", w: Number(p.width) || 100, h: Number(p.height) || 100, preview: p.url || "" };
    }).filter((g) => g.preview);
    return Response.json({ gifs, next: Number(offset) + (j.pagination?.count || 0), total: j.pagination?.total_count || 0 });
  } catch (e) {
    return new Response(String(e.message || e), { status: 502 });
  }
}

async function gifSend(request, env, hub, fromOwner = true) {
  if (!env.GIPHY_KEY) return new Response("GIPHY_KEY mangler", { status: 503 });
  const { vid, id } = await request.json().catch(() => ({}));
  if (typeof vid !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(vid) || typeof id !== "string" || !/^[a-zA-Z0-9]{4,40}$/.test(id)) {
    return new Response("Bad request", { status: 400 });
  }
  if (!fromOwner) {
    const ok = await hub.fetch(new Request("https://hub/internal/can-gif", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ vid }) }));
    if (!ok.ok) return new Response(await ok.text(), { status: ok.status });
  }
  let g;
  try { g = (await giphy(env, `/${id}`)).data; } catch (e) { return new Response(String(e.message || e), { status: 502 }); }
  const im = g?.images || {};
  // The full GIF as mp4 when it is reasonably small, otherwise Giphy's smaller cut.
  const pick = [im.original, im.downsized_small, im.fixed_height].find((x) => x?.mp4 && (!x.mp4_size || Number(x.mp4_size) < 8e6));
  if (!pick) return new Response("Ingen mp4 for denne GIF-en", { status: 502 });
  const media = await fetch(pick.mp4);
  if (!media.ok) return new Response(`Giphy media ${media.status}`, { status: 502 });
  const body = await media.arrayBuffer();
  const name = `GIF ${(g.title || "").replace(/\s+GIF.*$/i, "").replace(/[\u0000-\u001f\/\\]/g, "").trim().slice(0, 80) || id}.mp4`;
  const key = `${vid}/${crypto.randomUUID()}`;
  await env.FILES.put(key, body, {
    httpMetadata: { contentType: "video/mp4", contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}` },
    customMetadata: { vid, name, owner: fromOwner ? "1" : "0", giphy: id },
  });
  const r = await hub.fetch(new Request("https://hub/internal/file", {
    method: "POST", headers: { "x-role": "internal" },
    body: JSON.stringify({ vid, fromOwner, key, mime: "video/mp4", name, size: body.byteLength, gif: true }) }));
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

async function serveFile(request, env, key) {
  if (!/^[a-zA-Z0-9-]{8,64}\/[0-9a-f-]{36}$/.test(key)) return new Response("Not found", { status: 404 });
  const range = request.headers.get("Range");
  const obj = await env.FILES.get(key, range ? { range: request.headers } : {});
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=31536000, immutable");
  if (range && obj.range) {
    const start = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}

// Oslo wall-clock time for a timestamp.
export function osloTime(ts) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts));
  return { hour: Number(parts.find((p) => p.type === "hour").value), minute: Number(parts.find((p) => p.type === "minute").value) };
}

// A visit notification straight from the browser's request for the page itself: no cookie, no script, nothing stored
// on the device or here. Only real navigations to the two pages count (not prefetch, bots, or the app's mirror view).
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|java\//i;
// preloaded: the page was shown from a prefetch/prerender (the browser sent no request on the click), so the page itself
// reports it with POST /chat/besok and the navigation checks don't apply.
// Signs that a visitor is a robot rather than a person: a data-centre network, an automated browser, a Chrome that is years
// old, no language. Such visitors only count (and only show in «her nå») after a real interaction with the page.
const DC = /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai|oracle|alibaba|tencent|vultr|choopa|constant company|scaleway|contabo|leaseweb|m247|datacamp|hostinger|ionos|zenlayer|psychz|quadranet|colocrossing|frantech|cogent|hostroyale|servers australia|worldstream|g-core|gcore/i;
export function robotHint({ ua, lang, org, webdriver }) {
  if (webdriver) return "automatisert nettleser";
  const c = /Chrome\/(\d+)/.exec(ua || "");
  if (c && Number(c[1]) < 130 && !/Edg|OPR|SamsungBrowser|YaBrowser/.test(ua)) return "gammel Chrome";
  if (!lang) return "ingen språk";
  if (DC.test(org || "")) return "datasenter";
  return "";
}

export function pageVisit(request, env, url, preloaded = false) {
  const h = request.headers;
  if (!preloaded) {
    if (request.method !== "GET" || !/^\/(en\/)?(index\.html)?$/.test(url.pathname) || url.searchParams.has("speil")) return null;
    if (h.get("Sec-Fetch-Mode") !== "navigate" || h.get("Sec-Fetch-Dest") !== "document") return null;
    if (/prefetch|prerender/i.test((h.get("Sec-Purpose") || "") + (h.get("Purpose") || ""))) return null;
  }
  const ua = (h.get("User-Agent") || "").slice(0, 300);
  if (!ua || BOT.test(ua)) return null;
  const cookie = h.get("Cookie") || "";
  if (/(?:^|;\s*)esbjug_eier=1(?:;|$)/.test(cookie) || url.searchParams.has("eier")) return null;
  const vid = /(?:^|;\s*)esbjug_samtykke=ja(?:;|$)/.test(cookie) && (cookie.match(/(?:^|;\s*)esbjug_id=([a-zA-Z0-9-]{8,64})(?:;|$)/) || [])[1] || "";
  const cf = request.cf || {};
  const body = JSON.stringify({ vid, ip: h.get("CF-Connecting-IP") || "", city: cf.city || "", country: cf.country || "", ua });
  const hub = env.CHAT.get(env.CHAT.idFromName("hub"));
  return hub.fetch(new Request("https://hub/internal/visit", { method: "POST", headers: { "x-role": "internal" }, body })).catch(() => {});
}

// The network a visitor comes from: an IPv4 address as is, an IPv6 address as its /64 prefix.
export function pokeNet(ip) {
  if (!ip.includes(":")) return ip;
  const [a, b = ""] = ip.split("::");
  const h = a ? a.split(":") : [], t = b ? b.split(":") : [];
  return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t].slice(0, 4).join(":");
}

// Oslo midnight (as a UTC timestamp) for the Oslo day that ts falls in. Oslo is UTC+1 or UTC+2, so midnight is
// one of two candidates; the right one is the candidate that reads 00:00 in Oslo (also on the DST change days).
// The Oslo calendar day of ts as YYYY-MM-DD.
export function osloDay(ts) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date(ts));
}

async function sha256hex(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function osloMidnight(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const utc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  for (const h of [1, 2]) {
    const t = utc - h * 3600e3, o = osloTime(t);
    if (o.hour === 0 && o.minute === 0) return t;
  }
  return utc - 3600e3;
}

// Next :00/:15/:30/:45 after ts (Oslo is a whole-hour offset from UTC, so UTC quarters line up).
export function nextQuarter(ts) {
  return Math.floor(ts / 900e3) * 900e3 + 900e3;
}

// What the automatic status should change to, or null for no change.
export function autoStatus({ hour, minute, status, autoSlept, active }) {
  const night = hour >= 21 || hour < 4;
  if (night) return status !== "sleeping" && !active ? "sleeping" : null;
  // Daytime: wake up at 04:00 (any «sleeping»), and later only undo a night-time automatic sleep.
  if (status === "sleeping" && ((hour === 4 && minute < 15) || autoSlept)) return "available";
  return null;
}

export class ChatHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visitors (
      vid TEXT PRIMARY KEY, first_seen INTEGER, last_seen INTEGER,
      city TEXT, region TEXT, country TEXT, lat REAL, lon REAL, tz TEXT,
      ua TEXT, page TEXT, lang TEXT, unread INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, vid TEXT, from_owner INTEGER, text TEXT, ts INTEGER)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS messages_vid ON messages (vid, id)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS devices (token TEXT PRIMARY KEY, env TEXT, added INTEGER)`);
    for (const col of ["kind TEXT", "file TEXT", "mime TEXT", "name TEXT", "size INTEGER", "gif INTEGER", "rv TEXT", "ro TEXT"]) {
      try { this.sql.exec(`ALTER TABLE messages ADD COLUMN ${col}`); } catch {}
    }
    try { this.sql.exec(`ALTER TABLE visitors ADD COLUMN extras INTEGER DEFAULT 0`); } catch {}
    try { this.sql.exec(`ALTER TABLE visitors ADD COLUMN ring INTEGER DEFAULT 0`); } catch {}   // «Ring Tidemann» shown, owner's choice
    try { this.sql.exec(`ALTER TABLE devices ADD COLUMN topic TEXT`); } catch {}   // iPhone app or watch app bundle id
    // Visit recordings: one row per page visit, events in chunks (arrays of snapshots, JSON).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY, vid TEXT, start INTEGER, last INTEGER, dur INTEGER DEFAULT 0, events INTEGER DEFAULT 0,
      vw INTEGER, vh INTEGER, page TEXT, ref TEXT, city TEXT, country TEXT, ua TEXT, maxpct INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS sessions_vid ON sessions (vid, start)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rec (sid TEXT, seq INTEGER, data TEXT, PRIMARY KEY (sid, seq))`);
    this.pruned = 0;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
    // Heart rate samples from the owner's Apple Watch, for the graphs on the site. Kept 35 days.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hr (ts INTEGER PRIMARY KEY, bpm INTEGER)`);
    // The owner's position from his iPhone (raw, private). The public map only gets what sporPublic() lets through.
    // How much the phone moves, every 5 s (for the movement graph on the map page). Kept a day.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bev (ts INTEGER PRIMARY KEY, v REAL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pos (ts INTEGER PRIMARY KEY, lat REAL, lon REAL, acc REAL, spd REAL, alt REAL, hdg REAL)`);
    // Today's unique visitors for the counter on the site (salted hashes, emptied every Oslo midnight).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS uniq (day TEXT, k TEXT, net TEXT, PRIMARY KEY (day, k))`);
    try { this.sql.exec(`ALTER TABLE uniq ADD COLUMN n INTEGER`); } catch {}   // the visitor's number that day
    // Visitor numbers for consented visitors (cookie id), kept so the site can say «Du var nr. 15» on later visits.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS nr (vid TEXT PRIMARY KEY, n INTEGER)`);
    if (this.setting("uniqTotal") == null) {
      // Start the counter from what the site has already seen: each browser once per day, robots and test runs left out.
      const rows = this.sql.exec(`SELECT DISTINCT CAST(first_seen / 86400000 AS INTEGER) AS d, city, ua FROM visitors`).toArray();
      const n = rows.filter((r) => r.ua && !BOT.test(r.ua)).length;
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('uniqTotal', ?)`, String(n));
    }
    this.hrSaved = 0;
    this.hrPruned = 0;
    this.jwt = null;
    this.pushLog = [];          // times of recent pushes (global cap)
    this.pushLast = new Map();  // vid -> last push time
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = request.headers.get("x-role");

    if (role === "visitor") {
      const vid = request.headers.get("x-vid");
      const geo = JSON.parse(decodeURIComponent(request.headers.get("x-geo") || "%7B%7D"));
      const now = Date.now();
      // Page loads are notified from the HTML request itself (pageVisit), for every visitor. The socket only adds a
      // push when an open page comes back after more than 2 minutes away (in the background on a phone). The page sends
      // ny=1 on its first socket, which was already notified; plain reconnects after a network blip don't count.
      const prev = this.sql.exec(`SELECT last_seen FROM visitors WHERE vid=?`, vid).toArray()[0];
      const pageLoad = url.searchParams.get("ny") === "1";
      const newVisit = !pageLoad && !this.online(vid) && !!prev && now - prev.last_seen > 2 * 60e3;
      const ua = (request.headers.get("User-Agent") || "").slice(0, 300);
      const lang = (request.headers.get("Accept-Language") || "").split(",")[0].slice(0, 20);
      this.sql.exec(
        `INSERT INTO visitors (vid, first_seen, last_seen, city, region, country, lat, lon, tz, ua, lang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(vid) DO UPDATE SET last_seen=excluded.last_seen, city=excluded.city, region=excluded.region,
           country=excluded.country, lat=excluded.lat, lon=excluded.lon, tz=excluded.tz, ua=excluded.ua, lang=excluded.lang`,
        vid, now, now, geo.city, geo.region, geo.country, geo.lat, geo.lon, geo.tz, ua, lang);
      const ip = request.headers.get("x-ip") || "";
      if (ip && this.ctx.getWebSockets(`ip:${ip}`).length >= 10) return new Response("Too many connections", { status: 429 });
      // Unique-visitor counter: a known visitor gets their number back right away. A new one is only counted when the page
      // reports a person (an interaction, or 12 s on the page if nothing looks robotic): see «menneske» below.
      const sus = robotHint({ ua, lang, org: geo.org, webdriver: url.searchParams.get("w") === "1" });
      const consent = url.searchParams.get("c") === "1";
      const eier = url.searchParams.get("e") === "1";   // one of the owner's own browsers (?eier): never counted
      const vk = pageLoad && !eier && !BOT.test(ua) ? await this.visitKey({ vid, consent, ip, ua }) : null;
      let nr = vk ? vk.own : null;
      let pend = vk && !nr ? { day: vk.day, k: vk.k, net: vk.net, ipnet: pokeNet(ip), consent } : null;
      // A new visitor who doesn't look robotic is counted at once, so they see the number go up as they arrive. The count
      // is taken back if they leave without passing the person check (prov). Robotic-looking ones wait for an interaction.
      let prov = null;
      if (pend && !sus) { const n = this.confirmVisit(pend, vid); if (n) { nr = n; prov = { day: pend.day, k: pend.k, n }; } pend = null; }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ["v", `v:${vid}`, ...(ip ? [`ip:${ip}`] : [])]);
      pair[1].serializeAttachment({ role: "visitor", vid, rate: [], win: 0, n: 0, nr, pend, prov, sus, t0: now, ok: (!!nr && !prov) || eier, eier });
      const ex = this.sql.exec(`SELECT extras, ring FROM visitors WHERE vid=?`, vid).toArray()[0];
      const count = { live: this.liveCount(), total: this.uniqTotal() };
      pair[1].send(JSON.stringify({ t: "history", msgs: this.history(vid), owner: this.ownerOnline(), extras: !!ex?.extras, ring: !!ex?.ring, status: this.status(), call: this.canCall(), hr: this.liveHr(), count:{ live: this.liveCount(), total: this.uniqTotal(), nr, ny: !!prov, pend: !!pend || !!prov, meg: !eier && (!sus || !!nr) } }));
      this.send(this.ctx.getWebSockets("v").filter((w) => w !== pair[1]), { t: "count", ...count });
      this.toOwners({ t: "presence", v: this.visitor(vid) });
      if (newVisit && !eier && this.setting("notifyVisits") === "1") this.ctx.waitUntil(this.pushVisit({ key: vid, vid, first: false, city: geo.city, country: geo.country, ua }));
      this.ctx.waitUntil(this.ensureAlarm());
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (role === "internal") {
      const b = await request.json();
      if (url.pathname === "/internal/in-call") {
        const t = Number(this.sql.exec(`SELECT v FROM kv WHERE k=?`, `call:${b.vid}`).toArray()[0]?.v || 0);
        return t && Date.now() - t < 2 * 3600e3 && this.online(b.vid) ? new Response("ok") : new Response("no", { status: 403 });
      }
      if (url.pathname === "/internal/status") {
        return Response.json({ status: this.status(), owner: this.ownerOnline(), hr: this.liveHr() }, { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/kast") {
        // Laughs and tomatoes: shared counters, at most 20 a minute from one address.
        if (!["le", "tomat"].includes(b.k)) return new Response("Bad request", { status: 400 });
        // Tomatoes only while he is at his mother's.
        if (b.k === "tomat" && this.sporLive()?.kjent !== "hjemme hos moren sin") return new Response("Ikke hjemme hos moren sin", { status: 403 });
        const ip = request.headers.get("x-ip") || "", now = Date.now();
        this.kastRate = this.kastRate || new Map();
        const r = (this.kastRate.get(ip) || []).filter((t) => now - t < 60e3);
        if (r.length >= 20) return new Response("Too many", { status: 429 });
        r.push(now); this.kastRate.set(ip, r);
        if (this.kastRate.size > 5000) this.kastRate.clear();
        const n = Number(this.sql.exec(`SELECT v FROM kv WHERE k=?`, `kast:${b.k}`).toArray()[0]?.v || 0) + 1;
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `kast:${b.k}`, String(n));
        if (b.k === "tomat") this.tomatVarsel(decodeURIComponent(request.headers.get("x-by") || ""));
        return Response.json(this.kast());
      }
      if (url.pathname === "/internal/spor") {
        return Response.json(this.spor(), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/hr") {
        return Response.json(this.hrRange(b.r), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/visit") {
        if (this.setting("notifyVisits") === "1") {
          // A cookie id only comes with consent; without it nothing about the visitor is stored, the push is all.
          const known = b.vid && this.sql.exec(`SELECT 1 FROM visitors WHERE vid=?`, b.vid).toArray().length > 0;
          await this.pushVisit({ key: b.vid || "n:" + pokeNet(b.ip || ""), vid: known ? b.vid : null, first: !known, city: b.city, country: b.country, ua: b.ua });
        }
        return new Response("ok");
      }
      if (url.pathname === "/internal/rec") {
        this.record(b.vid, b);
        return new Response("ok");
      }
      if (url.pathname === "/internal/can-upload") {
        if (b.fromOwner) return new Response("ok");
        const v = this.sql.exec(`SELECT extras FROM visitors WHERE vid=?`, b.vid).toArray()[0];
        if (!v || !v.extras) return new Response("Not enabled", { status: 403 });
        const n = this.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE vid=? AND from_owner=0 AND kind='file' AND ts>?`,
          b.vid, Date.now() - 864e5).one().n;
        return n >= 30 ? new Response("Too many files today", { status: 429 }) : new Response("ok");
      }
      if (url.pathname === "/internal/can-gif") {
        // A known visitor (seen in the last 6 hours; the socket may be reconnecting): at most 4 GIFs a minute and 40 a day.
        const seen = this.sql.exec(`SELECT last_seen FROM visitors WHERE vid=?`, b.vid).toArray()[0];
        if (!this.online(b.vid) && !(seen && Date.now() - seen.last_seen < 6 * 3600e3)) return new Response("Unknown visitor", { status: 403 });
        const n = (since) => this.sql.exec(`SELECT COUNT(*) AS n FROM messages WHERE vid=? AND from_owner=0 AND gif=1 AND ts>?`, b.vid, Date.now() - since).one().n;
        return n(60e3) >= 4 || n(864e5) >= 40 ? new Response("Too many GIFs", { status: 429 }) : new Response("ok");
      }
      if (url.pathname === "/internal/file") {
        const msg = this.store(b.vid, !!b.fromOwner, b.name, { kind: "file", file: b.key, mime: b.mime, name: b.name, size: b.size, gif: b.gif ? 1 : null });
        if (!b.fromOwner) this.sql.exec(`UPDATE visitors SET unread = unread + 1, last_seen=? WHERE vid=?`, Date.now(), b.vid);
        else this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, b.vid);
        this.toVisitor(b.vid, { t: "msg", m: msg });
        this.toOwners({ t: "msg", vid: b.vid, m: msg, v: this.visitor(b.vid) });
        if (!b.fromOwner) {
          const v = this.visitor(b.vid);
          const where = [v?.city, v?.country].filter(Boolean).join(", ") || "Besøkende";
          const what = b.gif ? "🎞️ GIF" : b.mime.startsWith("audio/") ? "🎤 Lydmelding" : b.mime.startsWith("image/") ? "🖼️ Bilde" : b.mime.startsWith("video/") ? "🎬 Video" : `📎 ${b.name}`;
          this.ctx.waitUntil(this.push(where, what, b.vid));
        }
        return Response.json({ ok: true, m: msg });
      }
      return new Response("Not found", { status: 404 });
    }

    if (role !== "owner") return new Response("Forbidden", { status: 403 });

    if (url.pathname === "/chat/admin/ws") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ["o"]);
      pair[1].serializeAttachment({ role: "owner" });
      this.rememberOwnerNet(request.headers.get("CF-Connecting-IP") || "");
      pair[1].send(JSON.stringify({ t: "state", visitors: this.allVisitors(), status: this.status(), notifyVisits: this.setting("notifyVisits") === "1", incall: this.incall(), gjor: this.setting("gjor") || "", notat: this.notat()?.v || "" }));
      this.touchOwner();
      await this.ensureAlarm();
      this.toVisitors({ t: "owner", online: true });
      const sub = (request.headers.get("Sec-WebSocket-Protocol") || "").startsWith("esbjug") ? { "Sec-WebSocket-Protocol": "esbjug" } : {};
      return new Response(null, { status: 101, webSocket: pair[0], headers: sub });
    }
    if (url.pathname === "/chat/admin/device" && request.method === "POST") {
      const { token, env, topic } = await request.json();
      if (!/^[0-9a-f]{64,200}$/i.test(token || "")) return new Response("Bad token", { status: 400 });
      // The watch app registers itself too, so notifications reach phone and watch at the same time.
      // The phone also registers a VoIP token (PushKit), so a visitor's call can ring it with the app closed.
      const t = [`${this.env.APNS_TOPIC}.watchkitapp`, `${this.env.APNS_TOPIC}.voip`].includes(topic) ? topic : this.env.APNS_TOPIC;
      this.sql.exec(`INSERT OR REPLACE INTO devices (token, env, added, topic) VALUES (?, ?, ?, ?)`,
        token, env === "production" ? "production" : "sandbox", Date.now(), t);
      return Response.json({ ok: true });
    }
    // Which phones/watches get pushes (for debugging delivery): app, environment, when registered, end of the token.
    if (url.pathname === "/chat/admin/devices") {
      const rows = this.sql.exec(`SELECT token, env, added, topic FROM devices ORDER BY added`).toArray();
      return Response.json({ devices: rows.map((d) => ({ topic: d.topic || this.env.APNS_TOPIC, env: d.env, added: new Date(d.added).toISOString(), tail: d.token.slice(-6) })) });
    }
    // Start the visitor counter over (the owner's choice, e.g. when only he and robots had been counted).
    if (url.pathname === "/chat/admin/reset-teller" && request.method === "POST") {
      this.sql.exec(`DELETE FROM uniq`);
      this.sql.exec(`DELETE FROM nr`);
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('uniqTotal', '0')`);
      this.toVisitors({ t: "count", live: this.liveCount(), total: 0 });
      return Response.json({ ok: true, total: 0 });
    }
    if (url.pathname === "/chat/admin/test-push" && request.method === "POST") {
      const results = await this.push("Esbjug Consult", "Push virker", null);
      return Response.json({ results });
    }
    // The ringing without a visitor: VoIP push to the phone and the notification to the watch. Answering goes nowhere
    // (it fails after 30 s); decline it. APNs' answer per device shows whether the VoIP token works.
    if (url.pathname === "/chat/admin/test-call" && request.method === "POST") {
      const id = crypto.randomUUID();
      const v = { vid: "test-" + id.slice(0, 8), city: "Test", country: "NO" };
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('incall', ?)`, JSON.stringify({ id, vid: v.vid, ts: Date.now() }));
      return Response.json({ results: await this.pushCall(id, v) });
    }
    // Svar/Avslå/Legg på/Lyd av from the watch, also sent this way in case WatchConnectivity is slow to reach the phone.
    // The phone app's socket is open while a visitor rings (the VoIP push opens it). The phone ignores a repeat.
    if (url.pathname === "/chat/admin/callcmd" && request.method === "POST") {
      const { cmd, id, vid, on } = await request.json();
      if (!["answer", "decline", "end", "mute"].includes(cmd)) return new Response("Bad request", { status: 400 });
      this.toOwners({ t: "callcmd", cmd, id: typeof id === "string" ? id : null, vid: typeof vid === "string" ? vid : null, on: !!on });
      return Response.json({ ok: this.ownerOnline() });
    }
    if (url.pathname === "/chat/admin/ctl" && request.method === "POST") {
      const { vid, action, on } = await request.json();
      if (typeof vid !== "string" || !["ring", "extras"].includes(action)) return new Response("Bad request", { status: 400 });
      this.toggle(vid, action, !!on);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/chat/admin/sessions") {
      const vid = url.searchParams.get("vid");
      const rows = (vid
        ? this.sql.exec(`SELECT * FROM sessions WHERE vid=? ORDER BY start DESC LIMIT 200`, vid)
        : this.sql.exec(`SELECT * FROM sessions ORDER BY start DESC LIMIT 300`)).toArray();
      const chatted = new Set(this.sql.exec(`SELECT DISTINCT vid FROM messages`).toArray().map((r) => r.vid));
      return Response.json({ sessions: rows.map((r) => ({ ...r, chatted: chatted.has(r.vid) })) });
    }
    if (url.pathname === "/chat/admin/session") {
      const sid = url.searchParams.get("sid") || "";
      const meta = this.sql.exec(`SELECT * FROM sessions WHERE sid=?`, sid).toArray()[0];
      if (!meta) return new Response("Not found", { status: 404 });
      const events = this.sql.exec(`SELECT data FROM rec WHERE sid=? ORDER BY seq`, sid).toArray().flatMap((r) => JSON.parse(r.data));
      return Response.json({ meta, events });
    }
    // For the watch app and replies from notifications (no socket there): list, reply, mark read.
    // Live heart rate from the Apple Watch (only while the owner shares it). {bpm:null} = sharing stopped.
    // Samples are also stored (at most one per 4 s) for today's graph at the top of the site.
    if (url.pathname === "/chat/admin/hr" && request.method === "POST") {
      const { bpm } = await request.json();
      const v = Number.isFinite(bpm) && bpm > 25 && bpm < 240 ? Math.round(bpm) : null;
      const now = Date.now();
      this.hr = { bpm: v, ts: now };
      if (v && now - this.hrSaved >= 4000) {
        this.hrSaved = now;
        this.sql.exec(`INSERT OR REPLACE INTO hr (ts, bpm) VALUES (?, ?)`, now, v);
      }
      if (now - this.hrPruned > 3600e3) {
        this.hrPruned = now;
        this.sql.exec(`DELETE FROM hr WHERE ts < ?`, now - 35 * 864e5);
      }
      this.toVisitors({ t: "hr", bpm: v });
      return Response.json({ ok: true });
    }
    // Positions from the owner's iPhone: stored raw (35 days), and the public version goes straight to every open page.
    if (url.pathname === "/chat/admin/pos" && request.method === "POST") {
      const { pts } = await request.json().catch(() => ({}));
      if (!Array.isArray(pts)) return new Response("Bad request", { status: 400 });
      const now = Date.now();
      let n = 0;
      for (const p of pts.slice(-500)) {
        const ts = Math.round(Number(p.ts)), lat = Number(p.lat), lon = Number(p.lon), acc = Number(p.acc);
        if (!Number.isFinite(ts) || ts > now + 60e3 || ts < now - 7 * 864e5 || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) continue;
        if (Number.isFinite(acc) && acc > 150) continue;   // too uncertain to draw
        const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
        this.sql.exec(`INSERT OR REPLACE INTO pos (ts, lat, lon, acc, spd, alt, hdg) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ts, lat, lon, num(p.acc), num(p.spd), num(p.alt), num(p.hdg));
        n++;
      }
      if (now - (this.posPruned || 0) > 3600e3) { this.posPruned = now; this.sql.exec(`DELETE FROM pos WHERE ts < ?`, now - 35 * 864e5); }
      if (n) { const l = this.sporLive(); if (l) { this.toVisitors({ t: "pos", ...l }); this.ctx.waitUntil(this.stedNavn(l.lat, l.lon)); } }
      return Response.json({ ok: true, n });
    }
    // Name the place he is at now: the latest position, with a radius. The map then says the name instead of the town.
    if (url.pathname === "/chat/admin/sted-her" && request.method === "POST") {
      const { navn, r } = await request.json().catch(() => ({}));
      const l = this.sporLive();
      if (!l || typeof navn !== "string" || !navn.trim() || navn.length > 80) return new Response("Bad request", { status: 400 });
      const steder = this.steder().filter((x) => x.navn !== navn.trim());
      steder.push({ navn: navn.trim(), lat: l.lat, lon: l.lon, r: Number.isFinite(r) ? Math.min(2000, Math.max(30, r)) : 150 });
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('steder', ?)`, JSON.stringify(steder));
      return Response.json({ ok: true, steder: steder.map((x) => x.navn) });
    }
    // Readings from the owner's devices: {kilde: "iphone" | "watch", d: {bat, lader, skritt, trykk, …}}. Only the latest
    // per device is kept; every open page gets it at once.
    if (url.pathname === "/chat/admin/tele" && request.method === "POST") {
      const { kilde, d } = await request.json().catch(() => ({}));
      if (!/^[a-z]{2,12}$/.test(kilde || "") || !d || typeof d !== "object" || JSON.stringify(d).length > 8000) return new Response("Bad request", { status: 400 });
      const ren = {};
      for (const [k, v] of Object.entries(d)) if (/^[a-zA-Z]{1,20}$/.test(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 80) || v === null)) ren[k] = v;
      // The accelerometer: "x,y,z;…" in hundredths of a g at 20 Hz, a packet every 5 s.
      if (typeof d.acc === "string" && d.acc.length <= 6000 && /^[-\d,;]*$/.test(d.acc)) ren.acc = d.acc;
      const gml = this.sql.exec(`SELECT v FROM kv WHERE k=?`, `tele:${kilde}`).toArray()[0];
      const ny = { ...(gml ? JSON.parse(gml.v) : {}), ...ren, ts: Date.now() };
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `tele:${kilde}`, JSON.stringify(ny));
      if (kilde === "iphone" && typeof ren.bevegelse === "number") {
        this.sql.exec(`INSERT OR REPLACE INTO bev (ts, v) VALUES (?, ?)`, ny.ts, ren.bevegelse);
        if (ny.ts - (this.bevPruned || 0) > 3600e3) { this.bevPruned = ny.ts; this.sql.exec(`DELETE FROM bev WHERE ts < ?`, ny.ts - 864e5); }
      }
      const { acc, ...uten } = ny;   // the chat pages don't need the accelerometer; the map page fetches it
      this.toVisitors({ t: "tele", kilde, d: uten });
      return Response.json({ ok: true });
    }
    // Remove stored samples in a period (a faulty measurement). Returns the removed rows so they can be put back.
    if (url.pathname === "/chat/admin/hr-slett" && request.method === "POST") {
      const { fra, til } = await request.json();
      if (!Number.isFinite(fra) || !Number.isFinite(til) || til <= fra || til - fra > 864e5) return new Response("Bad request", { status: 400 });
      const rows = this.sql.exec(`SELECT ts, bpm FROM hr WHERE ts >= ? AND ts < ? ORDER BY ts`, fra, til).toArray();
      this.sql.exec(`DELETE FROM hr WHERE ts >= ? AND ts < ?`, fra, til);
      this.hrMemo = new Map();
      return Response.json({ slettet: rows.length, rows });
    }
    if (url.pathname === "/chat/admin/visitors") {
      return Response.json({ visitors: this.allVisitors(), status: this.status() });
    }
    if (url.pathname === "/chat/admin/reply" && request.method === "POST") {
      const { vid, text } = await request.json();
      const t = typeof text === "string" ? text.trim().slice(0, MAX_TEXT) : "";
      if (typeof vid !== "string" || !t) return new Response("Bad request", { status: 400 });
      this.touchOwner();
      const msg = this.store(vid, true, t);
      this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, vid);
      this.toVisitor(vid, { t: "msg", m: msg });
      this.toOwners({ t: "msg", vid, m: msg, v: this.visitor(vid) });
      return Response.json({ ok: true, m: msg });
    }
    if (url.pathname === "/chat/admin/read" && request.method === "POST") {
      const { vid } = await request.json();
      this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, vid);
      this.toOwners({ t: "presence", v: this.visitor(vid) });
      return Response.json({ ok: true });
    }
    if (url.pathname === "/chat/admin/messages") {
      const vid = url.searchParams.get("vid") || "";
      return Response.json({ msgs: this.history(vid) });
    }
    return new Response("Not found", { status: 404 });
  }

  // ---------- WebSocket events (hibernation API) ----------

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment() || {};

    if (a.role === "visitor") {
      // At most 40 messages per second per connection (live/rec/rtc are the busy ones); drop the rest.
      const sec = Math.floor(Date.now() / 1000);
      if (a.win !== sec) { a.win = sec; a.n = 0; }
      if (++a.n > 40) return;
      if (a.n === 1 || m.t === "msg") ws.serializeAttachment(a);
      if (typeof raw === "string" && raw.length > 150000) return;
      if (m.t === "page" && typeof m.page === "string") {
        this.sql.exec(`UPDATE visitors SET page=?, last_seen=? WHERE vid=?`, m.page.slice(0, 200), Date.now(), a.vid);
        this.toOwners({ t: "presence", v: this.visitor(a.vid) });
      } else if (m.t === "menneske") {
        // The page saw a person: an interaction (k:"i"), or 3 s on the page (k:"t", only if nothing looked robotic).
        if (!a.ok && (m.k === "i" || (!a.sus && Date.now() - a.t0 >= 3000))) {
          a.ok = true;
          a.prov = null;
          if (a.pend) {
            const n = this.confirmVisit(a.pend, a.vid);
            a.pend = null;
            if (n) { a.nr = n; ws.send(JSON.stringify({ t: "nr", nr: n, total: this.uniqTotal() })); }
          }
          ws.serializeAttachment(a);
          this.toVisitors({ t: "count", live: this.liveCount(), total: this.uniqTotal() });
          this.toOwners({ t: "presence", v: this.visitor(a.vid) });
        }
      } else if (m.t === "samtykke") {
        // The visitor accepted cookies during this visit: their number from today follows the cookie id from now on.
        if (a.nr) this.sql.exec(`INSERT OR IGNORE INTO nr (vid, n) VALUES (?, ?)`, a.vid, a.nr);
      } else if (m.t === "forget") {
        // The visitor deletes their own conversation: messages and the visitor record go, everywhere.
        await this.wipe(a.vid);
        this.toVisitor(a.vid, { t: "cleared" });
        this.toOwners({ t: "deleted", vid: a.vid });
      } else if (m.t === "call") {
        // «Ring»: the visitor rings the owner. His phone rings (VoIP push → CallKit), the watch gets Svar/Avslå. When he
        // answers, the app sends ctl «call» on, and the call goes on as when he rings out. Only while he is available.
        const cur = this.incall();
        if (cur && cur.vid === a.vid) { ws.send(JSON.stringify({ t: "calling", ok: true })); return; }
        const now = Date.now();
        a.calls = (a.calls || []).filter((t) => now - t < 600e3);
        this.callLog = (this.callLog || []).filter((t) => now - t < 600e3);
        const why = this.status() !== "available" || !this.canCall() || !this.sql.exec(`SELECT ring FROM visitors WHERE vid=?`, a.vid).toArray()[0]?.ring ? "off" : cur ? "busy"
          : a.calls.length >= 3 || this.callLog.length >= 12 ? "rate" : "";
        if (why) { ws.send(JSON.stringify({ t: "calling", ok: false, reason: why })); return; }
        a.calls.push(now);
        this.callLog.push(now);
        ws.serializeAttachment(a);
        const id = crypto.randomUUID();
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('incall', ?)`, JSON.stringify({ id, vid: a.vid, ts: now }));
        // The visitor gets TURN for the call (see /chat/ice) from now on.
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `call:${a.vid}`, String(now));
        ws.send(JSON.stringify({ t: "calling", ok: true }));
        const v = this.visitor(a.vid);
        this.toOwners({ t: "incall", id, vid: a.vid, v });
        this.ctx.waitUntil(this.pushCall(id, v || { vid: a.vid }));
      } else if (m.t === "rtc" && m.data && JSON.stringify(m.data).length < 20000) {
        // Voice call signalling (offer/answer/ICE) from the visitor's browser to the owner app.
        this.toOwners({ t: "rtc", vid: a.vid, data: m.data });
        // Gave up before he answered: his phone and watch stop ringing.
        if (m.data.type === "bye" || m.data.type === "decline") this.endRing(a.vid, "gone");
      } else if (m.t === "rec") {
        this.record(a.vid, m);
      } else if (m.t === "live" && m.d && typeof m.d === "object") {
        // Live view: scroll/pointer from the visitor, only while the owner is watching.
        this.toOwners({ t: "live", vid: a.vid, d: m.d });
      } else if (m.t === "typing") {
        this.toOwners({ t: "typing", vid: a.vid });
      } else if (m.t === "react" && Number.isInteger(m.id) && typeof m.e === "string") {
        const now = Date.now();
        a.rrate = (a.rrate || []).filter((t) => now - t < 60000);
        if (a.rrate.length >= 30) return;
        a.rrate.push(now);
        ws.serializeAttachment(a);
        const r = this.react(a.vid, m.id, false, m.e);
        if (r && m.e) {
          const v = this.visitor(a.vid);
          const where = [v?.city, v?.country].filter(Boolean).join(", ") || "Besøkende";
          this.ctx.waitUntil(this.push(where, `Reagerte ${m.e} på «${(r.text || "").slice(0, 60)}»`, a.vid));
        }
      } else if (m.t === "msg" && typeof m.text === "string") {
        const text = m.text.trim().slice(0, MAX_TEXT);
        if (!text) return;
        const now = Date.now();
        a.rate = (a.rate || []).filter((t) => now - t < 60000);
        if (a.rate.length >= 20) { ws.send(JSON.stringify({ t: "error", error: "rate" })); return; }
        a.rate.push(now);
        ws.serializeAttachment(a);
        const msg = this.store(a.vid, false, text);
        this.sql.exec(`UPDATE visitors SET unread = unread + 1, last_seen=? WHERE vid=?`, now, a.vid);
        this.toVisitor(a.vid, { t: "msg", m: msg });
        this.toOwners({ t: "msg", vid: a.vid, m: msg, v: this.visitor(a.vid) });
        const v = this.visitor(a.vid);
        const where = [v.city, v.country].filter(Boolean).join(", ") || "Besøkende";
        this.ctx.waitUntil(this.push(where, text, a.vid));
      }
      return;
    }

    if (a.role === "owner") {
      this.touchOwner();
      if (m.t === "msg" && typeof m.text === "string" && typeof m.vid === "string") {
        const text = m.text.trim().slice(0, MAX_TEXT);
        if (!text) return;
        const msg = this.store(m.vid, true, text);
        this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, m.vid);
        this.toVisitor(m.vid, { t: "msg", m: msg });
        this.toOwners({ t: "msg", vid: m.vid, m: msg, v: this.visitor(m.vid) });
      } else if (m.t === "react" && typeof m.vid === "string" && Number.isInteger(m.id) && typeof m.e === "string") {
        this.react(m.vid, m.id, true, m.e);
      } else if (m.t === "read" && typeof m.vid === "string") {
        this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, m.vid);
        this.toOwners({ t: "presence", v: this.visitor(m.vid) });
      } else if (m.t === "history" && typeof m.vid === "string") {
        ws.send(JSON.stringify({ t: "history", vid: m.vid, msgs: this.history(m.vid) }));
      } else if (m.t === "ctl" && typeof m.vid === "string" && /^[a-z]{1,20}$/.test(m.action || "")) {
        // Control buttons in the owner app change the visitor's page (e.g. "focus").
        if (m.action === "extras" || m.action === "ring") { this.toggle(m.vid, m.action, !!m.on); return; }
        const ctl = { t: "ctl", action: m.action, on: !!m.on };
        if (m.action === "call") {
          if (m.on) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `call:${m.vid}`, String(Date.now()));
          else this.sql.exec(`DELETE FROM kv WHERE k=?`, `call:${m.vid}`);
          // A visitor who rang: answered (on) or declined (off). The owner's other devices stop ringing.
          this.endRing(m.vid, m.on ? "answered" : "declined");
        }
        this.toVisitor(m.vid, ctl);
        this.toOwners({ ...ctl, vid: m.vid });
      } else if (m.t === "rtc" && typeof m.vid === "string" && m.data && JSON.stringify(m.data).length < 20000) {
        this.toVisitor(m.vid, { t: "rtc", data: m.data });
      } else if (m.t === "delete" && typeof m.vid === "string") {
        await this.wipe(m.vid);
        this.toOwners({ t: "deleted", vid: m.vid });
      } else if (m.t === "delsession" && typeof m.sid === "string") {
        this.sql.exec(`DELETE FROM rec WHERE sid=?`, m.sid);
        this.sql.exec(`DELETE FROM sessions WHERE sid=?`, m.sid);
      } else if (m.t === "setnotat" && typeof m.v === "string") {
        // A note he writes on his phone, shown as a letter on the map page with the time he wrote it. Empty removes it.
        const v = m.v.trim().slice(0, 600);
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('notat', ?)`, JSON.stringify({ v, ts: Date.now() }));
        this.toOwners({ t: "notat", v });
      } else if (m.t === "setgjor" && ["", "jobber", "trener"].includes(m.v)) {
        // What he is doing, shown on the map page: Jobber, Trener (or nothing). Sleeping is the status, not this.
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('gjor', ?)`, m.v);
        this.toOwners({ t: "gjor", v: m.v });
      } else if (m.t === "setstatus" && ["available", "meeting", "sleeping"].includes(m.v)) {
        // Asleep: «Holder på med» goes away (the night layer already says he sleeps).
        if (m.v === "sleeping") { this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('gjor', '')`); this.toOwners({ t: "gjor", v: "" }); }
        this.sql.exec(`DELETE FROM kv WHERE k='autoSlept'`);
        this.setStatus(m.v);
      } else if (m.t === "setnotify" && typeof m.v === "boolean") {
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('notifyVisits', ?)`, m.v ? "1" : "0");
        this.toOwners({ t: "notify", notifyVisits: m.v });
      } else if (m.t === "ping") {
        ws.send(JSON.stringify({ t: "pong" }));
      }
    }
  }

  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const a = ws.deserializeAttachment() || {};
    try { ws.close(1000); } catch {}
    if (a.role === "visitor") {
      if (!a.ok && a.prov && !this.online(a.vid, ws)) {
        // Counted on arrival but never passed the person check: take the count back (the number too, if it was the latest).
        this.sql.exec(`DELETE FROM uniq WHERE day=? AND k=?`, a.prov.day, a.prov.k);
        this.sql.exec(`DELETE FROM nr WHERE vid=?`, a.vid);
        if (this.uniqTotal() === a.prov.n) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('uniqTotal', ?)`, String(a.prov.n - 1));
      }
      const robot = !a.ok && a.t0 && (a.sus || Date.now() - a.t0 < 3000) && !this.online(a.vid, ws)
        && !this.sql.exec(`SELECT 1 FROM messages WHERE vid=? LIMIT 1`, a.vid).toArray().length && !this.sql.exec(`SELECT 1 FROM nr WHERE vid=?`, a.vid).toArray().length;
      if (robot) {
        // Never moved, scrolled or tapped, and gone again within 10 s (or looked robotic): not a visitor after all.
        this.sql.exec(`DELETE FROM visitors WHERE vid=?`, a.vid);
        this.toOwners({ t: "deleted", vid: a.vid });
      } else {
        this.sql.exec(`UPDATE visitors SET last_seen=? WHERE vid=?`, Date.now(), a.vid);
        this.toOwners({ t: "presence", v: this.visitor(a.vid, ws) });
      }
      this.send(this.ctx.getWebSockets("v").filter((w) => w !== ws), { t: "count", live: this.liveCount(ws), total: this.uniqTotal() });
      // Left while ringing the owner: stop the ringing.
      if (!this.online(a.vid, ws)) this.endRing(a.vid, "gone");
    } else if (a.role === "owner") {
      this.touchOwner();
      if (!this.ownerOnline(ws)) this.toVisitors({ t: "owner", online: false });
    }
  }

  // ---------- data ----------

  store(vid, fromOwner, text, f = null) {
    const ts = Date.now();
    const row = this.sql.exec(
      `INSERT INTO messages (vid, from_owner, text, ts, kind, file, mime, name, size, gif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      vid, fromOwner ? 1 : 0, text, ts, f?.kind ?? null, f?.file ?? null, f?.mime ?? null, f?.name ?? null, f?.size ?? null, f?.gif ?? null).one();
    return this.row({ id: row.id, from_owner: fromOwner ? 1 : 0, text, ts, ...f });
  }

  // Reactions: one emoji per side per message (rv the visitor's, ro the owner's), '' takes it away. Both sides get the new pair.
  react(vid, id, byOwner, e) {
    if (e && !REACTIONS.includes(e)) return null;
    const r = this.sql.exec(`UPDATE messages SET ${byOwner ? "ro" : "rv"}=? WHERE id=? AND vid=? RETURNING text, rv, ro`, e || null, id, vid).toArray()[0];
    if (!r) return null;
    const ev = { t: "react", id, rv: r.rv || null, ro: r.ro || null };
    this.toVisitor(vid, ev);
    this.toOwners({ ...ev, vid });
    return r;
  }

  row(r) {
    const m = { id: r.id, owner: !!r.from_owner, text: r.text, ts: r.ts };
    if (r.rv) m.rv = r.rv;
    if (r.ro) m.ro = r.ro;
    if (r.kind === "file") Object.assign(m, { kind: "file", file: r.file, mime: r.mime, name: r.name, size: r.size });
    if (r.kind === "file" && r.gif) m.gif = true;   // a Giphy GIF as mp4: the page and the app play it looped, muted, without controls
    return m;
  }

  history(vid) {
    return this.sql.exec(`SELECT * FROM messages WHERE vid=? ORDER BY id DESC LIMIT ?`, vid, HISTORY)
      .toArray().reverse().map((r) => this.row(r));
  }

  // Deletes a conversation everywhere, including its files in R2.
  async wipe(vid) {
    const keys = this.sql.exec(`SELECT file FROM messages WHERE vid=? AND file IS NOT NULL`, vid).toArray().map((r) => r.file);
    this.sql.exec(`DELETE FROM messages WHERE vid=?`, vid);
    this.sql.exec(`DELETE FROM visitors WHERE vid=?`, vid);
    this.sql.exec(`DELETE FROM nr WHERE vid=?`, vid);
    this.sql.exec(`DELETE FROM rec WHERE sid IN (SELECT sid FROM sessions WHERE vid=?)`, vid);
    this.sql.exec(`DELETE FROM sessions WHERE vid=?`, vid);
    if (keys.length) await this.env.FILES.delete(keys);
  }

  online(vid, closing) {
    return this.ctx.getWebSockets(`v:${vid}`).some((s) => s !== closing && s.readyState === 1);
  }

  ownerOnline(closing) {
    return this.ctx.getWebSockets("o").some((s) => s !== closing && s.readyState === 1);
  }

  visitor(vid, closing) {
    const r = this.sql.exec(`SELECT * FROM visitors WHERE vid=?`, vid).toArray()[0];
    if (!r) return null;
    const last = this.sql.exec(`SELECT from_owner, text, ts, kind, mime, gif FROM messages WHERE vid=? ORDER BY id DESC LIMIT 1`, vid).toArray()[0];
    if (last?.kind === "file") last.text = last.gif ? "🎞️ GIF" : last.mime?.startsWith("audio/") ? "🎤 Lydmelding" : last.mime?.startsWith("image/") ? "🖼️ Bilde" : last.mime?.startsWith("video/") ? "🎬 Video" : `📎 ${last.text}`;
    return {
      vid: r.vid, online: this.online(vid, closing), firstSeen: r.first_seen, lastSeen: r.last_seen,
      city: r.city, region: r.region, country: r.country, lat: r.lat, lon: r.lon, tz: r.tz,
      ua: r.ua, page: r.page, lang: r.lang, unread: r.unread, extras: !!r.extras, ring: !!r.ring,
      last: last ? { owner: !!last.from_owner, text: last.text, ts: last.ts } : null,
    };
  }

  allVisitors() {
    // Everyone on the site now, plus everyone who has written in the last 60 days.
    const since = Date.now() - 60 * 864e5;
    const rows = this.sql.exec(
      `SELECT vid FROM visitors WHERE last_seen > ? AND (vid IN (SELECT DISTINCT vid FROM messages) OR last_seen > ?)
       ORDER BY last_seen DESC LIMIT 300`, since, Date.now() - 864e5).toArray();
    return rows.map((r) => this.visitor(r.vid)).filter(Boolean);
  }

  // ---------- visitor counter on the site ----------
  // On the site now = distinct visitor ids with an open socket. Unique visitors: a consented visitor once (by cookie id),
  // others once per Oslo day by a hash of network + browser with a salt that changes every day. The salt and the day's
  // hashes are deleted at midnight, so nothing can be traced back. At most 3 new per network per day.
  liveCount(closing) {
    const ids = new Set();
    for (const w of this.ctx.getWebSockets("v")) {
      if (w === closing || w.readyState !== 1) continue;
      const a = w.deserializeAttachment();
      if (a && a.vid && !a.eier && (!a.sus || a.ok)) ids.add(a.vid);
    }
    return ids.size;
  }

  uniqTotal() {
    return Number(this.setting("uniqTotal") || 0);
  }

  // The day's key for a visitor and their number if they already have one. A consented visitor keeps one number for good
  // (table nr); others are recognised for the rest of the day by network + browser, and count again another day.
  async visitKey({ vid, consent, ip, ua }) {
    const day = osloDay(Date.now());
    let salt = this.setting("uniqSalt") || "";
    if (!salt.startsWith(day + ":")) {
      salt = day + ":" + crypto.randomUUID();
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('uniqSalt', ?)`, salt);
      this.sql.exec(`DELETE FROM uniq WHERE day <> ?`, day);
    }
    const net = await sha256hex(salt + "|" + pokeNet(ip || ""));
    const k = "a:" + (await sha256hex(salt + "|" + net + "|" + ua));
    const today = this.sql.exec(`SELECT n FROM uniq WHERE day=? AND k=?`, day, k).toArray()[0];
    let own = null;
    if (consent) {
      own = this.sql.exec(`SELECT n FROM nr WHERE vid=?`, vid).toArray()[0]?.n || null;
      if (!own && today && today.n) { own = today.n; this.sql.exec(`INSERT OR IGNORE INTO nr (vid, n) VALUES (?, ?)`, vid, own); }
    } else if (today) {
      own = today.n || null;
    }
    return { day, k, net, own };
  }

  // A person was seen: they get the next number. Not the owner's own network, at most 3 new per network per day.
  confirmVisit(p, vid) {
    if (p.day !== osloDay(Date.now()) || this.ownerNets().includes(p.ipnet)) return null;
    const had = this.sql.exec(`SELECT n FROM uniq WHERE day=? AND k=?`, p.day, p.k).toArray()[0];
    if (had) return had.n || null;
    if (this.sql.exec(`SELECT COUNT(*) AS n FROM uniq WHERE day=? AND net=?`, p.day, p.net).one().n >= 3) return null;
    const n = this.uniqTotal() + 1;
    this.sql.exec(`INSERT OR REPLACE INTO uniq (day, k, net, n) VALUES (?, ?, ?, ?)`, p.day, p.k, p.net, n);
    if (p.consent) this.sql.exec(`INSERT OR REPLACE INTO nr (vid, n) VALUES (?, ?)`, vid, n);
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('uniqTotal', ?)`, String(n));
    return n;
  }

  // The networks the owner's app connects from (last 60 days), so his own visits don't count as unique visitors.
  ownerNets() {
    try { return Object.keys(JSON.parse(this.setting("ownerNets") || "{}")); } catch { return []; }
  }

  rememberOwnerNet(ip) {
    if (!ip) return;
    let m = {};
    try { m = JSON.parse(this.setting("ownerNets") || "{}"); } catch {}
    const now = Date.now();
    m[pokeNet(ip)] = now;
    for (const k of Object.keys(m)) if (now - m[k] > 60 * 864e5) delete m[k];
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('ownerNets', ?)`, JSON.stringify(m));
  }

  // ---------- the map ----------
  // The owner's real position, everywhere (he has nothing to hide), today's trail, the place name, and the latest
  // readings from his phone and watch (battery, steps, air pressure …).
  sporLive() {
    const r = this.sql.exec(`SELECT ts, lat, lon, acc, spd, alt, hdg FROM pos ORDER BY ts DESC LIMIT 1`).toArray()[0];
    if (!r) return null;
    return { modus: "ekte", ts: r.ts, lat: r.lat, lon: r.lon, acc: r.acc, spd: r.spd, alt: r.alt, hdg: r.hdg, kjent: this.kjentSted(r.lat, r.lon) };
  }

  steder() {
    try { return JSON.parse(this.sql.exec(`SELECT v FROM kv WHERE k='steder'`).toArray()[0]?.v || "[]"); } catch { return []; }
  }

  // The named place he is at, if any (only the name goes out, never the stored coordinates).
  kjentSted(lat, lon) {
    for (const x of this.steder()) if (Math.hypot((lat - x.lat) * 111.2e3, (lon - x.lon) * 111.2e3 * Math.cos(lat * Math.PI / 180)) <= x.r) return x.navn;
    return null;
  }

  // A push to the owner's phone for every tomato, at once. No grouping and no throttle: it is supposed to be spammy.
  tomatVarsel(by) {
    const l = this.sporLive(), hjemme = l && l.kjent === "hjemme hos moren sin";
    this.ctx.waitUntil(this.push(hjemme ? "🍅 Taper!" : "🍅 Tomat!", by ? `Noen i ${by} kastet en tomat på deg` : "Noen kastet en tomat på deg", null, { thread: "tomat" }));
  }

  notat() {
    try { const n = JSON.parse(this.setting("notat") || "null"); return n && n.v ? n : null; } catch { return null; }
  }

  kast() {
    const n = (k) => Number(this.sql.exec(`SELECT v FROM kv WHERE k=?`, `kast:${k}`).toArray()[0]?.v || 0);
    return { le: n("le"), tomat: n("tomat") };
  }

  tele() {
    const out = {};
    for (const r of this.sql.exec(`SELECT k, v FROM kv WHERE k LIKE 'tele:%' OR k='sted'`).toArray()) {
      try { out[r.k === "sted" ? "sted" : r.k.slice(5)] = JSON.parse(r.v); } catch {}
    }
    return out;
  }

  spor() {
    const live = this.sporLive();
    const start = osloMidnight(Date.now());
    const rows = this.sql.exec(`SELECT ts, lat, lon FROM pos WHERE ts >= ? ORDER BY ts`, start).toArray();
    // At least ~12 m between points so the trail stays light; a gap (more than 1 km or 15 min, e.g. a flight) breaks the line.
    const trail = [];
    let pl = 0, po = 0, pt = 0;
    for (const r of rows) {
      const k = Math.cos(r.lat * Math.PI / 180), dy = (r.lat - pl) * 111.2e3, dx = (r.lon - po) * 111.2e3 * k, d2 = dx * dx + dy * dy;
      if (trail.length && d2 < 144) continue;
      if (trail.length && (d2 > 1e6 || r.ts - pt > 15 * 60e3)) trail.push(null);
      trail.push([+r.lat.toFixed(5), +r.lon.toFixed(5), r.ts]);
      pl = r.lat; po = r.lon; pt = r.ts;
    }
    const fra = Date.now() - 30 * 60e3;
    const bev = [...this.sql.exec(`SELECT ts, v FROM bev WHERE ts <= ? ORDER BY ts DESC LIMIT 1`, fra).toArray(),
      ...this.sql.exec(`SELECT ts, v FROM bev WHERE ts > ? ORDER BY ts`, fra).toArray()].map((r) => [r.ts, r.v]);
    // Heart rate the last 5 minutes, every stored sample (one per ~4 s while the watch shares it).
    const puls = this.sql.exec(`SELECT ts, bpm FROM hr WHERE ts > ? ORDER BY ts`, Date.now() - 5 * 60e3).toArray().map((r) => [r.ts, r.bpm]);
    return { now: Date.now(), live, trail, tele: this.tele(), bev, puls, kast: this.kast(), gjor: this.setting("gjor") || "", notat: this.notat() };
  }

  // The name of the place he is at (neighbourhood, town, country), from OpenStreetMap's Nominatim. At most every
  // 2 minutes and only after moving 150 m, so the free service is barely touched.
  async stedNavn(lat, lon) {
    const sist = this.sql.exec(`SELECT v FROM kv WHERE k='sted'`).toArray()[0];
    const s = sist ? JSON.parse(sist.v) : null;
    if (s && Date.now() - s.ts < 120e3) return;
    if (s && Math.hypot((lat - s.lat) * 111.2e3, (lon - s.lon) * 111.2e3 * Math.cos(lat * Math.PI / 180)) < 150) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=nb&lat=${lat}&lon=${lon}`,
        { headers: { "User-Agent": "esbjugconsult.com live map (tidemann@esbjugconsult.com)" } });
      if (!r.ok) return;
      const a = (await r.json()).address || {};
      const navn = { strok: a.neighbourhood || a.quarter || a.suburb || a.hamlet || a.village || "", by: a.city || a.town || a.village || a.municipality || "",
        land: a.country || "", kode: (a.country_code || "").toUpperCase(), lat, lon, ts: Date.now() };
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('sted', ?)`, JSON.stringify(navn));
      this.toVisitors({ t: "tele", kilde: "sted", d: navn });
    } catch {}
  }

  liveHr() {
    // Memory only: while sharing, the watch posts every ~5 s, which keeps the hub awake (and refills this after a deploy).
    return this.hr && this.hr.bpm && Date.now() - this.hr.ts < 20000 ? this.hr.bpm : null;
  }

  // A period from Oslo midnight: dag = today (one average per minute), uke = 7 days (per 10 min), mnd = 30 days (per hour).
  // pts = [[minutes since start, bpm], ...]; beats = the sum of the per-minute averages (one minute of measuring at 70 bpm
  // = 70 beats), mins = measured minutes. The endpoint is public, so each period is reused for 30 s (dag) or 2 min.
  hrRange(r = "dag") {
    const P = { dag: [0, 1, 30e3], uke: [6, 10, 120e3], mnd: [29, 60, 120e3] }[r] || [0, 1, 30e3];
    const now = Date.now(), start = osloMidnight(now - P[0] * 864e5), step = P[1];
    this.hrMemo = this.hrMemo instanceof Map ? this.hrMemo : new Map();
    let m = this.hrMemo.get(r);
    if (!m || m.start !== start || now - m.at > P[2]) {
      const rows = this.sql.exec(
        `SELECT CAST((ts - ?) / ? AS INTEGER) * ? AS m, CAST(ROUND(AVG(bpm)) AS INTEGER) AS b FROM hr WHERE ts >= ? GROUP BY 1 ORDER BY 1`,
        start, step * 60000, step, start).toArray();
      const t = this.sql.exec(
        `SELECT CAST(ROUND(COALESCE(SUM(b), 0)) AS INTEGER) AS beats, COUNT(*) AS mins, CAST(ROUND(MIN(b)) AS INTEGER) AS lo, CAST(ROUND(MAX(b)) AS INTEGER) AS hi
         FROM (SELECT AVG(bpm) AS b FROM hr WHERE ts >= ? GROUP BY CAST((ts - ?) / 60000 AS INTEGER))`,
        start, start).one();
      m = { start, at: now, pts: rows.map((x) => [x.m, x.b]), beats: t.beats, mins: t.mins, lo: t.lo, hi: t.hi };
      this.hrMemo.set(r, m);
    }
    return { r, start, now, step, live: this.liveHr(), pts: m.pts, beats: m.beats, mins: m.mins, lo: m.lo, hi: m.hi };
  }

  setting(k) {
    return this.sql.exec(`SELECT v FROM kv WHERE k=?`, k).toArray()[0]?.v;
  }

  // Push for a visit (when the owner has turned it on in the app). Own caps: one per visitor per 15 s (stops reload
  // spam), at most 20 per 10 minutes in total. Same coin sound as messages (the owner's choice).
  // key: the visitor's cookie id, or "n:" + network for visitors without consent. vid only for known visitors (tapping
  // the push opens them in the app).
  async pushVisit({ key, vid, first, city, country, ua }) {
    const now = Date.now();
    this.visitLast = this.visitLast || new Map();
    this.visitLog = (this.visitLog || []).filter((t) => now - t < 600000);
    if (now - (this.visitLast.get(key) || 0) < 15e3 || this.visitLog.length >= 20) return;
    for (const [k, t] of this.visitLast) if (now - t > 15e3) this.visitLast.delete(k);
    this.visitLast.set(key, now);
    this.visitLog.push(now);
    ua = ua || "";
    const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
      : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
    let land = "";
    try { const n = new Intl.DisplayNames(["nb"], { type: "region" }).of(country); if (n && n !== country) land = n; } catch {}
    const where = [city, land].filter(Boolean).join(", ") || "Ukjent sted";
    await this.push(first ? "Ny besøkende" : "Besøkende tilbake", [where, device].filter(Boolean).join(" · "), vid || null, { thread: "besok", throttle: false, category: "VISIT" });
  }

  setStatus(v) {
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('status', ?)`, v);
    this.toVisitors({ t: "status", v });
    this.toOwners({ t: "status", v, status: v });
  }

  touchOwner() {
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('ownerActive', ?)`, String(Date.now()));
  }

  // ---------- visitors ringing the owner ----------

  // «Mer chat» (extras) and «Ring» (ring) are switched on per visitor by the owner, stored so they survive a reload.
  toggle(vid, action, on) {
    this.sql.exec(`UPDATE visitors SET ${action === "ring" ? "ring" : "extras"}=? WHERE vid=?`, on ? 1 : 0, vid);
    const ctl = { t: "ctl", action, on };
    this.toVisitor(vid, ctl);
    this.toOwners({ ...ctl, vid });
  }

  // Visitors get «Ring» when the owner has turned it on for them, the phone app has a VoIP token (it rings with the
  // app closed), and the status is available.
  canCall() {
    return !!this.env.APNS_KEY && this.sql.exec(`SELECT 1 FROM devices WHERE topic=? LIMIT 1`, `${this.env.APNS_TOPIC}.voip`).toArray().length > 0;
  }

  // The visitor ringing right now {id, vid, ts}, until answered, declined, given up, or 60 s (the app gives up after 45).
  incall() {
    let c = null;
    try { c = JSON.parse(this.setting("incall") || "null"); } catch {}
    return c && Date.now() - c.ts < 60e3 ? c : null;
  }

  // The ringing is over (answered, declined, or the visitor gave up or left): every owner device hears it, so the
  // others stop ringing. Unless answered, the visitor's TURN access goes too.
  endRing(vid, why) {
    const c = this.incall();
    if (!c || c.vid !== vid) return;
    this.sql.exec(`DELETE FROM kv WHERE k='incall'`);
    if (why !== "answered") this.sql.exec(`DELETE FROM kv WHERE k=?`, `call:${vid}`);
    this.toOwners({ t: "ringend", id: c.id, vid, why });
  }

  // ---------- automatic night status ----------
  // Every quarter hour (Oslo time): from 21:00 to 04:00 the status becomes «sleeping» unless the owner is using
  // the app or used it in the last 30 minutes; at 04:00 it goes back to «available».

  async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(nextQuarter(Date.now()));
  }

  async alarm() {
    const now = Date.now();
    // Everyone gets a socket now, so visitors without consent leave a row per page load (a new random id each time).
    // Rows with no messages and no recordings go after 7 days; conversations and recorded visits stay as before.
    if (now - (this.visPruned || 0) > 3600e3) {
      this.visPruned = now;
      this.sql.exec(`DELETE FROM visitors WHERE last_seen < ? AND vid NOT IN (SELECT DISTINCT vid FROM messages) AND vid NOT IN (SELECT DISTINCT vid FROM sessions)`, now - 7 * 864e5);
    }
    const { hour, minute } = osloTime(now);
    const active = this.ownerOnline() || now - Number(this.setting("ownerActive") || 0) < 30 * 60e3;
    const next = autoStatus({ hour, minute, status: this.status(), autoSlept: this.setting("autoSlept") === "1", active });
    if (next === "sleeping") {
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('autoSlept', '1')`);
      this.setStatus("sleeping");
    } else if (next === "available") {
      this.sql.exec(`DELETE FROM kv WHERE k='autoSlept'`);
      this.setStatus("available");
    }
    await this.ctx.storage.setAlarm(nextQuarter(now + 1000));
  }

  status() {
    return this.sql.exec(`SELECT v FROM kv WHERE k='status'`).toArray()[0]?.v || "available";
  }

  // ---------- visit recordings ----------

  // A batch from a consented visitor's page: {sid, meta?, ev:[{t,sy,vw,vh,dh,mx,my,c,chat,f}]}.
  record(vid, b) {
    if (typeof vid !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(b.sid || "") || !Array.isArray(b.ev) || b.ev.length > 1200) return;
    const v = this.sql.exec(`SELECT city, country, ua FROM visitors WHERE vid=?`, vid).toArray()[0];
    if (!v) return;
    const now = Date.now();
    const known = this.sql.exec(`SELECT events FROM sessions WHERE sid=?`, b.sid).toArray()[0];
    if (!known && this.sql.exec(`SELECT COUNT(*) AS n FROM sessions WHERE vid=? AND start>?`, vid, now - 864e5).one().n >= 60) return;
    if (known && known.events > 30000) return;
    const m = b.meta || {};
    this.sql.exec(`INSERT OR IGNORE INTO sessions (sid, vid, start, last, vw, vh, page, ref, city, country, ua) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      b.sid, vid, now, now, m.vw || null, m.vh || null, String(m.page || "").slice(0, 200), String(m.ref || "").slice(0, 300), v.city, v.country, v.ua);
    if (b.ev.length) {
      const seq = this.sql.exec(`SELECT COUNT(*) AS n FROM rec WHERE sid=?`, b.sid).one().n;
      this.sql.exec(`INSERT INTO rec (sid, seq, data) VALUES (?, ?, ?)`, b.sid, seq, JSON.stringify(b.ev));
      const lastT = b.ev[b.ev.length - 1].t | 0;
      const pct = Math.max(0, ...b.ev.map((e) => (e.dh > 0 ? Math.min(100, Math.round(((e.sy + e.vh) / e.dh) * 100)) : 0)));
      const clicks = b.ev.filter((e) => Array.isArray(e.c)).length;
      this.sql.exec(`UPDATE sessions SET last=?, dur=MAX(dur, ?), events=events+?, maxpct=MAX(maxpct, ?), clicks=clicks+? WHERE sid=?`,
        now, lastT, b.ev.length, pct, clicks, b.sid);
    }
    // Keep 30 days, pruned at most once an hour.
    if (now - this.pruned > 3600e3) {
      this.pruned = now;
      const old = now - 30 * 864e5;
      this.sql.exec(`DELETE FROM rec WHERE sid IN (SELECT sid FROM sessions WHERE start < ?)`, old);
      this.sql.exec(`DELETE FROM sessions WHERE start < ?`, old);
    }
  }

  // ---------- fan-out ----------

  send(list, obj) {
    const s = JSON.stringify(obj);
    for (const ws of list) { try { ws.send(s); } catch {} }
  }
  toOwners(obj) { this.send(this.ctx.getWebSockets("o"), obj); }
  toVisitors(obj) { this.send(this.ctx.getWebSockets("v"), obj); }
  toVisitor(vid, obj) { this.send(this.ctx.getWebSockets(`v:${vid}`), obj); }

  // ---------- APNs ----------

  async apnsJwt() {
    const now = Math.floor(Date.now() / 1000);
    if (this.jwt && now - this.jwt.iat < 50 * 60) return this.jwt.token;
    const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
    const pem = this.env.APNS_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const input = `${enc({ alg: "ES256", kid: this.env.APNS_KEY_ID })}.${enc({ iss: this.env.APNS_TEAM_ID, iat: now })}`;
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
    this.jwt = { iat: now, token: `${input}.${b64u(sig)}` };
    return this.jwt.token;
  }

  async push(title, body, vid, opt = {}) {
    if (!this.env.APNS_KEY || !this.env.APNS_KEY_ID) return [{ error: "APNs not configured" }];
    // Anti-spam: one push per visitor per 20 s, at most 30 pushes per 10 minutes in total.
    const now = Date.now();
    if (vid && opt.throttle !== false) {
      if (now - (this.pushLast.get(vid) || 0) < 20000) return [{ skipped: "throttled" }];
      this.pushLog = this.pushLog.filter((t) => now - t < 600000);
      if (this.pushLog.length >= 30) return [{ skipped: "global cap" }];
      this.pushLast.set(vid, now);
      this.pushLog.push(now);
    }
    // Not the VoIP token: that one is for calls only (pushCall).
    const devices = this.sql.exec(`SELECT token, env, topic FROM devices WHERE topic IS NULL OR topic <> ?`, `${this.env.APNS_TOPIC}.voip`).toArray();
    if (!devices.length) return [{ error: "no devices" }];
    const jwt = await this.apnsJwt();
    const payload = {
      aps: { alert: { title, body: body.length > 180 ? body.slice(0, 177) + "…" : body }, sound: opt.sound || "klirr.caf", "thread-id": opt.thread || vid || "esbjug", ...(vid ? { category: opt.category || "MSG" } : {}), "mutable-content": 0 },
      vid,
    };
    const results = [];
    for (const d of devices) results.push(await this.apns(d, jwt, { "apns-push-type": "alert", "apns-priority": "10" }, payload));
    return results;
  }

  // A visitor rings: a VoIP push to the phone (PushKit, which shows the call with CallKit at once, also with the app
  // closed) and a notification with Svar/Avslå to the watch. APNs keeps neither: a ring from a minute ago is no use.
  async pushCall(id, v) {
    if (!this.env.APNS_KEY || !this.env.APNS_KEY_ID) return [{ error: "APNs not configured" }];
    const app = this.env.APNS_TOPIC;
    const devices = this.sql.exec(`SELECT token, env, topic FROM devices WHERE topic IN (?, ?)`, `${app}.voip`, `${app}.watchkitapp`).toArray();
    if (!devices.length) return [{ error: "no devices" }];
    const jwt = await this.apnsJwt();
    let land = "";
    try { const n = new Intl.DisplayNames(["nb"], { type: "region" }).of(v.country); if (n && n !== v.country) land = n; } catch {}
    const where = [v.city, land].filter(Boolean).join(", ") || "Besøkende";
    const until = String(Math.floor(Date.now() / 1000) + 45);
    return Promise.all(devices.map((d) => d.topic === `${app}.voip`
      ? this.apns(d, jwt, { "apns-push-type": "voip", "apns-priority": "10", "apns-expiration": "0" },
        { id, vid: v.vid, city: v.city || "", country: v.country || "" })
      : this.apns(d, jwt, { "apns-push-type": "alert", "apns-priority": "10", "apns-expiration": until, "apns-collapse-id": `ring-${id}` },
        { aps: { alert: { title: `${where} ringer deg`, body: "Lydsamtale fra chatten på esbjugconsult.com" }, sound: "default", category: "CALL", "thread-id": "ring" },
          id, vid: v.vid, place: where, country: v.country || "" })));
  }

  // One push to one device. Tokens APNs no longer knows are removed.
  async apns(d, jwt, headers, payload) {
    const host = d.env === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
    const topic = d.topic || this.env.APNS_TOPIC;
    try {
      const r = await fetch(`https://${host}/3/device/${d.token}`, {
        method: "POST",
        headers: { authorization: `bearer ${jwt}`, "apns-topic": topic, "content-type": "application/json", ...headers },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      if (r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text)) {
        this.sql.exec(`DELETE FROM devices WHERE token=?`, d.token);
      }
      return { status: r.status, body: text.slice(0, 200), topic, tail: d.token.slice(-6) };
    } catch (e) {
      return { error: String(e) };
    }
  }
}
