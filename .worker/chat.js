// Live chat between visitors on esbjugconsult.com and the owner's iPhone app.
//
// One Durable Object (ChatHub, instance "hub") holds every WebSocket: visitors (one per open tab)
// and the owner app. It knows who is on the site right now, stores conversations in its SQLite
// storage and sends a push to the owner's phone (APNs) when a visitor writes.
//
//   GET  /chat/ws?vid=<id>        visitor socket (the page opens it on load, for presence)
//   GET  /chat/admin/ws           owner socket    (Authorization: Bearer ADMIN_TOKEN)
//   POST /chat/admin/device       {token, env}    register the phone for push
//   POST /chat/admin/test-push                    send a test push to every registered phone
//   POST /chat/admin/upload?vid=&name=            owner sends a file (raw body, Content-Type)
//   POST /chat/upload?vid=&name=                  visitor sends a file (only after the owner turned on «Mer chat»)
//   GET  /chat/file/<key>                         a file from R2, with Range support (Safari needs it for audio)
//   GET  /chat/ice                                STUN + short-lived Cloudflare TURN credentials for calls
//   GET  /chat/status                             the owner's status (available/meeting/sleeping) + whether the app is open
//   POST /chat/rec                                last batch of a visit recording (sendBeacon when the page closes)
//   GET  /chat/admin/sessions[?vid=]              recorded visits (consented visitors only, kept 30 days)
//   GET  /chat/admin/session?sid=                 one recording's events, for replay in the app
//
// Location is Cloudflare's IP lookup (city/region/country/lat/lon), never the browser's GPS.

const MAX_TEXT = 2000;
const HISTORY = 200;
const MAX_FILE = 25 * 1024 * 1024;        // visitors
const MAX_FILE_OWNER = 95 * 1024 * 1024;  // the owner (video from the phone)

export async function handleChat(request, env, url) {
  const hub = env.CHAT.get(env.CHAT.idFromName("hub"));
  const path = url.pathname;

  if (path === "/chat/ws") {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const origin = request.headers.get("Origin") || "";
    if (origin && !/^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin) && !origin.startsWith("http://localhost")) {
      return new Response("Forbidden", { status: 403 });
    }
    const vid = url.searchParams.get("vid") || "";
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(vid)) return new Response("Bad vid", { status: 400 });
    const cf = request.cf || {};
    const geo = {
      city: cf.city || "", region: cf.region || "", country: cf.country || "",
      lat: cf.latitude ? Number(cf.latitude) : null, lon: cf.longitude ? Number(cf.longitude) : null,
      tz: cf.timezone || "",
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

  if (path === "/chat/upload" && request.method === "POST") {
    const origin = request.headers.get("Origin") || "";
    if (!/^https:\/\/(www\.)?esbjugconsult\.com$/.test(origin)) return new Response("Forbidden", { status: 403 });
    return upload(request, env, url, hub, false);
  }

  if (path.startsWith("/chat/admin/")) {
    const auth = request.headers.get("Authorization") || "";
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    if (path === "/chat/admin/upload" && request.method === "POST") return upload(request, env, url, hub, true);
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
    for (const col of ["kind TEXT", "file TEXT", "mime TEXT", "name TEXT", "size INTEGER"]) {
      try { this.sql.exec(`ALTER TABLE messages ADD COLUMN ${col}`); } catch {}
    }
    try { this.sql.exec(`ALTER TABLE visitors ADD COLUMN extras INTEGER DEFAULT 0`); } catch {}
    try { this.sql.exec(`ALTER TABLE devices ADD COLUMN topic TEXT`); } catch {}   // iPhone app or watch app bundle id
    // Visit recordings: one row per page visit, events in chunks (arrays of snapshots, JSON).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY, vid TEXT, start INTEGER, last INTEGER, dur INTEGER DEFAULT 0, events INTEGER DEFAULT 0,
      vw INTEGER, vh INTEGER, page TEXT, ref TEXT, city TEXT, country TEXT, ua TEXT, maxpct INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS sessions_vid ON sessions (vid, start)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rec (sid TEXT, seq INTEGER, data TEXT, PRIMARY KEY (sid, seq))`);
    this.pruned = 0;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
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
      // A new visit = not on the site right now and last seen more than 10 minutes ago (or never).
      const prev = this.sql.exec(`SELECT last_seen FROM visitors WHERE vid=?`, vid).toArray()[0];
      const newVisit = !this.online(vid) && (!prev || now - prev.last_seen > 10 * 60e3);
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
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ["v", `v:${vid}`, ...(ip ? [`ip:${ip}`] : [])]);
      pair[1].serializeAttachment({ role: "visitor", vid, rate: [], win: 0, n: 0 });
      const ex = this.sql.exec(`SELECT extras FROM visitors WHERE vid=?`, vid).toArray()[0];
      pair[1].send(JSON.stringify({ t: "history", msgs: this.history(vid), owner: this.ownerOnline(), extras: !!ex?.extras, status: this.status() }));
      this.toOwners({ t: "presence", v: this.visitor(vid) });
      if (newVisit && this.setting("notifyVisits") === "1") this.ctx.waitUntil(this.pushVisit(vid));
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
        return Response.json({ status: this.status(), owner: this.ownerOnline() }, { headers: { "cache-control": "no-store" } });
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
      if (url.pathname === "/internal/file") {
        const msg = this.store(b.vid, !!b.fromOwner, b.name, { kind: "file", file: b.key, mime: b.mime, name: b.name, size: b.size });
        if (!b.fromOwner) this.sql.exec(`UPDATE visitors SET unread = unread + 1, last_seen=? WHERE vid=?`, Date.now(), b.vid);
        else this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, b.vid);
        this.toVisitor(b.vid, { t: "msg", m: msg });
        this.toOwners({ t: "msg", vid: b.vid, m: msg, v: this.visitor(b.vid) });
        if (!b.fromOwner) {
          const v = this.visitor(b.vid);
          const where = [v?.city, v?.country].filter(Boolean).join(", ") || "Besøkende";
          const what = b.mime.startsWith("audio/") ? "🎤 Lydmelding" : b.mime.startsWith("image/") ? "🖼️ Bilde" : b.mime.startsWith("video/") ? "🎬 Video" : `📎 ${b.name}`;
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
      pair[1].send(JSON.stringify({ t: "state", visitors: this.allVisitors(), status: this.status(), notifyVisits: this.setting("notifyVisits") === "1" }));
      this.touchOwner();
      await this.ensureAlarm();
      this.toVisitors({ t: "owner", online: true });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/chat/admin/device" && request.method === "POST") {
      const { token, env, topic } = await request.json();
      if (!/^[0-9a-f]{64,200}$/i.test(token || "")) return new Response("Bad token", { status: 400 });
      // The watch app registers itself too, so notifications reach phone and watch at the same time.
      const t = topic === `${this.env.APNS_TOPIC}.watchkitapp` ? topic : this.env.APNS_TOPIC;
      this.sql.exec(`INSERT OR REPLACE INTO devices (token, env, added, topic) VALUES (?, ?, ?, ?)`,
        token, env === "production" ? "production" : "sandbox", Date.now(), t);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/chat/admin/test-push" && request.method === "POST") {
      const results = await this.push("Esbjug Consult", "Push virker", null);
      return Response.json({ results });
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
      } else if (m.t === "forget") {
        // The visitor deletes their own conversation: messages and the visitor record go, everywhere.
        await this.wipe(a.vid);
        this.toVisitor(a.vid, { t: "cleared" });
        this.toOwners({ t: "deleted", vid: a.vid });
      } else if (m.t === "rtc" && m.data && JSON.stringify(m.data).length < 20000) {
        // Voice call signalling (offer/answer/ICE) from the visitor's browser to the owner app.
        this.toOwners({ t: "rtc", vid: a.vid, data: m.data });
      } else if (m.t === "rec") {
        this.record(a.vid, m);
      } else if (m.t === "live" && m.d && typeof m.d === "object") {
        // Live view: scroll/pointer from the visitor, only while the owner is watching.
        this.toOwners({ t: "live", vid: a.vid, d: m.d });
      } else if (m.t === "typing") {
        this.toOwners({ t: "typing", vid: a.vid });
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
      } else if (m.t === "read" && typeof m.vid === "string") {
        this.sql.exec(`UPDATE visitors SET unread = 0 WHERE vid=?`, m.vid);
        this.toOwners({ t: "presence", v: this.visitor(m.vid) });
      } else if (m.t === "history" && typeof m.vid === "string") {
        ws.send(JSON.stringify({ t: "history", vid: m.vid, msgs: this.history(m.vid) }));
      } else if (m.t === "ctl" && typeof m.vid === "string" && /^[a-z]{1,20}$/.test(m.action || "")) {
        // Control buttons in the owner app change the visitor's page (e.g. "focus").
        const ctl = { t: "ctl", action: m.action, on: !!m.on };
        if (m.action === "extras") this.sql.exec(`UPDATE visitors SET extras=? WHERE vid=?`, m.on ? 1 : 0, m.vid);
        if (m.action === "call") {
          if (m.on) this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `call:${m.vid}`, String(Date.now()));
          else this.sql.exec(`DELETE FROM kv WHERE k=?`, `call:${m.vid}`);
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
      } else if (m.t === "setstatus" && ["available", "meeting", "sleeping"].includes(m.v)) {
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
      this.sql.exec(`UPDATE visitors SET last_seen=? WHERE vid=?`, Date.now(), a.vid);
      this.toOwners({ t: "presence", v: this.visitor(a.vid, ws) });
    } else if (a.role === "owner") {
      this.touchOwner();
      if (!this.ownerOnline(ws)) this.toVisitors({ t: "owner", online: false });
    }
  }

  // ---------- data ----------

  store(vid, fromOwner, text, f = null) {
    const ts = Date.now();
    const row = this.sql.exec(
      `INSERT INTO messages (vid, from_owner, text, ts, kind, file, mime, name, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      vid, fromOwner ? 1 : 0, text, ts, f?.kind ?? null, f?.file ?? null, f?.mime ?? null, f?.name ?? null, f?.size ?? null).one();
    return this.row({ id: row.id, from_owner: fromOwner ? 1 : 0, text, ts, ...f });
  }

  row(r) {
    const m = { id: r.id, owner: !!r.from_owner, text: r.text, ts: r.ts };
    if (r.kind === "file") Object.assign(m, { kind: "file", file: r.file, mime: r.mime, name: r.name, size: r.size });
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
    const last = this.sql.exec(`SELECT from_owner, text, ts, kind, mime FROM messages WHERE vid=? ORDER BY id DESC LIMIT 1`, vid).toArray()[0];
    if (last?.kind === "file") last.text = last.mime?.startsWith("audio/") ? "🎤 Lydmelding" : last.mime?.startsWith("image/") ? "🖼️ Bilde" : last.mime?.startsWith("video/") ? "🎬 Video" : `📎 ${last.text}`;
    return {
      vid: r.vid, online: this.online(vid, closing), firstSeen: r.first_seen, lastSeen: r.last_seen,
      city: r.city, region: r.region, country: r.country, lat: r.lat, lon: r.lon, tz: r.tz,
      ua: r.ua, page: r.page, lang: r.lang, unread: r.unread, extras: !!r.extras,
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

  setting(k) {
    return this.sql.exec(`SELECT v FROM kv WHERE k=?`, k).toArray()[0]?.v;
  }

  // Push for a new visitor on the site (when the owner has turned it on in the app). Own caps: one per
  // visitor per 30 min, at most 20 per 10 minutes. Same coin sound as messages (the owner's choice).
  async pushVisit(vid) {
    const now = Date.now();
    this.visitLast = this.visitLast || new Map();
    this.visitLog = (this.visitLog || []).filter((t) => now - t < 600000);
    if (now - (this.visitLast.get(vid) || 0) < 30 * 60e3 || this.visitLog.length >= 20) return;
    this.visitLast.set(vid, now);
    this.visitLog.push(now);
    const v = this.visitor(vid);
    if (!v) return;
    const ua = v.ua || "";
    const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
      : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
    let country = v.country || "";
    try { country = new Intl.DisplayNames(["nb"], { type: "region" }).of(v.country) || country; } catch {}
    const where = [v.city, country].filter(Boolean).join(", ") || "Ukjent sted";
    await this.push("Ny besøkende", [where, device].filter(Boolean).join(" · "), vid, { thread: "besok", throttle: false, category: "VISIT" });
  }

  setStatus(v) {
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('status', ?)`, v);
    this.toVisitors({ t: "status", v });
    this.toOwners({ t: "status", v, status: v });
  }

  touchOwner() {
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('ownerActive', ?)`, String(Date.now()));
  }

  // ---------- automatic night status ----------
  // Every quarter hour (Oslo time): from 21:00 to 04:00 the status becomes «sleeping» unless the owner is using
  // the app or used it in the last 30 minutes; at 04:00 it goes back to «available».

  async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(nextQuarter(Date.now()));
  }

  async alarm() {
    const now = Date.now();
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
    const devices = this.sql.exec(`SELECT token, env, topic FROM devices`).toArray();
    if (!devices.length) return [{ error: "no devices" }];
    const jwt = await this.apnsJwt();
    const payload = JSON.stringify({
      aps: { alert: { title, body: body.length > 180 ? body.slice(0, 177) + "…" : body }, sound: opt.sound || "klirr.caf", "thread-id": opt.thread || vid || "esbjug", ...(vid ? { category: opt.category || "MSG" } : {}), "mutable-content": 0 },
      vid,
    });
    const results = [];
    for (const d of devices) {
      const host = d.env === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
      try {
        const r = await fetch(`https://${host}/3/device/${d.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`, "apns-topic": d.topic || this.env.APNS_TOPIC,
            "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json",
          },
          body: payload,
        });
        const text = await r.text();
        results.push({ status: r.status, body: text.slice(0, 200) });
        if (r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text)) {
          this.sql.exec(`DELETE FROM devices WHERE token=?`, d.token);
        }
      } catch (e) {
        results.push({ error: String(e) });
      }
    }
    return results;
  }
}
