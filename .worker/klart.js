// Klart: prøveperiode, kjøp og aktiveringskoder.
//
// Programmet Klart går aldri på nett. Knappene i appen åpner /klart/aktiver i
// nettleseren, med maskinkoden i adressen. Siden kaller API-et her, og det som
// kommer tilbake er en aktiveringskode: en lapp med navn, type, maskin og
// utløpsdato, signert med Ed25519. Appen sjekker signaturen lokalt mot den
// offentlige nøkkelen den har innebygd (src-tauri/src/aktivering.rs i Klart).
//
//   GET  /GDPR/api/status       hva som er åpent: prøve og kjøp
//   POST /GDPR/api/prove        { maskin }          → 14 dager, én gang per maskin
//   POST /GDPR/api/kjop         { maskin, epost? }  → adresse til Stripe Checkout
//   GET  /GDPR/api/kvittering?session=cs_…          → koden etter betaling
//   POST /GDPR/api/hent         { maskin, epost }   → ny kode til en betalt lisens
//   POST /GDPR/api/stripe       Stripe-webhook
//
// Hemmeligheter (wrangler secret put): KLART_LISENSNOKKEL (PEM, PKCS#8, Ed25519),
// STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Innstillinger (vars i wrangler.jsonc):
// STRIPE_PRICE_ID (tom = kjøp er ikke åpnet), KLART_MASKINER (maskiner per lisens),
// KLART_MVA ("auto" = Stripe Tax legger på mva).
//
// Ingen dokumenter, ingen innhold fra programmet, kommer hit. Bare maskinkoden,
// som er en hash, og e-post og navn fra kjøpet.

import { DurableObject } from "cloudflare:workers";

const PROVEDAGER = 14;
const NADE_DAGER = 14; // lisensen varer så mange dager etter at perioden er betalt til
const MASKINKODE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
const SIDE = "https://esbjugconsult.com/GDPR/aktiver/";

// ---------------------------------------------------------------------------
// Ruting
// ---------------------------------------------------------------------------

export async function handleKlart(request, env, url) {
  const sti = url.pathname.replace(/^\/GDPR\/api\//, "");
  try {
    if (sti === "status" && request.method === "GET") return json(await status(env));
    if (sti === "prove" && request.method === "POST") return await prove(request, env);
    if (sti === "kjop" && request.method === "POST") return await kjop(request, env, url);
    if (sti === "kvittering" && request.method === "GET") return await kvittering(env, url);
    if (sti === "hent" && request.method === "POST") return await hent(request, env);
    if (sti === "stripe" && request.method === "POST") return await webhook(request, env);
    return json({ feil: "Finnes ikke." }, 404);
  } catch (err) {
    console.error("klart", sti, err && err.stack ? err.stack : err);
    return json({ feil: "Noe gikk galt hos oss. Prøv igjen om litt." }, 500);
  }
}

function lager(env) {
  return env.KLART.get(env.KLART.idFromName("lisenser"));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function maskinFra(verdi) {
  const m = String(verdi || "").trim().toUpperCase();
  return MASKINKODE.test(m) ? m : null;
}

function epostFra(verdi) {
  const e = String(verdi || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

// ---------------------------------------------------------------------------
// Datoer og signering
// ---------------------------------------------------------------------------

function dato(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function idag() {
  return dato(Date.now());
}

function omDager(dager, fra = Date.now()) {
  return dato(fra + dager * 86_400_000);
}

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let nokkelCache = null;

async function signeringsnokkel(env) {
  if (nokkelCache) return nokkelCache;
  const pem = env.KLART_LISENSNOKKEL;
  if (!pem) throw new Error("KLART_LISENSNOKKEL mangler");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) =>
    c.charCodeAt(0)
  );
  nokkelCache = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
  return nokkelCache;
}

/** Samme format som scripts/lag-lisens.mjs i Klart: KLART-<innhold>.<signatur>. */
async function lagKode(env, lapp) {
  const innhold = new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      id: lapp.id,
      type: lapp.type,
      navn: lapp.navn,
      epost: lapp.epost ?? null,
      maskin: lapp.maskin ?? null,
      plan: lapp.plan ?? null,
      utstedt: idag(),
      utloper: lapp.utloper ?? null,
    })
  );
  const sig = await crypto.subtle.sign("Ed25519", await signeringsnokkel(env), innhold);
  return `KLART-${b64url(innhold)}.${b64url(sig)}`;
}

function nyId() {
  return b64url(crypto.getRandomValues(new Uint8Array(6)));
}

// ---------------------------------------------------------------------------
// Prøveperiode
// ---------------------------------------------------------------------------

async function status(env) {
  return {
    prove: Boolean(env.KLART_LISENSNOKKEL),
    kjop: Boolean(env.KLART_LISENSNOKKEL && env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID),
  };
}

async function prove(request, env) {
  const { maskin: rå } = await body(request);
  const maskin = maskinFra(rå);
  if (!maskin) return json({ feil: "Maskinkoden ser ikke riktig ut. Den står nederst på aktiveringsskjermen i Klart." }, 400);
  if (!env.KLART_LISENSNOKKEL) return json({ feil: "Prøveperioden er ikke åpnet ennå." }, 503);

  const tidligere = await lager(env).finnProve(maskin);
  if (tidligere) {
    if (tidligere.utloper >= idag()) {
      // Samme maskin spør igjen innen perioden: samme kode, ingen ny prøvetid.
      return json({ kode: tidligere.kode, utloper: tidligere.utloper, igjen: true });
    }
    return json(
      { feil: "Denne maskinen har allerede brukt prøveperioden. Kjøp en lisens for å fortsette.", brukt: true },
      409
    );
  }
  // Siste dag teller med i appen, så 14 dager = i dag + 13.
  const utloper = omDager(PROVEDAGER - 1);
  const kode = await lagKode(env, { id: nyId(), type: "prove", navn: "Prøveperiode", maskin, utloper });
  const lagret = await lager(env).nyProve(maskin, utloper, kode);
  return json({ kode: lagret.kode, utloper: lagret.utloper });
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

async function stripe(env, metode, sti, felt) {
  const init = {
    method: metode,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  };
  if (felt) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(felt).toString();
  }
  const svar = await fetch(`https://api.stripe.com/v1/${sti}`, init);
  const data = await svar.json();
  if (!svar.ok) throw new Error(`Stripe ${sti}: ${data.error?.message || svar.status}`);
  return data;
}

async function kjop(request, env, url) {
  const { maskin: rå, epost: råEpost } = await body(request);
  const maskin = maskinFra(rå);
  if (!maskin) return json({ feil: "Maskinkoden ser ikke riktig ut. Den står nederst på aktiveringsskjermen i Klart." }, 400);
  if (!(await status(env)).kjop) return json({ feil: "Kjøp åpner snart." }, 503);

  const pris = await stripe(env, "GET", `prices/${env.STRIPE_PRICE_ID}`);
  const abonnement = Boolean(pris.recurring);
  const side = url.hostname === "localhost" ? `${url.origin}/GDPR/aktiver/` : SIDE;
  const felt = {
    mode: abonnement ? "subscription" : "payment",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${side}?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${side}?hva=kjop&maskin=${maskin}`,
    client_reference_id: maskin,
    "metadata[maskin]": maskin,
    locale: "nb",
    allow_promotion_codes: "true",
    "tax_id_collection[enabled]": "true",
    billing_address_collection: "required",
  };
  if (abonnement) felt["subscription_data[metadata][maskin]"] = maskin;
  else felt["customer_creation"] = "always";
  if (env.KLART_MVA === "auto") felt["automatic_tax[enabled]"] = "true";
  const epost = epostFra(råEpost);
  if (epost) felt.customer_email = epost;

  const økt = await stripe(env, "POST", "checkout/sessions", felt);
  return json({ adresse: økt.url });
}

/** Til og med-datoen lisensen gjelder, fra et Stripe-abonnement. */
function utloperFraAbonnement(abo) {
  const slutt = abo.current_period_end ?? abo.items?.data?.[0]?.current_period_end;
  return slutt ? omDager(NADE_DAGER, slutt * 1000) : null;
}

/** Lagrer eller oppdaterer lisensen fra en fullført Checkout-økt. Brukes av både kvitteringen og webhooken. */
async function lisensFraOkt(env, okt) {
  if (okt.status !== "complete" || !["paid", "no_payment_required"].includes(okt.payment_status)) return null;
  let utloper = null;
  let aboId = null;
  if (okt.mode === "subscription" && okt.subscription) {
    const abo = typeof okt.subscription === "string" ? await stripe(env, "GET", `subscriptions/${okt.subscription}`) : okt.subscription;
    aboId = abo.id;
    utloper = utloperFraAbonnement(abo);
  }
  const kunde = okt.customer_details || {};
  return lager(env).lagreLisens({
    id: aboId || okt.id,
    epost: (kunde.email || okt.customer_email || "").toLowerCase(),
    navn: kunde.name || kunde.email || "Klart-kunde",
    kunde: typeof okt.customer === "string" ? okt.customer : okt.customer?.id || null,
    utloper,
    maks: Number(env.KLART_MASKINER || 2),
    forsteMaskin: maskinFra(okt.metadata?.maskin || okt.client_reference_id),
  });
}

async function kodeTilLisens(env, lisens, maskin) {
  return lagKode(env, {
    id: nyId(),
    type: "lisens",
    navn: lisens.navn,
    epost: lisens.epost,
    maskin,
    plan: lisens.plan || null,
    utloper: lisens.utloper,
  });
}

async function kvittering(env, url) {
  const id = url.searchParams.get("session") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ feil: "Fant ikke kjøpet." }, 400);
  if (!(await status(env)).kjop) return json({ feil: "Kjøp er ikke åpnet." }, 503);
  const okt = await stripe(env, "GET", `checkout/sessions/${id}?expand[]=subscription`);
  const lisens = await lisensFraOkt(env, okt);
  if (!lisens) return json({ feil: "Betalingen er ikke fullført ennå. Last siden på nytt om litt." }, 409);
  const maskin = maskinFra(okt.metadata?.maskin || okt.client_reference_id);
  return json({ kode: await kodeTilLisens(env, lisens, maskin), navn: lisens.navn, epost: lisens.epost, utloper: lisens.utloper });
}

async function hent(request, env) {
  const { maskin: rå, epost: råEpost } = await body(request);
  const maskin = maskinFra(rå);
  const epost = epostFra(råEpost);
  if (!maskin || !epost) return json({ feil: "Skriv inn maskinkoden og e-posten du brukte da du kjøpte." }, 400);
  if (!env.KLART_LISENSNOKKEL) return json({ feil: "Ikke åpnet ennå." }, 503);
  const svar = await lager(env).knyttMaskin(epost, maskin, idag());
  if (svar.feil) return json({ feil: svar.feil }, svar.kode || 404);
  return json({ kode: await kodeTilLisens(env, svar.lisens, maskin), navn: svar.lisens.navn, utloper: svar.lisens.utloper });
}

// ---------------------------------------------------------------------------
// Webhook: holder lisensene oppdatert når Stripe fornyer eller avslutter
// ---------------------------------------------------------------------------

async function sjekkSignatur(env, request, raw) {
  const hode = request.headers.get("stripe-signature") || "";
  const deler = Object.fromEntries(
    hode.split(",").map((d) => d.split("=")).filter((d) => d.length === 2).map(([k, v]) => [k.trim(), v.trim()])
  );
  const signaturer = hode
    .split(",")
    .filter((d) => d.trim().startsWith("v1="))
    .map((d) => d.trim().slice(3));
  const t = Number(deler.t);
  if (!t || !signaturer.length || !env.STRIPE_WEBHOOK_SECRET) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;
  const nokkel = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", nokkel, new TextEncoder().encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signaturer.some((s) => s.length === hex.length && likt(s, hex));
}

function likt(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function webhook(request, env) {
  const raw = await request.text();
  if (!(await sjekkSignatur(env, request, raw))) return json({ feil: "Ugyldig signatur." }, 400);
  const hendelse = JSON.parse(raw);
  if (!(await lager(env).nyHendelse(hendelse.id))) return json({ ok: true, igjen: true });
  const obj = hendelse.data?.object || {};
  switch (hendelse.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await lisensFraOkt(env, obj);
      break;
    case "invoice.paid": {
      const aboId = obj.subscription || obj.parent?.subscription_details?.subscription;
      if (aboId) {
        const abo = await stripe(env, "GET", `subscriptions/${aboId}`);
        await lager(env).settUtloper(abo.id, utloperFraAbonnement(abo), "aktiv");
      }
      break;
    }
    case "customer.subscription.updated":
      await lager(env).settUtloper(obj.id, utloperFraAbonnement(obj), obj.status === "canceled" ? "avsluttet" : "aktiv");
      break;
    case "customer.subscription.deleted":
      await lager(env).settStatus(obj.id, "avsluttet");
      break;
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Lageret: én Durable Object med SQLite
// ---------------------------------------------------------------------------

export class KlartLager extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS prover (
      maskin TEXT PRIMARY KEY, utstedt TEXT, utloper TEXT, kode TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS lisenser (
      id TEXT PRIMARY KEY, epost TEXT, navn TEXT, kunde TEXT, plan TEXT,
      utloper TEXT, maks INTEGER, status TEXT, opprettet TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS lisenser_epost ON lisenser (epost)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS maskiner (
      lisens TEXT, maskin TEXT, lagt_til TEXT, PRIMARY KEY (lisens, maskin))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hendelser (id TEXT PRIMARY KEY, mottatt TEXT)`);
  }

  finnProve(maskin) {
    return this.sql.exec(`SELECT * FROM prover WHERE maskin = ?`, maskin).toArray()[0] || null;
  }

  /** Lagrer en ny prøveperiode. Kommer to forespørsler samtidig, vinner den første. */
  nyProve(maskin, utloper, kode) {
    this.sql.exec(
      `INSERT OR IGNORE INTO prover (maskin, utstedt, utloper, kode) VALUES (?, ?, ?, ?)`,
      maskin,
      idag(),
      utloper,
      kode
    );
    return this.finnProve(maskin);
  }

  lagreLisens(l) {
    const finnes = this.sql.exec(`SELECT * FROM lisenser WHERE id = ?`, l.id).toArray()[0];
    if (finnes) {
      this.sql.exec(
        `UPDATE lisenser SET epost = ?, navn = ?, kunde = COALESCE(?, kunde), utloper = ?, status = 'aktiv' WHERE id = ?`,
        l.epost,
        l.navn,
        l.kunde,
        l.utloper,
        l.id
      );
    } else {
      this.sql.exec(
        `INSERT INTO lisenser (id, epost, navn, kunde, plan, utloper, maks, status, opprettet)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'aktiv', ?)`,
        l.id,
        l.epost,
        l.navn,
        l.kunde,
        null,
        l.utloper,
        l.maks,
        idag()
      );
    }
    if (l.forsteMaskin) {
      this.sql.exec(
        `INSERT OR IGNORE INTO maskiner (lisens, maskin, lagt_til) VALUES (?, ?, ?)`,
        l.id,
        l.forsteMaskin,
        idag()
      );
    }
    return this.sql.exec(`SELECT * FROM lisenser WHERE id = ?`, l.id).toArray()[0];
  }

  /** Finner en gyldig lisens for e-posten og knytter maskinen til den, innenfor grensen. */
  knyttMaskin(epost, maskin, dag) {
    const lisenser = this.sql
      .exec(`SELECT * FROM lisenser WHERE epost = ? AND status = 'aktiv' ORDER BY utloper DESC`, epost)
      .toArray()
      .filter((l) => !l.utloper || l.utloper >= dag);
    if (!lisenser.length) return { feil: "Fant ingen gyldig lisens for den e-posten.", kode: 404 };
    for (const l of lisenser) {
      const har = this.sql.exec(`SELECT 1 FROM maskiner WHERE lisens = ? AND maskin = ?`, l.id, maskin).toArray().length;
      if (har) return { lisens: l };
    }
    for (const l of lisenser) {
      const antall = this.sql.exec(`SELECT COUNT(*) AS n FROM maskiner WHERE lisens = ?`, l.id).one().n;
      if (antall < (l.maks || 2)) {
        this.sql.exec(`INSERT INTO maskiner (lisens, maskin, lagt_til) VALUES (?, ?, ?)`, l.id, maskin, dag);
        return { lisens: l };
      }
    }
    return {
      feil: "Lisensen er allerede i bruk på så mange maskiner som den gjelder for. Kontakt oss hvis du har byttet maskin.",
      kode: 409,
    };
  }

  settUtloper(id, utloper, status) {
    this.sql.exec(`UPDATE lisenser SET utloper = COALESCE(?, utloper), status = ? WHERE id = ?`, utloper, status, id);
  }

  settStatus(id, status) {
    this.sql.exec(`UPDATE lisenser SET status = ? WHERE id = ?`, status, id);
  }

  /** true første gang en Stripe-hendelse kommer, false hvis den er behandlet før. */
  nyHendelse(id) {
    if (!id) return true;
    const før = this.sql.exec(`SELECT 1 FROM hendelser WHERE id = ?`, id).toArray().length;
    if (før) return false;
    this.sql.exec(`INSERT INTO hendelser (id, mottatt) VALUES (?, ?)`, id, new Date().toISOString());
    return true;
  }
}
