// AllSet (/allset/): free preview → paid site. Setup, bindings and secrets: ALLSET.md.
//
//   POST /api/allset/activate          form on /allset/: validate, rate-limit (D1), store lead, enqueue a preview job
//   GET  /api/allset/lead/<id>         status for the thanks page (no personal data)
//   POST /api/allset/checkout/preview  Stripe Checkout for the preview fee (PREVIEW_FEE_PRICE_ID; 503 until it is set)
//   POST /api/allset/checkout/full     admin: Stripe Checkout for the full site, amount per lead, at least $2,500
//   GET  /api/allset/admin/leads       admin: lead list
//   POST /api/allset/admin/process-jobs  admin: run D1 fallback jobs (when the queue binding was missing)
//   POST /api/stripe/webhook           Stripe → marks leads paid (signature checked)
//   GET  /allset/preview/<id>          the generated preview, from R2
//   GET  /allset/admin/                admin page (static); its API calls carry Authorization: Bearer ADMIN_TOKEN,
//                                      the same token and localStorage key as the chat panel (/panel/)
//
// Previews are built only in processLead(), i.e. after the visitor's click: from the queue consumer or the admin's
// process-jobs call. Never on a page view.
import { extractSite, layout, fill, render, normalizeUrl } from "./allset-preview.js";
import { generateImages } from "./allset-images.js";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']+\.[a-z]{2,}$/i;
const MIN_FULL_CENTS = 250000; // $2,500
const READY = ["preview_ready", "preview_paid", "paid"];
const noStore = { "Cache-Control": "no-store" };
const json = (data, status = 200) => Response.json(data, { status, headers: noStore });
const see = (location) => new Response(null, { status: 303, headers: { Location: location, ...noStore } });
const enc = (s) => new TextEncoder().encode(s);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc(s)));
const now = () => Date.now();

// Constant-time comparison of two secrets of any length (both are hashed to 32 bytes first).
async function same(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc(a)), crypto.subtle.digest("SHA-256", enc(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}
const isAdmin = (request, env) => !!env.ADMIN_TOKEN && same(request.headers.get("Authorization") || "", `Bearer ${env.ADMIN_TOKEN}`);
const sameOrigin = (request, url) => request.headers.get("Origin") === url.origin;

export async function handleAllset(request, env, url) {
  const p = url.pathname;
  const post = request.method === "POST";

  if (p === "/api/stripe/webhook" && post) return webhook(request, env);
  if (p.startsWith("/api/")) {
    if (!p.startsWith("/api/allset/")) return new Response("Not found", { status: 404 });
    if (!env.DB) return json({ error: "unavailable" }, 503);
    if (p === "/api/allset/activate" && post) return activate(request, env, url);
    if (p.startsWith("/api/allset/lead/") && request.method === "GET") return leadStatus(env, p.slice("/api/allset/lead/".length));
    if (p === "/api/allset/checkout/preview" && post) return checkoutPreview(request, env, url);
    if (p === "/api/allset/checkout/full" || p.startsWith("/api/allset/admin/")) {
      if (!(await isAdmin(request, env))) return json({ error: "unauthorized" }, 401);
      if (p === "/api/allset/checkout/full" && post) return checkoutFull(request, env, url);
      if (p === "/api/allset/admin/leads" && request.method === "GET") return adminLeads(env);
      if (p === "/api/allset/admin/process-jobs" && post) return processJobs(env, url);
    }
    return json({ error: "not_found" }, 404);
  }

  if (p.startsWith("/allset/preview/")) return servePreview(env, p.slice("/allset/preview/".length));

  const res = await env.ASSETS.fetch(request);
  if (p.startsWith("/allset/admin/") || p.startsWith("/allset/thanks/")) {
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "no-store");
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    out.headers.set("X-Frame-Options", "DENY");
    out.headers.set("Referrer-Policy", "no-referrer");
    return out;
  }
  // Turnstile only when a site key is configured: the widget is put into the form's empty #turnstile box.
  if ((p === "/allset/" || p === "/allset/index.html") && env.TURNSTILE_SITE_KEY && res.ok) {
    return new HTMLRewriter()
      .on("head", { element(el) { el.append('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>', { html: true }); } })
      .on("#turnstile", { element(el) { el.setAttribute("class", "cf-turnstile"); el.setAttribute("data-sitekey", env.TURNSTILE_SITE_KEY); } })
      .transform(res);
  }
  return res;
}

// ---------- Activation ----------

// Counts one hit on `key` (window baked into the key) and says whether it is still within `limit`.
async function within(env, key, limit, until) {
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count"
  ).bind(key, until).first();
  return row.count <= limit;
}

async function turnstileOk(env, token, ip) {
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token), remoteip: ip });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return r.ok && (await r.json()).success === true;
}

async function activate(request, env, url) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const fail = (code, status) => (wantsJson ? json({ error: code }, status) : see(`/allset/?e=${code}#activate`));
  if (!sameOrigin(request, url)) return fail("origin", 403);
  if (+(request.headers.get("Content-Length") || 0) > 16384) return fail("invalid", 413);

  const f = await body(request);
  // Honeypot: people never see the field, bots fill it. Act as if it worked and store nothing.
  if (f.website) return wantsJson ? json({ status: "queued" }) : see("/allset/thanks/");

  const name = String(f.name || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const email = String(f.email || "").trim().toLowerCase();
  const siteUrl = normalizeUrl(f.url);
  if (!name || email.length > 200 || !EMAIL.test(email)) return fail("invalid", 400);
  if (!siteUrl) return fail("url", 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.TURNSTILE_SECRET && !(await turnstileOk(env, f["cf-turnstile-response"], ip))) return fail("captcha", 400);

  const t = now(), hour = 3600_000, day = 86400_000;
  const ipKey = `ip:${await sha256("allset:" + ip)}:${Math.floor(t / hour)}`;
  if (!(await within(env, ipKey, +env.ALLSET_IP_LIMIT_PER_HOUR || 3, (Math.floor(t / hour) + 1) * hour))) return fail("rate", 429);
  if (!(await within(env, `day:${Math.floor(t / day)}`, +env.ALLSET_DAILY_CAP || 100, (Math.floor(t / day) + 1) * day))) return fail("busy", 429);
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(t).run();

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO leads (id, created_at, updated_at, name, email, site_url, status) VALUES (?, ?, ?, ?, ?, ?, 'queued')")
    .bind(id, t, t, name, email, siteUrl).run();
  await enqueue(env, id);
  return wantsJson ? json({ id, status: "queued" }, 201) : see(`/allset/thanks/?id=${id}`);
}

async function enqueue(env, leadId) {
  if (env.PREVIEW_QUEUE) {
    try { await env.PREVIEW_QUEUE.send({ leadId }); return; } catch (e) { console.error("allset: queue send failed, using D1 jobs", e); }
  }
  const t = now();
  await env.DB.prepare("INSERT INTO jobs (lead_id, status, attempts, created_at, updated_at) VALUES (?, 'pending', 0, ?, ?)").bind(leadId, t, t).run();
}

async function leadStatus(env, id) {
  if (!ID.test(id)) return json({ error: "not_found" }, 404);
  const lead = await env.DB.prepare("SELECT status, preview_paid_at FROM leads WHERE id = ?").bind(id).first();
  if (!lead) return json({ error: "not_found" }, 404);
  return json({
    status: lead.status,
    preview: READY.includes(lead.status) ? `/allset/preview/${id}` : null,
    preview_paid: !!lead.preview_paid_at,
    checkout: !!(env.STRIPE_SECRET_KEY && env.PREVIEW_FEE_PRICE_ID),
  });
}

// ---------- Building the preview (after the click only) ----------

const EXT = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/avif": "avif" };

export async function processLead(env, id) {
  const lead = await env.DB.prepare("SELECT id, site_url, status FROM leads WHERE id = ?").bind(id).first();
  if (!lead || !["queued", "processing", "failed"].includes(lead.status)) return; // unknown, or already built/paid
  await env.DB.prepare("UPDATE leads SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?").bind(now(), id).run();
  try {
    const site = await extractSite(lead.site_url);
    const plan = layout(site);
    const generated = await generateImages(env, { leadId: id, siteUrl: lead.site_url, site, slots: plan.missing });
    for (const g of generated) {
      if (!g?.bytes || !/^[a-z0-9-]{1,40}$/.test(g.slot || "") || !EXT[g.contentType]) continue;
      const file = `${g.slot}.${EXT[g.contentType]}`;
      await env.PREVIEWS.put(`${id}/${file}`, g.bytes, { httpMetadata: { contentType: g.contentType } });
      g.url = `/allset/preview/${id}/${file}`;
    }
    const html = render(site, fill(plan, generated));
    await env.PREVIEWS.put(`${id}/index.html`, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    await env.DB.prepare("UPDATE leads SET status = 'preview_ready', site_title = ?, error = NULL, updated_at = ? WHERE id = ?")
      .bind(site.brand, now(), id).run();
  } catch (e) {
    await env.DB.prepare("UPDATE leads SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .bind(String(e?.message || e).slice(0, 300), now(), id).run();
    throw e;
  }
}

// Queue consumer (exported as `queue` from index.js). Three tries per lead, then it stays 'failed' for the admin.
export async function allsetQueue(batch, env) {
  for (const msg of batch.messages) {
    const id = msg.body?.leadId;
    if (!ID.test(id || "")) { msg.ack(); continue; }
    try {
      await processLead(env, id);
      msg.ack();
    } catch (e) {
      console.error("allset: preview failed", id, e);
      if (msg.attempts < 3) msg.retry({ delaySeconds: 60 }); else msg.ack();
    }
  }
}

async function processJobs(env, url) {
  const limit = Math.min(+url.searchParams.get("limit") || 3, 10);
  const { results } = await env.DB.prepare("SELECT id, lead_id FROM jobs WHERE status IN ('pending', 'failed') AND attempts < 3 ORDER BY id LIMIT ?").bind(limit).all();
  const done = [];
  for (const job of results) {
    await env.DB.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?").bind(now(), job.id).run();
    try {
      await processLead(env, job.lead_id);
      await env.DB.prepare("UPDATE jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ?").bind(now(), job.id).run();
      done.push({ job: job.id, lead: job.lead_id, ok: true });
    } catch (e) {
      const error = String(e?.message || e).slice(0, 300);
      await env.DB.prepare("UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(error, now(), job.id).run();
      done.push({ job: job.id, lead: job.lead_id, ok: false, error });
    }
  }
  return json({ processed: done });
}

// The preview is our own HTML with the client's text and image URLs in it, all escaped; the CSP still forbids
// every script, and no-referrer keeps the secret preview URL from leaking to the client's image hosts.
async function servePreview(env, rest) {
  const [id, file = "index.html"] = rest.replace(/\/$/, "/index.html").split("/");
  if (!ID.test(id || "") || !/^[a-z0-9-]{1,40}\.(html|webp|png|jpg|avif)$/.test(file) || !env.PREVIEWS) return new Response("Not found", { status: 404 });
  const obj = await env.PREVIEWS.get(`${id}/${file}`);
  if (!obj) return new Response("This preview is not ready yet.", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; img-src https: 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
  return new Response(obj.body, { headers });
}

// ---------- Stripe (REST via fetch, no SDK) ----------

// { line_items: [{ price: "x" }] } → line_items[0][price]=x
function stripeForm(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") stripeForm(v, key, out); else out.append(key, String(v));
  }
  return out;
}

async function checkoutSession(env, params) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: stripeForm(params),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `stripe ${r.status}`);
  return data;
}

// JSON or form body as a plain object; {} when it is neither.
async function body(request) {
  try {
    const b = (request.headers.get("Content-Type") || "").includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

async function checkoutPreview(request, env, url) {
  if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
  // No price yet: the page says "Price coming soon" and this stays closed.
  if (!env.STRIPE_SECRET_KEY || !env.PREVIEW_FEE_PRICE_ID) return json({ error: "price_coming_soon" }, 503);
  const { id } = await body(request);
  if (!ID.test(id || "")) return json({ error: "not_found" }, 404);
  const lead = await env.DB.prepare("SELECT id, email, status, preview_paid_at FROM leads WHERE id = ?").bind(id).first();
  if (!lead || !READY.includes(lead.status)) return json({ error: "not_ready" }, 409);
  if (lead.preview_paid_at) return json({ error: "already_paid" }, 409);
  try {
    const s = await checkoutSession(env, {
      mode: "payment",
      line_items: [{ price: env.PREVIEW_FEE_PRICE_ID, quantity: 1 }],
      customer_email: lead.email,
      client_reference_id: id,
      metadata: { lead_id: id, kind: "preview" },
      success_url: `${url.origin}/allset/thanks/?id=${id}&paid=preview`,
      cancel_url: `${url.origin}/allset/thanks/?id=${id}`,
    });
    await env.DB.prepare("UPDATE leads SET preview_session_id = ?, updated_at = ? WHERE id = ?").bind(s.id, now(), id).run();
    return json({ url: s.url });
  } catch (e) {
    console.error("allset: preview checkout", e);
    return json({ error: "stripe" }, 502);
  }
}

async function checkoutFull(request, env, url) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: "stripe_not_configured" }, 503);
  const { id, amount_usd } = await body(request);
  if (!ID.test(id || "")) return json({ error: "not_found" }, 404);
  const cents = Math.round(Number(amount_usd) * 100);
  if (!Number.isFinite(cents) || cents < MIN_FULL_CENTS) return json({ error: "minimum_2500_usd" }, 400);
  if (cents > 100_000_000) return json({ error: "amount_too_large" }, 400);
  const lead = await env.DB.prepare("SELECT id, email, site_url, status FROM leads WHERE id = ?").bind(id).first();
  if (!lead) return json({ error: "not_found" }, 404);
  if (lead.status === "paid") return json({ error: "already_paid" }, 409);
  try {
    const s = await checkoutSession(env, {
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: `AllSet website: ${new URL(lead.site_url).hostname}` } } }],
      customer_email: lead.email,
      client_reference_id: id,
      metadata: { lead_id: id, kind: "full" },
      success_url: `${url.origin}/allset/thanks/?id=${id}&paid=full`,
      cancel_url: `${url.origin}/allset/thanks/?id=${id}`,
    });
    await env.DB.prepare("UPDATE leads SET full_amount_cents = ?, full_session_id = ?, full_checkout_url = ?, full_checkout_expires_at = ?, updated_at = ? WHERE id = ?")
      .bind(cents, s.id, s.url, (s.expires_at || 0) * 1000, now(), id).run();
    return json({ url: s.url, expires_at: (s.expires_at || 0) * 1000, amount_cents: cents });
  } catch (e) {
    console.error("allset: full checkout", e);
    return json({ error: "stripe", message: String(e.message || e).slice(0, 200) }, 502);
  }
}

// Stripe-Signature: t=<unix>,v1=<hex hmac of "t.body">[,v1=...]. Rejects anything older than 5 minutes.
export async function verifyStripe(raw, header, secret, tolerance = 300) {
  const parts = String(header || "").split(",").map((x) => x.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1] || "";
  const sigs = parts.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/.test(v || "")).map(([, v]) => v);
  if (!/^\d+$/.test(t) || !sigs.length || Math.abs(now() / 1000 - +t) > tolerance) return false;
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = enc(hex(await crypto.subtle.sign("HMAC", key, enc(`${t}.${raw}`))));
  return sigs.some((s) => crypto.subtle.timingSafeEqual(enc(s), mac));
}

async function webhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) return new Response("Not configured", { status: 503 });
  const raw = await request.text();
  if (!(await verifyStripe(raw, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) return new Response("Bad signature", { status: 400 });
  const ev = JSON.parse(raw);
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    const s = ev.data?.object || {};
    const id = s.metadata?.lead_id || s.client_reference_id || "";
    if (ID.test(id) && s.payment_status === "paid") {
      // Stripe resends events; each event id is applied once.
      const fresh = await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)").bind(ev.id, ev.type, now()).run();
      if (fresh.meta.changes) {
        const t = now();
        if (s.metadata?.kind === "full") {
          await env.DB.prepare("UPDATE leads SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?").bind(t, t, id).run();
        } else {
          await env.DB.prepare("UPDATE leads SET preview_paid_at = ?, status = CASE WHEN status = 'paid' THEN status ELSE 'preview_paid' END, updated_at = ? WHERE id = ?").bind(t, t, id).run();
        }
      }
    }
  }
  return json({ received: true });
}

// ---------- Admin ----------

async function adminLeads(env) {
  const [{ results: leads }, jobs] = await Promise.all([
    env.DB.prepare("SELECT id, created_at, name, email, site_url, status, site_title, error, full_amount_cents, full_checkout_url, full_checkout_expires_at, preview_paid_at, paid_at FROM leads ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending', 'failed') AND attempts < 3").first(),
  ]);
  return json({ leads, pending_jobs: jobs?.n || 0, queue: !!env.PREVIEW_QUEUE, stripe: !!env.STRIPE_SECRET_KEY });
}
