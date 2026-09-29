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
//
// Location is Cloudflare's IP lookup (city/region/country/lat/lon), never the browser's GPS.

const MAX_TEXT = 2000;
const HISTORY = 200;
const MAX_FILE = 25 * 1024 * 1024;

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
    return hub.fetch(new Request(request.url, { headers }));
  }

  if (path.startsWith("/chat/file/")) return serveFile(request, env, path.slice("/chat/file/".length));

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

// Upload: the hub says yes/no (visitor needs «Mer chat»), the bytes go to R2, then the hub posts the message.
async function upload(request, env, url, hub, fromOwner) {
  const vid = url.searchParams.get("vid") || "";
  const name = (url.searchParams.get("name") || "fil").replace(/[\u0000-\u001f\/\\]/g, "").slice(0, 120) || "fil";
  const mime = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim().slice(0, 100);
  const size = Number(request.headers.get("Content-Length") || 0);
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(vid)) return new Response("Bad vid", { status: 400 });
  if (!size || size > MAX_FILE) return new Response("Too large", { status: 413 });
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
    this.jwt = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = request.headers.get("x-role");

    if (role === "visitor") {
      const vid = request.headers.get("x-vid");
      const geo = JSON.parse(decodeURIComponent(request.headers.get("x-geo") || "%7B%7D"));
      const now = Date.now();
      const ua = (request.headers.get("User-Agent") || "").slice(0, 300);
      const lang = (request.headers.get("Accept-Language") || "").split(",")[0].slice(0, 20);
      this.sql.exec(
        `INSERT INTO visitors (vid, first_seen, last_seen, city, region, country, lat, lon, tz, ua, lang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(vid) DO UPDATE SET last_seen=excluded.last_seen, city=excluded.city, region=excluded.region,
           country=excluded.country, lat=excluded.lat, lon=excluded.lon, tz=excluded.tz, ua=excluded.ua, lang=excluded.lang`,
        vid, now, now, geo.city, geo.region, geo.country, geo.lat, geo.lon, geo.tz, ua, lang);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ["v", `v:${vid}`]);
      pair[1].serializeAttachment({ role: "visitor", vid, rate: [] });
      const ex = this.sql.exec(`SELECT extras FROM visitors WHERE vid=?`, vid).toArray()[0];
      pair[1].send(JSON.stringify({ t: "history", msgs: this.history(vid), owner: this.ownerOnline(), extras: !!ex?.extras }));
      this.toOwners({ t: "presence", v: this.visitor(vid) });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (role === "internal") {
      const b = await request.json();
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
          const what = b.mime.startsWith("audio/") ? "🎤 Lydmelding" : b.mime.startsWith("image/") ? "🖼️ Bilde" : `📎 ${b.name}`;
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
      pair[1].send(JSON.stringify({ t: "state", visitors: this.allVisitors() }));
      this.toVisitors({ t: "owner", online: true });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/chat/admin/device" && request.method === "POST") {
      const { token, env } = await request.json();
      if (!/^[0-9a-f]{64,200}$/i.test(token || "")) return new Response("Bad token", { status: 400 });
      this.sql.exec(`INSERT OR REPLACE INTO devices (token, env, added) VALUES (?, ?, ?)`,
        token, env === "production" ? "production" : "sandbox", Date.now());
      return Response.json({ ok: true });
    }
    if (url.pathname === "/chat/admin/test-push" && request.method === "POST") {
      const results = await this.push("Esbjug Consult", "Push virker 👋", null);
      return Response.json({ results });
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
      if (m.t === "page" && typeof m.page === "string") {
        this.sql.exec(`UPDATE visitors SET page=?, last_seen=? WHERE vid=?`, m.page.slice(0, 200), Date.now(), a.vid);
        this.toOwners({ t: "presence", v: this.visitor(a.vid) });
      } else if (m.t === "forget") {
        // The visitor deletes their own conversation: messages and the visitor record go, everywhere.
        await this.wipe(a.vid);
        this.toVisitor(a.vid, { t: "cleared" });
        this.toOwners({ t: "deleted", vid: a.vid });
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
        this.toVisitor(m.vid, ctl);
        this.toOwners({ ...ctl, vid: m.vid });
      } else if (m.t === "delete" && typeof m.vid === "string") {
        await this.wipe(m.vid);
        this.toOwners({ t: "deleted", vid: m.vid });
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
    if (last?.kind === "file") last.text = last.mime?.startsWith("audio/") ? "🎤 Lydmelding" : last.mime?.startsWith("image/") ? "🖼️ Bilde" : `📎 ${last.text}`;
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

  async push(title, body, vid) {
    if (!this.env.APNS_KEY || !this.env.APNS_KEY_ID) return [{ error: "APNs not configured" }];
    const devices = this.sql.exec(`SELECT token, env FROM devices`).toArray();
    if (!devices.length) return [{ error: "no devices" }];
    const jwt = await this.apnsJwt();
    const payload = JSON.stringify({
      aps: { alert: { title, body: body.length > 180 ? body.slice(0, 177) + "…" : body }, sound: "klirr.caf", "thread-id": vid || "esbjug", "mutable-content": 0 },
      vid,
    });
    const results = [];
    for (const d of devices) {
      const host = d.env === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
      try {
        const r = await fetch(`https://${host}/3/device/${d.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`, "apns-topic": this.env.APNS_TOPIC,
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
