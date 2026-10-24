// Klart: kjøp og aktiveringskoder.
//
// Det finnes ingen prøveperiode lenger. Prøvekoder som alt er gitt ut, virker
// til de går ut.
//
// Lisenser selges til bedrifter, ikke personer. Kjøperen skriver inn org.nr, og
// firmanavnet hentes fra Enhetsregisteret i Brønnøysund (data.brreg.no). Lisensen
// og koden bærer firmanavn og org.nr. Uten lisens kan appen lagre ti rensede
// filer av hver filtype (src-tauri/src/aktivering.rs).
//
// Programmet Klart går aldri på nett. Knappene i appen åpner /klart/aktiver i
// nettleseren, med maskinkoden i adressen. Siden kaller API-et her, og det som
// kommer tilbake er en aktiveringskode: en lapp med navn, type, maskin og
// utløpsdato, signert med Ed25519. Appen sjekker signaturen lokalt mot den
// offentlige nøkkelen den har innebygd (src-tauri/src/aktivering.rs i Klart).
//
//   GET  /klart/api/status       hva som er åpent: kjøp
//   POST /klart/api/prove        410: erstattet av forhåndsvisningen i appen
//   GET  /klart/api/firma?orgnr=… → { orgnr, navn } fra Enhetsregisteret
//   POST /klart/api/kjop         { maskin, orgnr, epost? } → adresse til Stripe Checkout
//   GET  /klart/api/kvittering?session=cs_…          → koden etter betaling
//   POST /klart/api/hent         { maskin, epost }   → ny kode til en betalt lisens
//   POST /klart/api/stripe       Stripe-webhook
//
// Prissiden (/klart/pris/) selger lisenser for hele virksomheten, priset fra antall ansatte:
//
//   GET  /klart/api/pris?orgnr=…[&som=kunde]  → virksomheten, prisen og hvordan den kan betale
//   POST /klart/api/kasse        { type, orgnr, betaling, kunder?, epost?, referanse?, ehf? }
//                                → adresse til Stripe Checkout, eller fakturaen og nøkkelen
//   GET  /klart/api/ordre?session=cs_…   → nøkkelen etter betaling på prissiden
//   POST /klart/api/kunder       { kode, kunder } → legger kunder til en tjenesteleverandørlisens
//   POST /klart/api/sprint       kontaktskjemaet for sprinten
//   GET  /klart/api/utboks       e-postene som skal ut, og henvendelsene (Bearer ADMIN_TOKEN)
//
// Hemmeligheter (wrangler secret put): KLART_LISENSNOKKEL (PEM, PKCS#8, Ed25519),
// STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, KLART_PRISER (JSON, se klart-pris.js),
// RESEND_API_KEY (valgfri; uten den blir e-postene liggende i utboksen). Innstillinger (vars i
// wrangler.jsonc): STRIPE_PRICE_ID (tom = kjøp er ikke åpnet), KLART_MASKINER (maskiner per
// lisens), KLART_MVA ("auto" = Stripe Tax legger på mva), KLART_EPOST_FRA (avsender),
// STRIPE_MVA_ID (valgfri; ellers finnes eller lages en MVA-sats på 25 % i Stripe).
//
// Ingen dokumenter, ingen innhold fra programmet, kommer hit. Bare maskinkoden,
// som er en hash, og org.nr, firmanavn og e-post fra kjøpet.

import { DurableObject } from "cloudflare:workers";
import {
  orgnrFra,
  lesPriser,
  lisenspris,
  kundepris,
  sprintFor,
  betalingFor,
  aktiv,
  virksomhetFra,
} from "./klart-pris.js";

const NADE_DAGER = 14; // lisensen varer så mange dager etter at perioden er betalt til
const MASKINKODE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;
const SIDE = "https://esbjugconsult.com/klart/aktiver/";

// ---------------------------------------------------------------------------
// Ruting
// ---------------------------------------------------------------------------

export async function handleKlart(request, env, url) {
  const sti = url.pathname.replace(/^\/(klart|GDPR)\/api\//, "");
  try {
    if (sti === "status" && request.method === "GET") return json(await status(env));
    if (sti === "prove" && request.method === "POST") return await prove(request, env);
    if (sti === "firma" && request.method === "GET") return await firma(url);
    if (sti === "kjop" && request.method === "POST") return await kjop(request, env, url);
    if (sti === "kvittering" && request.method === "GET") return await kvittering(env, url);
    if (sti === "hent" && request.method === "POST") return await hent(request, env);
    if (sti === "stripe" && request.method === "POST") return await webhook(request, env);
    if (sti === "pris" && request.method === "GET") return await pris(env, url);
    if (sti === "kasse" && request.method === "POST") return await kasse(request, env, url);
    if (sti === "ordre" && request.method === "GET") return await ordre(env, url);
    if (sti === "kunder" && request.method === "POST") return await leggTilKunder(request, env);
    if (sti === "sprint" && request.method === "POST") return await sprint(request, env);
    if (sti === "utboks" && request.method === "GET") return await utboks(request, env);
    return json({ feil: "Finnes ikke." }, 404);
  } catch (err) {
    console.error("klart", sti, err && err.stack ? err.stack : err);
    // I testmodus står den egentlige feilen med, så den kan rettes. Aldri i live.
    const detalj = testmodus(env) ? ` (${err && err.message ? err.message : err})` : "";
    return json({ feil: "Noe gikk galt hos oss. Prøv igjen om litt." + detalj }, 500);
  }
}

// ---------------------------------------------------------------------------
// Nedlasting: installasjonsfilene ligger i R2-bøtta klart-nedlasting, fordi de er
// større enn det statiske filer på Cloudflare kan være (25 MB).
// ---------------------------------------------------------------------------

const FILER = {
  // «key» er navnet i R2 (fra bygget), «navn» er det kunden får på disken.
  mac: { key: "mac/Klart_0.1.0_universal.dmg", navn: "Klart-for-Mac-0.1.0.dmg", type: "application/x-apple-diskimage" },
  windows: { key: "windows/Klart_0.1.0_x64-setup.exe", navn: "Klart-for-Windows-0.1.0.exe", type: "application/vnd.microsoft.portable-executable" },
};

export async function handleNedlasting(request, env, url) {
  const hva = url.pathname.replace(/^\/(klart|GDPR)\/last-ned\//, "").replace(/\/$/, "");
  const fil = FILER[hva];
  if (!fil || !["GET", "HEAD"].includes(request.method)) return new Response("Finnes ikke.", { status: 404 });
  const obj = await env.KLART_FILER.get(fil.key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("Filen er ikke lastet opp ennå.", { status: 404 });
  const hoder = new Headers();
  obj.writeHttpMetadata(hoder);
  hoder.set("content-type", fil.type);
  hoder.set("content-disposition", `attachment; filename="${fil.navn}"`);
  hoder.set("etag", obj.httpEtag);
  hoder.set("accept-ranges", "bytes");
  hoder.set("cache-control", "public, max-age=3600");
  if (!("body" in obj)) return new Response(null, { status: 304, headers: hoder });
  if (obj.range && request.headers.has("range")) {
    const start = obj.range.offset ?? obj.size - obj.range.suffix;
    const lengde = obj.range.length ?? obj.size - start;
    hoder.set("content-range", `bytes ${start}-${start + lengde - 1}/${obj.size}`);
    hoder.set("content-length", String(lengde));
    return new Response(request.method === "HEAD" ? null : obj.body, { status: 206, headers: hoder });
  }
  hoder.set("content-length", String(obj.size));
  return new Response(request.method === "HEAD" ? null : obj.body, { headers: hoder });
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

/** Firmaet bak et org.nr, fra Enhetsregisteret. { feil, kode } når det ikke kan kjøpe. */
async function slaaOppFirma(orgnr) {
  const svar = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, {
    headers: { accept: "application/json" },
  });
  if (svar.status === 404 || svar.status === 410) {
    return { feil: "Fant ikke organisasjonsnummeret i Enhetsregisteret.", kode: 404 };
  }
  if (!svar.ok) throw new Error(`Enhetsregisteret: ${svar.status}`);
  const enhet = await svar.json();
  if (enhet.slettedato) return { feil: "Organisasjonsnummeret er slettet i Enhetsregisteret.", kode: 409 };
  if (enhet.konkurs || enhet.underAvvikling || enhet.underTvangsavviklingEllerTvangsopplosning) {
    return { feil: "Virksomheten er under avvikling eller konkurs, og kan ikke kjøpe lisens.", kode: 409 };
  }
  return { orgnr, navn: enhet.navn };
}

async function firma(url) {
  const orgnr = orgnrFra(url.searchParams.get("orgnr"));
  if (!orgnr) return json({ feil: "Organisasjonsnummeret må være ni sifre og gyldig." }, 400);
  const f = await slaaOppFirma(orgnr);
  if (f.feil) return json({ feil: f.feil }, f.kode);
  return json(f);
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
let sjekkCache = null;

function derFra(env) {
  const pem = env.KLART_LISENSNOKKEL;
  if (!pem) throw new Error("KLART_LISENSNOKKEL mangler");
  return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
}

async function signeringsnokkel(env) {
  if (nokkelCache) return nokkelCache;
  nokkelCache = await crypto.subtle.importKey("pkcs8", derFra(env), { name: "Ed25519" }, false, ["sign"]);
  return nokkelCache;
}

/** Den offentlige halvdelen, den samme appen har innebygd. Hentes fra den private, så de aldri spriker. */
async function sjekknokkel(env) {
  if (sjekkCache) return sjekkCache;
  const privat = await crypto.subtle.importKey("pkcs8", derFra(env), { name: "Ed25519" }, true, ["sign"]);
  const { x } = await crypto.subtle.exportKey("jwk", privat);
  sjekkCache = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, { name: "Ed25519" }, false, ["verify"]);
  return sjekkCache;
}

function fraB64url(tekst) {
  const s = tekst.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
}

/** Leser en kode vi har laget, eller null hvis signaturen ikke stemmer. */
async function lesKode(env, kode) {
  const m = String(kode || "").replace(/\s/g, "").match(/^KLART-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const innhold = fraB64url(m[1]);
  if (!(await crypto.subtle.verify("Ed25519", await sjekknokkel(env), fraB64url(m[2]), innhold))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(innhold));
  } catch {
    return null;
  }
}

/** Samme format som scripts/lag-lisens.mjs i Klart: KLART-<innhold>.<signatur>. */
async function lagKode(env, lapp) {
  const innhold = new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      id: lapp.id,
      type: lapp.type,
      navn: lapp.navn,
      orgnr: lapp.orgnr ?? null,
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
    prove: false,
    kjop: Boolean(env.KLART_LISENSNOKKEL && env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID),
    pris: kjopApent(env),
    test: testmodus(env),
  };
}

async function prove() {
  return json(
    {
      feil: "Prøveperioden er erstattet av en gratis forhåndsvisning. Last ned Klart og prøv det uten kode.",
      brukt: true,
    },
    410
  );
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

async function stripe(env, metode, sti, felt, idempotens) {
  const init = {
    method: metode,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  };
  if (felt) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(felt).toString();
  }
  if (idempotens) init.headers["idempotency-key"] = idempotens;
  const svar = await fetch(`https://api.stripe.com/v1/${sti}`, init);
  const data = await svar.json();
  if (!svar.ok) throw new Error(`Stripe ${sti}: ${data.error?.message || svar.status}`);
  return data;
}

/** Som stripe(), men null når objektet ikke finnes. */
async function stripeFinn(env, sti) {
  const svar = await fetch(`https://api.stripe.com/v1/${sti}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (svar.status === 404) return null;
  const data = await svar.json();
  if (!svar.ok) throw new Error(`Stripe ${sti}: ${data.error?.message || svar.status}`);
  return data;
}

async function kjop(request, env, url) {
  const { maskin: rå, epost: råEpost, orgnr: råOrgnr } = await body(request);
  const maskin = maskinFra(rå);
  if (!maskin) return json({ feil: "Maskinkoden ser ikke riktig ut. Den står i lisensvinduet i Klart, øverst til høyre." }, 400);
  const orgnr = orgnrFra(råOrgnr);
  if (!orgnr) return json({ feil: "Lisenser selges til bedrifter. Skriv inn organisasjonsnummeret." }, 400);
  if (!(await status(env)).kjop) return json({ feil: "Kjøp åpner snart." }, 503);
  // Navnet hentes her, ikke fra siden, så lisensen alltid står på det registrerte navnet.
  const bedrift = await slaaOppFirma(orgnr);
  if (bedrift.feil) return json({ feil: bedrift.feil }, bedrift.kode);

  const pris = await stripe(env, "GET", `prices/${env.STRIPE_PRICE_ID}`);
  const abonnement = Boolean(pris.recurring);
  const side = url.hostname === "localhost" ? `${url.origin}/klart/aktiver/` : SIDE;
  const felt = {
    mode: abonnement ? "subscription" : "payment",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${side}?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${side}?hva=kjop&maskin=${maskin}`,
    client_reference_id: maskin,
    "metadata[maskin]": maskin,
    "metadata[orgnr]": orgnr,
    "metadata[firma]": bedrift.navn,
    locale: "nb",
    allow_promotion_codes: "true",
    "tax_id_collection[enabled]": "true",
    billing_address_collection: "required",
  };
  if (abonnement) {
    felt["subscription_data[metadata][maskin]"] = maskin;
    felt["subscription_data[metadata][orgnr]"] = orgnr;
    felt["subscription_data[metadata][firma]"] = bedrift.navn;
  }
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
    // Lisensen står på firmaet fra Enhetsregisteret. Kjøp fra før org.nr kom, har bare kortnavnet.
    navn: okt.metadata?.firma || kunde.name || kunde.email || "Klart-kunde",
    orgnr: orgnrFra(okt.metadata?.orgnr),
    kunde: typeof okt.customer === "string" ? okt.customer : okt.customer?.id || null,
    utloper,
    maks: Number(env.KLART_MASKINER || 2),
    forsteMaskin: maskinFra(okt.metadata?.maskin || okt.client_reference_id),
  });
}

/** Med en testnøkkel fra Stripe kan hvem som helst «betale» med testkort. Da gir kjøpet
    en lisens merket «test» som varer en uke, aldri en ekte lisens. */
function testmodus(env) {
  return String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
}

async function kodeTilLisens(env, lisens, maskin) {
  const test = testmodus(env);
  const uke = omDager(7);
  return lagKode(env, {
    id: nyId(),
    type: "lisens",
    navn: test ? `${lisens.navn} (test)` : lisens.navn,
    orgnr: lisens.orgnr || null,
    epost: lisens.epost,
    maskin,
    plan: test ? "test" : lisens.plan || null,
    utloper: test ? (lisens.utloper && lisens.utloper < uke ? lisens.utloper : uke) : lisens.utloper,
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
  return json({ kode: await kodeTilLisens(env, lisens, maskin), navn: lisens.navn, orgnr: lisens.orgnr, epost: lisens.epost, utloper: lisens.utloper });
}

async function hent(request, env) {
  const { maskin: rå, epost: råEpost } = await body(request);
  const maskin = maskinFra(rå);
  const epost = epostFra(råEpost);
  if (!maskin || !epost) return json({ feil: "Skriv inn maskinkoden og e-posten du brukte da du kjøpte." }, 400);
  if (!env.KLART_LISENSNOKKEL) return json({ feil: "Ikke åpnet ennå." }, 503);
  const svar = await lager(env).knyttMaskin(epost, maskin, idag());
  if (svar.feil) return json({ feil: svar.feil }, svar.kode || 404);
  // Lisenser fra prissiden gjelder hele virksomheten, så koden får ingen maskin.
  const kode = await kodeTilLisens(env, svar.lisens, svar.lisens.maks === 0 ? null : maskin);
  return json({ kode, navn: svar.lisens.navn, utloper: svar.lisens.utloper });
}

// ---------------------------------------------------------------------------
// Prissiden (/klart/pris/): én pris per virksomhet, fra antall ansatte i Enhetsregisteret
// ---------------------------------------------------------------------------
//
// Prisen regnes ut her, aldri på siden, og går til Stripe som price_data. Lisensen gjelder hele
// virksomheten: koden har ingen maskin, bare firmanavn, org.nr, plan og utløpsdato, og den sendes på
// e-post ved kjøp og ved hver fornyelse. Lisensen står i lageret med maks = 0 og plan «org»,
// «leverandor» eller «testing».

const PRISSIDE = "https://esbjugconsult.com/klart/pris/";
const EIER = "tidemann@esbjugconsult.com";
const IKKE_AKTIV = "Dette organisasjonsnummeret er ikke aktivt i Brønnøysundregistrene.";
// Appen godtar bare kodene «prove», «lisens» og «gave» (les_kode i aktivering.rs i Klart). En kode for
// utvidet testing avvises der til appen teller de 50 eksportene selv. Til da selges testingen bare i
// testmodus. Sett til true når en versjon av appen som kan det, er ute.
const TESTING_I_APPEN = false;
const PRODUKT_LISENS = "klart_lisens";
const PRODUKT_TESTING = "klart_testing";

function priser(env) {
  return lesPriser(env.KLART_PRISER);
}

function kjopApent(env) {
  return Boolean(env.KLART_LISENSNOKKEL && env.STRIPE_SECRET_KEY && env.KLART_PRISER);
}

function orgnrTekst(o) {
  return String(o || "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function kroner(n) {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n)} NOK`;
}

function datoTekst(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(a, m - 1, d)
  );
}

function tekstFra(verdi, maks) {
  return String(verdi ?? "").trim().slice(0, maks);
}

function leggPaa(felt, prefiks, obj) {
  for (const [k, v] of Object.entries(obj)) felt[`${prefiks}[${k}]`] = v;
}

function sideFor(url) {
  return ["localhost", "127.0.0.1"].includes(url.hostname) ? `${url.origin}/klart/pris/` : PRISSIDE;
}

function aboFra(faktura) {
  return faktura.subscription || faktura.parent?.subscription_details?.subscription || null;
}

function periodeSlutt(abo) {
  return abo.current_period_end ?? abo.items?.data?.[0]?.current_period_end;
}

function leggTilMaaneder(ms, n) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.getTime();
}

/** Til og med-datoen nøkkelen gjelder. Avdrag er fire betalinger på et år, så der gjelder den ut bindingsåret. */
function utloperFor(abo) {
  if (abo.metadata?.betaling !== "avdrag") return utloperFraAbonnement(abo);
  const start = (abo.start_date || 0) * 1000;
  const naa = (abo.current_period_start ?? abo.items?.data?.[0]?.current_period_start ?? abo.start_date) * 1000;
  let aar = 1;
  while (leggTilMaaneder(start, 12 * aar) <= naa) aar++;
  return omDager(NADE_DAGER, leggTilMaaneder(start, 12 * aar));
}

/** Avdrag: om neste periode begynner et nytt bindingsår. Da gjelder ny pris og ny nøkkel. */
function nyttAar(abo) {
  const start = new Date((abo.start_date || 0) * 1000);
  const slutt = new Date(periodeSlutt(abo) * 1000);
  const mnd = (slutt.getUTCFullYear() - start.getUTCFullYear()) * 12 + slutt.getUTCMonth() - start.getUTCMonth();
  return mnd % 12 === 0;
}

// --- Enhetsregisteret -------------------------------------------------------

async function brreg(sti, fersk = false) {
  const svar = await fetch(`https://data.brreg.no/enhetsregisteret/api/${sti}`, {
    headers: { accept: "application/json" },
    // Gratis og uten nøkkel (NLOD 2.0), men ingen grunn til å spørre om det samme mange ganger i timen.
    cf: fersk ? { cacheTtl: 0 } : { cacheEverything: true, cacheTtlByStatus: { "200-299": 3600, 404: 600, 410: 3600, "500-599": 0 } },
  });
  if (svar.status === 200) return { status: 200, data: await svar.json() };
  if (svar.status === 404 || svar.status === 410) return { status: svar.status };
  throw new Error(`Enhetsregisteret ${sti}: ${svar.status}`);
}

/** { virksomhet } når org.nr er aktivt, { underenhet, overordnet } for en underenhet, ellers { feil, kode }. */
async function slaaOppVirksomhet(orgnr, fersk = false) {
  const e = await brreg(`enheter/${orgnr}`, fersk);
  if (e.status === 200) return aktiv(e.data) ? { virksomhet: virksomhetFra(e.data) } : { feil: IKKE_AKTIV, kode: 409 };
  if (e.status === 410) return { feil: IKKE_AKTIV, kode: 410 };
  const u = await brreg(`underenheter/${orgnr}`, fersk);
  if (u.status === 200 && u.data.overordnetEnhet && !u.data.slettedato) {
    const over = await brreg(`enheter/${u.data.overordnetEnhet}`, fersk);
    if (over.status === 200 && aktiv(over.data)) {
      return {
        underenhet: { orgnr, navn: u.data.navn },
        overordnet: { orgnr: over.data.organisasjonsnummer, navn: over.data.navn },
      };
    }
  }
  return { feil: IKKE_AKTIV, kode: 404 };
}

function underenhetTekst(o) {
  return `Dette er en underenhet av ${o.overordnet.navn}. Fortsett med ${orgnrTekst(o.overordnet.orgnr)}.`;
}

// --- Pris ---------------------------------------------------------------------

async function pris(env, url) {
  const p = priser(env);
  if (!p) return json({ feil: "Prisene er ikke satt ennå." }, 503);
  const orgnr = orgnrFra(url.searchParams.get("orgnr"));
  if (!orgnr) return json({ feil: "Organisasjonsnummeret må være ni sifre og gyldig." }, 400);
  const o = await slaaOppVirksomhet(orgnr);
  if (o.feil) return json({ feil: o.feil }, o.kode);
  if (o.underenhet) return json({ underenhet: o.underenhet, overordnet: o.overordnet });
  const v = o.virksomhet;
  // En tjenesteleverandør slår opp en kunde: bare prisen per år for den kunden.
  if (url.searchParams.get("som") === "kunde") {
    return json({ orgnr: v.orgnr, navn: v.navn, ansatte: v.ansatte, pris: kundepris(p, v) });
  }
  const l = lisenspris(p, v);
  const testet = await lager(env).harTestet(v.orgnr);
  // Trinnet og antallet som telles, sendes ikke ut. Siden viser bare prisen.
  return json({
    orgnr: v.orgnr,
    navn: v.navn,
    ansatte: v.ansatte,
    sektor: l.sektor ? l.sektor.navn : null,
    pris: l.pris,
    betaling: betalingFor(p, v.ansatte, l.pris),
    testing: testet ? null : { pris: p.testing.pris, eksporter: p.testing.eksporter, apen: testmodus(env) || TESTING_I_APPEN },
    sprint: sprintFor(p, l.ansatte),
    kjop: kjopApent(env),
    test: testmodus(env),
  });
}

// --- Stripe-oppsett: produkter, MVA og kunder -----------------------------------

const produkterFinnes = new Set();
let mvaCache = null;
let betalingsoppsettCache;

/** Klarts eget oppsett av betalingsmåter, med Klarna av: den tar ikke bedriftskjøp, og i Norge bare
    «betal hele». Eget oppsett, så resten av Stripe-kontoen (Esbjug Consult) ikke røres. Feiler det,
    brukes kontoens standard, og kjøpet går likevel. */
async function betalingsoppsett(env) {
  if (betalingsoppsettCache !== undefined) return betalingsoppsettCache;
  try {
    const navn = "Klart (uten Klarna)";
    // Et nytt oppsett har ikke kort på av seg selv, så alt som skal gjelde, settes hver gang.
    const valg = {
      "card[display_preference][preference]": "on",
      "apple_pay[display_preference][preference]": "on",
      "google_pay[display_preference][preference]": "on",
      "klarna[display_preference][preference]": "off",
    };
    const liste = await stripe(env, "GET", "payment_method_configurations?limit=100");
    const funnet = liste.data.find((c) => c.name === navn && c.active);
    betalingsoppsettCache = funnet
      ? (await stripe(env, "POST", `payment_method_configurations/${funnet.id}`, valg)).id
      : (await stripe(env, "POST", "payment_method_configurations", { name: navn, ...valg })).id;
  } catch (err) {
    console.error("klart betalingsoppsett", err.message);
    betalingsoppsettCache = null;
  }
  return betalingsoppsettCache;
}

/** Produktene har faste id-er, så de finnes eller lages, og brukes om igjen ved fornyelse. */
async function produkt(env, id, navn, meta) {
  if (produkterFinnes.has(id)) return id;
  if (!(await stripeFinn(env, `products/${id}`))) {
    const felt = { id, name: navn };
    leggPaa(felt, "metadata", meta);
    try {
      await stripe(env, "POST", "products", felt);
    } catch (err) {
      if (!/already exists/i.test(err.message)) throw err;
    }
  }
  produkterFinnes.add(id);
  return id;
}

/** Én MVA-sats, 25 %, lagt på hver linje (exclusive). */
async function mvaSats(env) {
  if (env.STRIPE_MVA_ID) return env.STRIPE_MVA_ID;
  if (mvaCache) return mvaCache;
  const liste = await stripe(env, "GET", "tax_rates?active=true&inclusive=false&limit=100");
  const funnet = liste.data.find((t) => t.metadata?.klart === "mva" && Number(t.percentage) === 25);
  mvaCache = funnet
    ? funnet.id
    : (
        await stripe(env, "POST", "tax_rates", {
          display_name: "MVA",
          description: "Merverdiavgift 25 %",
          percentage: "25",
          inclusive: "false",
          country: "NO",
          jurisdiction: "NO",
          tax_type: "vat",
          "metadata[klart]": "mva",
        })
      ).id;
  return mvaCache;
}

/** Stripe-kunden for et org.nr, med navn og adresse fra Enhetsregisteret. Én kunde per virksomhet. */
async function stripeKunde(env, v, meta, { epost, referanse, ehf } = {}) {
  let id = await lager(env).kundeFor(v.orgnr);
  if (!id) {
    const q = encodeURIComponent(`metadata['orgnr']:'${v.orgnr}'`);
    id = (await stripe(env, "GET", `customers/search?query=${q}&limit=1`)).data[0]?.id || null;
  }
  const felt = { name: v.navn, "preferred_locales[0]": "nb" };
  leggPaa(felt, "metadata", { orgnr: v.orgnr, company_name: v.navn, tier: meta.tier, sector: meta.sector, employees_at_purchase: meta.employees_at_purchase, document_workers: meta.document_workers, license_type: meta.license_type });
  if (v.adresse) {
    felt["address[line1]"] = v.adresse.linjer[0] || "";
    felt["address[line2]"] = v.adresse.linjer.slice(1).join(", ");
    felt["address[postal_code]"] = v.adresse.postnummer;
    felt["address[city]"] = v.adresse.poststed;
    felt["address[country]"] = v.adresse.land;
  }
  if (epost) felt.email = epost;
  if (referanse) {
    felt["invoice_settings[custom_fields][0][name]"] = "Referanse";
    felt["invoice_settings[custom_fields][0][value]"] = referanse;
  }
  if (ehf !== undefined) felt["metadata[ehf]"] = ehf ? "ja" : "nei";
  if (!id && v.mva) {
    felt["tax_id_data[0][type]"] = "no_vat";
    felt["tax_id_data[0][value]"] = `${v.orgnr}MVA`;
  }
  const kunde = await stripe(env, "POST", id ? `customers/${id}` : "customers", felt);
  await lager(env).lagreKunde(v.orgnr, kunde.id);
  return kunde;
}

/** Kundene til en tjenesteleverandør, slått opp og priset hver for seg. Én linje (og ett produkt) per kunde. */
async function kunderFra(env, p, lev, liste, har = []) {
  const orgnre = [...new Set((Array.isArray(liste) ? liste : []).map(orgnrFra).filter(Boolean))].filter(
    (o) => o !== lev.orgnr && !har.includes(o)
  );
  if (!orgnre.length) return { feil: "Legg til minst én kunde med et gyldig organisasjonsnummer." };
  // Stripe tar opptil 20 linjer i ett abonnement.
  if (orgnre.length + har.length > 20) return { feil: `En leverandørlisens kan ha opptil 20 kunder. Skriv til ${EIER} for flere.` };
  const linjer = [];
  for (const k of orgnre) {
    const o = await slaaOppVirksomhet(k);
    if (o.feil) return { feil: `${orgnrTekst(k)}: ${o.feil}`, kode: o.kode };
    if (o.underenhet) return { feil: underenhetTekst(o), kode: 409 };
    const kv = o.virksomhet;
    const id = await produkt(
      env,
      `klart_lev_${lev.orgnr}_${kv.orgnr}`,
      `Klart – tjenesteleverandør for ${kv.navn} (org.nr ${orgnrTekst(kv.orgnr)})`,
      { klart: "leverandor", leverandor: lev.orgnr, kunde: kv.orgnr }
    );
    linjer.push({ produkt: id, belop: kundepris(p, kv) * 100, kunde: kv });
  }
  return { linjer };
}

async function harTestetHosStripe(env, orgnr) {
  if (await lager(env).harTestet(orgnr)) return true;
  const q = encodeURIComponent(`metadata['orgnr']:'${orgnr}' AND metadata['license_type']:'testing' AND status:'succeeded'`);
  return (await stripe(env, "GET", `payment_intents/search?query=${q}&limit=1`)).data.length > 0;
}

// --- Kasse --------------------------------------------------------------------

async function kasse(request, env, url) {
  const p = priser(env);
  if (!p || !kjopApent(env)) return json({ feil: "Kjøp er ikke åpnet ennå." }, 503);
  const inn = await body(request);
  const type = ["lisens", "testing", "leverandor"].includes(inn.type) ? inn.type : null;
  let betaling = ["kort", "faktura", "avdrag"].includes(inn.betaling) ? inn.betaling : "kort";
  const orgnr = orgnrFra(inn.orgnr);
  if (!type || !orgnr) return json({ feil: "Skriv inn et gyldig organisasjonsnummer." }, 400);
  // Alt slås opp på nytt her. Siden viser bare det samme som kommer tilbake.
  const o = await slaaOppVirksomhet(orgnr);
  if (o.feil) return json({ feil: o.feil }, o.kode);
  if (o.underenhet) return json({ feil: underenhetTekst(o) }, 409);
  const v = o.virksomhet;
  const l = lisenspris(p, v);
  const kan = betalingFor(p, v.ansatte, l.pris);
  if (type === "testing") betaling = "kort";
  if (type === "leverandor" && betaling === "avdrag") return json({ feil: "Leverandørlisensen betales med kort eller faktura." }, 400);
  if (betaling === "faktura" && !kan.faktura) return json({ feil: `Faktura gjelder virksomheter fra ${p.fakturaFra} ansatte.` }, 400);
  if (betaling === "avdrag" && !kan.avdrag) return json({ feil: `Kvartalsvise avdrag gjelder virksomheter med opptil ${p.avdragTil} ansatte.` }, 400);
  const epost = epostFra(inn.epost);
  if (betaling === "faktura" && !epost) return json({ feil: "Skriv inn e-postadressen fakturaen skal sendes til." }, 400);

  let linjer;
  let beskrivelse;
  if (type === "testing") {
    if (!testmodus(env) && !TESTING_I_APPEN) return json({ feil: "Utvidet testing åpner snart." }, 503);
    if (await harTestetHosStripe(env, v.orgnr)) return json({ feil: "Denne virksomheten har allerede hatt utvidet testing." }, 409);
    linjer = [{ produkt: await produkt(env, PRODUKT_TESTING, "Klart – utvidet testing", { klart: "testing" }), belop: p.testing.pris * 100 }];
    beskrivelse = `Utvidet testing av Klart for ${v.navn} (org.nr ${orgnrTekst(v.orgnr)}): ${p.testing.eksporter} eksporter, uten tidsgrense. Beløpet godskrives lisensen.`;
  } else if (type === "lisens") {
    const belop = betaling === "avdrag" ? Math.round((l.pris * 100) / 4) : l.pris * 100;
    linjer = [{ produkt: await produkt(env, PRODUKT_LISENS, "Klart – lisens for virksomheten", { klart: "lisens" }), belop }];
    beskrivelse =
      `Klart for ${v.navn} (org.nr ${orgnrTekst(v.orgnr)}), ${l.trinn.navn}. Alle brukere og enheter, virksomhetens egne data.` +
      (betaling === "avdrag" ? " Fire kvartalsvise betalinger på en lisens over 12 måneder." : "");
  } else {
    const k = await kunderFra(env, p, v, inn.kunder);
    if (k.feil) return json({ feil: k.feil }, k.kode || 400);
    linjer = k.linjer;
    beskrivelse = `Klart tjenesteleverandørlisens for ${v.navn} (org.nr ${orgnrTekst(v.orgnr)}), ${linjer.length} ${linjer.length === 1 ? "kunde" : "kunder"}.`;
  }

  const meta = {
    orgnr: v.orgnr,
    company_name: v.navn,
    tier: l.trinn.navn,
    sector: l.sektor ? l.sektor.id : "",
    employees_at_purchase: String(v.ansatte),
    document_workers: String(l.ansatte),
    license_type: type,
    betaling,
  };
  const kunde = await stripeKunde(env, v, meta, {
    epost,
    referanse: tekstFra(inn.referanse, 140),
    ehf: betaling === "faktura" ? Boolean(inn.ehf) : undefined,
  });
  const mva = await mvaSats(env);
  if (betaling === "faktura") return json(await fakturer(env, { kunde, meta, linjer, mva, beskrivelse }));

  const side = sideFor(url);
  const abonnement = type !== "testing";
  const felt = {
    mode: abonnement ? "subscription" : "payment",
    customer: kunde.id,
    locale: "nb",
    success_url: `${side}?ordre={CHECKOUT_SESSION_ID}`,
    cancel_url: `${side}?orgnr=${v.orgnr}`,
    client_reference_id: v.orgnr,
  };
  // Stripe tar ikke lenger payment_method_types i Checkout. Betalingsmåtene kommer fra et oppsett.
  const oppsett = await betalingsoppsett(env);
  if (oppsett) felt.payment_method_configuration = oppsett;
  leggPaa(felt, "metadata", meta);
  linjer.forEach((linje, i) => {
    const f = `line_items[${i}]`;
    felt[`${f}[price_data][currency]`] = "nok";
    felt[`${f}[price_data][product]`] = linje.produkt;
    felt[`${f}[price_data][unit_amount]`] = String(linje.belop);
    if (abonnement) {
      felt[`${f}[price_data][recurring][interval]`] = betaling === "avdrag" ? "month" : "year";
      felt[`${f}[price_data][recurring][interval_count]`] = betaling === "avdrag" ? "3" : "1";
    }
    felt[`${f}[quantity]`] = "1";
    felt[`${f}[tax_rates][0]`] = mva;
  });
  if (abonnement) {
    leggPaa(felt, "subscription_data[metadata]", meta);
    felt["subscription_data[description]"] = beskrivelse;
  } else {
    leggPaa(felt, "payment_intent_data[metadata]", meta);
    felt["payment_intent_data[description]"] = beskrivelse;
    felt["invoice_creation[enabled]"] = "true";
    leggPaa(felt, "invoice_creation[invoice_data][metadata]", meta);
  }
  const okt = await stripe(env, "POST", "checkout/sessions", felt);
  return json({ adresse: okt.url });
}

/** Faktura fra 51 ansatte: abonnement som sendes som faktura med 30 dagers frist. Nøkkelen gis når fakturaen er sendt. */
async function fakturer(env, { kunde, meta, linjer, mva, beskrivelse }) {
  const felt = {
    customer: kunde.id,
    collection_method: "send_invoice",
    days_until_due: "30",
    description: beskrivelse,
    "payment_settings[payment_method_types][0]": "card",
    "expand[0]": "latest_invoice",
  };
  leggPaa(felt, "metadata", meta);
  linjer.forEach((linje, i) => {
    const f = `items[${i}]`;
    felt[`${f}[price_data][currency]`] = "nok";
    felt[`${f}[price_data][product]`] = linje.produkt;
    felt[`${f}[price_data][unit_amount]`] = String(linje.belop);
    felt[`${f}[price_data][recurring][interval]`] = "year";
    felt[`${f}[tax_rates][0]`] = mva;
  });
  const abo = await stripe(env, "POST", "subscriptions", felt);
  let faktura = abo.latest_invoice;
  // Med auto_advance sender Stripe fakturaen selv når den er ferdigstilt.
  if (faktura.status === "draft") faktura = await stripe(env, "POST", `invoices/${faktura.id}/finalize`);
  if (faktura.auto_advance === false) faktura = await stripe(env, "POST", `invoices/${faktura.id}/send`);
  const lisens = await orgLisens(env, abo, kunde.email);
  const kode = await sendNokkel(env, lisens);
  return {
    kode,
    type: meta.license_type,
    navn: lisens.navn,
    orgnr: lisens.orgnr,
    epost: lisens.epost,
    utloper: lisens.utloper,
    faktura: {
      nummer: faktura.number,
      belop: faktura.total / 100,
      forfall: faktura.due_date ? dato(faktura.due_date * 1000) : null,
      adresse: faktura.hosted_invoice_url || null,
    },
  };
}

/** Lisensen for et abonnement fra prissiden: hele virksomheten, uten maskingrense. */
async function orgLisens(env, abo, epost) {
  const m = abo.metadata || {};
  return lager(env).lagreLisens({
    id: abo.id,
    epost: String(epost || "").toLowerCase(),
    navn: m.company_name || "Klart-kunde",
    orgnr: orgnrFra(m.orgnr),
    kunde: typeof abo.customer === "string" ? abo.customer : abo.customer?.id || null,
    utloper: utloperFor(abo),
    maks: 0,
    plan: m.license_type === "leverandor" ? "leverandor" : "org",
    forsteMaskin: null,
  });
}

/** Etter betaling i Checkout: lagrer lisensen (og krediterer utvidet testing), og gir koden. */
async function ordreFullfort(env, okt) {
  if (okt.status !== "complete" || !["paid", "no_payment_required"].includes(okt.payment_status)) return null;
  const m = okt.metadata || {};
  const epost = (okt.customer_details?.email || okt.customer_email || "").toLowerCase();
  const kunde = typeof okt.customer === "string" ? okt.customer : okt.customer?.id || null;
  let lisens;
  if (m.license_type === "testing") {
    const rad = await lager(env).testing(m.orgnr, okt.id, kunde);
    if (kunde && !rad.kreditert) {
      // Hele beløpet eks. mva legges på kundens saldo. Stripe trekker det fra den første lisensfakturaen
      // og tar med det som er igjen til fornyelsene.
      await stripe(
        env,
        "POST",
        `customers/${kunde}/balance_transactions`,
        {
          amount: String(-(okt.amount_subtotal || 0)),
          currency: "nok",
          description: "Utvidet testing, godskrives lisensen",
          "metadata[orgnr]": m.orgnr,
          "metadata[okt]": okt.id,
        },
        `klart-testing-${okt.id}`
      );
      await lager(env).kreditert(m.orgnr);
    }
    lisens = await lager(env).lagreLisens({
      id: okt.id,
      epost,
      navn: m.company_name || "Klart-kunde",
      orgnr: orgnrFra(m.orgnr),
      kunde,
      utloper: null,
      maks: 0,
      plan: "testing",
      forsteMaskin: null,
    });
  } else {
    const abo = typeof okt.subscription === "string" ? await stripe(env, "GET", `subscriptions/${okt.subscription}`) : okt.subscription;
    lisens = await orgLisens(env, abo, epost);
  }
  return { lisens, kode: await sendNokkel(env, lisens) };
}

async function orgKode(env, lisens) {
  if (lisens.plan === "testing") {
    const test = testmodus(env);
    return lagKode(env, {
      id: nyId(),
      type: "testing",
      navn: test ? `${lisens.navn} (test)` : lisens.navn,
      orgnr: lisens.orgnr,
      epost: lisens.epost,
      maskin: null,
      plan: String(priser(env)?.testing?.eksporter ?? 50),
      utloper: test ? omDager(7) : null,
    });
  }
  return kodeTilLisens(env, lisens, null);
}

/** Lager koden, og sender den på e-post én gang per utløpsdato (kjøp og hver fornyelse). */
async function sendNokkel(env, lisens) {
  const kode = await orgKode(env, lisens);
  if (lisens.epost && (await lager(env).nyNokkel(lisens.id, lisens.utloper || "-"))) {
    await sendEpost(env, nokkelEpost(lisens, kode));
  }
  return kode;
}

function nokkelEpost(lisens, kode) {
  const hvem = `${lisens.navn} (org.nr ${orgnrTekst(lisens.orgnr)})`;
  const testing = lisens.plan === "testing";
  const linjer = [
    "Hei,",
    "",
    testing ? `her er koden for utvidet testing av Klart for ${hvem}.` : `her er lisensnøkkelen til Klart for ${hvem}.`,
    "",
    kode,
    "",
    "Lim den inn i Klart: klikk «Gratis prøve» øverst til høyre, og lim nøkkelen inn i feltet der. Klart går aldri på nett; nøkkelen sjekkes på maskinen.",
    "",
  ];
  if (testing) {
    linjer.push("Koden gir 50 eksporter, uten tidsgrense. Hele beløpet godskrives lisensen når dere kjøper.");
  } else {
    linjer.push(
      `Nøkkelen gjelder alle brukere og enheter i virksomheten${lisens.utloper ? `, til og med ${datoTekst(lisens.utloper)}` : ""}. Ved hver fornyelse kommer en ny nøkkel på e-post.`
    );
    if (lisens.plan === "leverandor") {
      linjer.push("", "Når dere legger til kunder, får dere en ny nøkkel som erstatter denne.");
    }
  }
  linjer.push("", `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`, "", "Klart");
  return {
    til: lisens.epost,
    emne: testing ? "Klart: kode for utvidet testing" : `Klart: lisensnøkkel for ${lisens.navn}`,
    tekst: linjer.join("\n"),
  };
}

async function ordre(env, url) {
  const id = url.searchParams.get("session") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ feil: "Fant ikke kjøpet." }, 400);
  if (!kjopApent(env)) return json({ feil: "Kjøp er ikke åpnet." }, 503);
  const okt = await stripe(env, "GET", `checkout/sessions/${id}?expand[]=subscription`);
  if (!okt.metadata?.license_type) return json({ feil: "Fant ikke kjøpet." }, 404);
  const r = await ordreFullfort(env, okt);
  if (!r) return json({ feil: "Betalingen er ikke fullført ennå. Last siden på nytt om litt." }, 409);
  return json({
    kode: r.kode,
    type: okt.metadata.license_type,
    navn: r.lisens.navn,
    orgnr: r.lisens.orgnr,
    epost: r.lisens.epost,
    utloper: r.lisens.utloper,
  });
}

/** En tjenesteleverandør legger til kunder midt i perioden. Nøkkelen beviser hvem de er. */
async function leggTilKunder(request, env) {
  const p = priser(env);
  if (!p || !kjopApent(env)) return json({ feil: "Kjøp er ikke åpnet ennå." }, 503);
  const inn = await body(request);
  const lapp = await lesKode(env, inn.kode);
  if (!lapp || !lapp.orgnr) return json({ feil: "Lisensnøkkelen stemmer ikke. Lim inn hele nøkkelen dere fikk på e-post." }, 400);
  const lisens = await lager(env).finnLeverandor(lapp.orgnr, idag());
  if (!lisens) return json({ feil: "Fant ingen aktiv leverandørlisens for denne nøkkelen." }, 404);
  const o = await slaaOppVirksomhet(lapp.orgnr);
  if (!o.virksomhet) return json({ feil: o.feil || IKKE_AKTIV }, 409);
  const abo = await stripe(env, "GET", `subscriptions/${lisens.id}?expand[]=items.data.price.product`);
  const har = abo.items.data.map((i) => i.price.product?.metadata?.kunde).filter(Boolean);
  const k = await kunderFra(env, p, o.virksomhet, inn.kunder, har);
  if (k.feil) return json({ feil: k.feil }, k.kode || 400);
  const mva = await mvaSats(env);
  for (const [i, linje] of k.linjer.entries()) {
    await stripe(env, "POST", "subscription_items", {
      subscription: abo.id,
      "price_data[currency]": "nok",
      "price_data[product]": linje.produkt,
      "price_data[unit_amount]": String(linje.belop),
      "price_data[recurring][interval]": "year",
      quantity: "1",
      "tax_rates[0]": mva,
      // Forholdsmessig pris fram til leverandørens fornyelsesdato, samlet på én faktura med den siste linjen.
      proration_behavior: i === k.linjer.length - 1 ? "always_invoice" : "create_prorations",
    });
  }
  // Nøkkelen har ingen kundeliste, men hver endring gir en ny nøkkel som erstatter den gamle.
  const kode = await orgKode(env, lisens);
  if (lisens.epost) await sendEpost(env, nokkelEpost(lisens, kode));
  return json({ kode, kunder: k.linjer.map((l) => ({ orgnr: l.kunde.orgnr, navn: l.kunde.navn })), utloper: lisens.utloper });
}

async function sprint(request, env) {
  const inn = await body(request);
  // Feltet «nettside» er skjult på siden. Fyller noen det ut, er det en robot.
  if (inn.nettside) return json({ ok: true });
  const navn = tekstFra(inn.navn, 120);
  const epost = epostFra(inn.epost);
  if (!navn || !epost) return json({ feil: "Skriv inn navn og e-post, så tar vi kontakt." }, 400);
  const orgnr = orgnrFra(inn.orgnr);
  const o = orgnr ? await slaaOppVirksomhet(orgnr).catch(() => null) : null;
  const v = o?.virksomhet || null;
  const data = {
    navn,
    epost,
    telefon: tekstFra(inn.telefon, 40),
    melding: tekstFra(inn.melding, 3000),
    orgnr,
    firma: v?.navn || null,
    ansatte: v?.ansatte ?? null,
  };
  await lager(env).nyHenvendelse("sprint", data);
  await sendEpost(env, {
    til: EIER,
    svarTil: epost,
    emne: `Klart: sprintsamtale for ${data.firma || navn}`,
    tekst: [
      `${navn} <${epost}>${data.telefon ? `, ${data.telefon}` : ""}`,
      data.firma ? `${data.firma}, org.nr ${orgnrTekst(orgnr)}, ${new Intl.NumberFormat("nb-NO").format(data.ansatte)} registrerte ansatte` : "",
      "",
      data.melding || "(ingen melding)",
    ].join("\n"),
  });
  return json({ ok: true });
}

async function utboks(request, env) {
  const hode = request.headers.get("authorization") || "";
  const ventet = `Bearer ${env.ADMIN_TOKEN || ""}`;
  if (!env.ADMIN_TOKEN || hode.length !== ventet.length || !likt(hode, ventet)) return json({ feil: "Ikke tilgang." }, 401);
  const l = lager(env);
  return json({ eposter: await l.utboks(), henvendelser: await l.henvendelser() });
}

// --- Fornyelse ------------------------------------------------------------------

/** invoice.upcoming (14 dager før): slår opp størrelsen på nytt, setter ny pris før fornyelsen og sender påminnelsen. */
async function fornyelsesvarsel(env, faktura) {
  const aboId = aboFra(faktura);
  if (!aboId) return;
  const abo = await stripe(env, "GET", `subscriptions/${aboId}?expand[]=items.data.price.product&expand[]=customer`);
  const m = abo.metadata || {};
  const p = priser(env);
  if (!m.license_type || !p || abo.status === "canceled" || abo.cancel_at_period_end) return;
  // Avdrag varsles foran hvert nytt bindingsår, ikke hvert kvartal.
  if (m.betaling === "avdrag" && !nyttAar(abo)) return;
  let foer = 0;
  let etter = 0;
  const avvik = [];
  for (const item of abo.items.data) {
    const prod = item.price.product || {};
    const pm = prod.metadata || {};
    const leverandor = pm.klart === "leverandor";
    const orgnr = leverandor ? pm.kunde : m.orgnr;
    const gammel = item.price.unit_amount * (item.quantity || 1);
    foer += gammel;
    const o = await slaaOppVirksomhet(orgnr, true).catch((err) => ({ feil: err.message }));
    if (!o.virksomhet) {
      avvik.push(`${orgnrTekst(orgnr)}: ${o.feil || "nå en underenhet"}. Prisen er ikke endret.`);
      etter += gammel;
      continue;
    }
    const v = o.virksomhet;
    let belop = (leverandor ? kundepris(p, v) : lisenspris(p, v).pris) * 100;
    if (m.betaling === "avdrag") belop = Math.round(belop / 4);
    etter += belop;
    if (belop !== item.price.unit_amount) {
      await stripe(env, "POST", `subscription_items/${item.id}`, {
        "price_data[currency]": "nok",
        "price_data[product]": prod.id,
        "price_data[unit_amount]": String(belop),
        "price_data[recurring][interval]": item.price.recurring.interval,
        "price_data[recurring][interval_count]": String(item.price.recurring.interval_count || 1),
        proration_behavior: "none",
      });
    }
    if (!leverandor) {
      const l = lisenspris(p, v);
      const ny = {
        tier: l.trinn.navn,
        sector: l.sektor ? l.sektor.id : "",
        employees_at_renewal: String(v.ansatte),
        document_workers: String(l.ansatte),
      };
      const felt = {};
      leggPaa(felt, "metadata", ny);
      await stripe(env, "POST", `subscriptions/${abo.id}`, felt);
      if (abo.customer?.id) await stripe(env, "POST", `customers/${abo.customer.id}`, { ...felt });
    }
  }
  if (avvik.length) {
    await sendEpost(env, { til: EIER, emne: `Klart: fornyelse med avvik for ${m.company_name}`, tekst: avvik.join("\n") });
  }
  const til = abo.customer?.email;
  if (!til) return;
  const perAar = (ore) => (m.betaling === "avdrag" ? ore * 4 : ore) / 100;
  const fornyes = datoTekst(dato(periodeSlutt(abo) * 1000));
  await sendEpost(env, {
    til,
    emne: `Klart fornyes ${fornyes}`,
    tekst: [
      "Hei,",
      "",
      `lisensen til Klart for ${m.company_name} (org.nr ${orgnrTekst(m.orgnr)}) fornyes automatisk ${fornyes}.`,
      "",
      etter === foer
        ? `Prisen er uendret: ${kroner(perAar(etter))} per år, eks. mva.`
        : `Ny pris fra fornyelsen: ${kroner(perAar(etter))} per år, eks. mva (i dag ${kroner(perAar(foer))}). Prisen følger antall ansatte registrert i Brønnøysundregistrene.`,
      "",
      "Når fornyelsen er betalt, kommer en ny lisensnøkkel på e-post.",
      "",
      `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`,
      "",
      "Klart",
    ].join("\n"),
  });
}

async function betalingFeilet(env, faktura) {
  const aboId = aboFra(faktura);
  if (!aboId || !faktura.customer_email) return;
  const abo = await stripe(env, "GET", `subscriptions/${aboId}`);
  if (!abo.metadata?.license_type) return;
  const lisens = await lager(env).finnLisens(abo.id);
  await sendEpost(env, {
    til: faktura.customer_email,
    emne: "Klart: betalingen gikk ikke gjennom",
    tekst: [
      "Hei,",
      "",
      `betalingen for Klart (${abo.metadata.company_name}) gikk ikke gjennom.`,
      lisens?.utloper ? `Nøkkelen dere har, virker til og med ${datoTekst(lisens.utloper)}. Det er 14 dager etter at perioden gikk ut.` : "",
      faktura.hosted_invoice_url ? `Betal eller bytt kort her: ${faktura.hosted_invoice_url}` : "",
      "",
      `Spørsmål? Skriv til ${EIER}.`,
      "",
      "Klart",
    ].join("\n"),
  });
}

// --- E-post -------------------------------------------------------------------

/** Alt som skal ut, havner i utboksen i lageret. Med RESEND_API_KEY og KLART_EPOST_FRA sendes det også. */
async function sendEpost(env, { til, emne, tekst, svarTil }) {
  const id = await lager(env).iUtboks(til, emne, tekst);
  if (!env.RESEND_API_KEY || !env.KLART_EPOST_FRA) return;
  const svar = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `klart-utboks-${id}`,
    },
    body: JSON.stringify({ from: env.KLART_EPOST_FRA, to: [til], subject: emne, text: tekst, reply_to: svarTil || EIER }),
  });
  if (svar.ok) await lager(env).sendt(id);
  else console.error("klart epost", svar.status, await svar.text());
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
      // Kjøp fra prissiden har license_type. De gamle, maskinbundne kjøpene har det ikke.
      if (obj.metadata?.license_type) await ordreFullfort(env, obj);
      else await lisensFraOkt(env, obj);
      break;
    case "invoice.paid": {
      const aboId = aboFra(obj);
      if (aboId) {
        const abo = await stripe(env, "GET", `subscriptions/${aboId}`);
        await lager(env).settUtloper(abo.id, utloperFor(abo), "aktiv");
        // Kort og avdrag: ny nøkkel når en ny periode er betalt. Fakturakundene fikk den da fakturaen ble sendt.
        if (abo.metadata?.license_type && abo.collection_method !== "send_invoice") {
          await sendNokkel(env, await orgLisens(env, abo, obj.customer_email));
        }
      }
      break;
    }
    case "invoice.finalized": {
      const aboId = aboFra(obj);
      if (aboId && obj.collection_method === "send_invoice") {
        const abo = await stripe(env, "GET", `subscriptions/${aboId}`);
        if (abo.metadata?.license_type) await sendNokkel(env, await orgLisens(env, abo, obj.customer_email));
      }
      break;
    }
    case "invoice.upcoming":
      await fornyelsesvarsel(env, obj);
      break;
    case "invoice.payment_failed":
      await betalingFeilet(env, obj);
      break;
    case "customer.subscription.updated":
      await lager(env).settUtloper(obj.id, utloperFor(obj), obj.status === "canceled" ? "avsluttet" : "aktiv");
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
    // Org.nr kom til da lisensene ble knyttet til bedrifter. Lisenser fra før har det ikke.
    const kolonner = this.sql.exec(`PRAGMA table_info(lisenser)`).toArray().map((k) => k.name);
    if (!kolonner.includes("orgnr")) this.sql.exec(`ALTER TABLE lisenser ADD COLUMN orgnr TEXT`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS maskiner (
      lisens TEXT, maskin TEXT, lagt_til TEXT, PRIMARY KEY (lisens, maskin))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hendelser (id TEXT PRIMARY KEY, mottatt TEXT)`);
    // Prissiden: Stripe-kunden per org.nr, utvidet testing (én per org.nr), hvilke nøkler som er
    // sendt, e-poster som skal ut, og henvendelser fra skjemaet for sprinten.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kunder (orgnr TEXT PRIMARY KEY, stripe TEXT, oppdatert TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS testing (
      orgnr TEXT PRIMARY KEY, okt TEXT, kunde TEXT, betalt TEXT, kreditert TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS nokler (
      lisens TEXT, utloper TEXT, sendt TEXT, PRIMARY KEY (lisens, utloper))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS utboks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, til TEXT, emne TEXT, tekst TEXT, laget TEXT, sendt TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS henvendelser (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hva TEXT, data TEXT, laget TEXT)`);
  }

  kundeFor(orgnr) {
    return this.sql.exec(`SELECT stripe FROM kunder WHERE orgnr = ?`, orgnr).toArray()[0]?.stripe || null;
  }

  lagreKunde(orgnr, stripe) {
    this.sql.exec(
      `INSERT INTO kunder (orgnr, stripe, oppdatert) VALUES (?, ?, ?)
       ON CONFLICT (orgnr) DO UPDATE SET stripe = excluded.stripe, oppdatert = excluded.oppdatert`,
      orgnr,
      stripe,
      idag()
    );
  }

  harTestet(orgnr) {
    return this.sql.exec(`SELECT 1 FROM testing WHERE orgnr = ?`, orgnr).toArray().length > 0;
  }

  /** Registrerer utvidet testing for et org.nr. Kommer kjøpet to ganger (side og webhook), gjelder det første. */
  testing(orgnr, okt, kunde) {
    this.sql.exec(
      `INSERT OR IGNORE INTO testing (orgnr, okt, kunde, betalt) VALUES (?, ?, ?, ?)`,
      orgnr,
      okt,
      kunde,
      new Date().toISOString()
    );
    return this.sql.exec(`SELECT * FROM testing WHERE orgnr = ?`, orgnr).one();
  }

  kreditert(orgnr) {
    this.sql.exec(`UPDATE testing SET kreditert = ? WHERE orgnr = ?`, new Date().toISOString(), orgnr);
  }

  /** true første gang en nøkkel med denne utløpsdatoen gis for lisensen, så den sendes på e-post bare én gang. */
  nyNokkel(lisens, utloper) {
    const før = this.sql.exec(`SELECT 1 FROM nokler WHERE lisens = ? AND utloper = ?`, lisens, utloper).toArray().length;
    if (før) return false;
    this.sql.exec(`INSERT INTO nokler (lisens, utloper, sendt) VALUES (?, ?, ?)`, lisens, utloper, new Date().toISOString());
    return true;
  }

  finnLisens(id) {
    return this.sql.exec(`SELECT * FROM lisenser WHERE id = ?`, id).toArray()[0] || null;
  }

  finnLeverandor(orgnr, dag) {
    return (
      this.sql
        .exec(`SELECT * FROM lisenser WHERE orgnr = ? AND plan = 'leverandor' AND status = 'aktiv' ORDER BY utloper DESC`, orgnr)
        .toArray()
        .find((l) => !l.utloper || l.utloper >= dag) || null
    );
  }

  iUtboks(til, emne, tekst) {
    return this.sql
      .exec(
        `INSERT INTO utboks (til, emne, tekst, laget) VALUES (?, ?, ?, ?) RETURNING id`,
        til,
        emne,
        tekst,
        new Date().toISOString()
      )
      .one().id;
  }

  sendt(id) {
    this.sql.exec(`UPDATE utboks SET sendt = ? WHERE id = ?`, new Date().toISOString(), id);
  }

  utboks() {
    return this.sql.exec(`SELECT * FROM utboks ORDER BY id DESC LIMIT 200`).toArray();
  }

  nyHenvendelse(hva, data) {
    this.sql.exec(`INSERT INTO henvendelser (hva, data, laget) VALUES (?, ?, ?)`, hva, JSON.stringify(data), new Date().toISOString());
  }

  henvendelser() {
    return this.sql
      .exec(`SELECT * FROM henvendelser ORDER BY id DESC LIMIT 200`)
      .toArray()
      .map((h) => ({ ...h, data: JSON.parse(h.data) }));
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
      // En fornyelse uten e-post (webhooken har den ikke alltid) beholder den som står.
      this.sql.exec(
        `UPDATE lisenser SET epost = COALESCE(NULLIF(?, ''), epost), navn = ?, orgnr = COALESCE(?, orgnr), kunde = COALESCE(?, kunde), plan = COALESCE(?, plan), utloper = ?, status = 'aktiv' WHERE id = ?`,
        l.epost,
        l.navn,
        l.orgnr,
        l.kunde,
        l.plan ?? null,
        l.utloper,
        l.id
      );
    } else {
      this.sql.exec(
        `INSERT INTO lisenser (id, epost, navn, orgnr, kunde, plan, utloper, maks, status, opprettet)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktiv', ?)`,
        l.id,
        l.epost,
        l.navn,
        l.orgnr,
        l.kunde,
        l.plan ?? null,
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
    // Utvidet testing er ikke en lisens, og skal aldri komme ut herfra som en.
    const lisenser = this.sql
      .exec(
        `SELECT * FROM lisenser WHERE epost = ? AND status = 'aktiv' AND COALESCE(plan, '') != 'testing' ORDER BY utloper DESC`,
        epost
      )
      .toArray()
      .filter((l) => !l.utloper || l.utloper >= dag);
    if (!lisenser.length) return { feil: "Fant ingen gyldig lisens for den e-posten.", kode: 404 };
    // Lisenser fra prissiden (maks 0) gjelder hele virksomheten, uten maskingrense.
    const helVirksomhet = lisenser.find((l) => l.maks === 0);
    if (helVirksomhet) return { lisens: helVirksomhet };
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
