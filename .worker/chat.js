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
//   GET  /chat/admin/kamera?kilde=                    beacon camera settings (modus, front/back, zoom, preview)
//   POST /chat/admin/kamera       {kilde, …}          save those settings (kv kamera:<kilde>)
//   POST /chat/admin/kamera/bilde?kilde=              latest preview JPEG, memory only, only while visning is on (max 300 kB)
//   GET  /chat/admin/kamera/bilde?kilde=              that JPEG, 404 when older than 10 s
//   GET  /chat/admin/sporsmal                         the Jev questions the beacons ask {v, flaske, pult} (kv sporsmal)
//   POST /chat/admin/sporsmal     {flaske, pult}      replace them; v changes, and the beacons fetch them within 2 s
//   POST /chat/admin/sted-her     {navn, r}           name the place he is at now (e.g. «hjemme hos moren sin»), radius r m
//   POST /chat/admin/fyr          {nr, navn, trykk}   a beacon phone in the house: its air pressure (hPa)
//   POST /chat/admin/rom          {b, trykk, laer?}   what the iPhone hears from each beacon; learn a room or guess it
//   GET  /chat/admin/rom                              current room, rooms with sample counts, beacons
//   POST /chat/admin/rom-slett    {rom}               forget a room's samples
//   POST /chat/admin/plan         {ts, rom: [...]}    the house plan from the LiDAR scan (2D, metres); public at GET /chat/plan
//   POST /chat/kast               {k: "le" | "tomat"} a visitor laughs or throws a tomato at the map card (shared counters)
//   GET  /chat/poll?id=sherpa     poll totals;  POST /chat/poll {id, valg, vid} one vote per visitor (a new vote replaces the old)
//   POST /chat/android            {bat, lader}        the owner's Android phone reports its battery (its own key, ANDROID_TOKEN)
//   POST /chat/maskin             {navn, ledig}       a computer says it is on, every minute (starbase, starship, falcon; key MASKIN_TOKEN)
//   GET  /chat/oyet                               weather now in Dubai, Koh Phangan and Lombok (Open-Meteo, cached 15 min)
//   GET  /chat/spor                               the public map: live position, today's trail, place name and the readings
//   GET  /chat/hr                                 today's heart rate from the owner's Apple Watch (Oslo day, per minute) + live bpm
//   GET  /chat/norge                              where visitors came from, counted by city (no addresses)
//   POST /chat/besok                              the page was shown from a prefetch/prerender: same visit push as a page load
//   POST /chat/rec                                last batch of a visit recording (sendBeacon when the page closes)
//   GET  /chat/admin/sessions[?vid=]              recorded visits (consented visitors only, kept 30 days)
//   GET  /chat/admin/session?sid=                 one recording's events, for replay in the app
//
// Location is Cloudflare's IP lookup (city/region/country/lat/lon), never the browser's GPS.

// Samlet kontor-bilde. «vann» (utjevnet) tas fra flaske-kameraet når det har målt de siste 2 min,
// ellers fra pult-kameraet. Person, plagg og hodetelefoner tas fra pult-kameraet. Forsiden bruker samme regel.
function kontorAv(kilder, nå) {
  const liste = (kilder || []).filter((x) => x && /^fyr[a-z]$/.test(x.kilde) && (x.modus === "pult" || x.modus === "flaske"));
  if (!liste.length) return null;
  const flaske = liste.filter((x) => x.modus === "flaske" && typeof x.flaskeTs === "number" && nå - x.flaskeTs < 120e3)
    .sort((a, b) => b.flaskeTs - a.flaskeTs)[0];
  const pult = liste.filter((x) => x.modus === "pult").sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const f = flaske || pult;
  if (!f) return null;
  const d = { ts: nå };
  if (pult) for (const k of ["pult", "stilling", "plagg", "farge", "hodetelefoner"]) if (pult[k] !== undefined) d[k] = pult[k];
  if ("flaske" in f) d.flaske = f.flaske;
  if (f.harflaske !== undefined) d.harflaske = f.harflaske;
  if (f.vann !== undefined) d.vann = f.vann;
  if (typeof f.flaskeTs === "number") d.flaskeTs = f.flaskeTs;
  d.flaskeFra = f.kilde;
  return d;
}

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

  // Historikken: sporet for én dag i Oslo-tid (?dag=2026-10-19), de siste 35 dagene. Brukes til avspilling på /hjem/.
  if (path === "/chat/historikk") {
    const dag = url.searchParams.get("dag") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dag)) return new Response("Bad request", { status: 400 });
    const r = await hub.fetch(new Request("https://hub/internal/historikk", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ dag }) }));
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
  }

  // Versjonene av forsiden (fra GitHub), eldste først: sha, tidspunkt, melding og størrelse. Til avspillingens time-lapse.
  if (path === "/chat/versjoner") {
    const r = await hub.fetch(new Request("https://hub/internal/versjoner", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=120" } });
  }

  // Kalenderen i avspillingen: hvor mange timer hver dag har opptak (posisjon, puls eller målinger), fra databasen og arkivet.
  if (path === "/chat/historikk/dager") {
    const r = await hub.fetch(new Request("https://hub/internal/dager", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=120" } });
  }

  // Rå puls (hver lagret måling) og akselerometerpakker i et vindu på høyst 30 min, til avspillingen i sanntid.
  if (path === "/chat/historikk/aks") {
    const fra = Number(url.searchParams.get("fra")), til = Number(url.searchParams.get("til"));
    if (!Number.isFinite(fra) || !Number.isFinite(til) || til <= fra || til - fra > 30 * 60e3) return new Response("Bad request", { status: 400 });
    return hub.fetch(new Request("https://hub/internal/aks-raa", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ fra, til }) }));
  }
  if (path === "/chat/historikk/puls") {
    const fra = Number(url.searchParams.get("fra")), til = Number(url.searchParams.get("til"));
    if (!Number.isFinite(fra) || !Number.isFinite(til) || til <= fra || til - fra > 30 * 60e3) return new Response("Bad request", { status: 400 });
    return hub.fetch(new Request("https://hub/internal/hr-raa", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ fra, til }) }));
  }

  // Øyeblikkene de siste sju dagene (topp-øyeblikk i avspillingen).
  if (path === "/chat/oyeblikk") {
    const r = await hub.fetch(new Request("https://hub/internal/oyeblikk", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
  }

  // Søk i avspillingen: «når hadde han minst batteri?». Jev (TypeSafe, via jev-workeren som har nøkkelen) velger
  // det øyeblikket som svarer best. Høyst 10 søk i minuttet fra én adresse.
  if (path === "/chat/sok" && request.method === "POST") {
    const { q } = await request.json().catch(() => ({}));
    if (typeof q !== "string" || !q.trim() || q.length > 200) return new Response("Bad request", { status: 400 });
    const ip = request.headers.get("CF-Connecting-IP") || "", nå = Date.now();
    sokTeller = sokTeller.filter((x) => nå - x.t < 60e3);
    if (sokTeller.filter((x) => x.ip === ip).length >= 10) return new Response("For mange søk", { status: 429 });
    sokTeller.push({ ip, t: nå });
    // Et klokkeslett («hvor var han i går klokken 14:30») tolkes direkte; resten går til Jev.
    const tp = tidspunkt(q, nå);
    if (tp) return Response.json({ funnet: tp, sikkerhet: 1 });
    // En bestemt verdi («sist han hadde 111 i puls», «da iPhonen hadde 20 % batteri») slås opp direkte.
    const vv = verdiSok(q);
    if (vv) {
      const r = await (await hub.fetch(new Request("https://hub/internal/verdi", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify(vv) }))).json();
      return Response.json({ funnet: r, sikkerhet: r ? 1 : null });
    }
    // Banken («når brukte han penger sist», «når hadde han minus på konto»): fra saldoene som er logget hvert kvarter.
    const bs = bankSok(q);
    if (bs) {
      const r = await (await hub.fetch(new Request("https://hub/internal/banksok", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify(bs) }))).json();
      return Response.json(r ? { funnet: r, sikkerhet: 1 } : { funnet: null, melding: "Fant ikke noe slikt i saldoene." });
    }
    // Tekstene han har skrevet på siden («når skrev han om PC-laderen sin»): Jev velger innlegget som passer.
    if (/\b(skrev|skrevet|skriver|innlegg|posten|nevnte|tekstboks|notat)/i.test(q)) {
      const poster = await (await hub.fetch(new Request("https://hub/internal/tekster", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }))).json();
      if (poster.length && env.JEV && env.INTERN_KEY) {
        const kort = (s) => s.replace(/\s+/g, " ").slice(0, 400);
        const r = await env.JEV.fetch(new Request("https://jev/intern/jev", { method: "POST", headers: { "x-intern": env.INTERN_KEY, "Content-Type": "application/json" }, body: JSON.stringify({
          state: { sporsmal: q.trim() },
          questions: { innlegg: { type: "choice", instructions: "Hvilket av Tidemanns innlegg på nettsiden handler `sporsmal` om? Velg det som passer best i innhold, også om ordene er andre (f.eks. «PC-laderen» og «laderen til laptopen»).",
            criteria: Object.fromEntries(poster.map((x) => ["p" + x.id, kort(x.v)])) } } }) }));
        const a = r.ok ? (await r.json()).data?.answers?.innlegg : null, x = a && poster.find((p) => "p" + p.id === a.choice);
        if (x) {
          const dagN = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "numeric" }).format(x.ts);
          const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(x.ts);
          const sitat = x.v.replace(/\s+/g, " ").trim();
          // Postene kom på siden 23.10. kl. 03:55 (e1442e0). Det som ble skrevet før, vises fra da, ellers står det ingen post der.
          const POSTER_FRA = 1792720504000, ts = Math.max(x.ts + 1000, POSTER_FRA + 60e3);
          const vist = ts > x.ts + 1000 ? ` (postene kom på siden ${new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(POSTER_FRA)}, så du ser den derfra)` : "";
          return Response.json({ funnet: { id: "tekst", type: "tekst", ts, tekst: `Skrev ${dagN} kl. ${kl}: «${sitat.length > 90 ? sitat.slice(0, 88) + " …" : sitat}»${vist}` }, sikkerhet: a.confidence ?? null });
        }
      }
    }
    // Et sted («når var han i Frognerparken», «første gang han var på Aker brygge»): stedet slås opp i OpenStreetMap,
    // og hele posisjonshistorikken søkes etter når han var der.
    const ss = stedSok(q);
    if (ss) {
      const geo = await geokod(ss.navn);
      if (geo) {
        const r = await (await hub.fetch(new Request("https://hub/internal/sted", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ ...geo, forst: ss.forst }) }))).json();
        if (r) return Response.json({ funnet: r, sikkerhet: 1 });
        return Response.json({ funnet: null, melding: `Han har ikke vært ved ${geo.navn} siden opptakene startet.` });
      }
    }
    const ob = await (await hub.fetch(new Request("https://hub/internal/oyeblikk", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }))).json();
    if (!ob.length) return Response.json({ funnet: null });
    if (!env.JEV || !env.INTERN_KEY) return new Response("Jev er ikke koblet til", { status: 503 });
    const idag = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" }).format(nå);
    const body = {
      state: { sporsmal: q.trim(), idag },
      questions: { moment: { type: "choice", instructions: "Hvilket øyeblikk spør `sporsmal` etter? Det handler om Tidemanns målinger (puls, batteri, bevegelse, fart). Dagens dato er `idag`, så «i går», «tirsdag» osv. regnes fra den. Spør det ikke om en bestemt dag, velg det som gjelder hele uka.",
        criteria: Object.fromEntries(ob.map((o) => [o.id, o.tekst])) } },
    };
    const r = await env.JEV.fetch(new Request("https://jev/intern/jev", { method: "POST", headers: { "x-intern": env.INTERN_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (!r.ok) return new Response("Jev svarte ikke", { status: 502 });
    const j = await r.json(), a = j.data?.answers?.moment;
    return Response.json({ funnet: ob.find((o) => o.id === a?.choice) || null, sikkerhet: a?.confidence ?? null });
  }

  // Plantegningen av huset (skannet med LiDAR i appen), flat 2D. Endres sjelden.
  if (path === "/chat/plan") {
    const r = await hub.fetch(new Request("https://hub/internal/plan", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
  }

  // SpareBank 1: BankID-innloggingen kommer tilbake hit med en kode, som serveren bytter mot tilgang til kontoene.
  if (path === "/bank/tilbake") {
    const r = await hub.fetch(new Request("https://hub/internal/bank-tilbake", { method: "POST", headers: { "x-role": "internal" },
      body: JSON.stringify({ code: url.searchParams.get("code") || "", state: url.searchParams.get("state") || "", feil: url.searchParams.get("error") || "" }) }));
    const j = await r.json();
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Bank</title><body style="font:18px/1.5 -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#00205B"><p>${j.ok ? "Banken er koblet ✓ Saldoene hentes hvert kvarter." : "Fikk ikke koblet banken: " + String(j.feil || "ukjent feil").replace(/[<>&]/g, "")}</p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (path === "/chat/status") {
    return hub.fetch(new Request("https://hub/internal/status", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ t: tid(url) }) }));
  }

  if (path === "/chat/spor") {
    return hub.fetch(new Request("https://hub/internal/spor", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ t: tid(url) }) }));
  }

  if (path === "/chat/kast" && request.method === "POST") {
    if (!/^https:\/\/(www\.)?esbjugconsult\.com$/.test(request.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
    const body = await request.text();
    return hub.fetch(new Request("https://hub/internal/kast", { method: "POST", headers: { "x-role": "internal", "x-ip": request.headers.get("CF-Connecting-IP") || "",
      "x-by": encodeURIComponent((request.cf && request.cf.city) || "") }, body }));
  }

  // Avstemningen på /sherpa/: «Hvor står bedriften din i dag?» (fire leirer). Alle ser de samme tallene.
  if (path === "/chat/poll") {
    const stem = request.method === "POST";
    if (stem && !/^https:\/\/(www\.)?esbjugconsult\.com$/.test(request.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
    const b = stem ? await request.json().catch(() => null) : { id: url.searchParams.get("id") || "" };
    if (!b || typeof b !== "object") return new Response("Bad request", { status: 400 });
    // IPv6: hele /64-blokken teller som én adresse, ellers kan man bytte adresse for hver stemme.
    const ip = request.headers.get("CF-Connecting-IP") || "", nett = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
    return hub.fetch(new Request("https://hub/internal/poll", { method: "POST", headers: { "x-role": "internal", "x-ip": nett, "x-stem": stem ? "1" : "" },
      body: JSON.stringify({ id: String(b.id || ""), valg: b.valg, vid: b.vid }) }));
  }

  // «Øyet mot»: weather in the three places on the front page (Dubai, Koh Phangan, Lombok, in that order). One call to Open-Meteo for all, cached 15 minutes.
  // The Android phone: only battery and charging, with its own key, so the app never holds the admin token.
  if (path === "/chat/android" && request.method === "POST") {
    if (!env.ANDROID_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.ANDROID_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    const { bat, lader } = await request.json().catch(() => ({}));
    if (!Number.isFinite(bat) || bat < 0 || bat > 100) return new Response("Bad request", { status: 400 });
    return hub.fetch(new Request("https://hub/chat/admin/tele", { method: "POST", headers: { "x-role": "owner" },
      body: JSON.stringify({ kilde: "android", d: { bat: Math.round(bat), lader: !!lader } }) }));
  }

  // The computers: Starbase (Mac), Starship and Falcon 9 (Windows). Only «I am on» and seconds since the last
  // keyboard/mouse input (ledig), never what was typed. The page shows «Av» when one has been quiet for a few minutes.
  if (path === "/chat/maskin" && request.method === "POST") {
    if (!env.MASKIN_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MASKIN_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    const { navn, ledig } = await request.json().catch(() => ({}));
    if (!["starbase", "starship", "falcon"].includes(navn)) return new Response("Bad request", { status: 400 });
    return hub.fetch(new Request("https://hub/chat/admin/tele", { method: "POST", headers: { "x-role": "owner" },
      body: JSON.stringify({ kilde: navn, d: { ledig: Number.isFinite(ledig) && ledig >= 0 ? Math.round(ledig) : null } }) }));
  }

  if (path === "/chat/oyet" && tid(url)) {
    return hub.fetch(new Request("https://hub/internal/oyet-ved", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ t: tid(url) }) }));
  }
  if (path === "/chat/oyet") {
    const key = new Request("https://esbjugconsult.com/chat/oyet?steder=dubai-kp-lombok");
    const hit = await caches.default.match(key);
    if (hit) return hit;
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=25.2,9.73,-8.58&longitude=55.27,100.01,116.12&current=temperature_2m,weather_code,is_day");
    if (!r.ok) return new Response("Open-Meteo " + r.status, { status: 502 });
    const j = await r.json();
    const steder = (Array.isArray(j) ? j : [j]).map((x) => ({ t: Math.round(x.current?.temperature_2m), kode: x.current?.weather_code, dag: !!x.current?.is_day }));
    const res = Response.json(steder, { headers: { "cache-control": "public, max-age=900" } });
    await caches.default.put(key, res.clone());
    return res;
  }

  // Steder besøkende kom fra, slått sammen per by. Ingen IP, ingen cookie, ingen nettleser.
  if (path === "/chat/norge") {
    const r = await hub.fetch(new Request("https://hub/internal/norge", { method: "POST", headers: { "x-role": "internal" }, body: "{}" }));
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=15" } });
  }

  if (path === "/chat/hr") {
    const r = ["time", "fin", "dag", "uke", "mnd"].includes(url.searchParams.get("r")) ? url.searchParams.get("r") : "dag";
    return hub.fetch(new Request("https://hub/internal/hr", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ r, t: tid(url) }) }));
  }

  // Bevegelseshistorikk for akselerometrene (iPhone og Apple Watch), som pulsen: siste time, i dag, 7 dager, 30 dager.
  if (path === "/chat/bev") {
    const r = ["time", "fin", "dag", "uke", "mnd"].includes(url.searchParams.get("r")) ? url.searchParams.get("r") : "time";
    const k = ["watchr", "watchl", "watch"].includes(url.searchParams.get("k")) ? url.searchParams.get("k") : "iphone";
    return hub.fetch(new Request("https://hub/internal/bev", { method: "POST", headers: { "x-role": "internal" }, body: JSON.stringify({ r, k }) }));
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

export function enhetAv(ua = "") {
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
}

export function pageVisit(request, env, url, preloaded = false) {
  const h = request.headers;
  if (!preloaded) {
    if (request.method !== "GET" || !/^\/((en\/)?(index\.html)?|sherpa\/|podcast\/(\d+\/)?)$/.test(url.pathname) || url.searchParams.has("speil")) return null;
    if (h.get("Sec-Fetch-Mode") !== "navigate" || h.get("Sec-Fetch-Dest") !== "document") return null;
    if (/prefetch|prerender/i.test((h.get("Sec-Purpose") || "") + (h.get("Purpose") || ""))) return null;
  }
  const ua = (h.get("User-Agent") || "").slice(0, 300);
  if (!ua || BOT.test(ua)) return null;
  const cookie = h.get("Cookie") || "";
  if (/(?:^|;\s*)esbjug_eier=1(?:;|$)/.test(cookie) || url.searchParams.has("eier")) return null;
  const vid = /(?:^|;\s*)esbjug_samtykke=ja(?:;|$)/.test(cookie) && (cookie.match(/(?:^|;\s*)esbjug_id=([a-zA-Z0-9-]{8,64})(?:;|$)/) || [])[1] || "";
  const cf = request.cf || {};
  // Podcastsiden telles for seg (side «podcast», med episoden hvis lenken gikk rett til en).
  const pod = url.pathname.match(/^\/podcast\/(\d+)?/);
  const body = JSON.stringify({
    vid, ip: h.get("CF-Connecting-IP") || "",
    city: cf.city || "", region: cf.region || "", country: cf.country || "",
    lat: cf.latitude == null || cf.latitude === "" ? null : Number(cf.latitude),
    lon: cf.longitude == null || cf.longitude === "" ? null : Number(cf.longitude),
    org: cf.asOrganization || "",
    ua, side: pod ? "podcast" : "", ep: pod && pod[1] ? Number(pod[1]) : null,
  });
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

// A browser that comes back this many different days is one of the regulars (the owner and his machines) and is not counted.
const HJEMME_DAGER = 8;

// City names from the IP lookup, written the Norwegian way. Unknown names are kept.
const STEDNAVN = {};
for (const [navn, ...alias] of [
  ["Lillestrøm", "lillestrom", "lilestrøm", "lillestroem"],
  ["Tromsø", "tromso"], ["Bodø", "bodo"], ["Ålesund", "alesund", "aalesund"],
  ["Tønsberg", "tonsberg", "toensberg"], ["Gjøvik", "gjovik"], ["Lørenskog", "lorenskog"],
  ["Bærum", "baerum"], ["Ås", "aas"], ["Hønefoss", "honefoss"], ["Røros", "roros"],
  ["Førde", "forde"], ["Ørsta", "orsta"], ["Vadsø", "vadso"], ["Mo i Rana", "mo i rana"],
  ["Oslo"], ["Bergen"], ["Trondheim"], ["Stavanger"], ["Kristiansand"], ["Kristiansund"],
  ["Drammen"], ["Fredrikstad"], ["Sarpsborg"], ["Sandefjord"], ["Skien"], ["Porsgrunn"],
  ["Arendal"], ["Grimstad"], ["Moss"], ["Halden"], ["Hamar"], ["Lillehammer"],
  ["Kongsberg"], ["Kongsvinger"], ["Haugesund"], ["Sandnes"], ["Molde"], ["Harstad"],
  ["Alta"], ["Narvik"], ["Hammerfest"], ["Kirkenes"], ["Jessheim"], ["Ski"],
  ["Larvik"], ["Horten"], ["Steinkjer"], ["Levanger"], ["Sandvika"], ["Fornebu"],
]) {
  STEDNAVN[navn.toLowerCase()] = navn;
  for (const a of alias) STEDNAVN[a.toLowerCase()] = navn;
}

export function penSted(by) {
  const t = String(by || "").replace(/\s+/g, " ").trim().replace(/ (municipality|kommune)$/i, "");
  if (!t || t.length > 80) return "";
  return STEDNAVN[t.toLowerCase()] || t;
}

export function landNavn(kode) {
  const k = String(kode || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(k)) return "";
  try {
    const n = new Intl.DisplayNames(["nb"], { type: "region" }).of(k);
    return n && n !== k ? n : k;
  } catch { return k; }
}

// Rows from stedtreff become cities on the map. No addresses and no identity leave this function.
export function slagSteder(rows) {
  const map = new Map(), hvem = new Set();
  for (const r of rows || []) {
    if (!r || !r.by || !r.land) continue;
    if (r.hvem) hvem.add(r.hvem);
    const key = r.land + "\n" + r.by;
    let s = map.get(key);
    if (!s) {
      s = { kode: r.land, by: r.by, region: r.region || "", n: 0, forst: r.ts, sist: r.ts, lat: 0, lon: 0 };
      map.set(key, s);
    }
    s.n += 1;
    s.lat += Number(r.lat) || 0;
    s.lon += Number(r.lon) || 0;
    if (r.ts < s.forst) s.forst = r.ts;
    if (r.ts >= s.sist) { s.sist = r.ts; if (r.region) s.region = r.region; }
  }
  const steder = [...map.values()].map((s) => {
    let region = /^\d+$/.test(s.region) ? "" : s.region;
    if (region === s.by) region = "";
    return {
      by: s.by, region, kode: s.kode, land: landNavn(s.kode),
      lat: Math.round((s.lat / s.n) * 100) / 100, lon: Math.round((s.lon / s.n) * 100) / 100,
      n: s.n, forst: s.forst, sist: s.sist,
    };
  }).sort((a, b) => b.n - a.n || a.forst - b.forst);
  let nyeste = null;
  for (const s of steder) if (!nyeste || s.forst > nyeste.forst || (s.forst === nyeste.forst && s.n < nyeste.n)) nyeste = s;
  return { steder, totalt: hvem.size, nyeste };
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

// «Hvor var han i går klokken 14:30», «i dag kl. 9», «tirsdag 18.15»: dag (i dag, i går, i forgårs eller en
// ukedag de siste sju dagene) og klokkeslett. Uten dag og med et klokkeslett som ikke har vært ennå i dag: i går.
// Tallord etter «klokken» («klokken fjorten» → 14), så tale-til-tekst virker.
const TALLORD = ["null", "ett", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve", "tolv", "tretten", "fjorten", "femten", "seksten", "sytten", "atten", "nitten", "tjue", "tjueen", "tjueto", "tjuetre"];
// Veggklokka i Oslo på dagen som begynner ved midnatt m: også dagene sommertiden begynner eller slutter (23 eller 25 timer).
function osloKl(m, h, mi) {
  let ts = m + (h * 60 + mi) * 60e3;
  const o = osloTime(ts), avvik = (o.hour * 60 + o.minute) - (h * 60 + mi);
  if (avvik && Math.abs(avvik) <= 120) ts -= avvik * 60e3;
  return ts;
}

export function tidspunkt(q, nå) {
  const t = q.toLowerCase().replace(/\b(kl\.?|klokk(?:a|en))\s+([a-zæøå]+)/g, (x, k, ord) => { const i = TALLORD.indexOf(ord === "en" || ord === "ei" ? "ett" : ord === "syv" ? "sju" : ord); return i >= 0 ? k + " " + i : x; });
  const m = t.match(/\bkl(?:\.|okk(?:a|en))?\s*(\d{1,2})(?:[:.](\d{2}))?/) || t.match(/\b(\d{1,2})[:.](\d{2})\b/);
  // En bestemt dato («27. september», «27/9»): hvilken som helst dag bakover, kl. 12 hvis klokkeslettet mangler.
  const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
  const dm = t.match(/\b(\d{1,2})\.?\s*(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)/) || t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    const d = +dm[1], mo = isNaN(+dm[2]) ? MND.indexOf(dm[2]) : +dm[2] - 1;
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return null;
    const h = m ? +m[1] : 12, mi = m ? +(m[2] || 0) : 0;
    if (h > 23 || mi > 59) return null;
    let år = +new Intl.DateTimeFormat("en", { timeZone: "Europe/Oslo", year: "numeric" }).format(nå);
    let ts = osloKl(osloMidnight(Date.UTC(år, mo, d, 12)), h, mi);
    if (ts > nå) ts = osloKl(osloMidnight(Date.UTC(år - 1, mo, d, 12)), h, mi);
    const navn = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" }).format(ts);
    const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(ts);
    return { id: "tid", type: "tid", ts, tekst: `Her var han ${navn} kl. ${kl}` };
  }
  if (!m) return null;
  const h = +m[1], mi = +(m[2] || 0);
  if (h > 23 || mi > 59) return null;
  const UKE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const idag = UKE.indexOf(new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long" }).format(nå));
  let siden = /forgårs/.test(t) ? 2 : /i\s*går/.test(t) ? 1 : /i\s*dag/.test(t) ? 0 : null;
  if (siden == null) { const i = UKE.findIndex((d) => t.includes(d)); if (i >= 0) siden = (idag - i + 7) % 7; }
  let ts = osloKl(osloMidnight(nå - (siden || 0) * 864e5), h, mi);
  if (ts > nå && siden == null) ts -= 864e5;
  if (ts > nå || ts < nå - 7 * 864e5) return null;
  const navn = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "numeric" }).format(ts);
  const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(ts);
  return { id: "tid", type: "tid", ts, tekst: `Her var han ${navn} kl. ${kl}` };
}

// Banken: minus på kontoen, penger brukt eller kommet inn, høyeste eller laveste saldo. Ellers null.
export function bankSok(q) {
  const t = q.toLowerCase(), forst = /først|første/.test(t);
  if (/\b(minus|overtrukket|negativ|i rødt)/.test(t) && /konto|bank|saldo|penger|minus/.test(t)) return { hva: "minus", forst };
  if (/\b(brukte|brukt|betalte|handlet|kjøpte|tok ut|spent|spend|paid|bought)\b/.test(t)) return { hva: "brukt", forst };
  if (/(fikk|kom|satte inn|mottok).{0,20}(penger|lønn|kroner|betalt)|penger inn|lønn|tjen(te|t|er)\b|inntekt|innbetal|\b(make|made|earn(ed)?|got paid|received)\b/.test(t)) return { hva: "inn", forst };
  if (/(saldo|konto|bank|penger)/.test(t) && /\b(mest|høyest|størst)/.test(t)) return { hva: "hoy" };
  if (/(saldo|konto|bank|penger)/.test(t) && /\b(minst|lavest)/.test(t)) return { hva: "lav" };
  return null;
}

// «Når var han i Frognerparken», «første gang han var på Aker brygge»: stedsnavnet etter i/på/ved/til.
export function stedSok(q) {
  const t = q.toLowerCase().trim().replace(/[?!.]+$/, "");
  if (!/\b(når|sist|først|første|hvor lenge|var han|kom han|dro han)\b/.test(t)) return null;
  const m = t.match(/\b(?:var|kom|dro|gikk|reiste|syklet|kjørte)\s+(?:han\s+)?(?:sist\s+|først\s+)?(?:i|på|ved|til|innom|forbi|rundt)\s+(.{2,60})$/)
    || t.match(/\b(?:i|på|ved)\s+(.{2,60})$/);
  if (!m) return null;
  const navn = m[1].replace(/\s+(sist|sist gang|først|i det siste|noen gang)$/, "").trim();
  if (!navn || /^(går|dag|morgen|kveld|natt|forgårs|helgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|\d)/.test(navn) || /puls|batteri|bpm|prosent/.test(t)) return null;
  return { navn, forst: /først|første/.test(t) };
}

// Stedsnavn → område, fra OpenStreetMap (Nominatim). Oslo-området først, ellers Norge, ellers hele verden.
// Svaret mellomlagres i en uke (Nominatim tillater høyst ett oppslag i sekundet).
export async function geokod(navn) {
  const nokkel = new Request("https://geo.cache/" + encodeURIComponent(navn));
  const c = caches.default, lagret = await c.match(nokkel);
  if (lagret) return lagret.json();
  const hent = async (ekstra) => {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=nb&q=" + encodeURIComponent(navn) + ekstra,
      { headers: { "User-Agent": "EsbjugConsult/1.0 (+https://esbjugconsult.com)" } });
    return r.ok ? (await r.json())[0] : null;
  };
  const x = (await hent("&countrycodes=no&viewbox=10.4,60.1,11.2,59.6&bounded=1")) || (await hent("&countrycodes=no")) || (await hent(""));
  const geo = x ? { navn: x.name || navn, lat: +x.lat, lon: +x.lon, boks: x.boundingbox.map(Number) } : null;
  await c.put(nokkel, new Response(JSON.stringify(geo), { headers: { "content-type": "application/json", "cache-control": "max-age=604800" } }));
  return geo;
}

// «Sist han hadde 111 i puls», «puls på 95», «når hadde iPhonen 20 %»: hvilken måling og hvilken verdi.
export function verdiSok(q) {
  const t = q.toLowerCase(), forst = /først|første/.test(t);
  let m = t.match(/(\d{2,3})\s*(?:i\s+)?(?:puls|bpm|slag)/) || t.match(/puls\D{0,14}(\d{2,3})/);
  if (m) return { type: "puls", v: +m[1], forst };
  m = t.match(/(\d{1,3})\s*(?:%|prosent)/);
  if (m && (/batteri|%|prosent/.test(t))) return { type: "bat", v: +m[1], forst, kilde: /klokk|watch/.test(t) ? "watch" : /android|moto/.test(t) ? "android" : "iphone" };
  return null;
}

// Kartmatching: GPS-punktene legges på veiene i OpenStreetMap, som i navigasjonsapper. Valhalla (FOSSGIS sin åpne
// tjeneste) gir veien punktene fulgte (shape, polyline med 6 desimaler) og hvert punkt flyttet inn på veien.
export function dekod6(str) {
  const ut = []; let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, sk = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sk; sk += 5; } while (b >= 32);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) lat += d; else lon += d;
    }
    ut.push([lat / 1e6, lon / 1e6]);
  }
  return ut;
}

// Veien med klokkeslett: hvert punkt får sin plass langs veien (meter fra start), og hvert knekkpunkt på veien får
// tiden mellom de to nærmeste punktene. Gir [[lat, lon, ts], ...] som resten av sporet.
export function veiMedTid(shape, punkter) {
  const m = (a, b) => Math.hypot((a[0] - b[0]) * 111200, (a[1] - b[1]) * 111200 * Math.cos(a[0] * Math.PI / 180));
  const kum = [0];
  for (let i = 1; i < shape.length; i++) kum.push(kum[i - 1] + m(shape[i - 1], shape[i]));
  // Hvert punkt projiseres på veien, bare framover fra forrige (veien går én vei).
  const merker = []; let seg = 0;
  for (const p of punkter) {
    let best = null;
    for (let i = seg; i < Math.min(shape.length - 1, seg + 60); i++) {
      const a = shape[i], b = shape[i + 1], l = m(a, b) || 1e-9;
      const f = Math.max(0, Math.min(1, (((p[0] - a[0]) * (b[0] - a[0])) * 111200 * 111200 + ((p[1] - a[1]) * (b[1] - a[1])) * Math.pow(111200 * Math.cos(a[0] * Math.PI / 180), 2)) / (l * l)));
      const q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d = m(p, q);
      if (!best || d < best.d - .5) best = { d, i, s: kum[i] + l * f };
    }
    if (!best) continue;
    seg = best.i;
    const s = Math.max(best.s, merker.length ? merker[merker.length - 1].s : 0);
    merker.push({ s, t: p[2] });
  }
  if (merker.length < 2) return null;
  const tid = (s) => {
    if (s <= merker[0].s) return merker[0].t;
    for (let k = 1; k < merker.length; k++) if (s <= merker[k].s) { const a = merker[k - 1], b = merker[k]; return b.s - a.s < .01 ? b.t : a.t + (b.t - a.t) * (s - a.s) / (b.s - a.s); }
    return merker[merker.length - 1].t;
  };
  return shape.map((p, i) => [+p[0].toFixed(6), +p[1].toFixed(6), Math.round(tid(kum[i]))]).filter((p, i) => kum[i] >= merker[0].s - .5 && kum[i] <= merker[merker.length - 1].s + .5);
}

// Adressen BankID-innloggingen hos SpareBank 1 sendes tilbake til (registrert på den personlige klienten).
const SB1_TILBAKE = "https://esbjugconsult.com/bank/tilbake";

// ?t= (ms): spor, puls og status slik de var på det tidspunktet (gamle versjoner av siden i avspillingen spør slik).
const tid = (url) => { const t = Number(url.searchParams.get("t")); return Number.isFinite(t) && t > 1.7e12 && t < Date.now() - 5e3 ? t : null; };

// Søk i avspillingen per adresse, siste minutt (per isolat; nok til å stoppe misbruk).
let sokTeller = [];

// Next :00/:15/:30/:45 after ts (Oslo is a whole-hour offset from UTC, so UTC quarters line up).
export function nextQuarter(ts) {
  return Math.floor(ts / 900e3) * 900e3 + 900e3;
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
    // Bevegelse fra akselerometrene over tid (iPhone: «bevegelse», Apple Watch: «haand»; snitt i g uten tyngdekraft). 35 dager.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS bevegelse (k TEXT, ts INTEGER, v REAL, PRIMARY KEY (k, ts))`);
    // Notes on the front page, as posts: the newest on top. Editing keeps the original time.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notater (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT, ts INTEGER)`);
    {
      // The single note from before becomes the first post.
      const gml = this.sql.exec(`SELECT v FROM kv WHERE k='notat'`).toArray()[0];
      if (gml) {
        try { const n = JSON.parse(gml.v); if (n && n.v) this.sql.exec(`INSERT INTO notater (v, ts) VALUES (?, ?)`, n.v, n.ts || Date.now()); } catch {}
        this.sql.exec(`DELETE FROM kv WHERE k='notat'`);
      }
    }
    // Akselerometrene rått (pakker med 20 målinger i sekundet, én pakke hvert 5. s fra iPhone og klokka), til avspillingen.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS akslogg (kilde TEXT, ts INTEGER, acc TEXT, PRIMARY KEY (kilde, ts))`);
    // Kontoutskriftene fra SpareBank 1, bare lagret (vises ikke på siden). Nøkkelen er kontoen + dato + beløp + tekst.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS banktrans (id TEXT PRIMARY KEY, konto TEXT, tid INTEGER, belop REAL, tekst TEXT, sett INTEGER)`);
    // Kartmatchede biter av sporet (veien han fulgte, med klokkeslett), fra Valhalla. Erstatter rå GPS i tidsrommet.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS veispor (fra INTEGER PRIMARY KEY, til INTEGER, kost TEXT, geom TEXT)`);
    // Endringer over tid til avspillingen: «holder på med» (gjor), status og postene (hele lista etter hver endring). 35 dager.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS logg (ts INTEGER, k TEXT, v TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS logg_k_ts ON logg (k, ts)`);
    if (!this.sql.exec(`SELECT 1 FROM logg LIMIT 1`).toArray().length) {   // første gang: dagens tilstand som utgangspunkt
      const nå = Date.now();
      for (const [k, v] of [["gjor", this.setting("gjor") || ""], ["status", this.setting("status") || "available"], ["notater", JSON.stringify(this.notater(20))]])
        this.sql.exec(`INSERT INTO logg (ts, k, v) VALUES (?, ?, ?)`, nå, k, v);
    }
    // Målingene over tid til avspillingen: hver enhet høyst én rad i minuttet, bare feltene panelene viser. 35 dager.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS telelogg (kilde TEXT, ts INTEGER, d TEXT, PRIMARY KEY (kilde, ts))`);
    // Rom hjemme: eksempler på hva iPhonen hører i hvert rom (styrken fra hvert fyr, dBm) og høyden over fyr 1 (m).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS romprove (id INTEGER PRIMARY KEY AUTOINCREMENT, rom TEXT, ts INTEGER, b TEXT, h REAL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pos (ts INTEGER PRIMARY KEY, lat REAL, lon REAL, acc REAL, spd REAL, alt REAL, hdg REAL)`);
    // Today's unique visitors for the counter on the site (salted hashes, emptied every Oslo midnight).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS uniq (day TEXT, k TEXT, net TEXT, PRIMARY KEY (day, k))`);
    try { this.sql.exec(`ALTER TABLE uniq ADD COLUMN n INTEGER`); } catch {}   // the visitor's number that day
    // Visitor numbers for consented visitors (cookie id), kept so the site can say «Du var nr. 15» on later visits.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS nr (vid TEXT PRIMARY KEY, n INTEGER)`);
    // Besøk på /podcast/: tid, episoden (null for lista), land og enhet. Ingen IP. Slettes aldri.
    // Avstemninger (/chat/poll): én stemme per besøkende (tilfeldig id fra nettleseren), siste stemme gjelder.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS poll (id TEXT, velger TEXT, valg INTEGER, ts INTEGER, PRIMARY KEY (id, velger))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS podbesok (ts INTEGER, ep INTEGER, land TEXT, enhet TEXT, ny INTEGER)`);
    if (this.setting("uniqTotal") == null) {
      // Start the counter from what the site has already seen: each browser once per day, robots and test runs left out.
      const rows = this.sql.exec(`SELECT DISTINCT CAST(first_seen / 86400000 AS INTEGER) AS d, city, ua FROM visitors`).toArray();
      const n = rows.filter((r) => r.ua && !BOT.test(r.ua)).length;
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('uniqTotal', ?)`, String(n));
    }
    this.hrSaved = 0;
    this.hrPruned = 0;
    this.kamerabilde = {}; // siste forhåndsvisning per fyr: { bytes, ts }. Bare minnet, aldri R2 eller logg.
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
      // Mange deler IP-adresse (mobilnett, kontorer), og døde sockets kan bli hengende en stund. I stedet for å avvise nye
      // over grensen lukkes de eldste fra samme adresse (kode 4001: siden venter et minutt før den prøver igjen).
      if (ip) {
        const fra = this.ctx.getWebSockets(`ip:${ip}`);
        if (fra.length >= 30) {
          const eldst = fra.map((w) => ({ w, t: w.deserializeAttachment()?.t0 || 0 })).sort((a, b) => a.t - b.t);
          for (const { w } of eldst.slice(0, fra.length - 29)) { try { w.close(4001, "for mange fra samme adresse"); } catch {} }
        }
      }
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
      pair[1].send(JSON.stringify({ t: "history", msgs: this.history(vid), owner: this.ownerOnline(), extras: !!ex?.extras, ring: !!ex?.ring, status: this.status(), sovnet: this.sovnet(), call: this.canCall(), hr: this.liveHr(), count:{ live: this.liveCount(), total: this.uniqTotal(), nr, ny: !!prov, pend: !!pend || !!prov, meg: !eier && (!sus || !!nr) } }));
      this.send(this.ctx.getWebSockets("v").filter((w) => w !== pair[1]), { t: "count", ...count });
      this.loggBesok();
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
      if (url.pathname === "/internal/status" && b.t) {
        return Response.json(await this.statusVed(b.t), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/status") {
        return Response.json({ status: this.status(), sovnet: this.sovnet(), owner: this.ownerOnline(), hr: this.liveHr() }, { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/kast") {
        // Laughs, tomatoes and cheers (heia): shared counters, at most 20 a minute from one address.
        if (!["le", "tomat", "heia"].includes(b.k)) return new Response("Bad request", { status: 400 });
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
        this.loggFor("kast", JSON.stringify(this.kast()));
        if (b.k === "tomat") this.tomatVarsel(decodeURIComponent(request.headers.get("x-by") || ""));
        if (b.k === "heia") this.heiaVarsel(decodeURIComponent(request.headers.get("x-by") || ""));
        return Response.json(this.kast());
      }
      if (url.pathname === "/internal/poll") {
        const POLLS = { sherpa: 4 };   // id -> antall svar
        const id = String(b.id || ""), n = POLLS[id];
        if (!n) return new Response("Bad poll", { status: 400 });
        if (request.headers.get("x-stem")) {
          const valg = Number(b.valg), velger = String(b.vid || "");
          if (!(Number.isInteger(valg) && valg >= 0 && valg < n) || !/^[a-zA-Z0-9-]{8,64}$/.test(velger)) return new Response("Bad request", { status: 400 });
          const ip = request.headers.get("x-ip") || "", now = Date.now();
          this.pollRate = this.pollRate || new Map();
          const r = (this.pollRate.get(ip) || []).filter((t) => now - t < 3600e3);
          if (r.length >= 10) return new Response("Too many", { status: 429 });
          if (Number(this.sql.exec(`SELECT COUNT(*) AS c FROM poll WHERE id=?`, id).toArray()[0].c) >= 50000) return new Response("Full", { status: 429 });
          r.push(now); this.pollRate.set(ip, r);
          if (this.pollRate.size > 5000) this.pollRate.clear();
          this.sql.exec(`INSERT OR REPLACE INTO poll (id, velger, valg, ts) VALUES (?, ?, ?, ?)`, id, velger, valg, now);
        }
        const tall = Array(n).fill(0);
        for (const row of this.sql.exec(`SELECT valg, COUNT(*) AS c FROM poll WHERE id=? GROUP BY valg`, id).toArray()) tall[row.valg] = Number(row.c);
        return Response.json({ id, tall }, { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/versjoner") {
        return new Response(this.setting("versjoner") || "[]", { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/internal/oyet-ved") {
        const d = await this.dagVed(b.t), l = this.loggVed(d, b.t);
        return new Response(l.oyet || "[]", { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/dager") {
        return Response.json(await this.dager());
      }
      if (url.pathname === "/internal/hr-raa" || url.pathname === "/internal/aks-raa") {
        return Response.json(await this.vindu(url.pathname === "/internal/aks-raa" ? "aks" : "hr", b.fra, b.til), { headers: { "cache-control": "public, max-age=30" } });
      }
      if (url.pathname === "/internal/banksok") {
        return Response.json(await this.bankSokFinn(b));
      }
      if (url.pathname === "/internal/tekster") {
        // Innleggene han har skrevet: de som står nå, og de som er slettet men finnes i loggen.
        const alle = new Map();
        for (const r of this.sql.exec(`SELECT v FROM logg WHERE k='notater' ORDER BY ts`).toArray()) { try { for (const x of JSON.parse(r.v) || []) if (x && x.v) alle.set(x.id, x); } catch {} }
        for (const x of this.notater(500)) alle.set(x.id, x);
        return Response.json([...alle.values()].filter((x) => x.v && x.v.trim()).sort((a, b) => b.ts - a.ts).slice(0, 80));
      }
      if (url.pathname === "/internal/sted") {
        return Response.json(await this.stedFinn(b));
      }
      if (url.pathname === "/internal/verdi") {
        return Response.json(this.verdi(b));
      }
      if (url.pathname === "/internal/oyeblikk") {
        return Response.json(this.oyeblikk());
      }
      if (url.pathname === "/internal/historikk") {
        return Response.json(await this.historikk(b.dag));
      }
      if (url.pathname === "/internal/bank-tilbake") {
        return Response.json(await this.bankTilbake(b));
      }
      if (url.pathname === "/internal/plan") {
        return new Response(this.setting("plan") || "null", { headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/internal/spor" && b.t) {
        return Response.json(await this.sporVed(b.t), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/spor") {
        return Response.json(this.spor(), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/bev") {
        return Response.json(this.bevRange(b.k, b.r), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/hr" && b.t) {
        return Response.json(await this.hrVed(b.t), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/hr") {
        return Response.json(this.hrRange(b.r), { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/internal/norge") return Response.json(this.norge());
      if (url.pathname === "/internal/visit") {
        try { await this.merkSted(b); } catch {}
        if (b.side === "podcast") {
          const known = b.vid && this.sql.exec(`SELECT 1 FROM visitors WHERE vid=?`, b.vid).toArray().length > 0;
          this.sql.exec(`INSERT INTO podbesok (ts, ep, land, enhet, ny) VALUES (?, ?, ?, ?, ?)`, Date.now(), b.ep, b.country || "", enhetAv(b.ua), known ? 0 : 1);
          if (this.setting("notifyVisits") === "1")
            await this.pushVisit({ key: "pod:" + (b.vid || pokeNet(b.ip || "")), vid: known ? b.vid : null, first: !known, city: b.city, country: b.country, ua: b.ua, side: "Podcast" + (b.ep ? " · episode " + b.ep : "") });
          return new Response("ok");
        }
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
      pair[1].send(JSON.stringify({ t: "state", visitors: this.allVisitors(), status: this.status(), notifyVisits: this.setting("notifyVisits") === "1", incall: this.incall(), gjor: this.setting("gjor") || "", notater: this.notater() }));
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
      if (v && now - this.hrSaved >= 900) {   // hver måling klokka sender (høyst én i sekundet), til avspillingen
        this.hrSaved = now;
        this.sql.exec(`INSERT OR REPLACE INTO hr (ts, bpm) VALUES (?, ?)`, now, v);
      }
      if (now - this.hrPruned > 3600e3) {
        this.hrPruned = now;
        this.sql.exec(`DELETE FROM hr WHERE ts < ?`, this.slettFor(now));
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
      if (now - (this.posPruned || 0) > 3600e3) { this.posPruned = now; this.sql.exec(`DELETE FROM pos WHERE ts < ?`, this.slettFor(now)); }
      if (n) { const l = this.sporLive(); if (l) { this.toVisitors({ t: "pos", ...l }); this.ctx.waitUntil(this.stedNavn(l.lat, l.lon)); } }
      if (now - (this.matchet || 0) > 60e3) { this.matchet = now; this.ctx.waitUntil(this.matchNye().catch(() => {})); }
      return Response.json({ ok: true, n });
    }
    // Name the place he is at now: the latest position, with a radius. The map then says the name instead of the town.
    if (url.pathname === "/chat/admin/sted-her" && request.method === "POST") {
      const { navn, r } = await request.json().catch(() => ({}));
      const l = this.sporLive();
      if (!l || typeof navn !== "string" || !navn.trim() || navn.length > 80) return new Response("Bad request", { status: 400 });
      const steder = this.steder().filter((x) => x.navn !== navn.trim());
      steder.push({ navn: navn.trim(), lat: l.lat, lon: l.lon, r: Number.isFinite(r) ? Math.min(2000, Math.max(30, r)) : 150, fra: Date.now() });
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('steder', ?)`, JSON.stringify(steder));
      return Response.json({ ok: true, steder: steder.map((x) => x.navn) });
    }
    // Akselerometeret etterfylt fra iPhonens eget bakgrunnsopptak (CMSensorRecorder): {kilde, pakker: [[ts, "x,y,z;…"], …]},
    // 5 s per pakke ved 20 Hz, ts er slutten. Pakker der det allerede finnes en live-pakke (innen 5 s) hoppes over.
    if (url.pathname === "/chat/admin/aks" && request.method === "POST") {
      const { kilde, pakker } = await request.json().catch(() => ({}));
      if (!/^[a-z]{2,12}$/.test(kilde || "") || !Array.isArray(pakker) || pakker.length > 400) return new Response("Bad request", { status: 400 });
      let lagt = 0;
      for (const p of pakker) {
        if (!Array.isArray(p) || !Number.isFinite(p[0]) || typeof p[1] !== "string" || p[1].length > 6000 || !/^[-\d,;]*$/.test(p[1])) continue;
        const ts = Math.round(p[0]);
        if (ts > Date.now() + 60e3 || ts < this.slettFor(Date.now())) continue;
        if (this.sql.exec(`SELECT 1 FROM akslogg WHERE kilde=? AND ts > ? AND ts < ? LIMIT 1`, kilde, ts - 4500, ts + 4500).toArray().length) continue;
        this.sql.exec(`INSERT OR IGNORE INTO akslogg (kilde, ts, acc) VALUES (?, ?, ?)`, kilde, ts, p[1]);
        lagt++;
      }
      return Response.json({ ok: true, lagt });
    }
    // Kameraet på et fyr. Innstillingene ligger i kv. Bildet ligger bare i minnet, og bare mens noen ser på.
    if (url.pathname === "/chat/admin/kamera" && request.method === "GET") {
      const kilde = url.searchParams.get("kilde") || "";
      if (!/^fyr[a-z]$/.test(kilde)) return new Response("Bad request", { status: 400 });
      return Response.json(this.kameraLes(kilde), { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/chat/admin/kamera" && request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      const kilde = b.kilde || "";
      if (!/^fyr[a-z]$/.test(kilde)) return new Response("Bad request", { status: 400 });
      const s = this.kameraRaw(kilde);
      if (b.modus === "pult" || b.modus === "flaske") s.modus = b.modus;
      if (b.kamera === "bak" || b.kamera === "foran") s.kamera = b.kamera;
      if (typeof b.zoom === "number" && Number.isFinite(b.zoom)) s.zoom = Math.round(Math.min(5, Math.max(1, b.zoom)) * 10) / 10;
      if (typeof b.visning === "boolean") {
        s.visning = b.visning;
        if (b.visning) s.sett = Date.now();
      }
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `kamera:${kilde}`, JSON.stringify(s));
      return Response.json(this.kameraLes(kilde));
    }
    // Spørsmålene fyrene stiller Jev om bildet. Kilden er chat-app/sporsmal/sporsmal.json (privat repo), sendt hit med
    // chat-app/sporsmal/send.sh. Bildet går fortsatt bare fra telefonen til Jev; herfra kommer bare teksten.
    if (url.pathname === "/chat/admin/sporsmal" && request.method === "GET") {
      const rad = this.sql.exec(`SELECT v FROM kv WHERE k = 'sporsmal'`).toArray()[0];
      if (!rad) return new Response("Not found", { status: 404 });
      return new Response(rad.v, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (url.pathname === "/chat/admin/sporsmal" && request.method === "POST") {
      const b = await request.json().catch(() => null);
      const gyldig = (q) => q && typeof q === "object" && !Array.isArray(q) && Object.keys(q).length > 0 &&
        Object.values(q).every((x) => x && typeof x.type === "string");
      if (!b || !gyldig(b.flaske) || !gyldig(b.pult)) return new Response("Bad request", { status: 400 });
      const v = new Date().toISOString();
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, "sporsmal", JSON.stringify({ v, flaske: b.flaske, pult: b.pult }));
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, "sporsmal:v", v);
      return Response.json({ ok: true, v });
    }
    if (url.pathname === "/chat/admin/kamera/bilde" && request.method === "POST") {
      const kilde = url.searchParams.get("kilde") || "";
      if (!/^fyr[a-z]$/.test(kilde)) return new Response("Bad request", { status: 400 });
      const s = this.kameraRaw(kilde);
      if (!s.visning || Date.now() - (s.sett || 0) > 30e3) {
        if (s.visning) {
          s.visning = false;
          this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `kamera:${kilde}`, JSON.stringify(s));
        }
        return new Response("Visning er av", { status: 409 });
      }
      const n = Number(request.headers.get("Content-Length") || 0);
      if (n > 300 * 1024) return new Response("For stort", { status: 413 });
      const buf = new Uint8Array(await request.arrayBuffer());
      if (!buf.length) return new Response("Tomt bilde", { status: 400 });
      if (buf.length > 300 * 1024) return new Response("For stort", { status: 413 });
      if (buf[0] !== 0xff || buf[1] !== 0xd8) return new Response("Ikke JPEG", { status: 400 });
      if (!this.kamerabilde) this.kamerabilde = {};
      this.kamerabilde[kilde] = { bytes: buf, ts: Date.now() };
      return Response.json({ ok: true });
    }
    if (url.pathname === "/chat/admin/kamera/bilde" && request.method === "GET") {
      const kilde = url.searchParams.get("kilde") || "";
      if (!/^fyr[a-z]$/.test(kilde)) return new Response("Bad request", { status: 400 });
      const s = this.kameraRaw(kilde);
      if (!s.sett || Date.now() - s.sett > 5e3) {
        s.sett = Date.now();
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `kamera:${kilde}`, JSON.stringify(s));
      }
      const b = (this.kamerabilde || {})[kilde];
      if (!b || Date.now() - b.ts > 10e3) return new Response("Ingen ferskt bilde", { status: 404 });
      return new Response(b.bytes, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
    }
    // Readings from the owner's devices: {kilde: "iphone" | "watch", d: {bat, lader, skritt, trykk, …}}. Only the latest
    // per device is kept; every open page gets it at once.
    if (url.pathname === "/chat/admin/tele" && request.method === "POST") {
      const { kilde, d } = await request.json().catch(() => ({}));
      if (!/^[a-z]{2,12}$/.test(kilde || "") || !d || typeof d !== "object" || JSON.stringify(d).length > 8000) return new Response("Bad request", { status: 400 });
      const ren = {};
      for (const [k, v] of Object.entries(d)) if (/^[a-zA-Z]{1,20}$/.test(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 80) || v === null)) ren[k] = v;
      if (ren.modus !== "pult" && ren.modus !== "flaske") delete ren.modus;
      delete ren.flaskeTs; // tiden settes her, så telefonen ikke kan gjøre en gammel måling fersk
      if ("flaske" in ren) ren.flaskeTs = Date.now();
      // The accelerometer: "x,y,z;…" in hundredths of a g at 20 Hz, a packet every 5 s.
      if (typeof d.acc === "string" && d.acc.length <= 6000 && /^[-\d,;]*$/.test(d.acc)) ren.acc = d.acc;
      // Vannflasken (kameraet i fyr-appen): nivået følger medianen av de tre siste målingene nedover, og går opp når minst
      // to av de tre er mer enn 4 poeng over (påfyll, også litt). Én måling som hopper, flytter det ikke.
      if (typeof ren.flaske === "number" && ren.flaske >= 0 && ren.flaske <= 100) {
        const k = `vann:${kilde}`, f = JSON.parse(this.sql.exec(`SELECT v FROM kv WHERE k=?`, k).toArray()[0]?.v || "{}");
        const siste = [...(f.siste || []), ren.flaske].slice(-3), mid = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
        let niva = f.niva;
        const over = niva == null ? [] : siste.filter((x) => x > niva + 4);
        if (niva == null) { if (siste.length >= 2) niva = mid(siste); }
        else if (over.length >= 2) niva = mid(over);
        else if (mid(siste) < niva) niva = mid(siste);
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, k, JSON.stringify({ niva, siste }));
        if (niva != null) ren.vann = niva;
      }
      // Mikrofonen (verktoy/lyd): nye ord hvert sekund summeres til ord i dag (Oslo-døgnet). Bare antallet, aldri ordene.
      if (typeof ren.ord === "number" && ren.ord >= 0 && ren.ord < 1000) {
        const k = `ord:${kilde}:${osloDay(Date.now())}`, n = Number(this.sql.exec(`SELECT v FROM kv WHERE k=?`, k).toArray()[0]?.v || 0) + ren.ord;
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, k, String(n));
        ren.ordIdag = n;
      }
      const gml = this.sql.exec(`SELECT v FROM kv WHERE k=?`, `tele:${kilde}`).toArray()[0];
      const ny = { ...(gml ? JSON.parse(gml.v) : {}), ...ren, ts: Date.now() };
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `tele:${kilde}`, JSON.stringify(ny));
      if (/^fyr[a-z]$/.test(kilde) && ["flaske", "harflaske", "modus", "pult", "stilling", "plagg", "farge", "hodetelefoner"].some((k) => k in ren)) this.kontorOppdater();
      {
        const v = kilde === "iphone" ? ren.bevegelse : /^watch[rl]?$/.test(kilde) ? ren.haand : undefined;
        if (typeof v === "number" && v >= 0 && v < 20) {
          this.sql.exec(`INSERT OR REPLACE INTO bevegelse (k, ts, v) VALUES (?, ?, ?)`, kilde, ny.ts, v);
          if (ny.ts - (this.bevegelsePruned || 0) > 3600e3) { this.bevegelsePruned = ny.ts; this.sql.exec(`DELETE FROM bevegelse WHERE ts < ?`, this.slettFor(ny.ts)); }
        }
      }
      if (kilde === "iphone" && typeof ren.bevegelse === "number") {
        this.sql.exec(`INSERT OR REPLACE INTO bev (ts, v) VALUES (?, ?)`, ny.ts, ren.bevegelse);
        if (ny.ts - (this.bevPruned || 0) > 3600e3) { this.bevPruned = ny.ts; this.sql.exec(`DELETE FROM bev WHERE ts < ?`, ny.ts - 864e5); }
      }
      if (ren.acc) {
        this.sql.exec(`INSERT OR REPLACE INTO akslogg (kilde, ts, acc) VALUES (?, ?, ?)`, kilde, ny.ts, ren.acc);
        if (ny.ts - (this.aksPruned || 0) > 3600e3) { this.aksPruned = ny.ts; this.sql.exec(`DELETE FROM akslogg WHERE ts < ?`, this.slettFor(ny.ts)); }
      }
      this.teleLogg = this.teleLogg || {};
      if (ny.ts - (this.teleLogg[kilde] || 0) >= 60e3) {
        this.teleLogg[kilde] = ny.ts;
        const d = {};
        for (const k of ["bat", "lader", "meter", "skritt", "etasjer", "lyd", "nett", "bevegelse", "haand", "aktivitet", "trykk", "ledig", "snakker", "ordIdag", "flaske", "vann", "harflaske", "pult", "stilling", "plagg", "farge", "hodetelefoner", "modus", "flaskeTs"]) if (ny[k] !== undefined) d[k] = ny[k];
        this.sql.exec(`INSERT OR REPLACE INTO telelogg (kilde, ts, d) VALUES (?, ?, ?)`, kilde, ny.ts, JSON.stringify(d));
        if (ny.ts - (this.teleLoggPruned || 0) > 3600e3) { this.teleLoggPruned = ny.ts; this.sql.exec(`DELETE FROM telelogg WHERE ts < ?`, this.slettFor(ny.ts)); }
      }
      const { acc, ...uten } = ny;   // the chat pages don't need the accelerometer; the map page fetches it
      this.toVisitors({ t: "tele", kilde, d: uten });
      return Response.json({ ok: true });
    }
    // Rom hjemme. Fyrene (gamle iPhoner som står fast i huset) sender Bluetooth-signal og sitt eget lufttrykk.
    // iPhonen hans sender hvor sterkt den hører hvert fyr og sitt lufttrykk. Med «laer» lagres målingen som et eksempel
    // på rommet; ellers velges rommet med de mest like eksemplene. Ser telefonen ingen fyr, sender den ingenting, og
    // rommet forsvinner fra siden etter 30 s.
    if (url.pathname === "/chat/admin/fyr" && request.method === "POST") {
      const { nr, navn, trykk } = await request.json().catch(() => ({}));
      if (!Number.isInteger(nr) || nr < 1 || nr > 99 || !(trykk > 800 && trykk < 1100)) return new Response("Bad request", { status: 400 });
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, `fyr:${nr}`, JSON.stringify({ nr, navn: String(navn || "").slice(0, 40), trykk, ts: Date.now() }));
      return Response.json({ ok: true });
    }
    if (url.pathname === "/chat/admin/rom" && request.method === "POST") {
      const { b, trykk, laer } = await request.json().catch(() => ({}));
      if (!b || typeof b !== "object") return new Response("Bad request", { status: 400 });
      const sig = {};
      for (const [k, v] of Object.entries(b)) if (/^\d{1,2}$/.test(k) && v < 0 && v > -110) sig[k] = Math.round(v);
      const h = this.romHoyde(trykk), now = Date.now();
      if (typeof laer === "string" && laer.trim()) {
        if (!Object.keys(sig).length) return Response.json({ ok: false, feil: "Ser ingen fyr" });
        const rom = laer.trim().slice(0, 40);
        this.sql.exec(`INSERT INTO romprove (rom, ts, b, h) VALUES (?, ?, ?, ?)`, rom, now, JSON.stringify(sig), h);
        this.romProver = null;
        return Response.json({ ok: true, n: this.sql.exec(`SELECT COUNT(*) AS n FROM romprove WHERE rom=?`, rom).one().n });
      }
      if (!Object.keys(sig).length) return Response.json({ ok: true });
      // Flertallet av gjetningene de siste 15 s, så rommet ikke hopper frem og tilbake på et enkelt støyende svar.
      this.romSiste = (this.romSiste || []).filter((x) => now - x.ts < 15e3);
      const g = this.romGjett(sig, h);
      if (g) this.romSiste.push({ rom: g, ts: now });
      const tell = {};
      for (const x of this.romSiste) tell[x.rom] = (tell[x.rom] || 0) + 1;
      const rom = Object.keys(tell).sort((a, c) => tell[c] - tell[a])[0] || null;
      if (rom) {
        if (rom !== this.romForrige) { this.romForrige = rom; this.loggFor("rom", rom); }
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('rom', ?)`, JSON.stringify({ rom, ts: now }));
      }
      return Response.json({ ok: true, rom, gjett: g, h });
    }
    if (url.pathname === "/chat/admin/rom" && request.method === "GET") {
      const rom = this.rom();
      const liste = this.sql.exec(`SELECT rom, COUNT(*) AS n FROM romprove GROUP BY rom ORDER BY MIN(id)`).toArray();
      const fyr = this.sql.exec(`SELECT v FROM kv WHERE k LIKE 'fyr:%'`).toArray().map((r) => JSON.parse(r.v));
      return Response.json({ rom, liste, fyr });
    }
    // SpareBank 1: lager lenken til BankID-innloggingen (state lever i 15 min, så bare eieren kan koble en bank).
    if (url.pathname === "/chat/admin/bank/start" && request.method === "POST") {
      if (!this.env.SB1_CLIENT_ID || !this.env.SB1_FININST) return Response.json({ feil: "SB1_CLIENT_ID og SB1_FININST mangler" }, { status: 400 });
      const state = crypto.randomUUID();
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('sb1state', ?)`, JSON.stringify({ state, til: Date.now() + 15 * 60e3 }));
      const q = new URLSearchParams({ finInst: this.env.SB1_FININST, client_id: this.env.SB1_CLIENT_ID, state, redirect_uri: SB1_TILBAKE, response_type: "code" });
      return Response.json({ url: "https://api.sparebank1.no/oauth/authorize?" + q });
    }
    // Besøk på podcastsiden: totalt, i dag, siste 7 dager, per episode og per dag (siste 30).
    if (url.pathname === "/chat/admin/podcast") {
      const idag = osloMidnight(Date.now()), n = (q, ...a) => this.sql.exec(q, ...a).one().n;
      return Response.json({
        totalt: n(`SELECT COUNT(*) AS n FROM podbesok`),
        idag: n(`SELECT COUNT(*) AS n FROM podbesok WHERE ts >= ?`, idag),
        uke: n(`SELECT COUNT(*) AS n FROM podbesok WHERE ts >= ?`, Date.now() - 7 * 864e5),
        nye: n(`SELECT COUNT(*) AS n FROM podbesok WHERE ny = 1`),
        episoder: this.sql.exec(`SELECT ep, COUNT(*) AS n FROM podbesok GROUP BY ep ORDER BY ep`).toArray(),
        dager: this.sql.exec(`SELECT ts FROM podbesok WHERE ts >= ?`, Date.now() - 30 * 864e5).toArray()
          .reduce((m, r) => { const d = osloDay(r.ts); m[d] = (m[d] || 0) + 1; return m; }, {}),
        land: this.sql.exec(`SELECT land, COUNT(*) AS n FROM podbesok GROUP BY land ORDER BY n DESC`).toArray(),
        enheter: this.sql.exec(`SELECT enhet, COUNT(*) AS n FROM podbesok GROUP BY enhet ORDER BY n DESC`).toArray(),
      });
    }
    if (url.pathname === "/chat/admin/versjoner/hent" && request.method === "POST") {
      return Response.json({ antall: await this.versjonerOppdater() });
    }
    if (url.pathname === "/chat/admin/bank/hent" && request.method === "POST") {
      return Response.json(await this.bankOppdater(true));
    }
    if (url.pathname === "/chat/admin/plan" && request.method === "POST") {
      const t = await request.text();
      let p; try { p = JSON.parse(t); } catch {}
      if (!p || !Array.isArray(p.rom) || t.length > 900000) return new Response("Bad request", { status: 400 });
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('plan', ?)`, t);
      return Response.json({ ok: true, rom: p.rom.length });
    }
    if (url.pathname === "/chat/admin/rom-slett" && request.method === "POST") {
      const { rom } = await request.json().catch(() => ({}));
      this.sql.exec(`DELETE FROM romprove WHERE rom=?`, String(rom || ""));
      this.romProver = null;
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
      } else if (m.t === "slettmelding" && Number.isInteger(m.id)) {
        // A visitor deletes one of their own messages.
        await this.slettMelding(a.vid, m.id, false);
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
      } else if (m.t === "slettmelding" && typeof m.vid === "string" && Number.isInteger(m.id)) {
        // The owner deletes one message in a conversation (his own or the visitor's).
        await this.slettMelding(m.vid, m.id, true);
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
      } else if (m.t === "nynotat" && typeof m.v === "string" && m.v.trim()) {
        // Posts on the front page: new, edit (the time stays), delete. Every app gets the whole list back.
        this.sql.exec(`INSERT INTO notater (v, ts) VALUES (?, ?)`, m.v.trim().slice(0, 600), Date.now());
        this.toOwners({ t: "notater", notater: this.notater() });
        this.loggFor("notater", JSON.stringify(this.notater(20)));
      } else if (m.t === "endrenotat" && Number.isInteger(m.id) && typeof m.v === "string" && m.v.trim()) {
        this.sql.exec(`UPDATE notater SET v=? WHERE id=?`, m.v.trim().slice(0, 600), m.id);
        this.toOwners({ t: "notater", notater: this.notater() });
        this.loggFor("notater", JSON.stringify(this.notater(20)));
      } else if (m.t === "slettnotat" && Number.isInteger(m.id)) {
        this.sql.exec(`DELETE FROM notater WHERE id=?`, m.id);
        this.toOwners({ t: "notater", notater: this.notater() });
        this.loggFor("notater", JSON.stringify(this.notater(20)));
      } else if (m.t === "setgjor" && ["", "jobber", "trener"].includes(m.v)) {
        // What he is doing, shown on the map page: Jobber, Trener (or nothing). Sleeping is the status, not this.
        this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('gjor', ?)`, m.v);
        this.toOwners({ t: "gjor", v: m.v });
        this.loggFor("gjor", m.v);
      } else if (m.t === "setstatus" && ["available", "meeting", "sleeping"].includes(m.v)) {
        // Asleep: «Holder på med» goes away (the night layer already says he sleeps).
        if (m.v === "sleeping") { this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('gjor', '')`); this.toOwners({ t: "gjor", v: "" }); this.loggFor("gjor", ""); }
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

  async webSocketClose(ws) { this.gone(ws); this.loggBesok(); }
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

  // One message gone, everywhere: the row, its file in R2 (image, voice message, GIF), the visitor's page and the apps.
  // A visitor may only delete their own messages; the owner any message in the conversation.
  async slettMelding(vid, id, avEier) {
    const r = this.sql.exec(`SELECT file, from_owner FROM messages WHERE id=? AND vid=?`, id, vid).toArray()[0];
    if (!r || (!avEier && r.from_owner)) return;
    this.sql.exec(`DELETE FROM messages WHERE id=? AND vid=?`, id, vid);
    if (r.file) await this.env.FILES.delete(r.file).catch(() => {});
    this.toVisitor(vid, { t: "slettet", id });
    this.toOwners({ t: "slettet", vid, id });
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
    this.ctx.waitUntil(this.glemEierNett(ip));
  }

  // Where people opened the site, from Cloudflare's IP lookup. One row per person per city.
  // The owner's networks, and a browser that returns on HJEMME_DAGER different days, are left out.
  // The public answer is only city, count and time.
  stedKlargjor() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS stedtreff (
      hvem TEXT, land TEXT, by TEXT, region TEXT, lat REAL, lon REAL, ts INTEGER,
      PRIMARY KEY (hvem, land, by))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS stedkjenner (
      hvem TEXT PRIMARY KEY, dager INTEGER, sist TEXT, hjemme INTEGER)`);
    if (this.setting("stedTilbake") === "1") return;
    const tunge = new Set(this.sql.exec(
      `SELECT v.vid AS vid FROM visitors v
       LEFT JOIN (
         SELECT vid, COUNT(*) AS n, COUNT(DISTINCT CAST(start / 86400000 AS INTEGER)) AS d
         FROM sessions GROUP BY vid
       ) s ON s.vid = v.vid
       WHERE COALESCE(s.d, 0) >= 5 OR COALESCE(s.n, 0) >= 20`
    ).toArray().map((r) => r.vid));
    for (const v of this.sql.exec(`SELECT vid, first_seen, city, region, country, lat, lon, ua FROM visitors`).toArray()) {
      if (!v.vid || tunge.has(v.vid) || !v.ua || BOT.test(v.ua)) continue;
      const by = penSted(v.city), land = String(v.country || "").toUpperCase();
      const lat = Number(v.lat), lon = Number(v.lon);
      if (!by || !/^[A-Z]{2}$/.test(land) || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
      this.sql.exec(
        `INSERT OR IGNORE INTO stedtreff (hvem, land, by, region, lat, lon, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        "g:" + v.vid, land, by, String(v.region || "").slice(0, 80), lat, lon, v.first_seen || Date.now());
    }
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('stedTilbake', '1')`);
  }

  async stedSalt() {
    if (this.setting("stedSalt")) return this.setting("stedSalt");
    this.sql.exec(`INSERT OR IGNORE INTO kv (k, v) VALUES ('stedSalt', ?)`, crypto.randomUUID());
    return this.setting("stedSalt");
  }

  async stedHvem(nokkel) {
    return sha256hex((await this.stedSalt()) + "|" + nokkel);
  }

  stedGlem(hvem) {
    this.sql.exec(`INSERT OR REPLACE INTO stedkjenner (hvem, dager, sist, hjemme) VALUES (?, 99, ?, 1)`, hvem, osloDay(Date.now()));
    this.sql.exec(`DELETE FROM stedtreff WHERE hvem=?`, hvem);
  }

  async glemEierNett(ip) {
    try {
      this.stedKlargjor();
      const net = pokeNet(ip || "");
      if (!net) return;
      this.stedGlem(await this.stedHvem("n|" + net));
    } catch {}
  }

  async merkSted(b) {
    this.stedKlargjor();
    if (!b || DC.test(b.org || "")) return;
    const by = penSted(b.city), land = String(b.country || "").toUpperCase();
    const lat = Number(b.lat), lon = Number(b.lon);
    if (!by || !/^[A-Z]{2}$/.test(land) || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    const ip = b.ip || "", net = ip ? pokeNet(ip) : "";
    if (net && this.ownerNets().includes(net)) {
      this.stedGlem(await this.stedHvem("n|" + net));
      if (b.vid) {
        this.stedGlem(await this.stedHvem("v|" + b.vid));
        this.sql.exec(`DELETE FROM stedtreff WHERE hvem=?`, "g:" + b.vid);
      }
      return;
    }
    const nokkel = b.vid ? "v|" + b.vid : net ? "n|" + net : "";
    if (!nokkel) return;
    const hvem = await this.stedHvem(nokkel);
    const k = this.sql.exec(`SELECT dager, sist, hjemme FROM stedkjenner WHERE hvem=?`, hvem).toArray()[0];
    if (k && k.hjemme) {
      if (b.vid) this.sql.exec(`DELETE FROM stedtreff WHERE hvem=?`, "g:" + b.vid);
      return;
    }
    // Only a returning browser (a cookie) can be "here all the time". A bare address is counted once per city:
    // mobile networks share an address across many people, so a day-count on it would drop them.
    if (b.vid) {
      const dag = osloDay(Date.now());
      let dager = k ? k.dager : 0;
      if (!k || k.sist !== dag) {
        dager += 1;
        if (dager >= HJEMME_DAGER) {
          this.stedGlem(hvem);
          this.sql.exec(`DELETE FROM stedtreff WHERE hvem=?`, "g:" + b.vid);
          return;
        }
        this.sql.exec(`INSERT OR REPLACE INTO stedkjenner (hvem, dager, sist, hjemme) VALUES (?, ?, ?, 0)`, hvem, dager, dag);
      }
    }
    let ts = Date.now();
    if (b.vid) {
      const g = this.sql.exec(`SELECT ts FROM stedtreff WHERE hvem=? AND land=? AND by=?`, "g:" + b.vid, land, by).toArray()[0];
      if (g && g.ts && g.ts < ts) ts = g.ts;
      this.sql.exec(`DELETE FROM stedtreff WHERE hvem=?`, "g:" + b.vid);
    }
    this.sql.exec(
      `INSERT OR IGNORE INTO stedtreff (hvem, land, by, region, lat, lon, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      hvem, land, by, String(b.region || "").slice(0, 80), lat, lon, ts);
  }

  norge() {
    this.stedKlargjor();
    return slagSteder(this.sql.exec(`SELECT hvem, land, by, region, lat, lon, ts FROM stedtreff`).toArray());
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
  // t: i avspillingen gjelder et sted bare fra det ble lagt inn (steder fra før «fra» fantes: kjente steder kom 22.10. 19:53).
  kjentSted(lat, lon, t = Date.now()) {
    for (const x of this.steder()) if ((x.fra || 1792691580000) <= t && Math.hypot((lat - x.lat) * 111.2e3, (lon - x.lon) * 111.2e3 * Math.cos(lat * Math.PI / 180)) <= x.r) return x.navn;
    return null;
  }

  // A push to the owner's phone for every tomato, at once. No grouping and no throttle: it is supposed to be spammy.
  tomatVarsel(by) {
    const l = this.sporLive(), hjemme = l && l.kjent === "hjemme hos moren sin";
    this.ctx.waitUntil(this.push(hjemme ? "🍅 Taper!" : "🍅 Tomat!", by ? `Noen i ${by} kastet en tomat på deg` : "Noen kastet en tomat på deg", null, { thread: "tomat" }));
  }

  // ---------- SpareBank 1 (personlig API) ----------
  // Tilgangen varer 10 min og fornyes med refresh-tokenet (365 dager), som byttes ut hver gang det brukes. Hvert kvarter:
  // kontoene med saldo og disponibelt (ingen transaksjoner), lagret i kv 'bank' og vist på forsiden. Kontonumrene vises
  // bare med de fire siste sifrene. Går fornyelsen ut, kommer et varsel om å logge inn igjen.
  async sb1Token(grant) {
    const body = new URLSearchParams({ client_id: this.env.SB1_CLIENT_ID, client_secret: this.env.SB1_CLIENT_SECRET, ...grant });
    const r = await fetch("https://api.sparebank1.no/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || "token " + r.status);
    const t = { access: j.access_token, exp: Date.now() + (j.expires_in || 600) * 1000 - 30e3, refresh: j.refresh_token || null,
      rexp: Date.now() + (j.refresh_token_expires_in || 365 * 86400) * 1000 };
    const gml = this.sb1();
    if (!t.refresh && gml) { t.refresh = gml.refresh; t.rexp = gml.rexp; }
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('sb1', ?)`, JSON.stringify(t));
    return t;
  }

  sb1() { try { return JSON.parse(this.setting("sb1") || "null"); } catch { return null; } }

  async bankTilbake({ code, state, feil }) {
    if (feil) return { ok: false, feil };
    const s = JSON.parse(this.setting("sb1state") || "null");
    if (!s || s.state !== state || Date.now() > s.til || !code) return { ok: false, feil: "Lenken er brukt eller for gammel. Lag en ny." };
    this.sql.exec(`DELETE FROM kv WHERE k='sb1state'`);
    try {
      await this.sb1Token({ grant_type: "authorization_code", code, redirect_uri: SB1_TILBAKE, state });
      await this.bankOppdater(true);
      return { ok: true };
    } catch (e) { return { ok: false, feil: String(e.message || e) }; }
  }

  async bankOppdater(tving) {
    let t = this.sb1();
    if (!t || !this.env.SB1_CLIENT_ID) return { ok: false, feil: "ikke koblet" };
    const nå = Date.now();
    if (!tving && nå - (this.bankHentet || 0) < 10 * 60e3) return { ok: true, hoppet: true };
    this.bankHentet = nå;
    if (nå > t.exp) {
      if (!t.refresh || nå > t.rexp) return { ok: false, feil: "innloggingen er utløpt" };
      try { t = await this.sb1Token({ grant_type: "refresh_token", refresh_token: t.refresh }); }
      catch (e) {
        if (!this.setting("sb1varslet")) { this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('sb1varslet', '1')`); await this.push("🏦 Banken", "Koblingen til SpareBank 1 må fornyes med BankID.", null, { thread: "bank" }); }
        return { ok: false, feil: String(e.message || e) };
      }
      this.sql.exec(`DELETE FROM kv WHERE k='sb1varslet'`);
    }
    const hent = async (sti) => {
      const r = await fetch("https://api.sparebank1.no" + sti, { headers: { Authorization: "Bearer " + t.access, Accept: "application/vnd.sparebank1.v1+json; charset=utf-8" } });
      if (!r.ok) throw new Error(sti + " " + r.status);
      return r.json();
    };
    try {
      const a = await hent("/personal/banking/accounts");
      const liste = (a.accounts || a.list || (Array.isArray(a) ? a : [])).slice(0, 12);
      const kontoer = liste.map((k) => ({ key: k.key, navn: k.name || k.description || k.product || "Konto", nr: String(k.accountNumber?.formatted || k.accountNumber?.value || k.accountNumber || "").replace(/\D/g, "").slice(-4),
        saldo: Number(k.balance?.amount ?? k.balance ?? 0), disp: Number(k.availableBalance?.amount ?? k.availableBalance ?? 0), valuta: k.currencyCode || k.balance?.currencyCode || "NOK", type: k.type || "" }));
      // Summen er det disponible (det nettbanken viser): bokført saldo endrer seg først når en overføring er bokført.
      const bank = { ts: nå, kontoer: kontoer.map(({ key, ...k }) => k), sum: kontoer.reduce((s, k) => s + k.disp, 0) };
      const forrige = this.setting("bank");
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('bank', ?)`, JSON.stringify(bank));
      // Historikken: saldoene hver gang de endrer seg (og minst én gang i timen).
      const nøkkel = JSON.stringify(bank.kontoer);
      if (!forrige || JSON.stringify(JSON.parse(forrige).kontoer) !== nøkkel || nå - (this.bankLogget || 0) > 3600e3) { this.bankLogget = nå; this.loggFor("bank", JSON.stringify(bank)); }
      // Kontoutskriftene lagres privat (vises ikke): de siste transaksjonene på hver konto, uten dubletter.
      for (const k of kontoer) {
        try {
          const tr = await hent("/personal/banking/transactions?accountKey=" + encodeURIComponent(k.key));
          for (const x of tr.transactions || tr.list || []) {
            const tid = typeof x.date === "number" ? x.date : Date.parse(x.date || x.bookingDate || x.valueDate || x.accountingDate || "") || null;
            const belop = Number(x.amount?.amount ?? x.amount ?? 0), tekst = String(x.cleanedDescription || x.description || x.reference || "").slice(0, 200);
            const id = String(x.id || [k.key, tid, belop, tekst].join("|")).slice(0, 300);
            this.sql.exec(`INSERT OR IGNORE INTO banktrans (id, konto, tid, belop, tekst, sett) VALUES (?, ?, ?, ?, ?, ?)`, id, k.navn, tid, belop, tekst, nå);
          }
        } catch {}
      }
      return { ok: true, kontoer: bank.kontoer.length };
    } catch (e) { return { ok: false, feil: String(e.message || e) }; }
  }

  bank() { try { return JSON.parse(this.setting("bank") || "null"); } catch { return null; } }

  // Heia: en push for hvert heiarop, som tomatene.
  heiaVarsel(by) {
    this.ctx.waitUntil(this.push("📣 Heia!", by ? `Noen i ${by} sier heia til deg` : "Noen sier heia til deg", null, { thread: "heia" }));
  }

  notater(n = 100) {
    return this.sql.exec(`SELECT id, v, ts FROM notater ORDER BY ts DESC, id DESC LIMIT ?`, n).toArray();
  }

  kast() {
    const n = (k) => Number(this.sql.exec(`SELECT v FROM kv WHERE k=?`, `kast:${k}`).toArray()[0]?.v || 0);
    return { le: n("le"), tomat: n("tomat"), heia: n("heia") };
  }

  tele() {
    const out = {};
    for (const r of this.sql.exec(`SELECT k, v FROM kv WHERE k LIKE 'tele:%' OR k='sted'`).toArray()) {
      try { out[r.k === "sted" ? "sted" : r.k.slice(5)] = JSON.parse(r.v); } catch {}
    }
    return out;
  }

  // fyra ser på flasken, de andre fyrene på pulten, til noen endrer det.
  kameraRaw(kilde) {
    const s = { modus: kilde === "fyra" ? "flaske" : "pult", kamera: "bak", zoom: 1, visning: false, sett: 0 };
    const r = this.sql.exec(`SELECT v FROM kv WHERE k=?`, `kamera:${kilde}`).toArray()[0];
    if (!r) return s;
    try {
      const j = JSON.parse(r.v);
      if (j.modus === "pult" || j.modus === "flaske") s.modus = j.modus;
      if (j.kamera === "bak" || j.kamera === "foran") s.kamera = j.kamera;
      if (typeof j.zoom === "number" && j.zoom >= 1 && j.zoom <= 5) s.zoom = Math.round(j.zoom * 10) / 10;
      if (typeof j.visning === "boolean") s.visning = j.visning;
      if (typeof j.sett === "number") s.sett = j.sett;
    } catch {}
    return s;
  }

  kameraLes(kilde) {
    const { modus, kamera, zoom, visning } = this.kameraRaw(kilde);
    // Versjonen av spørsmålene til Jev: fyret henter dem på nytt når den endrer seg.
    const sporsmalV = this.sql.exec(`SELECT v FROM kv WHERE k = 'sporsmal:v'`).toArray()[0]?.v ?? null;
    return { modus, kamera, zoom, visning, sporsmalV };
  }

  // Skriver tele:kontor på nytt fra det fyrene sist sendte. Forsiden regner det samme selv, så kortet
  // skifter når flaskemålingen blir eldre enn 2 min uten å vente på neste post.
  kontorOppdater() {
    const nå = Date.now();
    const kilder = this.sql.exec(`SELECT k, v FROM kv WHERE k LIKE 'tele:fyr%'`).toArray().flatMap((r) => {
      try { return [{ kilde: r.k.slice(5), ...JSON.parse(r.v) }]; } catch { return []; }
    });
    const d = kontorAv(kilder, nå);
    if (!d) return;
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('tele:kontor', ?)`, JSON.stringify(d));
    this.toVisitors({ t: "tele", kilde: "kontor", d });
  }

  // Høyden over fyr 1 i meter, fra forskjellen i lufttrykk (ca. 8,4 m per hPa). Været endrer begge likt.
  romHoyde(trykk) {
    if (!(trykk > 800 && trykk < 1100)) return null;
    const fyr = this.sql.exec(`SELECT v FROM kv WHERE k LIKE 'fyr:%'`).toArray().map((r) => JSON.parse(r.v))
      .filter((f) => Date.now() - f.ts < 15 * 60e3).sort((a, c) => a.nr - c.nr)[0];
    return fyr ? Math.round((fyr.trykk - trykk) * 84) / 10 : null;
  }

  // De fem nærmeste eksemplene stemmer, de nærmeste teller mest. Et fyr som ikke høres regnes som −100 dBm;
  // én meter høyde teller som 4 dB.
  romGjett(sig, h) {
    if (!this.romProver) this.romProver = this.sql.exec(`SELECT rom, b, h FROM romprove`).toArray().map((r) => ({ rom: r.rom, b: JSON.parse(r.b), h: r.h }));
    if (!this.romProver.length) return null;
    const avst = (p) => {
      let d = 0;
      for (const k of new Set([...Object.keys(sig), ...Object.keys(p.b)])) d += ((sig[k] ?? -100) - (p.b[k] ?? -100)) ** 2;
      if (h != null && p.h != null) d += (4 * (h - p.h)) ** 2;
      return Math.sqrt(d);
    };
    const naer = this.romProver.map((p) => ({ rom: p.rom, d: avst(p) })).sort((a, c) => a.d - c.d).slice(0, 5);
    const stemme = {};
    for (const x of naer) stemme[x.rom] = (stemme[x.rom] || 0) + 1 / (1 + x.d);
    return Object.keys(stemme).sort((a, c) => stemme[c] - stemme[a])[0];
  }

  rom() {
    const r = this.setting("rom");
    try { const x = r && JSON.parse(r); return x && Date.now() - x.ts < 30e3 ? x.rom : null; } catch { return null; }
  }

  // Sporet for én Oslo-dag (YYYY-MM-DD). Ferdige dager huskes, i dag regnes ut på nytt hvert minutt.
  // Historikken for én Oslo-dag til avspillingen. Dager som er slettet fra databasen hentes fra arkivet i R2.
  async historikk(dag) {
    const start = osloMidnight(Date.parse(dag + "T12:00:00Z")), slutt = osloMidnight(start + 36 * 3600e3);
    this.histMemo = this.histMemo instanceof Map ? this.histMemo : new Map();
    const m = this.histMemo.get(dag);
    if (m && (slutt < Date.now() || Date.now() - m.at < 60e3)) return m.v;
    const iBasen = start >= this.slettFor(Date.now());
    const d = iBasen ? this.dagData(dag) : await this.arkivDag(dag);
    if (!d) return { dag, start, slutt, trail: [], hr: [], tele: [], logg: [] };
    // Pulsen som snitt per 15 s (rå puls hentes i vinduer), målingene én per minutt, endringene med tilstanden ved midnatt.
    const hr15 = new Map();
    for (const [ts, b] of d.hr) { const t = Math.floor(ts / 15000) * 15000, x = hr15.get(t) || [0, 0]; x[0] += b; x[1]++; hr15.set(t, x); }
    const v = { dag, start, slutt, trail: this.sporFra(d.pos, d.veispor), hr: [...hr15].map(([t, x]) => [t, Math.round(x[0] / x[1])]), tele: d.tele, logg: d.logg };
    if (this.histMemo.size > 40) this.histMemo.clear();
    this.histMemo.set(dag, { at: Date.now(), v });
    return v;
  }

  // ---------- Siden slik den var (gamle versjoner i avspillingen spør med ?t=) ----------
  // Én dags data, husket: i dag i 60 s, eldre dager så lenge de er blant de seks siste som er brukt.
  async dagVed(t) {
    const dag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(t), nå = Date.now();
    this.dagMemo = this.dagMemo instanceof Map ? this.dagMemo : new Map();
    const m = this.dagMemo.get(dag);
    if (m && (m.slutt < nå || nå - m.at < 60e3)) return m.d;
    const start = osloMidnight(Date.parse(dag + "T12:00:00Z")), slutt = osloMidnight(start + 36 * 3600e3);
    const d = start >= this.slettFor(nå) ? this.dagData(dag) : await this.arkivDag(dag);
    if (this.dagMemo.size > 6) this.dagMemo.delete(this.dagMemo.keys().next().value);
    this.dagMemo.set(dag, { at: nå, slutt, d });
    return d;
  }

  // Siste verdi i loggen (gjor, status, notater, bank, kast, rom, sted) før t.
  loggVed(d, t) {
    const v = {};
    for (const [ts, k, x] of d?.logg || []) { if (ts > t) break; v[k] = x; }
    return v;
  }

  // Det /chat/spor ga på tidspunktet t: posisjon og spor fram til t, målingene, pulsen siste 5 min og loggen.
  async sporVed(t) {
    const d = await this.dagVed(t);
    if (!d) return { now: t, live: null, trail: [], tele: {}, bev: [], puls: [], kast: { le: 0, tomat: 0, heia: 0 }, gjor: "", notater: [], rom: null, bank: null };
    const pos = d.pos.filter((p) => p.ts <= t), p = pos[pos.length - 1];
    const live = p ? { modus: "ekte", ts: p.ts, lat: p.lat, lon: p.lon, acc: p.acc, spd: p.spd, alt: p.alt, hdg: p.hdg, kjent: this.kjentSted(p.lat, p.lon, p.ts) } : null;
    const tele = {};
    for (const [ts, kilde, x] of d.tele) { if (ts > t) break; tele[kilde] = { ...x, ts }; }
    const l = this.loggVed(d, t), json = (x, f) => { try { return x ? JSON.parse(x) : f; } catch { return f; } };
    if (l.sted) tele.sted = json(l.sted, undefined);
    let notater = json(l.notater, null);
    if (!notater) notater = this.notater(20).filter((n) => n.ts <= t);
    return {
      now: t, live, trail: this.sporFra(pos, d.veispor, t), tele, bev: [],
      puls: d.hr.filter((h) => h[0] > t - 5 * 60e3 && h[0] <= t),
      kast: json(l.kast, { le: 0, tomat: 0, heia: 0 }), gjor: l.gjor || "", notater, rom: l.rom || null, bank: json(l.bank, null),
    };
  }

  // Pulsen i dag fram til t (snitt per minutt), og livepulsen om klokka sendte de siste 20 s før t.
  async hrVed(t) {
    const d = await this.dagVed(t), start = d ? d.start : osloMidnight(t), min = new Map();
    let live = null;
    for (const [ts, b] of d ? d.hr : []) {
      if (ts > t) break;
      const m = Math.floor((ts - start) / 60000), x = min.get(m) || [0, 0]; x[0] += b; x[1]++; min.set(m, x);
      if (t - ts < 20e3) live = b;
    }
    const pts = [...min].map(([m, x]) => [m, Math.round(x[0] / x[1])]), v = pts.map((p) => p[1]);
    return { r: "dag", start, now: t, step: 1, live, pts, beats: v.reduce((a, b) => a + b, 0), mins: v.length, lo: v.length ? Math.min(...v) : null, hi: v.length ? Math.max(...v) : null };
  }

  async statusVed(t) {
    const d = await this.dagVed(t), l = this.loggVed(d, t);
    let hr = null;
    for (const [ts, b] of d ? d.hr : []) { if (ts > t) break; if (t - ts < 20e3) hr = b; }
    // Når han la seg: siste skifte til «Sover» før t (samme dag; ellers vet vi det ikke).
    let sovnet = null, før = null;
    const igår = l.status === "sleeping" ? await this.dagVed(t - 864e5).catch(() => null) : null;
    for (const [ts, k, x] of [...(igår?.logg || []), ...(d?.logg || [])]) { if (ts > t) break; if (k !== "status") continue; if (x === "sleeping" && før !== "sleeping" && før !== null) sovnet = ts; if (x !== "sleeping") sovnet = null; før = x; }
    return { status: l.status || "available", sovnet: l.status === "sleeping" ? sovnet : null, owner: false, hr };
  }

  // Rå puls og akselerometerpakker i et vindu (høyst 30 min), fra databasen eller arkivet.
  async vindu(type, fra, til) {
    if (fra >= this.slettFor(Date.now()))
      return type === "aks"
        ? this.sql.exec(`SELECT ts, kilde, acc FROM akslogg WHERE ts >= ? AND ts < ? ORDER BY ts`, fra, til).toArray().map((r) => [r.ts, r.kilde, r.acc])
        : this.sql.exec(`SELECT ts, bpm FROM hr WHERE ts >= ? AND ts < ? ORDER BY ts`, fra, til).toArray().map((r) => [r.ts, r.bpm]);
    const dag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(fra);
    const d = await this.arkivDag(dag);
    return d ? (type === "aks" ? d.aks : d.hr).filter((x) => x[0] >= fra && x[0] < til) : [];
  }

  // Kartmatching av ferdige biter (eldre enn 90 s). Bitene deles der GPS-en har hull (over 2 min eller 1 km) og er høyst
  // 15 min lange. Farten avgjør hvordan Valhalla regner: gange, sykkel eller buss. Står han stille, matches ingenting.
  // Finner ikke Valhalla en vei (tog, skog), blir rå GPS stående. Pekeren veisporTil sier hvor langt den har kommet.
  async matchNye() {
    const nå = Date.now(), grense = nå - 90e3;
    let fra = Number(this.setting("veisporTil") || 0) || nå - 2 * 864e5;
    const rows = this.sql.exec(`SELECT ts, lat, lon FROM pos WHERE ts > ? AND ts <= ? ORDER BY ts LIMIT 5000`, fra, grense).toArray();
    if (rows.length < 2) return;
    const m = (a, b) => Math.hypot((a.lat - b.lat) * 111200, (a.lon - b.lon) * 111200 * Math.cos(a.lat * Math.PI / 180));
    const biter = []; let cur = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (b.ts - a.ts > 120e3 || m(a, b) > 1000 || b.ts - cur[0].ts > 15 * 60e3) { biter.push(cur); cur = []; }
      cur.push(b);
    }
    // Den siste biten tas bare når den er avsluttet (hull etterpå) eller lang nok; ellers venter den på flere punkter.
    if (grense - cur[cur.length - 1].ts > 120e3 || cur[cur.length - 1].ts - cur[0].ts > 5 * 60e3) biter.push(cur);
    let n = 0;
    for (const b of biter.slice(0, 12)) {
      const tynn = [b[0]];
      for (const p of b.slice(1)) if (m(tynn[tynn.length - 1], p) >= 8) tynn.push(p);
      if (tynn[tynn.length - 1] !== b[b.length - 1] && m(tynn[tynn.length - 1], b[b.length - 1]) > 2) tynn.push(b[b.length - 1]);
      const lengde = tynn.reduce((s, p, i) => s + (i ? m(tynn[i - 1], p) : 0), 0), varighet = (b[b.length - 1].ts - b[0].ts) / 1000;
      if (tynn.length >= 4 && lengde > 60) {
        const kmt = varighet > 0 ? lengde / varighet * 3.6 : 0, kost = kmt > 25 ? "bus" : kmt > 11 ? "bicycle" : "pedestrian";
        try {
          const r = await fetch("https://valhalla1.openstreetmap.de/trace_attributes", { method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "esbjugconsult.com live map (tidemann@esbjugconsult.com)" },
            body: JSON.stringify({ shape: tynn.map((p) => ({ lat: p.lat, lon: p.lon, time: p.ts / 1000 })), costing: kost, shape_match: "map_snap", use_timestamps: true,
              filters: { attributes: ["shape", "matched.point", "matched.type"], action: "include" } }) });
          if (r.ok) {
            const j = await r.json(), mp = j.matched_points || [];
            const pk = mp.map((p, i) => (p.type === "unmatched" ? null : [p.lat, p.lon, tynn[i].ts])).filter(Boolean);
            const v = j.shape && pk.length >= 2 ? veiMedTid(dekod6(j.shape), pk) : null;
            if (v && v.length >= 2) { this.sql.exec(`INSERT OR REPLACE INTO veispor (fra, til, kost, geom) VALUES (?, ?, ?, ?)`, b[0].ts, b[b.length - 1].ts, kost, JSON.stringify(v)); n++; }
          }
        } catch {}
      }
      fra = b[b.length - 1].ts;
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('veisporTil', ?)`, String(fra));
    }
    if (n) this.histMemo = new Map();   // ferdige dager i historikken regnes ut på nytt med veiene
    if (nå - (this.veisporPruned || 0) > 3600e3) { this.veisporPruned = nå; this.sql.exec(`DELETE FROM veispor WHERE til < ?`, this.slettFor(nå)); }
    return n;
  }

  // Sporet fra posisjonene: kartmatchede biter der de finnes (veien), ellers rå GPS, lett nok til å sendes til alle sidene.
  // til: bare veien fram til dette tidspunktet (avspillingen), så sporet ikke tegnes foran ham.
  sporFra(rows, biterFra, til = Infinity) {
    if (rows.length) {
      const biter = (biterFra || this.sql.exec(`SELECT fra, til, geom FROM veispor WHERE til >= ? AND fra <= ? ORDER BY fra`, rows[0].ts, rows[rows.length - 1].ts).toArray()).map((b) => ({ ...b }));
      if (biter.length) {
        const ut = []; let k = 0;
        for (const r of rows) {
          while (k < biter.length && biter[k].til < r.ts) k++;
          const b = biter[k];
          if (b && r.ts >= b.fra && r.ts <= b.til) { if (!b.lagt) { b.lagt = true; for (const p of JSON.parse(b.geom)) if (p[2] <= til) ut.push({ lat: p[0], lon: p[1], ts: p[2], vei: true }); } continue; }
          ut.push(r);
        }
        rows = ut;
      }
    }
    // At least ~12 m between points so the trail stays light (the road itself keeps its curves, 2 m); a gap (more than
    // 1 km or 15 min, e.g. a flight) breaks the line.
    const trail = [];
    let pl = 0, po = 0, pt = 0;
    for (const r of rows) {
      const k = Math.cos(r.lat * Math.PI / 180), dy = (r.lat - pl) * 111.2e3, dx = (r.lon - po) * 111.2e3 * k, d2 = dx * dx + dy * dy;
      if (trail.length && d2 < (r.vei ? 4 : 144)) continue;
      if (trail.length && (d2 > 1e6 || r.ts - pt > 15 * 60e3)) trail.push(null);
      trail.push([+r.lat.toFixed(r.vei ? 6 : 5), +r.lon.toFixed(r.vei ? 6 : 5), r.ts]);
      pl = r.lat; po = r.lon; pt = r.ts;
    }
    return trail;
  }

  // Saldoene over tid (summen av det disponible på alle kontoene, logget hvert kvarter), i hele historikken.
  async bankSokFinn({ hva, forst }) {
    const dager = Object.keys((await this.dager()).dager).sort(), rader = [];
    for (const dag of dager) {
      const d = await this.dagVed(Date.parse(dag + "T12:00:00Z"));
      for (const [ts, k, v] of d?.logg || []) {
        if (k !== "bank" || ts < osloMidnight(Date.parse(dag + "T12:00:00Z"))) continue;
        try { const j = JSON.parse(v); if (j && j.kontoer) rader.push({ ts, sum: j.kontoer.reduce((s, x) => s + (x.disp ?? x.saldo ?? 0), 0) }); } catch {}
      }
    }
    const like = rader;
    const kr = (n) => (n < 0 ? "−" : "") + Math.round(Math.abs(n)).toLocaleString("nb-NO") + " kr";
    const når = (ts) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "numeric" }).format(ts) + " kl. " + new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(ts);
    const svar = (ts, tekst) => ({ id: "bank", type: "bank", ts: ts + 1000, tekst });
    if (hva === "hoy" || hva === "lav") {
      const r = like.reduce((b, x) => (!b || (hva === "hoy" ? x.sum > b.sum : x.sum < b.sum) ? x : b), null);
      return r && svar(r.ts, `${hva === "hoy" ? "Mest" : "Minst"} på konto: ${kr(r.sum)}, ${når(r.ts)}`);
    }
    // Endringene: hver gang summen gikk ned (brukt), opp (inn) eller under null (minus, fra der det begynte).
    const hendelser = [];
    for (let i = 1; i < like.length; i++) {
      const før = like[i - 1].sum, nå = like[i].sum, diff = nå - før;
      if (hva === "brukt" && diff <= -1) hendelser.push({ ts: like[i].ts, tekst: `brukte han ${kr(-diff)}` });
      if (hva === "inn" && diff >= 1) hendelser.push({ ts: like[i].ts, tekst: `kom det inn ${kr(diff)}` });
      if (hva === "minus" && nå < 0 && før >= 0) hendelser.push({ ts: like[i].ts, tekst: `gikk kontoen i minus (${kr(nå)})` });
    }
    if (hva === "minus" && like.length && like[0].sum < 0) hendelser.unshift({ ts: like[0].ts, tekst: `var kontoen i minus (${kr(like[0].sum)})` });
    const h = forst ? hendelser[0] : hendelser[hendelser.length - 1];
    return h ? svar(h.ts, `${forst ? "Første gang" : "Sist"} ${h.tekst}: ${når(h.ts)}`) : null;
  }

  // Når han var ved et sted, i hele historikken: siste (eller første) besøk, med når han kom og hvor lenge han var der.
  // Et område (park, bydel) er boksen fra OpenStreetMap med 30 m ekstra; et punkt (kafé, adresse) er 120 m rundt det.
  async stedFinn({ navn, lat, lon, boks, forst }) {
    const [s, n, w, e] = boks, mLat = 111200, mLon = 111200 * Math.cos(lat * Math.PI / 180);
    const liten = (n - s) * mLat < 150 && (e - w) * mLon < 150;
    const inne = liten
      ? (p) => Math.hypot((p.lat - lat) * mLat, (p.lon - lon) * mLon) <= 120
      : (p) => p.lat >= s - 30 / mLat && p.lat <= n + 30 / mLat && p.lon >= w - 30 / mLon && p.lon <= e + 30 / mLon;
    const dager = Object.keys((await this.dager()).dager).sort();
    if (!forst) dager.reverse();
    for (const dag of dager) {
      const d = await this.dagVed(Date.parse(dag + "T12:00:00Z"));
      const pos = (d?.pos || []).map((p) => Array.isArray(p) ? { ts: p[0], lat: p[1], lon: p[2] } : p);
      // Besøkene den dagen: punkter inne i området, med under 10 min mellom.
      const besok = [];
      for (const p of pos) {
        if (!inne(p)) continue;
        const b = besok[besok.length - 1];
        if (b && p.ts - b.til < 10 * 60e3) b.til = p.ts; else besok.push({ fra: p.ts, til: p.ts });
      }
      if (!besok.length) continue;
      const v = forst ? besok[0] : besok[besok.length - 1];
      const dagN = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "numeric" }).format(v.fra);
      const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(v.fra);
      const min = Math.round((v.til - v.fra) / 60e3);
      return { id: "sted", type: "sted", ts: v.fra, tekst: `${forst ? "Første gang" : "Sist"} ved ${navn}: ${dagN} kl. ${kl}` + (min >= 2 ? ` (${min} min)` : "") };
    }
    return null;
  }

  // Siste (eller første) gang en verdi ble målt de siste sju dagene. Finnes ikke akkurat den, brukes den nærmeste.
  verdi({ type, v, forst, kilde }) {
    const fra = Date.now() - 7 * 864e5, rekke = forst ? "ASC" : "DESC";
    const r = type === "puls"
      ? this.sql.exec(`SELECT ts, bpm AS v FROM hr WHERE ts >= ? ORDER BY ABS(bpm - ?) ASC, ts ${rekke} LIMIT 1`, fra, v).toArray()[0]
      : this.sql.exec(`SELECT ts, json_extract(d, '$.bat') AS v FROM telelogg WHERE kilde LIKE ? AND ts >= ? AND json_extract(d, '$.bat') IS NOT NULL ORDER BY ABS(json_extract(d, '$.bat') - ?) ASC, ts ${rekke} LIMIT 1`, kilde === "watch" ? "watch%" : kilde, fra, v).toArray()[0];
    if (!r) return null;
    const navn = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "numeric" }).format(r.ts);
    const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(r.ts);
    const hva = type === "puls" ? `${r.v} i puls` : `${r.v} % batteri på ${{ iphone: "iPhonen", watch: "Apple Watch", watchr: "Apple Watch R", watchl: "Apple Watch L", android: "Android-telefonen" }[kilde]}`;
    return { id: "verdi", type, ts: r.ts, verdi: r.v, tekst: `${forst ? "Første" : "Siste"} gang han hadde ${hva}: ${navn} kl. ${kl}` + (r.v !== v ? ` (nærmeste: ${r.v})` : "") };
  }

  // Øyeblikkene de siste sju dagene som avspillingen kan hoppe til og Jev kan velge mellom: høyeste og laveste puls,
  // laveste batteri på hver enhet, mest bevegelse og raskest fart, for hver dag og for hele uka.
  oyeblikk() {
    const nå = Date.now(), dagN = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "numeric" });
    const kl = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
    const ut = [], beste = {};
    const legg = (id, type, ts, verdi, tekst, hoy) => {
      if (ts == null || verdi == null) return;
      ut.push({ id, type, ts, verdi, tekst });
      const b = beste[type];
      if (!b || (hoy ? verdi > b.verdi : verdi < b.verdi)) beste[type] = { ts, verdi, tekst };
    };
    const TYPER = {
      pulsHoy: ["høyest puls", (v) => v + " bpm", true], pulsLav: ["lavest puls", (v) => v + " bpm", false],
      iphoneBat: ["lavest batteri på iPhonen", (v) => v + " %", false], watchBat: ["lavest batteri på Apple Watch", (v) => v + " %", false],
      androidBat: ["lavest batteri på Android-telefonen", (v) => v + " %", false],
      bevegelse: ["mest bevegelse (iPhone)", (v) => v.toFixed(2).replace(".", ",") + " g", true], haand: ["mest bevegelse i hånda (Apple Watch)", (v) => v.toFixed(2).replace(".", ",") + " g", true],
      fart: ["raskest fart", (v) => Math.round(v * 3.6) + " km/t", true],
    };
    for (let i = 6; i >= 0; i--) {
      const start = osloMidnight(nå - i * 864e5), slutt = osloMidnight(start + 36 * 3600e3), navn = dagN.format(start + 12 * 3600e3);
      const en = (sql, ...a) => this.sql.exec(sql, ...a).toArray()[0];
      const fyll = (type, r) => { if (!r) return; const [t, fmt, hoy] = TYPER[type]; legg(`${type}-${i}`, type, r.ts, r.v, `${t[0].toUpperCase() + t.slice(1)} ${navn}: ${fmt(r.v)} kl. ${kl.format(r.ts)}`, hoy); };
      fyll("pulsHoy", en(`SELECT ts, bpm AS v FROM hr WHERE ts >= ? AND ts < ? ORDER BY bpm DESC LIMIT 1`, start, slutt));
      fyll("pulsLav", en(`SELECT ts, bpm AS v FROM hr WHERE ts >= ? AND ts < ? ORDER BY bpm ASC LIMIT 1`, start, slutt));
      for (const [k, type] of [["iphone", "iphoneBat"], ["watch%", "watchBat"], ["android", "androidBat"]])
        fyll(type, en(`SELECT ts, json_extract(d, '$.bat') AS v FROM telelogg WHERE kilde LIKE ? AND ts >= ? AND ts < ? AND json_extract(d, '$.bat') IS NOT NULL ORDER BY v ASC, ts ASC LIMIT 1`, k, start, slutt));
      fyll("bevegelse", en(`SELECT ts, v FROM bevegelse WHERE k='iphone' AND ts >= ? AND ts < ? ORDER BY v DESC LIMIT 1`, start, slutt));
      fyll("haand", en(`SELECT ts, v FROM bevegelse WHERE k LIKE 'watch%' AND ts >= ? AND ts < ? ORDER BY v DESC LIMIT 1`, start, slutt));
      fyll("fart", en(`SELECT ts, spd AS v FROM pos WHERE ts >= ? AND ts < ? AND spd IS NOT NULL AND acc < 30 ORDER BY spd DESC LIMIT 1`, start, slutt));
    }
    for (const [type, b] of Object.entries(beste)) ut.push({ id: `${type}-uke`, type, ts: b.ts, verdi: b.verdi, uke: true,
      tekst: `${TYPER[type][0][0].toUpperCase() + TYPER[type][0].slice(1)} hele uka: ${b.tekst.split(": ").slice(1).join(": ")} (${dagN.format(b.ts)})` });
    return ut;
  }

  spor() {
    const live = this.sporLive();
    const start = osloMidnight(Date.now());
    const trail = this.sporFra(this.sql.exec(`SELECT ts, lat, lon FROM pos WHERE ts >= ? ORDER BY ts`, start).toArray());
    const fra = Date.now() - 30 * 60e3;
    const bev = [...this.sql.exec(`SELECT ts, v FROM bev WHERE ts <= ? ORDER BY ts DESC LIMIT 1`, fra).toArray(),
      ...this.sql.exec(`SELECT ts, v FROM bev WHERE ts > ? ORDER BY ts`, fra).toArray()].map((r) => [r.ts, r.v]);
    // Heart rate the last 5 minutes, every stored sample (one per ~4 s while the watch shares it).
    const puls = this.sql.exec(`SELECT ts, bpm FROM hr WHERE ts > ? ORDER BY ts`, Date.now() - 5 * 60e3).toArray().map((r) => [r.ts, r.bpm]);
    return { now: Date.now(), live, trail, tele: this.tele(), bev, puls, kast: this.kast(), gjor: this.setting("gjor") || "", notater: this.notater(20), rom: this.rom(), bank: this.bank() };
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
      this.loggFor("sted", JSON.stringify(navn));
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
    if (r === "time" || r === "fin") {
      // Hver lagrede måling (én per ~4–8 s), med minutter (desimaler) fra starten: siste time, eller i dag (fin) til zoom.
      const now = Date.now(), start = r === "fin" ? osloMidnight(now) : now - 3600e3;
      const rows = this.sql.exec(`SELECT ts, bpm FROM hr WHERE ts >= ? ORDER BY ts`, start).toArray();
      const pts = rows.map((x) => [Math.round((x.ts - start) / 600) / 100, x.bpm]);
      let lo = null, hi = null, sum = 0;
      for (const [, b] of pts) { lo = lo == null ? b : Math.min(lo, b); hi = hi == null ? b : Math.max(hi, b); sum += b; }
      const mins = new Set(rows.map((x) => Math.floor(x.ts / 60000))).size;
      return { r, start, now, step: 0.5, live: this.liveHr(), pts, beats: pts.length ? Math.round(sum / pts.length * mins) : 0, mins, lo, hi };
    }
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

  // Bevegelse over tid for ett akselerometer: siste time (hver måling), i dag (per minutt), 7 dager (per 10 min),
  // 30 dager (per time). Minutter fra starten, som pulsen; lavest/snitt/høyest i g og målt tid i minutter.
  bevRange(k = "iphone", r = "time") {
    const now = Date.now();
    const start = r === "time" ? now - 3600e3 : osloMidnight(now - ({ dag: 0, fin: 0, uke: 6, mnd: 29 }[r] ?? 0) * 864e5);
    const step = { time: 0, fin: 0, dag: 1, uke: 10, mnd: 60 }[r] ?? 1;
    const rows = step
      ? this.sql.exec(`SELECT CAST((ts - ?) / ? AS INTEGER) * ? AS m, AVG(v) AS v FROM bevegelse WHERE k=? AND ts >= ? GROUP BY 1 ORDER BY 1`, start, step * 60000, step, k, start).toArray()
      : this.sql.exec(`SELECT (ts - ?) / 60000.0 AS m, v FROM bevegelse WHERE k=? AND ts >= ? ORDER BY ts`, start, k, start).toArray();
    const pts = rows.map((x) => [Math.round(x.m * 100) / 100, Math.round(x.v * 1000) / 1000]);
    const t = this.sql.exec(`SELECT MIN(v) AS lo, AVG(v) AS av, MAX(v) AS hi, COUNT(DISTINCT CAST(ts / 60000 AS INTEGER)) AS mins FROM bevegelse WHERE k=? AND ts >= ?`, k, start).one();
    const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
    return { k, r, start, now, step: step || 0.5, pts, lo: r3(t.lo), av: r3(t.av), hi: r3(t.hi), mins: t.mins || 0 };
  }

  // Push for a visit (when the owner has turned it on in the app). Own caps: one per visitor per 15 s (stops reload
  // spam), at most 20 per 10 minutes in total. Same coin sound as messages (the owner's choice).
  // key: the visitor's cookie id, or "n:" + network for visitors without consent. vid only for known visitors (tapping
  // the push opens them in the app).
  async pushVisit({ key, vid, first, city, country, ua, side }) {
    const now = Date.now();
    this.visitLast = this.visitLast || new Map();
    this.visitLog = (this.visitLog || []).filter((t) => now - t < 600000);
    if (now - (this.visitLast.get(key) || 0) < 15e3 || this.visitLog.length >= 20) return;
    for (const [k, t] of this.visitLast) if (now - t > 15e3) this.visitLast.delete(k);
    this.visitLast.set(key, now);
    this.visitLog.push(now);
    ua = ua || "";
    const device = enhetAv(ua);
    let land = "";
    try { const n = new Intl.DisplayNames(["nb"], { type: "region" }).of(country); if (n && n !== country) land = n; } catch {}
    const where = [city, land].filter(Boolean).join(", ") || "Ukjent sted";
    await this.push((first ? "Ny besøkende" : "Besøkende tilbake") + (side ? " · " + side : ""), [where, device].filter(Boolean).join(" · "), vid || null, { thread: "besok", throttle: false, category: "VISIT" });
  }

  // «Sover» husker når han la seg (sovnet), så siden kan si hvor lenge han har sovet.
  setStatus(v) {
    if (v === "sleeping" && this.status() !== "sleeping") this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('sovnet', ?)`, String(Date.now()));
    if (v !== this.status()) this.loggFor("status", v);
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('status', ?)`, v);
    const sovnet = this.sovnet();
    this.toVisitors({ t: "status", v, sovnet });
    this.toOwners({ t: "status", v, status: v });
  }

  // Antall besøkende på siden akkurat nå (og totalt), høyst én rad i minuttet.
  loggBesok() {
    const nå = Date.now();
    if (nå - (this.besokLogget || 0) < 60e3) return;
    this.besokLogget = nå;
    this.loggFor("besok", JSON.stringify({ live: this.liveCount(), total: this.uniqTotal() }));
  }

  // Ingenting slettes før dagen er arkivert i R2: rader eldre enn 35 dager, men aldri nyere enn det siste arkivet.
  slettFor(nå) {
    const til = this.setting("arkivTil");
    const arkivertTil = til ? osloMidnight(Date.parse(til + "T12:00:00Z") + 24 * 3600e3) : 0;   // midnatt etter siste arkiverte dag
    return Math.min(nå - 35 * 864e5, arkivertTil);
  }

  // Arkivet: hver ferdige dag (Oslo) pakkes som én gzip-JSON i R2 (historikk/<dag>.json.gz) og blir liggende for alltid.
  // Tar opptil åtte dager per runde (fra alarmen hvert kvarter), eldste først.
  async arkiver() {
    const dag = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(ts);
    // Versjon 2: den første versjonen hoppet over annenhver dag, så alt arkiveres på nytt fra starten.
    if (this.setting("arkivVersjon") !== "2") { this.sql.exec(`DELETE FROM kv WHERE k='arkivTil'`); this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('arkivVersjon', '2')`); }
    let fra = this.setting("arkivTil");
    if (!fra) {
      const først = Math.min(...["pos", "hr", "telelogg", "logg", "akslogg"].map((t) => this.sql.exec(`SELECT MIN(ts) AS m FROM ${t}`).one().m || Date.now()));
      fra = dag(osloMidnight(først) - 864e5);
    }
    const iDag = dag(Date.now());
    for (let n = 0; n < 8; n++) {
      const neste = dag(Date.parse(fra + "T12:00:00Z") + 24 * 3600e3);   // dagen etter (kl. 12 UTC er alltid samme dato i Oslo)
      if (neste >= iDag) return;
      const data = this.dagData(neste);
      const tekst = JSON.stringify(data);
      const gz = await new Response(new Blob([tekst]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
      const timer = new Set([...data.pos.map((p) => Math.floor(p.ts / 3600e3)), ...data.hr.map((h) => Math.floor(h[0] / 3600e3)), ...data.tele.map((t) => Math.floor(t[0] / 3600e3))]).size;
      await this.env.FILES.put(`historikk/${neste}.json.gz`, gz, { httpMetadata: { contentType: "application/json", contentEncoding: "gzip" }, customMetadata: { timer: String(timer) } });
      this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('arkivTil', ?)`, neste);
      fra = neste;
    }
  }

  // Alt som finnes for én Oslo-dag, rått: posisjoner, puls, målinger, akselerometre, bevegelse, endringer (med tilstanden
  // ved midnatt), kartmatchede biter og kontoutskrifter.
  dagData(dag) {
    const start = osloMidnight(Date.parse(dag + "T12:00:00Z")), slutt = osloMidnight(start + 36 * 3600e3);
    const q = (sql) => this.sql.exec(sql, start, slutt).toArray();
    const LOGG = ["gjor", "status", "notater", "bank", "kast", "besok", "rom", "sted", "oyet"];
    return {
      dag, start, slutt,
      pos: q(`SELECT ts, lat, lon, acc, spd, alt, hdg FROM pos WHERE ts >= ? AND ts < ? ORDER BY ts`),
      hr: q(`SELECT ts, bpm FROM hr WHERE ts >= ? AND ts < ? ORDER BY ts`).map((r) => [r.ts, r.bpm]),
      tele: q(`SELECT kilde, ts, d FROM telelogg WHERE ts >= ? AND ts < ? ORDER BY ts`).map((r) => [r.ts, r.kilde, JSON.parse(r.d)]),
      aks: q(`SELECT kilde, ts, acc FROM akslogg WHERE ts >= ? AND ts < ? ORDER BY ts`).map((r) => [r.ts, r.kilde, r.acc]),
      bevegelse: q(`SELECT k, ts, v FROM bevegelse WHERE ts >= ? AND ts < ? ORDER BY ts`).map((r) => [r.ts, r.k, r.v]),
      logg: [...LOGG.flatMap((k) => this.sql.exec(`SELECT ts, k, v FROM logg WHERE k=? AND ts < ? ORDER BY ts DESC LIMIT 1`, k, start).toArray()),
        ...q(`SELECT ts, k, v FROM logg WHERE ts >= ? AND ts < ? ORDER BY ts`)].sort((a, b) => a.ts - b.ts).map((r) => [r.ts, r.k, r.v]),
      veispor: this.sql.exec(`SELECT fra, til, kost, geom FROM veispor WHERE til >= ? AND fra < ? ORDER BY fra`, start, slutt).toArray(),
      banktrans: q(`SELECT id, konto, tid, belop, tekst FROM banktrans WHERE tid >= ? AND tid < ? ORDER BY tid`),
    };
  }

  // Været i «Øyet mot» (Dubai, Koh Phangan, Lombok) logges hvert kvarter, så avspillingen kan vise været den gang.
  async oyetLogg() {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=25.2,9.73,-8.58&longitude=55.27,100.01,116.12&current=temperature_2m,weather_code,is_day");
    if (!r.ok) return;
    const j = await r.json();
    const steder = (Array.isArray(j) ? j : [j]).map((x) => ({ t: Math.round(x.current?.temperature_2m), kode: x.current?.weather_code, dag: !!x.current?.is_day }));
    this.loggFor("oyet", JSON.stringify(steder));
  }

  // Versjonshistorikken: hver commit som endret forsiden (index.html) i det offentlige repoet hentes fra GitHub og lagres
  // i R2 (versjoner/<sha>.html), med tidspunkt og melding. Lista ligger i kv 'versjoner'. Høyst 30 nye per runde.
  async versjonerOppdater() {
    const liste = JSON.parse(this.setting("versjoner") || "[]"), har = new Set(liste.map((v) => v.sha));
    const gh = { headers: { "User-Agent": "esbjugconsult.com", Accept: "application/vnd.github+json" } };
    const nye = [];
    for (let side = 1; side <= 10; side++) {
      const r = await fetch(`https://api.github.com/repos/TidemannEsbjug/esbjugconsult/commits?path=index.html&per_page=100&page=${side}`, gh);
      if (!r.ok) break;
      const c = await r.json();
      for (const x of c) if (!har.has(x.sha)) nye.push({ sha: x.sha, ts: Date.parse(x.commit.committer.date), melding: (x.commit.message || "").split("\n")[0].slice(0, 200) });
      if (c.length < 100 || (c.length && har.has(c[c.length - 1].sha))) break;   // resten er hentet fra før
    }
    nye.sort((a, b) => a.ts - b.ts);
    for (const v of nye.slice(0, 30)) {
      const r = await fetch(`https://raw.githubusercontent.com/TidemannEsbjug/esbjugconsult/${v.sha}/index.html`);
      if (!r.ok) continue;
      const html = await r.text();
      await this.env.FILES.put(`versjoner/${v.sha}.html`, html, { httpMetadata: { contentType: "text/html; charset=utf-8" }, customMetadata: { ts: String(v.ts), melding: v.melding } });
      liste.push({ ...v, lengde: html.length });
    }
    liste.sort((a, b) => a.ts - b.ts);
    this.sql.exec(`INSERT OR REPLACE INTO kv (k, v) VALUES ('versjoner', ?)`, JSON.stringify(liste));
    return liste.length;
  }

  // Timer med opptak per Oslo-dag: hver time med posisjon, puls eller målinger teller (0–24). Arkiverte dager har tallet
  // i arkivets metadata. Huskes i 2 min.
  async dager() {
    const nå = Date.now();
    if (this.dagerMemo && nå - this.dagerMemo.at < 120e3) return this.dagerMemo.v;
    const timer = new Set();
    for (const t of ["pos", "hr", "telelogg"]) for (const r of this.sql.exec(`SELECT DISTINCT CAST(ts / 3600000 AS INTEGER) AS h FROM ${t}`).toArray()) timer.add(r.h);
    const dagN = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }), v = {};
    for (const h of timer) { const d = dagN.format(h * 3600e3 + 1800e3); v[d] = (v[d] || 0) + 1; }
    try {
      let cursor;
      do {
        const l = await this.env.FILES.list({ prefix: "historikk/", include: ["customMetadata"], cursor });
        for (const o of l.objects) { const d = o.key.slice(10, 20); if (!v[d]) v[d] = Number(o.customMetadata?.timer || 1); }
        cursor = l.truncated ? l.cursor : null;
      } while (cursor);
    } catch {}
    for (const d in v) v[d] = Math.min(24, v[d]);
    const svar = { dager: v, først: Object.keys(v).sort()[0] || null };
    this.dagerMemo = { at: nå, v: svar };
    return svar;
  }

  // En dag fra arkivet (eldre enn det som ligger i databasen), lest én gang og husket.
  async arkivDag(dag) {
    this.arkivMemo = this.arkivMemo instanceof Map ? this.arkivMemo : new Map();
    if (this.arkivMemo.has(dag)) return this.arkivMemo.get(dag);
    const obj = await this.env.FILES.get(`historikk/${dag}.json.gz`);
    const d = obj ? JSON.parse(await new Response(obj.body.pipeThrough(new DecompressionStream("gzip"))).text()) : null;
    if (this.arkivMemo.size > 10) this.arkivMemo.clear();
    this.arkivMemo.set(dag, d);
    return d;
  }

  loggFor(k, v) {
    const now = Date.now();
    this.sql.exec(`INSERT INTO logg (ts, k, v) VALUES (?, ?, ?)`, now, k, v);
    if (now - (this.loggPruned || 0) > 3600e3) { this.loggPruned = now; this.sql.exec(`DELETE FROM logg WHERE ts < ?`, this.slettFor(now)); }
  }

  sovnet() {
    return this.status() === "sleeping" ? Number(this.setting("sovnet") || 0) || null : null;
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

  // ---------- quarter-hour jobs ----------
  // The status is never changed automatically (no «sleeping» at night, no «available» at 04:00, no waking on the
  // pulse): only the owner sets it, from the app.

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
    if (this.setting("autoSlept")) this.sql.exec(`DELETE FROM kv WHERE k='autoSlept'`);   // left over from the old automatic night status
    await this.matchNye().catch(() => {});   // også når telefonen ikke sender (resten av en tur)
    await this.bankOppdater().catch(() => {});
    await this.arkiver().catch(() => {});
    await this.versjonerOppdater().catch(() => {});
    await this.oyetLogg().catch(() => {});
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
