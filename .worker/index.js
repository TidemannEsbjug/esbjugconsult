// https://esbjugconsult.com is the one address: www and plain http go there with the same path, so
// www.esbjugconsult.com/jev ends up at the Jev module too. /chat/* is the live chat; everything
// else is the static site. /login/ (customer portal) and /kunde/ (behind login) are in kunde.js.
import { handleChat, pageVisit } from "./chat.js";
import { handleKunde } from "./kunde.js";
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
    // Visit push for page loads; never allowed to break serving the page.
    try { const visit = pageVisit(request, env, url); if (visit) ctx.waitUntil(visit); } catch {}
    const res = await env.ASSETS.fetch(request);
    // /ny/ er V2 (blå, rød og hvit), forsiden 7.–9.10.2026. Forsiden er V1 (gul) igjen fra 9.10.2026; /ny/ skal ikke indekseres.
    if (url.pathname === "/ny" || url.pathname.startsWith("/ny/")) {
      const r = new Response(res.body, res);
      r.headers.set("X-Robots-Tag", "noindex, nofollow");
      return r;
    }
    return res;
  },
};
