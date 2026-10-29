// https://esbjugconsult.com is the one address: www and plain http go there with the same path, so
// www.esbjugconsult.com/jev ends up at the Jev module too. /chat/* is the live chat; everything
// else is the static site. /login/ (customer portal) and /kunde/ (behind login) are in kunde.js.
import { handleChat, pageVisit } from "./chat.js";
import { handleKunde } from "./kunde.js";
import { handleKlart, handleNedlasting } from "./klart.js";
export { ChatHub } from "./chat.js";
export { KlartLager } from "./klart.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.esbjugconsult.com" || (url.protocol === "http:" && url.hostname !== "localhost")) {
      url.hostname = url.hostname.replace(/^www\./, "");
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/chat/")) return handleChat(request, env, url);
    if (url.pathname === "/bank/tilbake") return handleChat(request, env, url);
    // /monitor/ var testsiden for kameraet ved pulten. Kortet er på forsiden nå.
    if (url.pathname === "/monitor" || url.pathname.startsWith("/monitor/")) { url.pathname = "/"; return Response.redirect(url.toString(), 301); }
    // /hjem/ var testsiden for huset, rommene og replay. Det er på forsiden nå.
    if (url.pathname === "/hjem" || url.pathname.startsWith("/hjem/")) { url.pathname = "/"; return Response.redirect(url.toString(), 301); }
    // /sherpa/ var forsøket med AI-sherpa-heroen. Det er forsiden fra 28.10.2026 (?tekst=bla følger med).
    if (url.pathname === "/sherpa" || url.pathname.startsWith("/sherpa/")) { url.pathname = "/"; return Response.redirect(url.toString(), 301); }
    // Podkasten og bloggen (innleggene laget ut fra episodene) er avpublisert fra 29.10.2026: sidene sendes til forsiden
    // (302, så de kan komme tilbake), og lyden og filene svarer 404, også for gamle versjoner. Filene ligger fortsatt i
    // repoet (utenfor opplastingen, se .assetsignore) og lyden i R2 (FILES, podcast/epN.m4a).
    if (/^\/(podcast|blogg)(\/|$)/.test(url.pathname)) {
      if (url.pathname.startsWith("/podcast/lyd/") || /\.[a-z0-9]+$/i.test(url.pathname)) return new Response("Not found", { status: 404 });
      url.pathname = "/"; url.search = ""; return Response.redirect(url.toString(), 302);
    }
    // Siden slik den så ut ved en tidligere versjon (lagret i R2 fra GitHub, se versjonerOppdater i chat.js).
    const ver = url.pathname.match(/^\/versjon\/([0-9a-f]{40})\/?$/);
    if (ver) return versjonSide(env, url, ver[1]);
    const verFil = url.pathname.match(/^\/versjon-fil\/([0-9a-f]{40})\/(.+)$/);
    if (verFil) return versjonFil(env, verFil[1], verFil[2]);
    // Filer en gammel versjon henter på andre måter (bakgrunnsbilder i stilarket o.l.): finnes de ikke lenger, hentes de
    // slik de var i den versjonen.
    const fraVer = (request.headers.get("Referer") || "").match(/\/versjon(?:-fil)?\/([0-9a-f]{40})\//);
    if (fraVer && request.method === "GET" && !/^\/(?:chat|versjon|podcast\/lyd)\//.test(url.pathname)) {
      const nå = await env.ASSETS.fetch(request);
      if (nå.status !== 404) return nå;
      return versjonFil(env, fraVer[1], url.pathname.slice(1));
    }   // SpareBank 1 sin BankID-innlogging kommer tilbake hit
    // Klart: prøveperiode, kjøp og aktiveringskoder (klart.js). /GDPR/api/ og /GDPR/last-ned/ virker
    // fortsatt, fordi Stripe-webhooken og eldre versjoner av appen bruker dem.
    if (/^\/(klart|GDPR)\/api\//.test(url.pathname)) return handleKlart(request, env, url);
    if (/^\/(klart|GDPR)\/last-ned\//.test(url.pathname)) return handleNedlasting(request, env, url);
    // /login/ er kundeportalen, /kunde/ er lukket bak innlogging.
    if (url.pathname.startsWith("/login/") || url.pathname.startsWith("/kunde/")) return handleKunde(request, env, url);
    // /ny/ var arbeidskopien av V2. V2 er forsiden fra 7.10.2026, så gamle lenker sendes dit (spørrestrengen følger med).
    // /new2/ var arbeidskopien med kartet som hero; den er forsiden fra 22.10.2026.
    if (url.pathname === "/new2" || url.pathname.startsWith("/new2/")) {
      url.pathname = "/";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/ny" || url.pathname.startsWith("/ny/")) {
      url.pathname = url.pathname.startsWith("/ny/en") ? "/en/" : "/";
      return Response.redirect(url.toString(), 301);
    }
    // Klart bor på /klart/. Filene ligger i mappa GDPR/, men adressen i nettleseren blir stående på
    // /klart/. Gamle lenker til /gdpr, /GDPR, /Klart osv. sendes til /klart/, med spørrestrengen.
    const klart = url.pathname.match(/^\/(?:klart|gdpr)(\/.*)?$/i);
    if (klart) {
      const rest = klart[1] || "/";
      if (url.pathname !== "/klart" + rest) {
        url.pathname = "/klart" + rest;
        return Response.redirect(url.toString(), 301);
      }
      const fil = new URL(url);
      fil.pathname = "/GDPR" + rest;
      const svar = await env.ASSETS.fetch(new Request(fil, request));
      // Assets legger til / på mapper (/klart/aktiver → /GDPR/aktiver/). Pek det tilbake til /klart.
      const til = svar.headers.get("location");
      if (til && /^(https?:\/\/[^/]+)?\/GDPR\//.test(til)) {
        const hoder = new Headers(svar.headers);
        hoder.set("location", til.replace(/\/GDPR\//, "/klart/"));
        return new Response(svar.body, { status: svar.status, headers: hoder });
      }
      try { const visit = pageVisit(request, env, url); if (visit) ctx.waitUntil(visit); } catch {}
      return svar;
    }
    // Visit push for page loads; never allowed to break serving the page.
    try { const visit = pageVisit(request, env, url); if (visit) ctx.waitUntil(visit); } catch {}
    const svar = await env.ASSETS.fetch(request);
    if (/\.(mp4|m4v|webm|mov|mp3|m4a)$/i.test(url.pathname)) return medRange(request, svar);
    return svar;
  },
};

// Statiske filer svarer ikke på Range, men Safari spiller ikke video uten (og spoling trenger det overalt).
// Videoene og lyden her er noen få MB, så hele fila leses og biten som ble bedt om sendes som 206.
async function medRange(request, svar) {
  if (svar.status !== 200) return svar;
  const hoder = new Headers(svar.headers);
  hoder.set("Accept-Ranges", "bytes");
  const m = (request.headers.get("Range") || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return new Response(svar.body, { status: 200, headers: hoder });
  const data = await svar.arrayBuffer();
  const str = data.byteLength;
  let fra = m[1] ? Number(m[1]) : Math.max(0, str - Number(m[2]));
  const til = m[1] && m[2] ? Math.min(Number(m[2]), str - 1) : str - 1;
  if (fra >= str || fra > til) {
    hoder.set("Content-Range", `bytes */${str}`);
    hoder.delete("Content-Length");
    return new Response(null, { status: 416, headers: hoder });
  }
  hoder.set("Content-Range", `bytes ${fra}-${til}/${str}`);
  hoder.set("Content-Length", String(til - fra + 1));
  return new Response(data.slice(fra, til + 1), { status: 206, headers: hoder });
}

// En gammel versjon av forsiden. Den kobler seg ikke til chatten (ingen WebSocket, så ingen besøksvarsel), er skjult for
// søkemotorer, og får en stripe øverst med når den er fra (ikke i ?ramme, som er forhåndsvisningen i avspillingen).
async function versjonSide(env, url, sha) {
  const obj = await env.FILES.get(`versjoner/${sha}.html`);
  if (!obj) return new Response("Fant ikke den versjonen", { status: 404 });
  const meta = obj.customMetadata || {};
  const ramme = url.searchParams.has("ramme");
  const tid = meta.ts ? new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(Number(meta.ts)) : "";
  const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  const hode = `<meta name="robots" content="noindex, nofollow"><script>window.__versjon=1;window.WebSocket=function(){return{readyState:3,send(){},close(){},addEventListener(){}}};</script>`;
  // I rammen (avspillingen på forsiden) vises verken samtykkebanneret eller chatten fra den gamle siden, og siden lever på
  // avspillerens tid: klokka (Date) går fra ?t= og fra meldingene forsiden sender, og /chat/spor, /chat/hr og
  // /chat/status hentes slik de var på det tidspunktet (?t= på forespørselen).
  const skjul = ramme ? `<style>.ck,#chat,.ch-b,.kart-venter{display:none!important}.natt-lag{transition:none!important}html.uten-paneler .paneler{opacity:0!important;pointer-events:none!important}#kart{opacity:1!important;transform:none!important;transition:none!important}</style>` : "";
  const tidsreise = ramme ? `<script>(()=>{const RD=Date;let skew=0;const t0=+new URLSearchParams(location.search).get('t');if(t0)skew=t0-RD.now();class D extends RD{constructor(...a){if(a.length)super(...a);else super(RD.now()+skew)}static now(){return RD.now()+skew}}window.Date=D;let aktiv=true;const poll=[];const SI=window.setInterval;window.setInterval=(f,ms,...a)=>{if(typeof f!=='function')return SI(f,ms,...a);if(ms>=2e3&&ms<=9e5)poll.push(()=>f(...a));return SI(()=>{if(aktiv)f(...a)},ms>=2e3&&ms<=15e3?1e3:ms)};const hent=()=>{for(const g of poll)try{g()}catch(e){}};const f0=window.fetch.bind(window);window.fetch=(u,o)=>{try{const x=new URL(u instanceof Request?u.url:u,location.href);if(skew&&x.origin===location.origin&&/^\\/chat\\/(spor|hr|status|oyet)$/.test(x.pathname)){x.searchParams.set('t',String(Math.round(RD.now()+skew)));u=x.toString()}}catch(e){}return f0(u,o)};addEventListener('message',e=>{const d=e.data;if(e.origin!==location.origin||!d)return;let hopp=false;if(typeof d.avspT==='number'){const ny=d.avspT-RD.now();hopp=Math.abs(ny-skew)>5e3;skew=ny}if('paneler' in d)document.documentElement.classList.toggle('uten-paneler',!d.paneler);if('aktiv' in d){if(d.aktiv&&!aktiv)hopp=true;aktiv=!!d.aktiv}if(hopp&&aktiv)hent()})})();</script>` : "";
  const stripe = ramme ? "" : `<div style="position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px);display:flex;gap:12px;align-items:center;padding:9px 14px;border-radius:999px;background:#00205B;color:#fff;font:600 13px/1.2 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,20,60,.35)"><span>Slik så siden ut ${esc(tid)}</span><span style="opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw">${esc(meta.melding || "")}</span><a href="/" style="color:#fff;opacity:.85">Til i dag</a></div>`;
  const svar = new Response(obj.body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=86400" } });
  // Bilder, stilark og skript på siden hentes slik de var i denne versjonen (/versjon-fil/<sha>/<sti>), så filer som
  // senere er flyttet eller slettet fortsatt vises.
  const lokal = (v) => v && !/^(?:[a-z]+:|\/\/|#|data:)/i.test(v) && !/^\/(?:chat|versjon|podcast\/lyd)\//.test(v);
  const tilVer = (v) => `/versjon-fil/${sha}/` + v.replace(/^\//, "").replace(/^\.\//, "");
  const omskriv = (attr) => ({ element: (el) => { const v = el.getAttribute(attr); if (lokal(v)) el.setAttribute(attr, tilVer(v)); } });
  const srcset = { element: (el) => { const v = el.getAttribute("srcset"); if (v) el.setAttribute("srcset", v.split(",").map((d) => { const [u, ...r] = d.trim().split(/\s+/); return [lokal(u) ? tilVer(u) : u, ...r].join(" "); }).join(", ")); } };
  return new HTMLRewriter()
    .on("img[src], video[src], audio[src], source[src], script[src], iframe[src]", omskriv("src"))
    .on("video[poster]", omskriv("poster"))
    .on("img[srcset], source[srcset]", srcset)
    .on('link[rel~="stylesheet"][href], link[rel~="icon"][href], link[rel="preload"][href]', omskriv("href"))
    .on("head", { element: (el) => { el.prepend(hode + tidsreise, { html: true }); if (skjul) el.append(skjul, { html: true }); } })
    .on("body", { element: (el) => el.prepend(stripe, { html: true }) })
    .transform(svar);
}

// En fil slik den var i en versjon av siden: fra R2 om den er hentet før, ellers fra GitHub (det offentlige repoet) ved
// den committen, og så lagret. Finnes den ikke der (filer utenfor repoet), brukes dagens fil.
async function versjonFil(env, sha, sti) {
  if (sti.includes("..")) return new Response("Ugyldig", { status: 400 });
  if (/^(podcast|blogg)(\/|$)/.test(sti)) return new Response("Not found", { status: 404 });   // avpublisert, se fetch over
  const ext =(sti.split(".").pop() || "").toLowerCase();
  const typer = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon", css: "text/css", js: "text/javascript", mjs: "text/javascript", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", woff2: "font/woff2", woff: "font/woff", json: "application/json" };
  const type = typer[ext] || "application/octet-stream", nøkkel = `versjoner/filer/${sha}/${sti}`;
  const hoder = { "content-type": type, "cache-control": "public, max-age=31536000, immutable" };
  const lagret = await env.FILES.get(nøkkel);
  if (lagret) return new Response(lagret.body, { headers: hoder });
  const r = await fetch(`https://raw.githubusercontent.com/TidemannEsbjug/esbjugconsult/${sha}/${sti.split("?")[0]}`);
  if (r.ok) {
    const data = await r.arrayBuffer();
    await env.FILES.put(nøkkel, data, { httpMetadata: { contentType: type } });
    return new Response(data, { headers: hoder });
  }
  return env.ASSETS.fetch(new Request(new URL("/" + sti, "https://esbjugconsult.com")));
}
