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
    if (url.pathname === "/bank/tilbake") return handleChat(request, env, url);   // SpareBank 1 sin BankID-innlogging kommer tilbake hit
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
