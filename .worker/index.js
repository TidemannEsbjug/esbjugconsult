// https://esbjugconsult.com is the one address: www and plain http go there with the same path, so
// www.esbjugconsult.com/jev ends up at the Jev module too. /chat/* is the live chat; everything
// else is the static site. /login/ (customer portal) and /kunde/ (behind login) are in kunde.js.
// /allset/ and /api/ (AllSet leads, previews, Stripe) are in allset.js, which also consumes the preview queue.
import { handleChat, pageVisit } from "./chat.js";
import { handleKunde } from "./kunde.js";
import { handleAllset, allsetQueue } from "./allset.js";
export { ChatHub } from "./chat.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.esbjugconsult.com" || (url.protocol === "http:" && url.hostname !== "localhost")) {
      url.hostname = url.hostname.replace(/^www\./, "");
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/chat/")) return handleChat(request, env, url);
    // /login/ er kundeportalen, /kunde/ er lukket bak innlogging.
    if (url.pathname.startsWith("/login/") || url.pathname.startsWith("/kunde/")) return handleKunde(request, env, url);
    if (url.pathname.startsWith("/allset/") || url.pathname.startsWith("/api/")) return handleAllset(request, env, url);
    // /ny/ var arbeidskopien av V2. V2 er forsiden fra 7.10.2026, så gamle lenker sendes dit (spørrestrengen følger med).
    if (url.pathname === "/ny" || url.pathname.startsWith("/ny/")) {
      url.pathname = url.pathname.startsWith("/ny/en") ? "/en/" : "/";
      return Response.redirect(url.toString(), 301);
    }
    // Visit push for page loads; never allowed to break serving the page.
    try { const visit = pageVisit(request, env, url); if (visit) ctx.waitUntil(visit); } catch {}
    return env.ASSETS.fetch(request);
  },
  // AllSet preview jobs from the queue esbjug-allset-previews.
  async queue(batch, env) {
    return allsetQueue(batch, env);
  },
};
