// https://esbjugconsult.com is the one address: www and plain http go there with the same path, so
// www.esbjugconsult.com/jev ends up at the Jev module too. /chat/* is the live chat; everything
// else is the static site. /login/ (customer portal) and /kunde/ (behind login) are in kunde.js.
import { handleChat, pageVisit } from "./chat.js";
import { handleKunde } from "./kunde.js";
import { handleKlart, handleNedlasting } from "./klart.js";
import EPISODER from "../podcast/episoder.json";
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
    // Siden slik den så ut ved en tidligere versjon (lagret i R2 fra GitHub, se versjonerOppdater i chat.js).
    const ver = url.pathname.match(/^\/versjon\/([0-9a-f]{40})\/?$/);
    if (ver) return versjonSide(env, url, ver[1]);   // SpareBank 1 sin BankID-innlogging kommer tilbake hit
    // Podcastepisodene ligger i R2 (FILES, nøkkel podcast/<fil>), ikke i dette offentlige repoet.
    if (url.pathname.startsWith("/podcast/lyd/")) return podcastLyd(request, env, url.pathname.slice("/podcast/lyd/".length));
    // /podcast/ og hver episode på /podcast/<n>/ er samme side, med episodelista og riktig tittel for deling satt inn.
    const pod = url.pathname.match(/^\/podcast(?:\/(\d+))?(\/?)$/);
    if (pod) {
      if (!pod[2]) { url.pathname += "/"; return Response.redirect(url.toString(), 301); }
      const ep = pod[1] ? EPISODER.find((e) => e.n === Number(pod[1])) : null;
      if (pod[1] && !ep) { url.pathname = "/podcast/"; return Response.redirect(url.toString(), 302); }
      return podcastSide(env, url, ep);
    }
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
    return env.ASSETS.fetch(request);
  },
};

// En episode fra R2 med Range-støtte, så spoling virker (Safari krever det for lyd).
async function podcastLyd(request, env, fil) {
  if (!/^ep\d{1,3}\.m4a$/.test(fil)) return new Response("Not found", { status: 404 });
  const range = request.headers.get("Range");
  const obj = await env.FILES.get("podcast/" + fil, range ? { range: request.headers } : {});
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "content-type": "audio/mp4", "accept-ranges": "bytes", etag: obj.httpEtag, "cache-control": "public, max-age=86400" });
  if (range && obj.range) {
    const start = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    return new Response(request.method === "HEAD" ? null : obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(request.method === "HEAD" ? null : obj.body, { headers });
}

async function podcastSide(env, url, ep) {
  const svar = await env.ASSETS.fetch(new URL("/podcast/", url));
  if (!svar.ok) return svar;
  const data = JSON.stringify(EPISODER).replace(/</g, "\\u003c");
  let rw = new HTMLRewriter().on("script#ep-data", { element: (el) => el.setInnerContent(data, { html: true }) });
  if (ep) {
    const tittel = `${ep.tittel} · Esbjug Podcast`;
    const besk = `Episode ${ep.n} av podcasten til Tidemann Esbjug.`;
    const adr = `https://esbjugconsult.com/podcast/${ep.n}/`;
    rw = rw
      .on("title", { element: (el) => el.setInnerContent(tittel) })
      .on('meta[property="og:title"]', { element: (el) => el.setAttribute("content", tittel) })
      .on('meta[property="og:description"], meta[name="description"]', { element: (el) => el.setAttribute("content", besk) })
      .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", adr) })
      .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", adr) });
  }
  const hoder = new Headers(svar.headers);
  hoder.delete("etag");
  hoder.set("cache-control", "no-cache");
  return rw.transform(new Response(svar.body, { status: 200, headers: hoder }));
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
  const skjul = ramme ? `<style>.ck,#chat,.ch-b{display:none!important}</style>` : "";
  const tidsreise = ramme ? `<script>(()=>{const RD=Date;let skew=0;const t0=+new URLSearchParams(location.search).get('t');if(t0)skew=t0-RD.now();class D extends RD{constructor(...a){if(a.length)super(...a);else super(RD.now()+skew)}static now(){return RD.now()+skew}}window.Date=D;const f0=window.fetch.bind(window);window.fetch=(u,o)=>{try{const x=new URL(u instanceof Request?u.url:u,location.href);if(skew&&x.origin===location.origin&&/^\/chat\/(spor|hr|status)$/.test(x.pathname)){x.searchParams.set('t',String(Math.round(RD.now()+skew)));u=x.toString()}}catch(e){}return f0(u,o)};addEventListener('message',e=>{if(e.origin===location.origin&&e.data&&typeof e.data.avspT==='number')skew=e.data.avspT-RD.now()})})();</script>` : "";
  const stripe = ramme ? "" : `<div style="position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px);display:flex;gap:12px;align-items:center;padding:9px 14px;border-radius:999px;background:#00205B;color:#fff;font:600 13px/1.2 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,20,60,.35)"><span>Slik så siden ut ${esc(tid)}</span><span style="opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40vw">${esc(meta.melding || "")}</span><a href="/" style="color:#fff;opacity:.85">Til i dag</a></div>`;
  const svar = new Response(obj.body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=86400" } });
  return new HTMLRewriter()
    .on("head", { element: (el) => { el.prepend(hode + tidsreise, { html: true }); if (skjul) el.append(skjul, { html: true }); } })
    .on("body", { element: (el) => el.prepend(stripe, { html: true }) })
    .transform(svar);
}
