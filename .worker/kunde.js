// Kundeområdet. /login/ er portalen (Firebase Auth + Firestore, bygget fra ../kunde-portal).
// Alt under /kunde/ er lukket: bare en gyldig innlogging slipper inn.
//
// Innloggingen i portalen sender Firebase-ID-tokenet hit (POST /login/session). Serveren sjekker
// signaturen mot Googles offentlige nøkler og legger tokenet i en HttpOnly-cookie. Hver forespørsel
// under /kunde/ sjekkes på nytt, så cookien slutter å virke når tokenet utløper (én time);
// portalen fornyer den så lenge den står åpen. Ingen hemmelig nøkkel å passe på.

const PROJECT_ID = "esbjug-consult";
const JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const COOKIE = "__Secure-kunde";
// Bare kontoene i hemmeligheten ALLOWED_EMAILS (kommaseparert, `wrangler secret put ALLOWED_EMAILS`)
// slipper inn under /kunde/, selv om andre skulle få en konto i Firebase. Repoet er offentlig, derfor står de ikke her.
const allowed = (env) => new Set(String(env.ALLOWED_EMAILS || "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean));

let keys = null; // { at, byKid }

const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64u(s)));

async function getKey(kid) {
  if (!keys || Date.now() - keys.at > 3600_000 || !keys.byKid.has(kid)) {
    // Ikke hent oftere enn hvert 30. sekund, selv om noen sender ukjente kid-er.
    if (!keys || Date.now() - keys.at > 30_000) {
      const r = await fetch(JWK_URL, { cf: { cacheTtl: 3600 } });
      if (!r.ok) throw new Error("jwk");
      const { keys: list } = await r.json();
      const byKid = new Map();
      for (const k of list) {
        byKid.set(k.kid, await crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
      }
      keys = { at: Date.now(), byKid };
    }
  }
  return keys.byKid.get(kid);
}

// Returnerer e-posten hvis tokenet er ekte, ikke utløpt og tilhører en tillatt konto, ellers null.
export async function verify(token, env) {
  try {
    if (typeof token !== "string" || token.length > 4096) return null;
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const head = json(h);
    if (head.alg !== "RS256" || !head.kid) return null;
    const key = await getKey(head.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(h + "." + p));
    if (!ok) return null;
    const c = json(p);
    const now = Math.floor(Date.now() / 1000);
    if (c.iss !== "https://securetoken.google.com/" + PROJECT_ID || c.aud !== PROJECT_ID) return null;
    if (!c.sub || c.exp <= now || c.iat > now + 60 || c.auth_time > now + 60) return null;
    if (c.email_verified !== true) return null;
    const email = String(c.email || "").toLowerCase();
    return allowed(env).has(email) ? email : null;
  } catch {
    return null;
  }
}

const cookieOf = (request) => {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? m[1] : "";
};

const secure = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

// Portalen: én skriptfil fra egen origin, Firebase for innlogging og data, skissen og kartet i iframe.
const PORTAL_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.googleapis.com",
].join("; ");

export async function handleKunde(request, env, url) {
  const p = url.pathname;

  if (p === "/login/session" || p === "/login/logout") {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    if (request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403 });
    const base = "; Path=/kunde/; HttpOnly; Secure; SameSite=Lax";
    if (p === "/login/logout") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": COOKIE + "=; Max-Age=0" + base, "Cache-Control": "no-store" } });
    }
    let token = "";
    try { token = (await request.json()).token; } catch {}
    if (!(await verify(token, env))) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 204, headers: { "Set-Cookie": COOKIE + "=" + token + "; Max-Age=3600" + base, "Cache-Control": "no-store" } });
  }

  if (p.startsWith("/kunde/")) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    if (!(await verify(cookieOf(request), env))) {
      // Sidene åpnes fra portalen. Uten gyldig økt går man via innloggingen og tilbake hit.
      const wantsPage = (request.headers.get("Accept") || "").includes("text/html");
      if (wantsPage) return new Response(null, { status: 302, headers: { Location: "/login/?til=" + encodeURIComponent(p + url.search), "Cache-Control": "no-store" } });
      return new Response("Ikke innlogget", { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "private, no-store");
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    out.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    for (const [k, v] of Object.entries(secure)) out.headers.set(k, v);
    return out;
  }

  // /login/ og filene under: vanlig statisk, med strenge sikkerhetshoder.
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(secure)) out.headers.set(k, v);
  const type = out.headers.get("Content-Type") || "";
  if (type.includes("text/html")) {
    out.headers.set("Content-Security-Policy", PORTAL_CSP);
    out.headers.set("X-Frame-Options", "DENY");
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    out.headers.set("Cache-Control", "no-cache");
  }
  return out;
}
