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
//   POST /klart/api/kjop         410: det gamle kortkjøpet per maskin. Kjøp skjer på /klart/pris/, på faktura.
//   GET  /klart/api/kvittering   410: som over
//   POST /klart/api/hent         { maskin, epost }   → ny kode til en betalt lisens
//   POST /klart/api/stripe       Stripe-webhook, bare for kjøp som ble gjort før 20.11.2026 (se nederst)
//
// Prissiden (/klart/pris/) selger lisenser for hele virksomheten, priset fra antall ansatte:
//
//   GET  /klart/api/adresse?q=…           → adresser fra Kartverket, med avstand og om det trengs reisedag
//   GET  /klart/api/kart/…                → kartdata via oss, så siden aldri kobler seg til andre enn oss
//   GET  /klart/api/sok?q=…               → opptil seks virksomheter som passer navnet (forslag i feltet)
//   GET  /klart/api/maskin?q=…            → maskiner som passer navnet, og om Klart går på dem (klart-maskin.js).
//                                           Bare et oppslag i vår egen liste: ingenting lagres, ingen andre spørres.
//   GET  /klart/api/sjekk?orgnr=…         → virksomheten, om den er stor nok for skreddersydd oppsett, og
//                                           lisensprisen etter prøven (forsiden viser den ved nedlasting).
//   GET  /klart/api/pris?orgnr=…[&som=kunde]  → virksomheten, prisen og hvordan den kan betale
//   POST /klart/api/kasse        { type, orgnr, kunder?, epost, referanse?, ehf? }
//                                → bestillingen (K-1001 …). Ingen betaling her: kunden får beskjed om at
//                                  fakturaen kommer, eieren får det han trenger for å sende den.
//   GET  /klart/api/betalt?nr=…&t=…      → eierens lenke: viser bestillingen og knappen «betalt»
//   POST /klart/api/betalt?nr=…&t=…      → fakturaen er betalt: lisensnøkkelen sendes kunden
//   GET  /klart/api/ordre        410: kortkjøpet er borte
//   POST /klart/api/kunder       { kode, kunder } → bestiller flere kunder til en tjenesteleverandørlisens
//   POST /klart/api/sprint       kontaktskjemaet for sprinten (spørsmål før booking)
//   GET  /klart/api/sprint/ledige?tilbud=oppsett|kort|sprint → ledige startdager (og de som blir forespørsler)
//   POST /klart/api/sprint/book          { orgnr, tilbud, start, navn, epost, … } → { bestilt, ordre }: datoen
//                                           holdes, fakturaen kommer, og bookingen gjelder når den er betalt
//   POST /klart/api/sprint/sperr         { fra, til } | { fjern } → sperrer dager (Bearer ADMIN_TOKEN)
//   GET  /klart/api/utboks       e-postene som skal ut, og henvendelsene (Bearer ADMIN_TOKEN)
//
// Ingen betaling går gjennom Stripe (eieren 20.11.2026): alt bestilles på faktura, eieren sender fakturaen
// selv, og lisensnøkkelen sendes når han har merket bestillingen som betalt. E-posten går med Cloudflares
// e-postutsending (bindingen EMAIL).
//
// Hemmeligheter (wrangler secret put): KLART_LISENSNOKKEL (PEM, PKCS#8, Ed25519), KLART_PRISER (JSON, se
// klart-pris.js). STRIPE_SECRET_KEY og STRIPE_WEBHOOK_SECRET brukes bare av webhooken for eldre kjøp.
// Innstillinger (vars i wrangler.jsonc): KLART_MASKINER (maskiner per lisens fra det gamle kortkjøpet).
//
// Ingen dokumenter, ingen innhold fra programmet, kommer hit. Bare maskinkoden,
// som er en hash, og org.nr, firmanavn og e-post fra kjøpet.

import { DurableObject } from "cloudflare:workers";
import {
  orgnrFra,
  epostPaaDomene,
  domeneFra,
  lesPriser,
  lisenspris,
  kundepris,
  sprintFor,
  sprintTilbudFor,
  betalingFor,
  ehfForvalgt,
  reiseFor,
  aktiv,
  virksomhetFra,
  grunnlagFra,
  fornyetBelop,
  telteAnsatte,
  leverandorAktuell,
} from "./klart-pris.js";
// Org.nr → innbyggere (SSB) og ansatte i hele kommunen (Enhetsregisteret) for kommuner og fylkeskommuner,
// og ansatte i hele virksomheten for statlige etater og helseforetak. Lages med node bygg-innbyggere.mjs.
import INNBYGGERE from "./innbyggere.json";
import KOMMUNEANSATTE from "./kommuneansatte.json";
import STATSANSATTE from "./statsansatte.json";
import { ansatteITre, delAvKommunen, statlig, SAMLET_STAT } from "./kommunetre.js";
import { sokMaskin } from "./klart-maskin.js";
import { price as usPris, STATES as US_STATER } from "../frostcopy/buy/price.js";
import { preis as dePreis } from "../alles-klar/pris/preis.js";
import utgaveGb from "./utgaver/gb.js";
import utgaveFr from "./utgaver/fr.js";
import utgaveEs from "./utgaver/es.js";
import utgaveIt from "./utgaver/it.js";
import utgaveNl from "./utgaver/nl.js";
import utgavePl from "./utgaver/pl.js";
import utgaveSe from "./utgaver/se.js";
import utgaveDk from "./utgaver/dk.js";
import utgaveAt from "./utgaver/at.js";
import utgaveBe from "./utgaver/be.js";

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
    if (sti === "kjop" && request.method === "POST") return flyttet();
    if (sti === "kvittering" && request.method === "GET") return flyttet();
    if (sti === "hent" && request.method === "POST") return await hent(request, env);
    if (sti === "stripe" && request.method === "POST") return await webhook(request, env);
    if (sti === "sok" && request.method === "GET") return await sok(url);
    if (sti === "maskin" && request.method === "GET") return json(sokMaskin(url.searchParams.get("q")));
    if (sti === "adresse" && request.method === "GET") return json({ treff: await adresser(url.searchParams.get("q")) });
    if (sti.startsWith("kart/") && request.method === "GET") return await kartdata(url);
    if (sti === "sjekk" && request.method === "GET") return await sjekk(env, url);
    if (sti === "pris" && request.method === "GET") return await pris(env, url);
    if (sti === "kasse" && request.method === "POST") return await kasse(request, env);
    if (sti === "betalt" && ["GET", "POST"].includes(request.method)) return await betalt(request, env, url);
    if (sti === "ordre" && request.method === "GET") return flyttet();
    if (sti === "kunder" && request.method === "POST") return await leggTilKunder(request, env);
    if (sti === "sprint" && request.method === "POST") return await sprint(request, env);
    if (sti.startsWith("sprint/")) return await sprintRute(request, env, url, sti.slice(7));
    if (sti === "utboks" && request.method === "GET") return await utboks(request, env);
    return json({ feil: "Finnes ikke." }, 404);
  } catch (err) {
    console.error("klart", sti, err && err.stack ? err.stack : err);
    return json({ feil: "Noe gikk galt hos oss. Prøv igjen om litt." }, 500);
  }
}

// ---------------------------------------------------------------------------
// Nedlasting: installasjonsfilene ligger i R2-bøtta klart-nedlasting, fordi de er
// større enn det statiske filer på Cloudflare kan være (25 MB).
// ---------------------------------------------------------------------------

const DEB = "application/vnd.debian.binary-package";
const EXE = "application/vnd.microsoft.portable-executable";
const DMG = "application/x-apple-diskimage";
// «key» er navnet i R2 (fra bygget), «navn» er det kunden får på disken: bare navnet på programmet, uten
// versjonsnummer (eieren 11.11.2026; nummeret kommer med v2). Linux beholder nummeret og arkitekturen, slik
// .deb-pakker pleier å hete. Byggene er fra 24.11.2026 (prosjektnøkler, USB-veiviseren, revisjonsloggen).
// De forrige ligger urørt i R2 under 2026-11-11/, 2026-11-12b/ og 2026-11-20/.
const FILER = {
  // Klart (norsk), /klart/last-ned/…
  klart: {
    mac: { key: "2026-11-26/Klart_0.1.0_universal.dmg", navn: "Klart.dmg", type: DMG },
    windows: { key: "2026-11-26/Klart_0.1.0_x64-setup.exe", navn: "Klart.exe", type: EXE },
    linux: { key: "2026-11-26/Klart_0.1.0_amd64.deb", navn: "Klart_0.1.0_amd64.deb", type: DEB },
    "linux-arm": { key: "2026-11-26/Klart_0.1.0_arm64.deb", navn: "Klart_0.1.0_arm64.deb", type: DEB },
  },
  // Alles Klar (tysk), /alles-klar/last-ned/…
  "alles-klar": {
    mac: { key: "2026-11-26/de/Alles-Klar_0.1.0_universal.dmg", navn: "Alles Klar.dmg", type: DMG },
    windows: { key: "2026-11-26/de/Alles-Klar_0.1.0_x64-setup.exe", navn: "Alles Klar.exe", type: EXE },
    linux: { key: "2026-11-26/de/Alles-Klar_0.1.0_amd64.deb", navn: "Alles Klar_0.1.0_amd64.deb", type: DEB },
    "linux-arm": { key: "2026-11-26/de/Alles-Klar_0.1.0_arm64.deb", navn: "Alles Klar_0.1.0_arm64.deb", type: DEB },
  },
  // FrostCopy (amerikansk), /frostcopy/download/…
  frostcopy: {
    mac: { key: "2026-11-26/us/FrostCopy_0.1.0_universal.dmg", navn: "FrostCopy.dmg", type: DMG },
    windows: { key: "2026-11-26/us/FrostCopy_0.1.0_x64-setup.exe", navn: "FrostCopy.exe", type: EXE },
    linux: { key: "2026-11-26/us/FrostCopy_0.1.0_amd64.deb", navn: "FrostCopy_0.1.0_amd64.deb", type: DEB },
    "linux-arm": { key: "2026-11-26/us/FrostCopy_0.1.0_arm64.deb", navn: "FrostCopy_0.1.0_arm64.deb", type: DEB },
  },
};

// ---------------------------------------------------------------------------
// Testversjonen: mens «Kommer snart» står ute, slipper /klart/test eieren inn i de ekte
// sidene og nedlastingene med et passord (hemmeligheten KLART_TESTPASSORD). Riktig passord
// gir informasjonskapselen klart_test, som er en hash av passordet, så den slutter å virke
// når passordet byttes. Uten hemmeligheten er inngangen stengt.
// ---------------------------------------------------------------------------

// Klart åpner for alle 11.11.2026 kl. 23.11 norsk tid (eieren). Fra da av står passordet ikke
// lenger foran sidene, og nedlastingene er åpne, uten at noe må deployes. Samme tidspunkt står i
// data-til i GDPR/test.html (nedtellingen).
const LANSERING = Date.parse("2026-11-11T22:11:00Z");
export function erLansert() {
  return Date.now() >= LANSERING;
}

async function testMerke(env) {
  if (!env.KLART_TESTPASSORD) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("klart-test|" + env.KLART_TESTPASSORD));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function harTest(request, env) {
  const merke = await testMerke(env);
  if (!merke) return false;
  return (request.headers.get("cookie") || "").split(/;\s*/).includes("klart_test=" + merke);
}

export async function handleTest(request, env, url) {
  const ingenLager = { "cache-control": "no-store" };
  // Etter lanseringen finnes det ikke noe passord: alle går rett til forsiden.
  if (erLansert()) return new Response(null, { status: 303, headers: { ...ingenLager, location: "/klart/" } });
  if (request.method === "POST") {
    const skjema = await request.formData().catch(() => null);
    const passord = skjema && skjema.get("passord");
    const merke = await testMerke(env);
    // Fire raske trykk på merket gir også tilgang, for telefoner uten tastatur (eieren 11.11.2026).
    const fireTrykk = skjema && skjema.get("trykk") === "4";
    // Store og små bokstaver teller ikke: telefoner gjør gjerne første bokstav stor.
    if (merke && (fireTrykk || (typeof passord === "string" && passord.trim().toLowerCase() === String(env.KLART_TESTPASSORD).toLowerCase()))) {
      return new Response(null, {
        status: 303,
        headers: { ...ingenLager, location: "/klart/", "set-cookie": `klart_test=${merke}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` },
      });
    }
    return new Response(null, { status: 303, headers: { ...ingenLager, location: "/klart/" } });
  }
  if (await harTest(request, env)) return new Response(null, { status: 303, headers: { ...ingenLager, location: "/klart/" } });
  // Bare sider får passordskjemaet. Et skjult stilark, bilde eller skript får 404, ikke HTML.
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !/\.html$/i.test(url.pathname)) return new Response("Finnes ikke.", { status: 404, headers: ingenLager });
  const side = await env.ASSETS.fetch(new Request(new URL("/GDPR/test", url)));
  let html = await side.text();
  if (url.searchParams.has("feil")) html = html.replace('<p class="feil" hidden>', '<p class="feil">');
  return new Response(html, { headers: { ...ingenLager, "content-type": "text/html; charset=utf-8" } });
}

export async function handleNedlasting(request, env, url) {
  // /klart/last-ned/mac, /alles-klar/last-ned/mac og /frostcopy/download/mac: hver utgave har sine filer.
  // De andre utgavene har filene sine i .worker/utgaver/<kode>.js (u.filer) og lenkene på /<sti>/download/….
  const treff = url.pathname.match(/^\/([^/]+)\/(?:last-ned|download)\/([^/]+)\/?$/);
  const filer = treff && (FILER[treff[1] === "GDPR" ? "klart" : treff[1]] || utgaveFraSti(url.pathname)?.filer);
  const fil = filer && Object.hasOwn(filer, treff[2]) ? filer[treff[2]] : null;
  if (!fil || !["GET", "HEAD"].includes(request.method)) return new Response("Finnes ikke.", { status: 404 });
  // KLART_NEDLASTING = "pause" i wrangler.jsonc stenger nedlastingen, for eksempel
  // mens en feil rettes. Gamle lenker får da en forklaring, ikke en gammel fil.
  if (env.KLART_NEDLASTING === "pause" && !erLansert() && !(await harTest(request, env))) {
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Klart</title>" +
        "<p style='font:16px system-ui;max-width:36em;margin:4em auto'>Klart oppdateres. " +
        "En ny versjon kommer straks. <a href='/klart/'>Tilbake til Klart</a></p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "3600" } }
    );
  }
  const obj = await env.KLART_FILER.get(fil.key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("Filen er ikke lastet opp ennå.", { status: 404 });
  const hoder = new Headers();
  obj.writeHttpMetadata(hoder);
  hoder.set("content-type", fil.type || (fil.key.endsWith(".dmg") ? DMG : fil.key.endsWith(".exe") ? EXE : DEB));
  // filename* for navn med tegn utenfor ASCII (Clarísimo); filename som reserve uten dem.
  const ascii = fil.navn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_");
  hoder.set("content-disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fil.navn)}`);
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

// ---------------------------------------------------------------------------
// FrostCopy (den amerikanske utgaven): kjøp på faktura, /frostcopy/api/…
// ---------------------------------------------------------------------------
//
// Kjøperen velger størrelse og bransje (eller offentlig), og prisen regnes ut her med den samme filen som siden
// viser prisen med (frostcopy/buy/price.js). Ikke noe registeroppslag og ikke Stripe (eieren 20.11.2026: faktura).
//
//   POST /frostcopy/api/order   bestillingen: lagres, får fakturanummer, og fakturaen sendes kunden på e-post
//                               (30 dager, bankoverføring i dollar). Eieren får en e-post med en lenke.
//   GET  /frostcopy/api/paid    lenken fra den e-posten: viser bestillingen og knappen «betalt».
//   POST /frostcopy/api/paid    eieren har sett pengene: lisensen (FROSTCOPY-…, 365 dager fra nå) sendes kunden.
//
// Lisensen sendes først når fakturaen er betalt (eieren). Lenken er signert med lisensnøkkelen, så bare den som
// har fått e-posten, kan utløse lisensen. E-posten går med Cloudflares e-postutsending (bindingen EMAIL).

const US_AVSENDER = { email: "frostcopy@esbjugconsult.com", name: "FrostCopy" };
const US_FRIST_DAGER = 30;
const US_SELGER = ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norway", "Org. no. 938 441 405"];
// Kontoen fakturaen betales til (eieren 20.11.2026). BIC og bankens adresse er fra bankens side «Motta penger fra
// utlandet» (SpareBank 1 Østfold Akershus).
const US_BANK = [
  ["Account holder", "ESBJUG CONSULT"],
  ["IBAN", "NO91 1080 2731 456"],
  ["BIC / SWIFT", "SPTRNO22"],
  ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norway"],
];

const usd = (n) => "$" + Number(n).toLocaleString("en-US");
const usDato = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const usNr = (nr) => "FC-" + (1000 + nr);

function usHtmlSide(tittel, innhold) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(tittel)}</title>` +
      `<body style="font:16px/1.5 system-ui,sans-serif;max-width:40em;margin:3em auto;padding:0 1em;color:#00205b">${innhold}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

export async function handleFrostCopy(request, env, url) {
  const sti = url.pathname.replace(/^\/frostcopy\/api\//, "");
  try {
    if (sti === "order" && request.method === "POST") return await usBestill(request, env);
    if (sti === "paid" && ["GET", "POST"].includes(request.method)) return await usBetalt(request, env, url);
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error("frostcopy", sti, err);
    return json({ error: "Something went wrong on our side. Try again in a moment, or write to " + EIER + "." }, 500);
  }
}

/** Beskjed til eieren på e-post (Cloudflares utsending), og i utboksen. Gir false når den ikke gikk ut. */
/** fra: utgavens egen avsender (Alles Klar, C’est Clair …), så eieren ser hvilken utgave bestillingen gjelder. */
async function varsleEier(env, emne, tekst, fra = { email: "klart@esbjugconsult.com", name: "Klart" }) {
  const id = await lager(env).iUtboks(EIER, emne, tekst);
  if (!env.EMAIL) return false;
  try {
    await env.EMAIL.send({ to: EIER, from: fra, subject: emne, text: tekst });
    await lager(env).sendt(id);
    return true;
  } catch (err) {
    console.error("klart varsel", err && err.code, err && err.message);
    return false;
  }
}

/** Sender en e-post med Cloudflares utsending og fører den i utboksen. Gir false når den ikke gikk ut. */
async function usEpost(env, { til, emne, tekst, html, vedlegg }) {
  const id = await lager(env).iUtboks(til, emne, tekst);
  if (!env.EMAIL) return false;
  try {
    await env.EMAIL.send({ to: til, from: US_AVSENDER, replyTo: EIER, subject: emne, text: tekst, ...(html ? { html } : {}), ...(vedlegg ? { attachments: vedlegg } : {}) });
    await lager(env).sendt(id);
    return true;
  } catch (err) {
    console.error("frostcopy epost", til, err && err.code, err && err.message);
    return false;
  }
}

async function usSignatur(env, nr) {
  return b64url(await crypto.subtle.sign("Ed25519", await signeringsnokkel(env), new TextEncoder().encode(`frostcopy-betalt|${nr}`)));
}

function usFaktura(o) {
  const linje = `FrostCopy license for one year, for the whole organization (${usHvem(o)})`;
  const kunde = [o.navn, ...o.adresse.split("\n")];
  const tekst = [
    `INVOICE ${o.faktura}`,
    ``,
    `Invoice date: ${usDato(o.dato)}`,
    `Due date: ${usDato(o.forfall)} (${US_FRIST_DAGER} days)`,
    ...(o.referanse ? [`Your reference: ${o.referanse}`] : []),
    ``,
    `From:`,
    ...US_SELGER.map((l) => "  " + l),
    ``,
    `To:`,
    ...kunde.map((l) => "  " + l),
    ``,
    `${linje}: ${usd(o.usd)}`,
    ``,
    `Total to pay: ${usd(o.usd)} (US dollars). No VAT or sales tax is added.`,
    ``,
    `How to pay`,
    `Pay by international bank transfer in US dollars. Write ${o.faktura} in the message field.`,
    ...US_BANK.map(([k, v]) => `  ${k}: ${v}`),
    `Please choose to cover the transfer fees yourself, so the full amount arrives.`,
    ``,
    `The license is sent to this email address when the payment has arrived. Until then FrostCopy works in full for 30 days from the first use.`,
    ``,
    `Questions: ${EIER}`,
  ].join("\n");
  const rad = (k, v) => `<tr><td style="padding:2px 16px 2px 0;color:#5b6b8c">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`;
  const html =
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#00205b;max-width:640px">` +
    `<h1 style="font-size:24px;margin:0 0 4px">Invoice ${esc(o.faktura)}</h1>` +
    `<table style="border-collapse:collapse;margin:12px 0">${rad("Invoice date", usDato(o.dato))}${rad("Due date", `${usDato(o.forfall)} (${US_FRIST_DAGER} days)`)}${o.referanse ? rad("Your reference", o.referanse) : ""}</table>` +
    `<table style="border-collapse:collapse;width:100%;margin:12px 0"><tr>` +
    `<td style="vertical-align:top;padding:0 24px 0 0"><b>From</b><br>${US_SELGER.map(esc).join("<br>")}</td>` +
    `<td style="vertical-align:top"><b>To</b><br>${kunde.map(esc).join("<br>")}</td></tr></table>` +
    `<table style="border-collapse:collapse;width:100%;margin:16px 0;border-top:2px solid #00205b;border-bottom:2px solid #00205b">` +
    `<tr><td style="padding:10px 16px 10px 0">${esc(linje)}</td><td style="padding:10px 0;text-align:right;white-space:nowrap">${usd(o.usd)}</td></tr>` +
    `<tr><td style="padding:10px 16px 10px 0;border-top:1px solid #c5cfe3"><b>Total to pay</b> (US dollars). No VAT or sales tax is added.</td><td style="padding:10px 0;text-align:right;white-space:nowrap;border-top:1px solid #c5cfe3"><b>${usd(o.usd)}</b></td></tr></table>` +
    `<h2 style="font-size:17px;margin:20px 0 4px">How to pay</h2>` +
    `<p style="margin:0 0 8px">Pay by international bank transfer in US dollars. Write <b>${esc(o.faktura)}</b> in the message field.</p>` +
    `<table style="border-collapse:collapse">${US_BANK.map(([k, v]) => rad(k, v)).join("")}</table>` +
    `<p style="margin:8px 0 0">Please choose to cover the transfer fees yourself, so the full amount arrives.</p>` +
    `<p style="margin:16px 0 0">The license is sent to this email address when the payment has arrived. Until then FrostCopy works in full for 30 days from the first use.</p>` +
    `<p style="margin:16px 0 0;color:#5b6b8c">Questions: <a href="mailto:${EIER}">${EIER}</a></p></div>`;
  return { tekst, html };
}

/** Hvem lisensen er for, slik det står på fakturaen: «25 people, Law firm» eller «40 users, state agency, Texas». */
function usHvem(o) {
  const n = o.people.toLocaleString("en-US");
  if (o.kind === "federal") return `${n} ${o.people === 1 ? "user" : "users"}, federal agency`;
  if (o.kind === "state" || o.kind === "local") return `${n} ${o.people === 1 ? "user" : "users"}, ${o.kind === "state" ? "state agency" : "local government"}, ${US_STATER[o.state]?.[0] || o.state}`;
  return `${n} ${o.people === 1 ? "person" : "people"}, ${o.business || "one person"}`;
}

async function usBestill(request, env) {
  if (!env.KLART_LISENSNOKKEL) return json({ error: "Ordering is not open yet." }, 503);
  const b = await body(request);
  // Et felt mennesker ikke ser. Roboter fyller det ut; de får et vanlig svar, og ingenting skjer.
  if (b.website) return json({ ok: true, invoice: "FC-0", price: 0, sent: true });
  const p = usPris({ people: b.people, kind: ["federal", "state", "local"].includes(b.kind) ? b.kind : "business", business: b.business, state: String(b.state || "") });
  const navn = tekstFra(b.name, 120).replace(/\s+/g, " ");
  const epost = epostFra(b.email);
  const adresse = String(b.address || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6).map((l) => l.slice(0, 100)).join("\n");
  const referanse = tekstFra(b.reference, 80).replace(/\s+/g, " ");
  if (!p) return json({ error: "Fill in the fields above the price first." }, 400);
  if (navn.length < 2) return json({ error: "Write the name of the organization." }, 400);
  if (!epost) return json({ error: "Write the email address the invoice should go to." }, 400);
  if (adresse.length < 8) return json({ error: "Write the billing address." }, 400);
  const dag = idag();
  const o = { navn, epost, adresse, referanse, people: p.people, kind: p.kind, state: p.state || null, business: p.business, usd: p.price, dato: dag, forfall: omDager(US_FRIST_DAGER) };
  const nr = await lager(env).usNyOrdre(o);
  o.faktura = usNr(nr);
  await lager(env).usOppdater(nr, o);
  const f = usFaktura(o);
  const sendt = await usEpost(env, { til: epost, emne: `Invoice ${o.faktura} for FrostCopy: ${navn}`, tekst: f.tekst, html: f.html });
  const lenke = `https://esbjugconsult.com/frostcopy/api/paid?nr=${nr}&t=${await usSignatur(env, nr)}`;
  await usEpost(env, {
    til: EIER,
    emne: `FrostCopy-bestilling ${o.faktura}: ${navn}, ${usd(o.usd)}`,
    tekst: [
      `Ny bestilling på faktura.`,
      ``,
      `${navn} (${epost})`,
      usHvem(o),
      `Beløp: ${usd(o.usd)}, forfall ${o.forfall}`,
      sendt ? `Fakturaen er sendt til kunden.` : `FAKTURAEN GIKK IKKE UT PÅ E-POST. Send den selv; teksten står under.`,
      ``,
      `Når pengene er kommet inn, åpne denne lenken og trykk på knappen. Da får kunden lisensen på e-post:`,
      lenke,
      ``,
      `----- Fakturaen -----`,
      f.tekst,
    ].join("\n"),
  });
  return json({ ok: true, invoice: o.faktura, price: o.usd, due: o.forfall, sent: sendt });
}

async function usBetalt(request, env, url) {
  const nr = Number(url.searchParams.get("nr"));
  const t = url.searchParams.get("t") || "";
  if (!Number.isInteger(nr) || nr < 1 || !env.KLART_LISENSNOKKEL) return json({ error: "Not found." }, 404);
  const ventet = await usSignatur(env, nr);
  if (t.length !== ventet.length || !likt(t, ventet)) return json({ error: "Not found." }, 404);
  const rad = await lager(env).usOrdre(nr);
  if (!rad) return json({ error: "Not found." }, 404);
  const o = rad.data;
  const hode = `<h1 style="font-size:22px">${esc(o.faktura)}: ${esc(o.navn)}</h1><p>${esc(o.epost)}<br>${usd(o.usd)}, bestilt ${esc(o.dato)}, forfall ${esc(o.forfall)}</p>`;
  if (rad.betalt) return usHtmlSide(o.faktura, hode + `<p><b>Lisensen ble sendt ${esc(rad.betalt.slice(0, 10))}.</b></p>`);
  if (request.method === "GET") {
    return usHtmlSide(o.faktura, hode + `<p>Er pengene kommet inn? Da sendes lisensen til kunden, og den varer i 365 dager fra i dag.</p>` +
      `<form method="post"><button style="font:inherit;padding:12px 20px;border:0;border-radius:999px;background:#00205b;color:#fff;cursor:pointer">Betalt: send lisensen</button></form>`);
  }
  const utloper = omDager(365);
  const kode = (await lagKode(env, { id: nyId(), type: "lisens", navn: o.navn, orgnr: null, epost: o.epost, maskin: null, plan: "org", utloper })).replace(/^KLART-/, "FROSTCOPY-");
  const fil = `License for FrostCopy: ${o.navn}\n\nDouble-click this file, or drop it on the FrostCopy window, and FrostCopy is activated.\nYou can also paste the code below in FrostCopy › License.\n\n${kode}\n`;
  const tekst = [
    `Thank you. The payment for invoice ${o.faktura} has arrived, and here is the license for ${o.navn}.`,
    ``,
    `Open FrostCopy and choose License at the top right. Paste the code below, or drop the attached file on the FrostCopy window.`,
    `Everyone in the organization uses the same license. It lasts until ${usDato(utloper)}.`,
    ``,
    kode,
    ``,
    `Questions: ${EIER}`,
  ].join("\n");
  const sendt = await usEpost(env, {
    til: o.epost,
    emne: `Your FrostCopy license: ${o.navn}`,
    tekst,
    vedlegg: [{ content: btoa(String.fromCharCode(...new TextEncoder().encode(fil))), filename: "FrostCopy license.frostcopylicense", type: "text/plain", disposition: "attachment" }],
  });
  if (!sendt) return usHtmlSide(o.faktura, hode + `<p><b>E-posten gikk ikke ut.</b> Ingenting er merket som betalt. Prøv igjen, eller send koden selv:</p><textarea rows="6" style="width:100%">${esc(kode)}</textarea>`);
  await lager(env).usMerkBetalt(nr, utloper);
  await usEpost(env, { til: EIER, emne: `FrostCopy ${o.faktura} betalt: lisensen er sendt til ${o.navn}`, tekst: `Lisensen er sendt til ${o.epost}. Den varer til ${utloper}.\n\n${kode}` });
  return usHtmlSide(o.faktura, hode + `<p><b>Lisensen er sendt til ${esc(o.epost)}.</b> Den varer til ${esc(utloper)}.</p>`);
}

// ---------------------------------------------------------------------------
// Alles Klar (den tyske utgaven): kjøp på faktura i euro, /alles-klar/api/…
// ---------------------------------------------------------------------------
//
// Som FrostCopy over, på tysk og med tre slags kjøpere: virksomhet (personer og bransje), kommune (innbyggere;
// kurven gir fire år, og det bestilles og faktureres ett år om gangen) og statlig eller delstatlig myndighet
// (ansatte). Prisen regnes ut her med den samme filen som siden viser prisen med (alles-klar/pris/preis.js).
// Ikke noe registeroppslag og ingen betalingsleverandør (eieren 20.11.2026: faktura).
//
//   POST /alles-klar/api/bestellung   bestillingen: lagres, får fakturanummer (AK-1001 …), og fakturaen sendes
//                                     kunden på e-post (30 dager, SEPA-overføring i euro). Eieren får en lenke.
//   GET  /alles-klar/api/bezahlt      lenken fra den e-posten: viser bestillingen og knappen «betalt».
//   POST /alles-klar/api/bezahlt      eieren har sett pengene: lisensen (ALLESKLAR-…, 365 dager fra nå) sendes kunden.
//
// Lisensnøkkelen sendes først når fakturaen er betalt. Lenken er signert med lisensnøkkelen, med sin egen merkelapp.

const DE_AVSENDER = { email: "allesklar@esbjugconsult.com", name: "Alles Klar" };
const DE_FRIST_DAGER = 30;
const DE_SELGER = ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norwegen", "Org.-Nr. 938 441 405"];
const DE_BANK = [
  ["Kontoinhaber", "ESBJUG CONSULT"],
  ["IBAN", "NO91 1080 2731 456"],
  ["BIC", "SPTRNO22"],
  ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norwegen"],
];
const DE_MWST = "Kein Ausweis von Umsatzsteuer. Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).";
const DE_SCHLUESSEL =
  "Den Lizenzschlüssel senden wir an diese E-Mail-Adresse, sobald die Zahlung eingegangen ist. Bis dahin funktioniert Alles Klar 30 Tage ab der ersten Verwendung in vollem Umfang.";

// Egen tusenskiller og dato, så teksten ikke avhenger av hvilke språk kjøremiljøet har.
const deTall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");
const eur = (n) => deTall(n) + " €";
const deDato = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const deNr = (nr) => "AK-" + (1000 + nr);

export async function handleAllesKlar(request, env, url) {
  const sti = url.pathname.replace(/^\/alles-klar\/api\//, "");
  try {
    if (sti === "bestellung" && request.method === "POST") return await deBestill(request, env);
    if (sti === "bezahlt" && ["GET", "POST"].includes(request.method)) return await deBetalt(request, env, url);
    return json({ error: "Nicht gefunden." }, 404);
  } catch (err) {
    console.error("alles-klar", sti, err);
    return json({ error: "Bei uns ist etwas schiefgegangen. Versuchen Sie es gleich noch einmal, oder schreiben Sie an " + EIER + "." }, 500);
  }
}

/** Sender en e-post til kunden fra Alles Klar og fører den i utboksen. Gir false når den ikke gikk ut. */
async function deEpost(env, { til, emne, tekst, html, vedlegg }) {
  const id = await lager(env).iUtboks(til, emne, tekst);
  if (!env.EMAIL) return false;
  try {
    await env.EMAIL.send({ to: til, from: DE_AVSENDER, replyTo: EIER, subject: emne, text: tekst, ...(html ? { html } : {}), ...(vedlegg ? { attachments: vedlegg } : {}) });
    await lager(env).sendt(id);
    return true;
  } catch (err) {
    console.error("alles-klar epost", til, err && err.code, err && err.message);
    return false;
  }
}

async function deSignatur(env, nr) {
  return b64url(await crypto.subtle.sign("Ed25519", await signeringsnokkel(env), new TextEncoder().encode(`alles-klar-bezahlt|${nr}`)));
}

/** Det bestillingen gjelder, slik det står på fakturaen: «25 Personen, Immobilien», «18.500 Einwohner, Jahr 1 von 4». */
function deGrunnlag(o) {
  if (o.art === "kommune") return `${deTall(o.einwohner)} Einwohner, Jahr 1 von 4`;
  if (o.art === "behoerde") return `${deTall(o.beschaeftigte)} Beschäftigte`;
  return o.personen === 1 ? "1 Person" : `${deTall(o.personen)} Personen, ${o.branche}`;
}

function deFaktura(o) {
  const linje = `Alles Klar, Lizenz für ein Jahr, für die gesamte Organisation (${deGrunnlag(o)})`;
  const kunde = [o.navn, ...o.adresse.split("\n")];
  const forfall = `${deDato(o.forfall)} (fällig in ${DE_FRIST_DAGER} Tagen)`;
  const betal = `Bitte zahlen Sie per SEPA-Überweisung in Euro und geben Sie als Verwendungszweck ${o.faktura} an.`;
  const tekst = [
    `RECHNUNG Nr. ${o.faktura}`,
    ``,
    `Rechnungsdatum: ${deDato(o.dato)}`,
    `Zahlbar bis: ${forfall}`,
    ...(o.referanse ? [`Ihre Bestellnummer / Ihr Zeichen: ${o.referanse}`] : []),
    ``,
    `Von:`,
    ...DE_SELGER.map((l) => "  " + l),
    ``,
    `An:`,
    ...kunde.map((l) => "  " + l),
    ``,
    `${linje}: ${eur(o.eur)}`,
    ``,
    `Rechnungsbetrag: ${eur(o.eur)}`,
    DE_MWST,
    ``,
    `Zahlung`,
    betal,
    ...DE_BANK.map(([k, v]) => `  ${k}: ${v}`),
    `  Verwendungszweck: ${o.faktura}`,
    ``,
    DE_SCHLUESSEL,
    ``,
    `Fragen: ${EIER}`,
  ].join("\n");
  const rad = (k, v) => `<tr><td style="padding:2px 16px 2px 0;color:#5b6b8c">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`;
  const html =
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#00205b;max-width:640px">` +
    `<h1 style="font-size:24px;margin:0 0 4px">Rechnung Nr. ${esc(o.faktura)}</h1>` +
    `<table style="border-collapse:collapse;margin:12px 0">${rad("Rechnungsdatum", deDato(o.dato))}${rad("Zahlbar bis", forfall)}${o.referanse ? rad("Ihre Bestellnummer / Ihr Zeichen", o.referanse) : ""}</table>` +
    `<table style="border-collapse:collapse;width:100%;margin:12px 0"><tr>` +
    `<td style="vertical-align:top;padding:0 24px 0 0"><b>Von</b><br>${DE_SELGER.map(esc).join("<br>")}</td>` +
    `<td style="vertical-align:top"><b>An</b><br>${kunde.map(esc).join("<br>")}</td></tr></table>` +
    `<table style="border-collapse:collapse;width:100%;margin:16px 0;border-top:2px solid #00205b;border-bottom:2px solid #00205b">` +
    `<tr><td style="padding:10px 16px 10px 0">${esc(linje)}</td><td style="padding:10px 0;text-align:right;white-space:nowrap">${eur(o.eur)}</td></tr>` +
    `<tr><td style="padding:10px 16px 10px 0;border-top:1px solid #c5cfe3"><b>Rechnungsbetrag</b><br><span style="color:#5b6b8c">${esc(DE_MWST)}</span></td><td style="padding:10px 0;text-align:right;white-space:nowrap;vertical-align:top;border-top:1px solid #c5cfe3"><b>${eur(o.eur)}</b></td></tr></table>` +
    `<h2 style="font-size:17px;margin:20px 0 4px">Zahlung</h2>` +
    `<p style="margin:0 0 8px">Bitte zahlen Sie per SEPA-Überweisung in Euro und geben Sie als Verwendungszweck <b>${esc(o.faktura)}</b> an.</p>` +
    `<table style="border-collapse:collapse">${DE_BANK.map(([k, v]) => rad(k, v)).join("")}${rad("Verwendungszweck", o.faktura)}</table>` +
    `<p style="margin:16px 0 0">${esc(DE_SCHLUESSEL)}</p>` +
    `<p style="margin:16px 0 0;color:#5b6b8c">Fragen: <a href="mailto:${EIER}">${EIER}</a></p></div>`;
  return { tekst, html };
}

async function deBestill(request, env) {
  if (!env.KLART_LISENSNOKKEL) return json({ error: "Die Bestellung ist noch nicht geöffnet." }, 503);
  const b = await body(request);
  // Et felt mennesker ikke ser. Roboter fyller det ut; de får et vanlig svar, og ingenting skjer.
  if (b.website) return json({ ok: true, rechnung: "AK-0", preis: 0, gesendet: true });
  const art = ["kommune", "behoerde"].includes(b.art) ? b.art : "unternehmen";
  const p = dePreis({ art, personen: b.personen, branche: b.branche, einwohner: b.einwohner, beschaeftigte: b.beschaeftigte });
  const navn = tekstFra(b.name, 120).replace(/\s+/g, " ");
  const epost = epostFra(b.email);
  const adresse = String(b.adresse || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6).map((l) => l.slice(0, 100)).join("\n");
  const referanse = tekstFra(b.zeichen, 80).replace(/\s+/g, " ");
  if (!p) {
    return json({ error: art === "kommune" ? "Geben Sie die Einwohnerzahl ein." : art === "behoerde" ? "Geben Sie die Zahl der Beschäftigten ein." : "Geben Sie an, wie viele Personen in der Organisation arbeiten." }, 400);
  }
  if (navn.length < 2) return json({ error: "Geben Sie den Namen der Organisation ein." }, 400);
  if (!epost) return json({ error: "Geben Sie die E-Mail-Adresse ein, an die die Rechnung gehen soll." }, 400);
  if (adresse.length < 8) return json({ error: "Geben Sie die Rechnungsadresse ein." }, 400);
  const o = {
    navn, epost, adresse, referanse, art: p.art,
    personen: p.personen ?? null, branche: p.branche ?? null, einwohner: p.einwohner ?? null, beschaeftigte: p.beschaeftigte ?? null,
    eur: p.preis, vierJahre: p.vierJahre ?? null, dato: idag(), forfall: omDager(DE_FRIST_DAGER),
  };
  const nr = await lager(env).deNyOrdre(o);
  o.faktura = deNr(nr);
  await lager(env).deOppdater(nr, o);
  const f = deFaktura(o);
  const sendt = await deEpost(env, { til: epost, emne: `Rechnung ${o.faktura} für Alles Klar: ${navn}`, tekst: f.tekst, html: f.html });
  const lenke = `https://esbjugconsult.com/alles-klar/api/bezahlt?nr=${nr}&t=${await deSignatur(env, nr)}`;
  const hva = o.art === "kommune" ? `Kommune, ${deTall(o.einwohner)} innbyggere (fire år: ${eur(o.vierJahre)}; denne fakturaen er år 1 av 4)`
    : o.art === "behoerde" ? `Statlig eller delstatlig myndighet, ${deTall(o.beschaeftigte)} ansatte`
    : `Virksomhet, ${deTall(o.personen)} ${o.personen === 1 ? "person" : `personer, ${o.branche}`}`;
  await varsleEier(
    env,
    `Alles Klar-bestilling ${o.faktura}: ${navn}, ${eur(o.eur)}`,
    [
      `Ny bestilling på faktura (Alles Klar, tysk).`,
      ``,
      `${navn} (${epost})`,
      hva,
      ...(referanse ? [`Kundens referanse: ${referanse}`] : []),
      `Beløp: ${eur(o.eur)} for ett år, forfall ${o.forfall}`,
      sendt ? `Fakturaen er sendt til kunden.` : `FAKTURAEN GIKK IKKE UT PÅ E-POST. Send den selv; teksten står under.`,
      ``,
      `Når pengene er kommet inn, åpne denne lenken og trykk på knappen. Da får kunden lisensnøkkelen på e-post:`,
      lenke,
      ``,
      `----- Fakturaen -----`,
      f.tekst,
    ].join("\n"),
    DE_AVSENDER
  );
  return json({ ok: true, rechnung: o.faktura, preis: o.eur, faellig: o.forfall, gesendet: sendt });
}

async function deBetalt(request, env, url) {
  const nr = Number(url.searchParams.get("nr"));
  const t = url.searchParams.get("t") || "";
  if (!Number.isInteger(nr) || nr < 1 || !env.KLART_LISENSNOKKEL) return json({ error: "Nicht gefunden." }, 404);
  const ventet = await deSignatur(env, nr);
  if (t.length !== ventet.length || !likt(t, ventet)) return json({ error: "Nicht gefunden." }, 404);
  const rad = await lager(env).deOrdre(nr);
  if (!rad) return json({ error: "Nicht gefunden." }, 404);
  const o = rad.data;
  const hode = `<h1 style="font-size:22px">${esc(o.faktura)}: ${esc(o.navn)}</h1><p>${esc(o.epost)}<br>${esc(deGrunnlag(o))}<br>${eur(o.eur)}, bestilt ${esc(o.dato)}, forfall ${esc(o.forfall)}</p>`;
  if (rad.betalt) return usHtmlSide(o.faktura, hode + `<p><b>Lisensnøkkelen ble sendt ${esc(rad.betalt.slice(0, 10))}.</b></p>`);
  if (request.method === "GET") {
    return usHtmlSide(o.faktura, hode + `<p>Er pengene kommet inn? Da sendes lisensnøkkelen til kunden, og den varer i 365 dager fra i dag.</p>` +
      `<form method="post"><button style="font:inherit;padding:12px 20px;border:0;border-radius:999px;background:#00205b;color:#fff;cursor:pointer">Betalt: send lisensnøkkelen</button></form>`);
  }
  const utloper = omDager(365);
  const kode = (await lagKode(env, { id: nyId(), type: "lisens", navn: o.navn, orgnr: null, epost: o.epost, maskin: null, plan: "org", utloper })).replace(/^KLART-/, "ALLESKLAR-");
  // Samme tekst som appen selv skriver i en lisensfil (aktivierung.rs, lizenz_speichere_datei).
  const fil = `Lizenz für Alles Klar: ${o.navn}\n\nDoppelklicken Sie auf diese Datei oder ziehen Sie sie in das Alles-Klar-Fenster, dann ist Alles Klar aktiviert.\nSie können den Code unten auch in Alles Klar › Lizenz einfügen.\n\n${kode}\n`;
  const tekst = [
    `Vielen Dank. Die Zahlung für die Rechnung ${o.faktura} ist eingegangen. Hier ist der Lizenzschlüssel für ${o.navn}.`,
    ``,
    `Öffnen Sie Alles Klar und klicken Sie oben rechts auf „Lizenz“ (während der Testphase steht dort „Test: noch … Tage“). Fügen Sie den Code unten in das Feld ein und klicken Sie auf „Aktivieren“.`,
    `Auf dem Mac können Sie stattdessen die angehängte Datei doppelklicken oder in das Alles-Klar-Fenster ziehen.`,
    `Alle in der Organisation verwenden denselben Lizenzschlüssel. Unter Lizenz › „Mit Kollegen teilen“ geben Sie ihn weiter. Er gilt bis einschließlich ${deDato(utloper)}.`,
    ``,
    kode,
    ``,
    `Fragen: ${EIER}`,
  ].join("\n");
  const sendt = await deEpost(env, {
    til: o.epost,
    emne: `Ihr Lizenzschlüssel für Alles Klar: ${o.navn}`,
    tekst,
    vedlegg: [{ content: btoa(String.fromCharCode(...new TextEncoder().encode(fil))), filename: "Alles Klar Lizenz.allesklarlizenz", type: "text/plain", disposition: "attachment" }],
  });
  if (!sendt) return usHtmlSide(o.faktura, hode + `<p><b>E-posten gikk ikke ut.</b> Ingenting er merket som betalt. Prøv igjen, eller send koden selv:</p><textarea rows="6" style="width:100%">${esc(kode)}</textarea>`);
  await lager(env).deMerkBetalt(nr, utloper);
  await varsleEier(env, `Alles Klar ${o.faktura} betalt: lisensnøkkelen er sendt til ${o.navn}`, `Lisensnøkkelen er sendt til ${o.epost}. Den varer til ${utloper}.\n\n${kode}`, DE_AVSENDER);
  return usHtmlSide(o.faktura, hode + `<p><b>Lisensnøkkelen er sendt til ${esc(o.epost)}.</b> Den varer til ${esc(utloper)}.</p>`);
}

// ---------------------------------------------------------------------------
// De andre utgavene (FrostCopy UK, C'est Clair, Clarísimo, Chiarissimo, Klip en Klaar, Wszystko Jasne)
// ---------------------------------------------------------------------------
//
// Samme løp som Alles Klar, men koden er felles og alt utgaven har for seg selv (adresse, navn, lisensprefiks,
// pris og tekstene kunden ser) står i .worker/utgaver/<kode>.js. Se README.md der.

export const UTGAVER = { gb: utgaveGb, fr: utgaveFr, es: utgaveEs, it: utgaveIt, nl: utgaveNl, pl: utgavePl, se: utgaveSe, dk: utgaveDk, at: utgaveAt, be: utgaveBe };

/** Utgaver med to språk (Belgia: nederlandsk, og fransk under `u.fr`): bestillingen sier `lang`, og fakturaen og
 * lisens-e-posten skrives på det språket. Uten `u.fr` eller med et annet språk er utgaven som før. */
function utSpråk(u, lang) {
  if (lang !== "fr" || !u.fr) return u;
  return { ...u, ...u.fr, t: { ...u.t, ...(u.fr.t || {}) }, fr: undefined, lang: "fr" };
}
const UTGAVE_PÅ_STI = Object.fromEntries(Object.values(UTGAVER).map((u) => [u.sti, u]));

/** Utgaven en adresse hører til, ut fra første ledd («cest-clair»), eller null. */
export function utgaveFraSti(pathname) {
  return UTGAVE_PÅ_STI[pathname.split("/")[1]] || null;
}

export async function handleUtgave(request, env, url, u) {
  const sti = url.pathname.slice(`/${u.sti}/api/`.length);
  try {
    if (sti === "order" && request.method === "POST") return await utBestill(request, env, u);
    if (sti === "paid" && ["GET", "POST"].includes(request.method)) return await utBetalt(request, env, url, u);
    return json({ error: u.t.ikkeFunnet }, 404);
  } catch (err) {
    console.error(u.sti, sti, err);
    return json({ error: u.t.feilServer(EIER) }, 500);
  }
}

async function utEpost(env, u, { til, emne, tekst, html, vedlegg }) {
  const id = await lager(env).iUtboks(til, emne, tekst);
  if (!env.EMAIL) return false;
  try {
    await env.EMAIL.send({ to: til, from: u.avsender, replyTo: EIER, subject: emne, text: tekst, ...(html ? { html } : {}), ...(vedlegg ? { attachments: vedlegg } : {}) });
    await lager(env).sendt(id);
    return true;
  } catch (err) {
    console.error(u.sti, "epost", til, err && err.code, err && err.message);
    return false;
  }
}

async function utSignatur(env, u, nr) {
  return b64url(await crypto.subtle.sign("Ed25519", await signeringsnokkel(env), new TextEncoder().encode(`${u.sti}-paid|${nr}`)));
}

function utFaktura(u, o) {
  const f = u.t.faktura;
  const linje = u.t.fakturaLinje(o);
  const kunde = [o.navn, ...o.adresse.split("\n")];
  const forfall = f.fristTekst(u.dato(o.forfall), u.frist);
  const sum = u.penger(o.pris);
  const tekst = [
    `${f.tittel} ${o.faktura}`.toUpperCase(),
    ``,
    `${f.dato}: ${u.dato(o.dato)}`,
    `${f.forfall}: ${forfall}`,
    ...(o.referanse ? [`${f.referanse}: ${o.referanse}`] : []),
    ``,
    `${f.fra}:`,
    ...u.selger.map((l) => "  " + l),
    ``,
    `${f.til}:`,
    ...kunde.map((l) => "  " + l),
    ``,
    `${linje}: ${sum}`,
    ``,
    `${f.belop}: ${sum}`,
    f.mva,
    ``,
    f.betaling,
    f.betalTekst(o.faktura),
    ...f.bank.map(([k, v]) => `  ${k}: ${v}`),
    `  ${f.formaal}: ${o.faktura}`,
    ``,
    f.nokkel,
    ``,
    `${f.sporsmal}: ${EIER}`,
  ].join("\n");
  const rad = (k, v) => `<tr><td style="padding:2px 16px 2px 0;color:#5b6b8c">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`;
  const html =
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#00205b;max-width:640px">` +
    `<h1 style="font-size:24px;margin:0 0 4px">${esc(f.tittel)} ${esc(o.faktura)}</h1>` +
    `<table style="border-collapse:collapse;margin:12px 0">${rad(f.dato, u.dato(o.dato))}${rad(f.forfall, forfall)}${o.referanse ? rad(f.referanse, o.referanse) : ""}</table>` +
    `<table style="border-collapse:collapse;width:100%;margin:12px 0"><tr>` +
    `<td style="vertical-align:top;padding:0 24px 0 0"><b>${esc(f.fra)}</b><br>${u.selger.map(esc).join("<br>")}</td>` +
    `<td style="vertical-align:top"><b>${esc(f.til)}</b><br>${kunde.map(esc).join("<br>")}</td></tr></table>` +
    `<table style="border-collapse:collapse;width:100%;margin:16px 0;border-top:2px solid #00205b;border-bottom:2px solid #00205b">` +
    `<tr><td style="padding:10px 16px 10px 0">${esc(linje)}</td><td style="padding:10px 0;text-align:right;white-space:nowrap">${esc(sum)}</td></tr>` +
    `<tr><td style="padding:10px 16px 10px 0;border-top:1px solid #c5cfe3"><b>${esc(f.belop)}</b><br><span style="color:#5b6b8c">${esc(f.mva)}</span></td><td style="padding:10px 0;text-align:right;white-space:nowrap;vertical-align:top;border-top:1px solid #c5cfe3"><b>${esc(sum)}</b></td></tr></table>` +
    `<h2 style="font-size:17px;margin:20px 0 4px">${esc(f.betaling)}</h2>` +
    `<p style="margin:0 0 8px">${esc(f.betalTekst(o.faktura))}</p>` +
    `<table style="border-collapse:collapse">${f.bank.map(([k, v]) => rad(k, v)).join("")}${rad(f.formaal, o.faktura)}</table>` +
    `<p style="margin:16px 0 0">${esc(f.nokkel)}</p>` +
    `<p style="margin:16px 0 0;color:#5b6b8c">${esc(f.sporsmal)}: <a href="mailto:${EIER}">${EIER}</a></p></div>`;
  return { tekst, html };
}

async function utBestill(request, env, u) {
  if (!env.KLART_LISENSNOKKEL) return json({ error: u.t.ikkeApen }, 503);
  const b = await body(request);
  u = utSpråk(u, b.lang);
  // Et felt mennesker ikke ser. Roboter fyller det ut; de får et vanlig svar, og ingenting skjer.
  if (b.website) return json({ ok: true, invoice: u.nrPrefiks + "0", price: 0, sent: true });
  const art = ["municipal", "state"].includes(b.art) ? b.art : "business";
  const p = u.pris({ art, persons: b.persons, sector: b.sector, inhabitants: b.inhabitants, employees: b.employees, ...(u.lang ? { lang: u.lang } : {}) });
  const navn = tekstFra(b.name, 120).replace(/\s+/g, " ");
  const epost = epostFra(b.email);
  const adresse = String(b.address || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 6).map((l) => l.slice(0, 100)).join("\n");
  const referanse = tekstFra(b.reference, 80).replace(/\s+/g, " ");
  if (!p) return json({ error: u.t.mangler.antall(art) }, 400);
  if (navn.length < 2) return json({ error: u.t.mangler.navn }, 400);
  if (!epost) return json({ error: u.t.mangler.epost }, 400);
  if (adresse.length < 8) return json({ error: u.t.mangler.adresse }, 400);
  const o = {
    navn, epost, adresse, referanse, art: p.art,
    persons: p.persons ?? null, sector: p.sector ?? null, inhabitants: p.inhabitants ?? null, employees: p.employees ?? null,
    pris: p.price, fourYears: p.fourYears ?? null, dato: idag(), forfall: omDager(u.frist),
    ...(u.lang ? { lang: u.lang } : {}),
  };
  const nr = await lager(env).utNyOrdre(u.kode, o);
  o.faktura = u.nrPrefiks + (1000 + nr);
  await lager(env).utOppdater(nr, o);
  const f = utFaktura(u, o);
  const sendt = await utEpost(env, u, { til: epost, emne: u.t.emneFaktura(o.faktura, navn), tekst: f.tekst, html: f.html });
  const lenke = `https://esbjugconsult.com/${u.sti}/api/paid?nr=${nr}&t=${await utSignatur(env, u, nr)}`;
  await varsleEier(
    env,
    `${u.navn}-bestilling ${o.faktura}: ${navn}, ${u.penger(o.pris)}`,
    [
      `Ny bestilling på faktura (${u.navn}, ${u.land}).`,
      ``,
      `${navn} (${epost})`,
      utHvaNorsk(u, o),
      ...(referanse ? [`Kundens referanse: ${referanse}`] : []),
      `Beløp: ${u.penger(o.pris)} for ett år, forfall ${o.forfall}`,
      sendt ? `Fakturaen er sendt til kunden.` : `FAKTURAEN GIKK IKKE UT PÅ E-POST. Send den selv; teksten står under.`,
      ``,
      `Når pengene er kommet inn, åpne denne lenken og trykk på knappen. Da får kunden lisensnøkkelen på e-post:`,
      lenke,
      ``,
      `----- Fakturaen -----`,
      f.tekst,
    ].join("\n"),
    u.avsender
  );
  return json({ ok: true, invoice: o.faktura, price: o.pris, due: o.forfall, sent: sendt });
}

function utHvaNorsk(u, o) {
  if (o.art === "municipal") return `Kommune, ${o.inhabitants} innbyggere${o.fourYears ? ` (fire år: ${u.penger(o.fourYears)}; denne fakturaen er år 1 av 4)` : ""}`;
  if (o.art === "state") return `Statlig myndighet, ${o.employees} ansatte`;
  return `Virksomhet, ${o.persons} ${o.persons === 1 ? "person" : `personer, ${o.sector}`}`;
}

async function utBetalt(request, env, url, u) {
  const nr = Number(url.searchParams.get("nr"));
  const t = url.searchParams.get("t") || "";
  if (!Number.isInteger(nr) || nr < 1 || !env.KLART_LISENSNOKKEL) return json({ error: u.t.ikkeFunnet }, 404);
  const ventet = await utSignatur(env, u, nr);
  if (t.length !== ventet.length || !likt(t, ventet)) return json({ error: u.t.ikkeFunnet }, 404);
  const rad = await lager(env).utOrdre(nr);
  if (!rad || rad.utgave !== u.kode) return json({ error: u.t.ikkeFunnet }, 404);
  const o = rad.data;
  u = utSpråk(u, o.lang);
  const hode = `<h1 style="font-size:22px">${esc(o.faktura)}: ${esc(o.navn)}</h1><p>${esc(u.navn)}<br>${esc(o.epost)}<br>${esc(utHvaNorsk(u, o))}<br>${esc(u.penger(o.pris))}, bestilt ${esc(o.dato)}, forfall ${esc(o.forfall)}</p>`;
  if (rad.betalt) return usHtmlSide(o.faktura, hode + `<p><b>Lisensnøkkelen ble sendt ${esc(rad.betalt.slice(0, 10))}.</b></p>`);
  if (request.method === "GET") {
    return usHtmlSide(o.faktura, hode + `<p>Er pengene kommet inn? Da sendes lisensnøkkelen til kunden, og den varer i 365 dager fra i dag.</p>` +
      `<form method="post"><button style="font:inherit;padding:12px 20px;border:0;border-radius:999px;background:#00205b;color:#fff;cursor:pointer">Betalt: send lisensnøkkelen</button></form>`);
  }
  const utloper = omDager(365);
  const kode = (await lagKode(env, { id: nyId(), type: "lisens", navn: o.navn, orgnr: null, epost: o.epost, maskin: null, plan: "org", utloper })).replace(/^KLART-/, u.prefiks);
  const fil = u.t.lisensfilTekst(o.navn, kode);
  const sendt = await utEpost(env, u, {
    til: o.epost,
    emne: u.t.emneLisens(o.navn),
    tekst: u.t.lisensEpost({ faktura: o.faktura, navn: o.navn, kode, utloper: u.dato(utloper) }),
    vedlegg: [{ content: btoa(String.fromCharCode(...new TextEncoder().encode(fil))), filename: u.lisensfil, type: "text/plain", disposition: "attachment" }],
  });
  if (!sendt) return usHtmlSide(o.faktura, hode + `<p><b>E-posten gikk ikke ut.</b> Ingenting er merket som betalt. Prøv igjen, eller send koden selv:</p><textarea rows="6" style="width:100%">${esc(kode)}</textarea>`);
  await lager(env).utMerkBetalt(nr, utloper);
  await varsleEier(env, `${u.navn} ${o.faktura} betalt: lisensnøkkelen er sendt til ${o.navn}`, `Lisensnøkkelen er sendt til ${o.epost}. Den varer til ${utloper}.\n\n${kode}`, u.avsender);
  return usHtmlSide(o.faktura, hode + `<p><b>Lisensnøkkelen er sendt til ${esc(o.epost)}.</b> Den varer til ${esc(utloper)}.</p>`);
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
  // En avkortet eller feillimt kode (feil lengde på signaturen, ugyldig base64) er bare en kode som ikke stemmer.
  try {
    const innhold = fraB64url(m[1]);
    if (!(await crypto.subtle.verify("Ed25519", await sjekknokkel(env), fraB64url(m[2]), innhold))) return null;
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
    // Det gamle kortkjøpet per maskin er borte. Lisenser bestilles på prissiden, på faktura.
    kjop: false,
    pris: kjopApent(env),
    test: false,
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
// Stripe: bare for webhooken (kjøp som ble gjort før 20.11.2026). Ingen side og ingen adresse en kunde kan
// nå, kaller stripe() lenger.
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

/** De gamle adressene for kortkjøp (eldre versjoner av appen og gamle lenker): kjøp skjer ikke her lenger. */
function flyttet() {
  return json({ feil: "Kjøp skjer nå på esbjugconsult.com/klart/pris/, og betales med faktura.", side: PRISSIDE }, 410);
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

/** Bare for lisenser fra de gamle kjøpene gjennom Stripe (id fra Stripe: sub_, cs_, in_): sto Stripe i testmodus,
    kunne hvem som helst «betale» med testkort, og de lisensene gir fortsatt bare en kode merket «test» som varer
    en uke. Bestillinger på faktura (ordre-…) og kommunenøkler (kommune-…) er aldri berørt av Stripe. */
function gammelTest(env, lisens) {
  return String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_") && !/^(ordre|kommune)-/.test(String(lisens.id || ""));
}

async function kodeTilLisens(env, lisens, maskin) {
  const test = gammelTest(env, lisens);
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
// Prisen regnes ut her, aldri på siden. Lisensen gjelder hele virksomheten: koden har ingen maskin, bare
// firmanavn, org.nr, plan og utløpsdato, og den sendes på e-post når fakturaen er betalt. Lisensen står i
// lageret med maks = 0 og plan «org», «konsern» eller «leverandor». Den fornyes ikke av seg selv: når den
// går ut, bestiller kunden på nytt.

const PRISSIDE = "https://esbjugconsult.com/klart/pris/";
const EIER = "tidemann@esbjugconsult.com";
const IKKE_AKTIV = "Dette organisasjonsnummeret er ikke aktivt i Brønnøysundregistrene.";
const MVA = 0.25; // lagt på alle beløp, som prissiden sier («25 % mva legges til på fakturaen»)
const FRIST_DAGER = 7; // betalingsfristen prissiden oppgir

function priser(env) {
  return lesPriser(env.KLART_PRISER);
}

/** Bestilling er åpen når prisene er satt, nøkler kan lages og e-posten kan gå ut. */
function kjopApent(env) {
  return Boolean(env.KLART_LISENSNOKKEL && env.KLART_PRISER && env.EMAIL);
}

function orgnrTekst(o) {
  return String(o || "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function kroner(n) {
  // Hele kroner uten desimaler, ellers to (3 437,50 NOK).
  return `${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)} NOK`;
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

/** Alle årsregnskapene for et org.nr fra Regnskapsregisteret, selskap og konsern, eller null. Svarer ikke
    registeret, prises virksomheten uten justering i stedet for at kjøpet stopper. */
async function regnskapFor(orgnr, fersk = false) {
  try {
    const svar = await fetch(`https://data.brreg.no/regnskapsregisteret/regnskap/${orgnr}`, {
      headers: { accept: "application/json" },
      // Regnskapene kommer én gang i året, så et døgn i hurtigbufferen er nok.
      cf: fersk ? { cacheTtl: 0 } : { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, 404: 86400, "500-599": 0 } },
    });
    return svar.ok ? await svar.json() : null;
  } catch (err) {
    console.error("klart regnskap", orgnr, err.message);
    return null;
  }
}

/** Det et oppslag prises på: hele konsernet for et morselskap med konsernregnskap, ellers virksomheten selv
    (se grunnlagFra). { v, regnskap, konsern } */
function grunnlag(p, o) {
  return grunnlagFra(p, o.virksomhet, o.regnskap);
}

const KOMMUNEFORMER = new Set(["KOMM", "FYLK"]);

/** Kommunen, fylkeskommunen eller den statlige virksomheten en enhet hører til, eller enheten selv når den er
    det: oppover i Enhetsregisteret (overordnetEnhet) gjennom organisasjonsledd og kommunale foretak, aldri
    gjennom et eget rettssubjekt (AS, IKS …). I staten er kjøperen leddet rett under et departement (en etat),
    et helseforetak, departementet selv, eller STAT-enheten der leddene kjøper samlet (SAMLET_STAT: domstolene).
    { orgnr, navn, form, innbyggere, ansatte, domene, stat } eller null. */
async function offentligRot(enhet, fersk) {
  let e = enhet;
  for (let i = 0; i < 7; i++) {
    const form = e.organisasjonsform?.kode;
    if (KOMMUNEFORMER.has(form)) return rotFra(e, false);
    if (form === "STAT" || !e.overordnetEnhet || !delAvKommunen(e)) return statlig(e) ? rotFra(e, true) : null;
    const over = await brreg(`enheter/${e.overordnetEnhet}`, fersk);
    if (over.status !== 200 || !aktiv(over.data)) return null;
    if (over.data.organisasjonsform?.kode === "STAT" && statlig(e) && !SAMLET_STAT.has(over.data.organisasjonsnummer)) {
      return rotFra(e, true);
    }
    e = over.data;
  }
  return null;
}

/** En kommune eller statlig virksomhet som kjøper for seg og alt under seg. De ansatte i hele treet er telt
    på forhånd (bygg-innbyggere.mjs); en ny etat telles nå. Et departement teller bare sine egne, ikke etatene. */
async function rotFra(e, stat) {
  const orgnr = e.organisasjonsnummer;
  const form = e.organisasjonsform.kode;
  let ansatte;
  if (!stat) ansatte = KOMMUNEANSATTE[orgnr] || e.antallAnsatte || 0;
  else if (STATSANSATTE[orgnr]) ansatte = STATSANSATTE[orgnr];
  else if (form === "STAT" && !SAMLET_STAT.has(orgnr)) ansatte = e.antallAnsatte || 0;
  else ansatte = await ansatteITre(e, enheterUnder, 60);
  return { orgnr, navn: e.navn, form, innbyggere: stat ? 0 : INNBYGGERE[orgnr] || 0, ansatte, domene: domeneFra(e), stat };
}

/** «kommunen» eller «virksomheten», for tekstene om hele kommunen eller hele den statlige virksomheten. */
function helhet(stat) {
  return stat ? "virksomheten" : "kommunen";
}

/** Enhetene rett under et org.nr, for å telle de ansatte i en bydel eller etat med alt under den. */
async function enheterUnder(orgnr) {
  const svar = await brreg(`enheter?overordnetEnhet=${orgnr}&size=100`);
  return svar.status === 200 ? svar.data._embedded?.enheter || [] : [];
}

/** { virksomhet, regnskap } når org.nr er aktivt, { underenhet, overordnet } for en underenhet, ellers
    { feil, kode }. Regnskapene hentes samtidig, så prisen kan ta hensyn til konsern og hva virksomheten
    tjener. En kommune får innbyggertallet og de ansatte i hele kommunen, en statlig virksomhet de ansatte i hele
    virksomheten og virksomhet.stat. En del av en kommune eller statlig virksomhet (bydel, etat, skole, kontor)
    er en virksomhet med virksomhet.kommune: den kan kjøpe selv, for sin andel. */
async function slaaOppVirksomhet(orgnr, fersk = false) {
  const [e, regnskap] = await Promise.all([brreg(`enheter/${orgnr}`, fersk), regnskapFor(orgnr, fersk)]);
  if (e.status === 200) {
    if (!aktiv(e.data)) return { feil: IKKE_AKTIV, kode: 409 };
    const virksomhet = virksomhetFra(e.data);
    const rot = await offentligRot(e.data, fersk);
    if (rot?.orgnr === orgnr) {
      virksomhet.ansatte = rot.ansatte;
      if (rot.stat) virksomhet.stat = true;
      else if (rot.innbyggere) virksomhet.innbyggere = rot.innbyggere;
    } else if (rot) {
      virksomhet.kommune = rot;
      virksomhet.ansatte = await ansatteITre(e.data, enheterUnder, 60);
    }
    return { virksomhet, regnskap };
  }
  if (e.status === 410) return { feil: IKKE_AKTIV, kode: 410 };
  const u = await brreg(`underenheter/${orgnr}`, fersk);
  if (u.status === 200 && u.data.overordnetEnhet && !u.data.slettedato) {
    const over = await brreg(`enheter/${u.data.overordnetEnhet}`, fersk);
    if (over.status === 200 && aktiv(over.data)) {
      // En skole eller et sykehjem i en kommune, eller et sykehus eller kontor i staten, kan kjøpe selv.
      // Andre underenheter kjøper gjennom hovedenheten.
      const kommune = await offentligRot({ overordnetEnhet: over.data.organisasjonsnummer, organisasjonsform: { kode: "BEDR" } }, fersk);
      if (kommune) return { virksomhet: { ...virksomhetFra(u.data), kommune }, regnskap: null };
      return {
        underenhet: { orgnr, navn: u.data.navn },
        overordnet: { orgnr: over.data.organisasjonsnummer, navn: over.data.navn },
      };
    }
  }
  return { feil: IKKE_AKTIV, kode: 404 };
}

/** Hva prisen bygger på, til eieren (vises ikke for kunden). */
function prisgrunnlag(l, g) {
  if (l.fireAar) {
    return (
      (l.stat ? `${(g.v.kommune || g.v).ansatte} ansatte i virksomheten, statlig fireårslisens` : `${l.innbyggere} innbyggere, fireårslisens`) +
      (l.verdi > 1 ? `, påslag ${l.verdi}` : "") +
      (l.del ? `, del av ${helhet(l.stat)} (${(l.andel * 100).toFixed(1)} % av de ansatte)` : "") +
      (l.betalt ? `, ${l.betalt} kr trukket fra` : "")
    );
  }
  return (
    `${l.ansatte} talte ansatte${g.konsern ? " i konsernet" : ""}, faktor ${l.faktor.toFixed(2)}` +
    (l.kundedata ? ", satt av kundedata" : "") +
    (l.sektor ? `, påslag ${l.sektor.faktor} for ${l.sektor.navn}` : "") +
    (g.regnskap ? ` (regnskap ${g.regnskap.aar})` : " (uten regnskap)")
  );
}

function underenhetTekst(o) {
  return `Dette er en underenhet av ${o.overordnet.navn}. Fortsett med ${orgnrTekst(o.overordnet.orgnr)}.`;
}

// --- EHF ------------------------------------------------------------------------------

const EHF_FAKTURA = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1";

/** Om virksomheten tar imot EHF-faktura: registrert i PEPPOL-katalogen med org.nr (0192) for faktura
    etter BIS Billing 3.0. null når katalogen ikke svarer; da kan de velge selv. */
async function kanEhf(orgnr) {
  try {
    const svar = await fetch(`https://directory.peppol.eu/search/1.0/json?participant=iso6523-actorid-upis::0192:${orgnr}`, {
      headers: { accept: "application/json" },
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "500-599": 0 } },
    });
    if (!svar.ok) return null;
    const d = await svar.json();
    return (d.matches || []).some((m) => (m.docTypes || []).some((t) => t.value === EHF_FAKTURA));
  } catch (err) {
    console.error("klart ehf", orgnr, err.message);
    return null;
  }
}

/** Domenene en lisensnøkkel kan sendes til uten betaling (bare kommuneGratis): virksomhetens eget, og
    kommunens for en del av en kommune. Fra hjemmeside og e-post i Enhetsregisteret. */
function egneDomener(v) {
  return [v.domene, v.kommune?.domene].filter(Boolean);
}

// --- Kommuner: hva som alt er kjøpt -------------------------------------------------

/** For en kommune eller statlig virksomhet, eller en del av en: det som alt er betalt i kommunen (virksomheten)
    for lisenser som gjelder nå (trekkes fra prisen), om kommunen selv har en lisens (den gjelder da alle delene),
    og om enheten har en. null for alle andre. */
async function kommunestatus(env, v) {
  if (!v.kommune && !v.stat && !KOMMUNEFORMER.has(v.form)) return null;
  const rot = v.kommune ? v.kommune.orgnr : v.orgnr;
  const stat = Boolean(v.kommune ? v.kommune.stat : v.stat);
  return { rot, stat, navn: v.kommune ? v.kommune.navn : v.navn, ...(await lager(env).kommunekjop(rot, v.orgnr, idag())) };
}

/** Hvorfor en kommune eller del ikke kan kjøpe nå, eller null. Har delene betalt hele kommunens pris,
    får kommunen selv nøkkelen for 0 kr (kommuneGratis); en del blir bedt om å la kommunen hente den. */
function kommuneHinder(k, l) {
  if (!k) return null;
  if (k.egen) return "Dere har allerede en lisens som gjelder nå.";
  if (k.rotHar) return `${k.navn} har en lisens som gjelder hele ${helhet(k.stat)}, også dere.`;
  if (l.pris <= 0 && l.del) {
    const h = helhet(k.stat);
    return `Delene av ${k.navn} har betalt hele prisen. ${k.navn} henter nøkkelen for hele ${h}, også dere, gratis på denne siden.`;
  }
  return null;
}

/** Kommunen selv, når delene har betalt hele prisen: nøkkelen for hele kommunen, uten betaling, til den
    første av delenes lisenser går ut (da er ikke hele prisen betalt lenger). */
async function kommuneGratis(env, v, k, epost) {
  const lisens = await lager(env).lagreLisens({
    id: `kommune-${k.rot}-${idag()}`,
    epost,
    navn: v.navn,
    orgnr: v.orgnr,
    kunde: null,
    utloper: k.forsteSlutt,
    maks: 0,
    plan: "org",
    forsteMaskin: null,
  });
  await lager(env).nyttKommunekjop(lisens.id, k.rot, v.orgnr, 0, k.forsteSlutt);
  const sendt = await klartEpost(env, nokkelEpost(lisens, await orgKode(env, lisens)));
  await varsleEier(
    env,
    `Klart: ${v.navn} hentet nøkkelen for hele ${helhet(k.stat)}`,
    `${v.navn} (org.nr ${orgnrTekst(v.orgnr)}) hentet nøkkelen gratis${sendt ? `, sendt til ${epost}` : `. E-POSTEN TIL ${epost} GIKK IKKE UT: send nøkkelen selv`}. Delene har betalt ${kroner(k.betalt)}. Gjelder til og med ${datoTekst(k.forsteSlutt)}.`
  );
  // Nøkkelen er bare på e-post, ikke på siden.
  return { type: "lisens", fireAar: true, gratis: true, navn: lisens.navn, orgnr: lisens.orgnr, epost: lisens.epost, utloper: lisens.utloper };
}

/** Bare for nøkkelen som gis uten betaling (kommuneGratis): hvorfor den ikke kan sendes til e-postadressen,
    eller null. Ved vanlig bestilling sendes nøkkelen etter betaling, til e-posten på bestillingen. */
function domeneFeil(v, epost) {
  const domener = egneDomener(v);
  if (!domener.length) {
    return `Fant ikke deres domene i Enhetsregisteret (hjemmeside eller e-post), så vi kan ikke sende nøkkelen herfra. Skriv til ${EIER}.`;
  }
  if (!epostPaaDomene(epost, domener)) {
    return `Lisensnøkkelen sendes bare til en e-postadresse på deres eget domene (…@${domener[domener.length - 1]}).`;
  }
  return null;
}

/** Til og med-datoen for en fireårslisens som starter nå. */
function fireAarFra(ms = Date.now()) {
  return dato(leggTilMaaneder(ms, 12 * 4) - 86400000);
}

/** Til og med-datoen for en lisens på ett år som starter nå (når fakturaen er betalt). */
function ettAarFra(ms = Date.now()) {
  return dato(leggTilMaaneder(ms, 12));
}

// --- Søk og sjekk (feltet på forsiden og prissiden) -------------------------------

/** Forslag mens noen skriver navnet. Enhetsregisteret slipper ikke nettleseren til selv (ingen CORS). */
/** Adresser fra Kartverket, med avstand og om det trengs en reisedag. */
async function adresser(tekst) {
  const q = tekstFra(tekst, 120);
  if (q.length < 3) return [];
  const svar = await fetch(
    `https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(q)}&fuzzy=true&treffPerSide=5&utkoordsys=4258`,
    { headers: { accept: "application/json" }, cf: { cacheEverything: true, cacheTtl: 86400 } }
  );
  if (!svar.ok) throw new Error(`Kartverket: ${svar.status}`);
  const stor = (s) => String(s || "").toLowerCase().replace(/(^|[\s-])\p{L}/gu, (b) => b.toUpperCase());
  return ((await svar.json()).adresser || [])
    .filter((a) => a.representasjonspunkt)
    .map((a) => {
      const { lat, lon } = a.representasjonspunkt;
      return { tekst: `${a.adressetekst}, ${a.postnummer} ${stor(a.poststed)}`, lat, lon, ...reiseFor(lat, lon) };
    });
}

/** Kartdata fra OpenFreeMap via oss. Bare det kartet trenger slipper gjennom. */
async function kartdata(url) {
  const sti = decodeURIComponent(url.pathname).replace(/^\/(klart|GDPR)\/api\/kart\//, "");
  const lov = /^(planet|planet\/\w+\/\d+\/\d+\/\d+\.pbf|fonts\/Noto Sans Regular\/\d+-\d+\.pbf)$/.test(sti);
  if (!lov) return json({ feil: "Finnes ikke." }, 404);
  const svar = await fetch(`https://tiles.openfreemap.org/${encodeURI(sti)}`, { cf: { cacheEverything: true, cacheTtl: 604800 } });
  if (!svar.ok) return new Response(null, { status: svar.status === 404 ? 204 : 502 });
  if (sti === "planet") {
    const tekst = (await svar.text()).replaceAll("https://tiles.openfreemap.org/", `${url.origin}/klart/api/kart/`);
    return new Response(tekst, { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
  }
  return new Response(svar.body, {
    headers: { "content-type": svar.headers.get("content-type") || "application/x-protobuf", "cache-control": "public, max-age=604800" },
  });
}

async function sok(url) {
  const q = tekstFra(url.searchParams.get("q"), 80);
  if (q.length < 2) return json({ treff: [] });
  const svar = await fetch(
    `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(q)}&size=12&konkurs=false&underAvvikling=false`,
    { headers: { accept: "application/json" }, cf: { cacheEverything: true, cacheTtl: 3600 } }
  );
  if (!svar.ok) throw new Error(`Enhetsregisteret søk: ${svar.status}`);
  const data = await svar.json();
  const treff = (data._embedded?.enheter || [])
    // Utenlandske enheter (UTLA) kan ikke kjøpe.
    .filter((e) => aktiv(e) && e.organisasjonsform?.kode !== "UTLA")
    .slice(0, 6)
    .map((e) => ({ orgnr: e.organisasjonsnummer, navn: e.navn, sted: e.forretningsadresse?.poststed || e.postadresse?.poststed || "" }));
  return json({ treff });
}

/** Nedlasting på forsiden: virksomheten finnes og er aktiv, om den er stor, og hva lisensen koster hvis
    de kjøper etter prøven (samme pris som prissiden). */
async function sjekk(env, url) {
  const p = priser(env);
  const orgnr = orgnrFra(url.searchParams.get("orgnr"));
  if (!orgnr) return json({ feil: "Organisasjonsnummeret må være ni sifre og gyldig." }, 400);
  const o = await slaaOppVirksomhet(orgnr);
  if (o.feil) return json({ feil: o.feil }, o.kode);
  if (o.underenhet) return json({ underenhet: o.underenhet, overordnet: o.overordnet });
  const g = p ? grunnlag(p, o) : null;
  const k = g ? await kommunestatus(env, g.v) : null;
  const l = g ? lisenspris(p, g.v, g.regnskap, k?.betalt || 0) : null;
  return json({
    orgnr: o.virksomhet.orgnr,
    navn: o.virksomhet.navn,
    stor: Boolean(g && !offentligKunde(g.v) && sprintFor(p, telteAnsatte(p, g.v))),
    // Kommuner og stat: forsiden viser dem uten «Godkjent»-merket.
    offentlig: Boolean(g && offentligKunde(g.v)),
    konsern: Boolean(g?.konsern),
    // Kommuner og stat ser prisen per år, som på prissiden (eieren 11.11.2026).
    pris: l ? (l.fireAar ? Math.round(l.pris / 4) : l.pris) : null,
    fireAar: Boolean(l?.fireAar),
  });
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
  const g = grunnlag(p, o);
  // En tjenesteleverandør slår opp en kunde: bare prisen per år for den kunden.
  if (url.searchParams.get("som") === "kunde") {
    return json({ orgnr: v.orgnr, navn: v.navn, ansatte: v.ansatte, konsern: g.konsern, pris: kundepris(p, g.v, g.regnskap) });
  }
  const [k, ehf] = await Promise.all([kommunestatus(env, g.v), kanEhf(v.orgnr)]);
  const l = lisenspris(p, g.v, g.regnskap, k?.betalt || 0);
  // Hva prisen bygger på (antall som telles, regnskap, påslag), sendes ikke ut. Siden viser bare prisen.
  return json({
    orgnr: v.orgnr,
    navn: v.navn,
    ansatte: v.ansatte,
    konsern: g.konsern,
    // Kommuner og stat ser prisen per år, som alle andre (eieren 11.11.2026): en fjerdedel av
    // fireårsprisen, og det er det de bestiller og betaler for ett år om gangen (kassen).
    pris: l.fireAar ? Math.round(l.pris / 4) : l.pris,
    // Kommuner og delene av dem kjøper for fire år, betalt per år.
    fireAar: Boolean(l.fireAar),
    kommune: l.fireAar
      ? {
          aar: l.aar,
          til: fireAarFra(),
          hel: l.hel,
          betalt: l.betalt,
          del: l.del ? { navn: g.v.kommune.navn, orgnr: g.v.kommune.orgnr } : null,
          // «kommunen» eller «virksomheten» i tekstene på siden.
          ord: helhet(l.stat),
          hinder: kommuneHinder(k, l),
          // Delene har betalt hele prisen: kommunen henter nøkkelen gratis, til den første av dem går ut.
          gratis: l.pris === 0 && !l.del && !kommuneHinder(k, l) ? { til: k.forsteSlutt } : null,
        }
      : null,
    betaling: betalingFor(),
    besoksadresse: v.adresse?.postnummer ? `${(v.adresse.linjer || []).join(" ")}, ${v.adresse.postnummer} ${v.adresse.poststed}`.trim() : "",
    // Tar de imot EHF (PEPPOL-katalogen). Avgjør hva som er forhåndsvalgt på siden.
    ehf,
    // Oppsettsdag og sprinter som gjelder (tom liste for de små), med prisene åpent.
    stor: sprintTilbud(p, g).length > 0,
    sprint: sprintTilbud(p, g),
    // Behandler trolig data for andre: da er det et eget steg i kassen.
    leverandorAktuell: leverandorAktuell(p, v),
    kjop: kjopApent(env),
  });
}

// --- Bestilling på faktura (ingen Stripe) -------------------------------------------
//
// Kassen lagrer bestillingen (K-1001, K-1002 …) og sender to e-poster: kunden får beskjed om at fakturaen
// kommer, eieren får det han trenger for å sende fakturaen selv, og en lenke signert med lisensnøkkelen.
// Når fakturaen er betalt, åpner eieren lenken og trykker på knappen. Først da lages lisensen, og nøkkelen
// sendes til e-posten på bestillingen. Ingen nøkkel går ut før betaling, så den trenger ikke gå til
// virksomhetens eget domene.

const KLART_AVSENDER = { email: "klart@esbjugconsult.com", name: "Klart" };
const nrTekst = (nr) => "K-" + (1000 + nr);
const inklMva = (n) => Math.round(n * (1 + MVA) * 100) / 100;

/** Sender en e-post med Cloudflares utsending og fører den i utboksen. Gir false når den ikke gikk ut. */
async function klartEpost(env, { til, emne, tekst, svarTil, vedlegg }) {
  const id = await lager(env).iUtboks(til, emne, tekst);
  if (!env.EMAIL) return false;
  try {
    await env.EMAIL.send({ to: til, from: KLART_AVSENDER, replyTo: svarTil || EIER, subject: emne, text: tekst, ...(vedlegg ? { attachments: vedlegg } : {}) });
    await lager(env).sendt(id);
    return true;
  } catch (err) {
    console.error("klart epost", til, err && err.code, err && err.message);
    return false;
  }
}

async function betaltSignatur(env, nr) {
  return b64url(await crypto.subtle.sign("Ed25519", await signeringsnokkel(env), new TextEncoder().encode(`klart-betalt|${nr}`)));
}

function adresseTekst(a) {
  if (!a) return "(ingen adresse i Enhetsregisteret)";
  return [...(a.linjer || []), `${a.postnummer} ${a.poststed}`.trim(), a.land && a.land !== "NO" ? a.land : ""].filter(Boolean).join(", ");
}

/** Linjene om beløpet, like i e-posten til kunden og til eieren. */
function belopLinjer(o) {
  return [
    ...(o.linjer.length > 1 ? o.linjer.map((l) => `  ${l.tekst}: ${kroner(l.belop)}`) : []),
    `Beløp eks. mva: ${kroner(o.belop)}`,
    `Beløp inkl. 25 % mva: ${kroner(inklMva(o.belop))}`,
  ];
}

/** Lagrer bestillingen og sender e-posten til kunden og til eieren. Gir { nr, ordre, sendt }. */
async function nyBestilling(env, o, { emne, kunde, eier, naarBetalt }) {
  const l = lager(env);
  const nr = await l.nyOrdre(o.orgnr, o);
  o.ordre = nrTekst(nr);
  await l.oppdaterOrdre(nr, o);
  const sendt = await klartEpost(env, { til: o.epost, emne: `Klart: ${emne} (${o.ordre})`, tekst: kunde(o).join("\n") });
  const lenke = `https://esbjugconsult.com/klart/api/betalt?nr=${nr}&t=${await betaltSignatur(env, nr)}`;
  await klartEpost(env, {
    til: EIER,
    svarTil: o.epost,
    emne: `Klart-bestilling ${o.ordre}: ${o.navn}, ${kroner(o.belop)} eks. mva`,
    tekst: [
      `Ny bestilling på faktura. Fakturaen sender du selv: ${o.ehf == null ? "kunden er ikke spurt om EHF" : o.ehf ? "SEND SOM EHF" : "SEND PÅ E-POST"}.`,
      ``,
      `Bestilling: ${o.ordre}, ${datoTekst(o.dato)}`,
      `Virksomhet: ${o.navn}`,
      `Org.nr: ${orgnrTekst(o.orgnr)}`,
      `Adresse (Enhetsregisteret): ${adresseTekst(o.adresse)}`,
      `Registrert i Merverdiavgiftsregisteret: ${o.mvaRegistrert ? "ja" : "nei"}`,
      `Kundens e-post: ${o.epost}`,
      `Kundens referanse: ${o.referanse || "(ingen)"}`,
      o.ehf == null
        ? `Faktura: ikke spurt om EHF. PEPPOL-katalogen: ${o.kanEhf ? "de tar imot EHF" : o.kanEhf === false ? "de står ikke der, send på e-post" : "svarte ikke"}`
        : o.ehf
          ? `Faktura: send som EHF til org.nr ${orgnrTekst(o.orgnr)}${o.kanEhf === false ? " (NB: står ikke i PEPPOL-katalogen)" : o.kanEhf === null ? " (PEPPOL-katalogen svarte ikke)" : ""}`
          : `Faktura: send på e-post til ${o.epost}${o.kanEhf ? " (de tar også imot EHF, men ba ikke om det)" : ""}`,
      ``,
      ...eier(o),
      ...belopLinjer(o),
      `Betalingsfrist kunden har fått oppgitt: ${FRIST_DAGER} dager`,
      ``,
      sendt ? `Kunden har fått e-post om at fakturaen kommer.` : `E-POSTEN TIL KUNDEN GIKK IKKE UT. Skriv til dem selv.`,
      ``,
      naarBetalt,
      lenke,
    ].join("\n"),
  });
  return { nr, ordre: o.ordre, sendt };
}

/** Kundene til en tjenesteleverandør, slått opp og priset hver for seg. Én linje per kunde.
    «ledig» er hvor mange kunder det er plass til på lisensen (19, som før). */
async function kunderFra(p, lev, liste, har = [], ledig = 19) {
  const orgnre = [...new Set((Array.isArray(liste) ? liste : []).map(orgnrFra).filter(Boolean))].filter(
    (o) => o !== lev.orgnr && !har.includes(o)
  );
  if (!orgnre.length) return { feil: "Legg til minst én kunde med et gyldig organisasjonsnummer." };
  if (orgnre.length > ledig) return { feil: `Det er plass til ${Math.max(ledig, 0)} kunder til på lisensen. Skriv til ${EIER} for flere.` };
  const linjer = [];
  for (const k of orgnre) {
    const o = await slaaOppVirksomhet(k);
    if (o.feil) return { feil: `${orgnrTekst(k)}: ${o.feil}`, kode: o.kode };
    if (o.underenhet) return { feil: underenhetTekst(o), kode: 409 };
    const kv = o.virksomhet;
    const kg = grunnlag(p, o);
    linjer.push({
      tekst: `Tjenesteleverandør for ${kv.navn} (org.nr ${orgnrTekst(kv.orgnr)})`,
      belop: kundepris(p, kg.v, kg.regnskap),
      kunde: { orgnr: kv.orgnr, navn: kv.navn },
    });
  }
  return { linjer };
}

// --- Kasse --------------------------------------------------------------------

async function kasse(request, env) {
  const p = priser(env);
  if (!p || !kjopApent(env)) return json({ feil: "Kjøp er ikke åpnet ennå." }, 503);
  const inn = await body(request);
  const type = ["lisens", "leverandor"].includes(inn.type) ? inn.type : null;
  const orgnr = orgnrFra(inn.orgnr);
  if (!type || !orgnr) return json({ feil: "Skriv inn et gyldig organisasjonsnummer." }, 400);
  // Alt slås opp på nytt her. Siden viser bare det samme som kommer tilbake.
  const o = await slaaOppVirksomhet(orgnr);
  if (o.feil) return json({ feil: o.feil }, o.kode);
  if (o.underenhet) return json({ feil: underenhetTekst(o) }, 409);
  const v = o.virksomhet;
  const g = grunnlag(p, o);
  const k = await kommunestatus(env, g.v);
  const l = lisenspris(p, g.v, g.regnskap, k?.betalt || 0);
  // En kommune eller statlig virksomhet, eller en del av en, prises for fire år (kommunepris). Siden viser
  // en fjerdedel som prisen per år (eieren 11.11.2026), og det er det de bestiller: ett år om gangen.
  const fireAar = type === "lisens" && Boolean(l.fireAar);
  if (type === "leverandor" && l.fireAar) {
    return json({ feil: "Kommuner og statlige virksomheter kjøper sin egen lisens. Behandler dere data for andre, skriv til oss." }, 400);
  }
  const epost = epostFra(inn.epost);
  if (fireAar) {
    const hinder = kommuneHinder(k, l);
    if (hinder) return json({ feil: hinder }, 409);
    // Gratis når delene har betalt alt. Den nøkkelen gis uten betaling, så den går bare til kommunens eget domene.
    if (l.pris === 0) {
      const feil = domeneFeil(v, epost);
      if (feil) return json({ feil }, 400);
      return json(await kommuneGratis(env, v, k, epost));
    }
  }
  if (!epost) return json({ feil: "Skriv inn e-postadressen fakturaen og lisensnøkkelen skal sendes til." }, 400);

  const hvem = `${v.navn} (org.nr ${orgnrTekst(v.orgnr)})`;
  let linjer;
  let beskrivelse;
  if (type === "lisens") {
    linjer = [{ tekst: "Klart, lisens for virksomheten, ett år", belop: fireAar ? Math.round(l.pris / 4) : l.pris }];
    beskrivelse =
      (g.konsern
        ? `Klart for ${hvem} og hele konsernet. Alle brukere og enheter, konsernets egne data.`
        : `Klart for ${hvem}. Alle brukere og enheter, virksomhetens egne data.`) +
      (fireAar
        ? // Kommuner og stat: årlig lisens uten binding, uten noe om fire år (eieren 11.11.2026).
          " Årlig lisens uten binding." +
          (l.del ? ` En del av ${g.v.kommune.navn} (org.nr ${orgnrTekst(g.v.kommune.orgnr)}).` : "") +
          (l.betalt ? ` ${kroner(l.betalt)} som er betalt i ${helhet(l.stat)} før, er trukket fra.` : "")
        : "");
  } else {
    // Egne data og kunders data på én bestilling: virksomhetens egen lisens, og én linje per kunde.
    const kl = await kunderFra(p, v, inn.kunder);
    if (kl.feil) return json({ feil: kl.feil }, kl.kode || 400);
    linjer = [{ tekst: "Klart, lisens for virksomheten, ett år", belop: l.pris }, ...kl.linjer];
    const antall = `${kl.linjer.length} ${kl.linjer.length === 1 ? "kunde" : "kunder"}`;
    beskrivelse = `Klart for ${hvem}: egne data, og tjenesteleverandørlisens for ${antall}.`;
  }

  const bestilling = {
    type,
    orgnr: v.orgnr,
    navn: v.navn,
    adresse: v.adresse,
    mvaRegistrert: v.mva,
    epost,
    referanse: tekstFra(inn.referanse, 140).replace(/\s+/g, " "),
    ehf: Boolean(inn.ehf),
    kanEhf: await kanEhf(v.orgnr),
    beskrivelse,
    linjer,
    belop: linjer.reduce((s, x) => s + x.belop, 0),
    plan: type === "leverandor" ? "leverandor" : g.konsern ? "konsern" : "org",
    // Kommuner og stat: kommunen kjøpet hører til og hele fireårsprisen, så det trekkes fra når andre i
    // kommunen kjøper (registreres når fakturaen er betalt, og gjelder så lenge lisensen gjør det).
    kommune: fireAar ? { rot: k.rot, belop: l.pris } : null,
    grunnlag: prisgrunnlag(l, g),
    dato: idag(),
  };
  const hvor = bestilling.plan === "konsern" ? "hele konsernet" : "virksomheten";
  const r = await nyBestilling(env, bestilling, {
    emne: "bestillingen er mottatt",
    kunde: (b) => [
      `Hei,`,
      ``,
      `takk for bestillingen av Klart for ${hvem}.`,
      ``,
      `Bestilling: ${b.ordre}`,
      b.beskrivelse,
      ...belopLinjer(b),
      ...(b.referanse ? [`Deres referanse: ${b.referanse}`] : []),
      ``,
      b.ehf
        ? `Fakturaen kommer som EHF (e-faktura) til organisasjonsnummer ${orgnrTekst(b.orgnr)}.`
        : `Fakturaen kommer på e-post til ${b.epost}.`,
      `Betalingsfristen er ${FRIST_DAGER} dager. Denne e-posten bekrefter bestillingen. Selve fakturaen kommer for seg.`,
      ``,
      `Lisensnøkkelen sendes til ${b.epost} når fakturaen er betalt. Lisensen gjelder i ett år fra den dagen, for alle brukere og enheter i ${hvor}.`,
      `Lisensen fornyes ikke av seg selv. Når den går ut, bestiller dere på nytt på ${PRISSIDE}`,
      ``,
      `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`,
      ``,
      `Klart`,
    ],
    eier: (b) => [
      `Hva: ${b.beskrivelse}`,
      `Periode: ett år fra dagen du merker den som betalt`,
      `Prisgrunnlag: ${b.grunnlag}`,
    ],
    naarBetalt: `Når fakturaen er betalt, åpne denne lenken og trykk på knappen. Da får kunden lisensnøkkelen på e-post:`,
  });
  return json({
    type,
    ordre: r.ordre,
    navn: v.navn,
    orgnr: v.orgnr,
    epost,
    ehf: bestilling.ehf,
    belop: bestilling.belop,
    belopInkl: inklMva(bestilling.belop),
    frist: FRIST_DAGER,
    sendt: r.sendt,
  });
}

// --- Betalt: eierens lenke -----------------------------------------------------------

function betaltSide(tittel, innhold) {
  // Samme sikkerhetshoder som resten av /klart/: ingen inline-stil, bare stilarket fra samme domene.
  return new Response(
    `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(tittel)}</title>` +
      `<link rel="icon" type="image/png" href="/klart/favicon.png"><link rel="stylesheet" href="/klart/pris/betalt.css"><body>${innhold}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

/** GET viser bestillingen og knappen. POST: fakturaen er betalt, og kunden får det som er bestilt. */
async function betalt(request, env, url) {
  const nr = Number(url.searchParams.get("nr"));
  const t = url.searchParams.get("t") || "";
  if (!Number.isInteger(nr) || nr < 1 || !env.KLART_LISENSNOKKEL) return json({ feil: "Finnes ikke." }, 404);
  const ventet = await betaltSignatur(env, nr);
  if (t.length !== ventet.length || !likt(t, ventet)) return json({ feil: "Finnes ikke." }, 404);
  const rad = await lager(env).ordre(nr);
  if (!rad) return json({ feil: "Finnes ikke." }, 404);
  const o = rad.data;
  const hode =
    `<h1>${esc(o.ordre)}: ${esc(o.navn)}</h1>` +
    `<p>Org.nr ${esc(orgnrTekst(o.orgnr))}<br>${esc(o.epost)}<br>${esc(o.beskrivelse)}<br>` +
    `${esc(kroner(o.belop))} eks. mva, ${esc(kroner(inklMva(o.belop)))} inkl. mva. Bestilt ${esc(datoTekst(o.dato))}.</p>`;
  if (rad.betalt) return betaltSide(o.ordre, hode + `<p><b>${esc(rad.utfall || "Ferdig behandlet")} ${esc(datoTekst(rad.betalt.slice(0, 10)))}.</b></p>`);
  if (request.method === "GET") {
    const sporsmal =
      o.type === "sprint"
        ? `Er fakturaen betalt? Da blir datoen booket, og kunden får bekreftelsen med kalenderfil.`
        : o.type === "kunder"
          ? `Er fakturaen betalt? Da får kunden bekreftelsen på at kundene er lagt til, med nøkkelen.`
          : `Er fakturaen betalt? Da sendes lisensnøkkelen til kunden, og den gjelder i ett år fra i dag.`;
    return betaltSide(
      o.ordre,
      hode +
        `<p>${sporsmal}</p><form method="post"><button name="hva" value="betalt">Betalt: send til kunden</button></form>` +
        (o.type === "sprint" ? `<form method="post"><button class="svak" name="hva" value="slipp">Ikke betalt: slipp datoen</button></form>` : "")
    );
  }
  const hva = (await request.formData().catch(() => null))?.get("hva") || "betalt";
  const ferdig = async (utfall, tekst) => {
    await lager(env).merkOrdreBetalt(nr, utfall.utloper || null, utfall.tekst);
    return betaltSide(o.ordre, hode + `<p><b>${esc(tekst)}</b></p>`);
  };
  const feilet = (kode) =>
    betaltSide(o.ordre, hode + `<p><b>E-posten til kunden gikk ikke ut.</b> Ingenting er merket som betalt. Prøv igjen${kode ? ", eller send nøkkelen selv:" : "."}</p>` + (kode ? `<textarea rows="6" readonly>${esc(kode)}</textarea>` : ""));

  if (o.type === "sprint") {
    if (hva === "slipp") {
      await lager(env).fjernSperring(o.sprint);
      return ferdig({ tekst: "Datoen ble sluppet" }, "Datoen er sluppet. Kunden har ikke fått beskjed: skriv til dem selv.");
    }
    const r = await lager(env).betalSprintId(o.sprint, o.epost);
    if (!r) return betaltSide(o.ordre, hode + `<p><b>Fant ikke bookingen i kalenderen.</b> Den er trolig fjernet.</p>`);
    if (r.ny) await sprintBekreftelse(env, r.rad, o.epost, `Bestilling: ${o.ordre}`, klartEpost, (ics) => [{ content: base64(ics), filename: "klart.ics", type: "text/calendar", disposition: "attachment" }]);
    return ferdig({ tekst: "Booket og bekreftet" }, `Datoen er booket, og bekreftelsen er sendt til ${o.epost}.`);
  }

  if (o.type === "kunder") {
    const lisens = await lager(env).finnLisens(o.lisens);
    if (!lisens) return betaltSide(o.ordre, hode + `<p><b>Fant ikke leverandørlisensen.</b></p>`);
    const kode = await orgKode(env, lisens);
    const sendt = await klartEpost(env, {
      til: o.epost,
      emne: `Klart: kundene er lagt til lisensen for ${o.navn}`,
      tekst: [
        `Hei,`,
        ``,
        `takk, fakturaen for bestilling ${o.ordre} er betalt. Disse kundene er lagt til tjenesteleverandørlisensen for ${o.navn}:`,
        ...o.linjer.map((x) => `  ${x.kunde.navn} (org.nr ${orgnrTekst(x.kunde.orgnr)})`),
        ``,
        `Lisensen gjelder som før til og med ${datoTekst(lisens.utloper)}. Her er nøkkelen på nytt:`,
        ``,
        kode,
        ``,
        `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`,
        ``,
        `Klart`,
      ].join("\n"),
    });
    if (!sendt) return feilet(kode);
    return ferdig({ tekst: "Kundene ble lagt til", utloper: lisens.utloper }, `Bekreftelsen er sendt til ${o.epost}.`);
  }

  // Lisens for virksomheten (og kundene, for en tjenesteleverandør): ett år fra i dag.
  const utloper = ettAarFra();
  const lisens = { id: `ordre-${o.ordre}`, epost: o.epost, navn: o.navn, orgnr: o.orgnr, kunde: null, utloper, maks: 0, plan: o.plan, forsteMaskin: null };
  const kode = await orgKode(env, lisens);
  const sendt = await klartEpost(env, nokkelEpost(lisens, kode));
  if (!sendt) return feilet(kode);
  await lager(env).lagreLisens(lisens);
  await lager(env).nyNokkel(lisens.id, utloper);
  if (o.kommune) await registrerKommunekjop(env, lisens.id, { kommune_rot: o.kommune.rot, orgnr: o.orgnr, kommune_belop: o.kommune.belop }, utloper);
  await varsleEier(env, `Klart ${o.ordre} betalt: nøkkelen er sendt til ${o.navn}`, `Lisensnøkkelen er sendt til ${o.epost}. Den gjelder til og med ${datoTekst(utloper)}.\n\n${kode}`);
  return ferdig({ tekst: "Lisensnøkkelen ble sendt", utloper }, `Lisensnøkkelen er sendt til ${o.epost}. Den gjelder til og med ${datoTekst(utloper)}.`);
}

/** Hele beløpet for en fireårslisens lagres på kommunen, så det trekkes fra når andre i kommunen kjøper.
    «til» er så lenge kjøpet gjelder: lisensens utløp for bestillinger på faktura, fire år for de gamle abonnementene. */
async function registrerKommunekjop(env, id, m, til = fireAarFra()) {
  await lager(env).nyttKommunekjop(id, m.kommune_rot, orgnrFra(m.orgnr), Number(m.kommune_belop) || 0, til);
}

// --- Eldre kjøp gjennom Stripe: bare webhooken kommer hit ------------------------------

/** Lisensen for en fireårslisens betalt på forskudd: hele virksomheten, uten maskingrense, i fire år. */
async function forskuddsLisens(env, id, m, epost, kunde) {
  const finnes = await lager(env).finnLisens(id);
  if (!finnes) await registrerKommunekjop(env, id, m);
  return lager(env).lagreLisens({
    id,
    epost: String(m.nokkel_epost || epost || "").toLowerCase(),
    navn: m.company_name || "Klart-kunde",
    orgnr: orgnrFra(m.orgnr),
    kunde,
    // Samme dato hver gang kvitteringen eller webhooken kommer, ikke fire år fra den siste.
    utloper: finnes?.utloper || fireAarFra(),
    maks: 0,
    plan: m.scope === "konsern" ? "konsern" : "org",
    forsteMaskin: null,
  });
}

/** Lisensen for et abonnement fra prissiden: hele virksomheten, uten maskingrense. */
async function orgLisens(env, abo, epost) {
  const m = abo.metadata || {};
  return lager(env).lagreLisens({
    id: abo.id,
    // Med faktura går nøkkelen til adressen på eget domene, ikke til fakturaadressen.
    epost: String(m.nokkel_epost || epost || "").toLowerCase(),
    navn: m.company_name || "Klart-kunde",
    orgnr: orgnrFra(m.orgnr),
    kunde: typeof abo.customer === "string" ? abo.customer : abo.customer?.id || null,
    utloper: utloperFor(abo),
    maks: 0,
    plan: m.license_type === "leverandor" ? "leverandor" : m.scope === "konsern" ? "konsern" : "org",
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
  } else if (m.fire_aar === "forskudd") {
    lisens = await forskuddsLisens(env, okt.id, m, epost, kunde);
  } else {
    let abo = typeof okt.subscription === "string" ? await stripe(env, "GET", `subscriptions/${okt.subscription}`) : okt.subscription;
    // Checkout kan ikke sette en sluttdato. En fireårslisens betalt per år får den her, fire år etter start.
    if (m.fire_aar === "aarlig" && !abo.cancel_at) {
      abo = await stripe(env, "POST", `subscriptions/${abo.id}`, {
        cancel_at: String(Math.floor(leggTilMaaneder(abo.start_date * 1000, 48) / 1000)),
        proration_behavior: "none",
      });
      await registrerKommunekjop(env, abo.id, m);
    }
    lisens = await orgLisens(env, abo, epost);
  }
  return { lisens, kode: await sendNokkel(env, lisens) };
}

async function orgKode(env, lisens) {
  // Utvidet testing selges ikke lenger. Koder fra eldre kjøp lages som før (bare webhooken kommer hit med dem).
  if (lisens.plan === "testing") {
    const test = gammelTest(env, lisens);
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
    // De gamle abonnementene (sub_…) får en ny nøkkel for hver periode. En bestilling på faktura fornyes ikke.
    const id = String(lisens.id);
    linjer.push(
      `Nøkkelen gjelder alle brukere og enheter i ${lisens.plan === "konsern" ? "hele konsernet" : "virksomheten"}` +
        `, til og med ${datoTekst(lisens.utloper)}.` +
        (id.startsWith("sub_") ? " Ved hver fornyelse kommer en ny nøkkel på e-post." : "") +
        (id.startsWith("ordre-") ? ` Lisensen fornyes ikke av seg selv. Når den går ut, bestiller dere på nytt på ${PRISSIDE}` : "")
    );
    if (lisens.plan === "leverandor") {
      linjer.push("", "Legger dere til kunder senere, gjelder den samme nøkkelen videre.");
    }
  }
  linjer.push("", `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`, "", "Klart");
  return {
    til: lisens.epost,
    emne: testing ? "Klart: kode for utvidet testing" : `Klart: lisensnøkkel for ${lisens.navn}`,
    tekst: linjer.join("\n"),
  };
}

/** En tjenesteleverandør bestiller flere kunder midt i perioden. Nøkkelen beviser hvem de er. Kundene prises
    for resten av perioden, fakturaen sender eieren, og kundene er lagt til når den er betalt. */
async function leggTilKunder(request, env) {
  const p = priser(env);
  if (!p || !kjopApent(env)) return json({ feil: "Kjøp er ikke åpnet ennå." }, 503);
  const inn = await body(request);
  const lapp = await lesKode(env, inn.kode);
  if (!lapp || !lapp.orgnr) return json({ feil: "Lisensnøkkelen stemmer ikke. Lim inn hele nøkkelen dere fikk på e-post." }, 400);
  const lisens = await lager(env).finnLeverandor(lapp.orgnr, idag());
  if (!lisens || !lisens.utloper) return json({ feil: "Fant ingen aktiv leverandørlisens for denne nøkkelen." }, 404);
  if (!lisens.epost) return json({ feil: `Lisensen mangler e-postadresse. Skriv til ${EIER}.` }, 409);
  const o = await slaaOppVirksomhet(lapp.orgnr);
  if (!o.virksomhet) return json({ feil: o.feil || IKKE_AKTIV }, 409);
  const v = o.virksomhet;
  // Kundene som alt står på lisensen: fra bestillingene som er betalt i denne perioden.
  const har = (await lager(env).betalteOrdrer(v.orgnr))
    .filter((r) => r.data.lisens === lisens.id || `ordre-${r.data.ordre}` === lisens.id)
    .flatMap((r) => r.data.linjer.map((x) => x.kunde?.orgnr).filter(Boolean));
  const k = await kunderFra(p, v, inn.kunder, har, 19 - har.length);
  if (k.feil) return json({ feil: k.feil }, k.kode || 400);
  // Forholdsmessig pris fram til lisensen går ut.
  const dager = Math.max(0, Math.round((Date.parse(lisens.utloper) - Date.parse(idag())) / 86_400_000));
  const linjer = k.linjer.map((x) => ({ ...x, tekst: `${x.tekst}, til og med ${datoTekst(lisens.utloper)}`, belop: Math.round((x.belop * Math.min(dager, 365)) / 365) }));
  const hvem = `${v.navn} (org.nr ${orgnrTekst(v.orgnr)})`;
  const bestilling = {
    type: "kunder",
    lisens: lisens.id,
    orgnr: v.orgnr,
    navn: v.navn,
    adresse: v.adresse,
    mvaRegistrert: v.mva,
    epost: lisens.epost,
    referanse: tekstFra(inn.referanse, 140).replace(/\s+/g, " "),
    // Fakturamåten spørres det ikke om her. Eieren ser i katalogen hva de tar imot.
    ehf: null,
    kanEhf: await kanEhf(v.orgnr),
    beskrivelse: `Klart for ${hvem}: ${linjer.length} ${linjer.length === 1 ? "kunde" : "kunder"} til på tjenesteleverandørlisensen, til og med ${datoTekst(lisens.utloper)}.`,
    linjer,
    belop: linjer.reduce((s, x) => s + x.belop, 0),
    dato: idag(),
  };
  const r = await nyBestilling(env, bestilling, {
    emne: "bestillingen av flere kunder er mottatt",
    kunde: (b) => [
      `Hei,`,
      ``,
      `takk for bestillingen. Disse kundene legges til tjenesteleverandørlisensen for ${hvem}:`,
      ...b.linjer.map((x) => `  ${x.kunde.navn} (org.nr ${orgnrTekst(x.kunde.orgnr)}): ${kroner(x.belop)}`),
      ``,
      `Bestilling: ${b.ordre}`,
      `Prisen gjelder resten av perioden, til og med ${datoTekst(lisens.utloper)}.`,
      `Beløp eks. mva: ${kroner(b.belop)}`,
      `Beløp inkl. 25 % mva: ${kroner(inklMva(b.belop))}`,
      ``,
      `Fakturaen kommer for seg, på samme måte som sist. Betalingsfristen er ${FRIST_DAGER} dager.`,
      `Kundene er lagt til når fakturaen er betalt. Da får dere en bekreftelse på e-post. Nøkkelen dere har, gjelder videre.`,
      ``,
      `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`,
      ``,
      `Klart`,
    ],
    eier: (b) => [`Hva: ${b.beskrivelse}`, `Lisensen det gjelder: ${lisens.id}`],
    naarBetalt: `Når fakturaen er betalt, åpne denne lenken og trykk på knappen. Da får kunden bekreftelsen:`,
  });
  return json({
    ordre: r.ordre,
    kunder: linjer.map((x) => x.kunde),
    belop: bestilling.belop,
    belopInkl: inklMva(bestilling.belop),
    epost: lisens.epost,
    utloper: lisens.utloper,
  });
}

async function sprint(request, env) {
  const inn = await body(request);
  // Feltet «nettside» er skjult på siden. Fyller noen det ut, er det en robot.
  if (inn.nettside) return json({ ok: true });
  const navn = tekstFra(inn.navn, 120);
  const epost = epostFra(inn.epost);
  if (!navn || !epost) return json({ feil: "Skriv inn navn og e-post, så tar jeg kontakt." }, 400);
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
  await klartEpost(env, {
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

// --- Oppsettsdag og sprinter: betal og book ------------------------------------------
//
// Tre tilbud etter talte ansatte (KLART_PRISER.sprint, se sprintTilbudFor i klart-pris.js): oppsettsdag
// (fast pris), kort sprint (5 dager) og sprint (10 dager), begge med grunnhonorar. Egen enkel kalender i
// lageret, ingen ekstern tjeneste. Kunden velger en dag, helg eller ikke, tidligst SPRINT_VARSEL dager fram.
//
// Reglene i kalenderen (ledigFor):
// - To sprinter kan ikke overlappe. En oppsettsdag kan ikke ligge på samme dag som en annen.
// - En sprint blokkerer bare oppstartsdagen og avslutningsdagen for oppsettsdager, så de kan ligge inne i den.
// - En sprint kan bestilles over en dag der det alt ligger en oppsettsdag. Eieren får beskjed om det i
//   e-posten og flytter oppsettsdagen før han fakturerer.
// Ingen betaling på siden (eieren 20.11.2026: ikke Stripe). Bestillingen holder datoen («forespurt»), kunden får
// beskjed om at fakturaen kommer, og eieren får en lenke (se betalt): «betalt» booker datoen og sender
// bekreftelsen med kalenderfil, «slipp» gjør datoen ledig igjen. Tidsrom eieren ikke kan, sperres med
// POST /klart/api/sprint/sperr { fra, til }; { fjern: id } fjerner en sperring eller en bestilling som ikke
// er betalt (Bearer ADMIN_TOKEN).

const SPRINT_VARSEL = 14;
const SPRINT_HORISONT = 180;
const OPPSETT_FRADRAG_DAGER = 92; // en kort sprint innen tre måneder etter oppsettsdagen får den trukket fra
const SPRINT_LINJE = { oppsett: "Oppsettsdag, fast pris", kort: "Grunnhonorar for kort sprint", sprint: "Grunnhonorar for sprint" };
const ISO_DAG = /^\d{4}-\d{2}-\d{2}$/;
const OKT_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;
// Samme kriterium som på prissiden (/klart/pris/) og i e-postene.
const SPRINT_KRITERIER =
  "Suksesskriteriet: før sprinten blir vi enige om hvordan et renset dokument skal se ut. Det testes i runder på 100 tilfeldige dokumenter fra egne arkiver (eller høyst 1 000 sider). " + "Går Klart glipp av noe, rettes modellen, og " +
  "dokumentene blir treningsmateriale; så tas 100 nye. Kriteriet er nådd når en ny runde blir 100 % ren på første " +
  "forsøk, målt på Klart alene: alle direkte identifikatorer og alt annet avtalt borte, og ingen gjenkjennelige " +
  "personer igjen. Det må nås innenfor sprinten; ellers faller resten av honoraret bort. Kriteriet gjelder rundene " +
  "som testes, ikke alle dokumenter.";
const OPPSETT_INNHOLD =
  "Oppsettsdagen: Klart installeres på en maskin dere har klar, tilgang internt settes opp med deres IT " +
  "(fjerntilgang til maskinen; Klart selv kobler seg ikke til nett), opplæring, og Klart kjøres på et utvalg av " +
  "deres egne dokumenter som vi går gjennom sammen, dere og jeg. Ingen egen modell og ingen suksesskriterier. Er ikke " +
  "sjekklisten klar (maskin, IT-kontakt, tilganger, testdokumenter), flyttes dagen. Mer enn én dag faktureres per time.";

function sluttFor(start, dager) {
  return omDager(dager - 1, Date.parse(`${start}T00:00:00Z`));
}

function forrigeDag(iso) {
  return omDager(-1, Date.parse(`${iso}T00:00:00Z`));
}

function kalenderType(id) {
  return id === "oppsett" ? "oppsett" : "sprint";
}

/** Om en booking av typen («oppsett» eller «sprint») fra start til slutt kan legges inn blant radene.
    { ok, forespurt }: forespurt betyr en sprint over en oppsettsdag som eieren må flytte først. */
function ledigFor(rader, type, start, slutt) {
  let forespurt = false;
  for (const r of rader) {
    // En booking med reisedag holder også dagen før.
    if ((r.reise ? forrigeDag(r.start) : r.start) > slutt || r.slutt < start) continue;
    if (r.status === "sperret") return { ok: false };
    const rt = r.type || "sprint";
    if (type === "oppsett") {
      if (rt === "oppsett" || r.start === start || r.slutt === start) return { ok: false };
    } else if (rt === "sprint") {
      return { ok: false };
    } else {
      forespurt = true;
    }
  }
  return { ok: true, forespurt };
}

/** Startdager for tilbudet: alle dager, også helg, fra SPRINT_VARSEL til SPRINT_HORISONT dager fram.
    «forespurt» er de som blir en forespørsel fordi en oppsettsdag ligger i perioden. */
async function ledigeStarter(env, tilbud, reise = false) {
  const type = kalenderType(tilbud.id);
  const rader = await lager(env).sprintOpptatt(omDager(SPRINT_VARSEL - 1), sluttFor(omDager(SPRINT_HORISONT), tilbud.dager), new Date().toISOString());
  const ledige = [];
  const forespurt = [];
  for (let d = SPRINT_VARSEL; d <= SPRINT_HORISONT; d++) {
    const start = omDager(d);
    const l = ledigFor(rader, type, reise ? forrigeDag(start) : start, sluttFor(start, tilbud.dager));
    if (l.ok) (l.forespurt ? forespurt : ledige).push(start);
  }
  return { ledige, forespurt };
}

/** Tilbudene for virksomheten, i rekkefølge. Samme ansatte som prisen telles på. */
function sprintTilbud(p, g) {
  // Kommuner og stat får ikke tilbudet om sprint eller oppsettsdag på siden (eieren 11.11.2026:
  // en sprint koster for mye for dem; det tas heller i andre kanaler).
  if (offentligKunde(g.v)) return [];
  return sprintTilbudFor(p, telteAnsatte(p, g.v));
}

/** En kommune, en fylkeskommune, en statlig virksomhet, eller en del av en av dem. */
function offentligKunde(v) {
  return Boolean(v.stat || v.kommune || KOMMUNEFORMER.has(v.form));
}

/** Det som faktureres ved booking, eks. mva: fast pris for oppsettsdagen, ellers grunnhonoraret. */
function forskudd(t) {
  return t.fast ?? t.grunn;
}

async function sprintRute(request, env, url, del) {
  if (del === "ledige" && request.method === "GET") return await sprintLedige(env, url);
  if (del === "book" && request.method === "POST") return await sprintBook(request, env);
  // Fra kortbetalingen som er borte: sider som står åpne fra før, får et rolig svar.
  if (del === "avbryt" && request.method === "POST") return json({ ok: true });
  if (del === "kvittering" && request.method === "GET") return flyttet();
  if (del === "ics" && request.method === "GET") return await sprintIcsSvar(env, url);
  if (del === "sperr" && request.method === "POST") return await sprintSperr(request, env);
  return json({ feil: "Finnes ikke." }, 404);
}

/** GET ?tilbud=oppsett|kort|sprint → ledige startdager. Varigheten følger tilbudet, ikke virksomheten. */
async function sprintLedige(env, url) {
  const id = url.searchParams.get("tilbud") || "sprint";
  const dager = { oppsett: 1, kort: 5, sprint: 10 }[id];
  if (!dager) return json({ feil: "Ukjent tilbud." }, 400);
  return json({ dager, ...(await ledigeStarter(env, { id, dager }, url.searchParams.get("reise") === "1")) });
}

function tidTekst(start, slutt) {
  return start === slutt ? datoTekst(start) : `${datoTekst(start)}–${datoTekst(slutt)}`;
}

/** Hva som er bestilt, til bestillingen og e-posten til eieren. */
function sprintBeskrivelse(t, firma, orgnr, start, slutt) {
  const hos = `hos ${firma} (org.nr ${orgnrTekst(orgnr)}), ${tidTekst(start, slutt)}.`;
  if (t.id === "oppsett") return `Oppsettsdag for Klart ${hos} Fast pris. ${OPPSETT_INNHOLD}`;
  return (
    `Grunnhonorar for ${t.id === "kort" ? "kort sprint" : "sprint"} (${t.dager} dager) med Klart ${hos} ` +
    `Grunnhonoraret beholdes. Resten (${kroner(t.total - t.grunn)} eks. mva) faktureres bare hvis suksesskriteriet er nådd, ` +
    `ellers faller den bort. ${SPRINT_KRITERIER}`
  );
}

async function sprintBook(request, env) {
  const p = priser(env);
  if (!p || !kjopApent(env)) return json({ feil: "Booking er ikke åpnet ennå." }, 503);
  const inn = await body(request);
  if (inn.nettside) return json({ feil: "Noe gikk galt." }, 400);
  const navn = tekstFra(inn.navn, 120);
  const epost = epostFra(inn.epost);
  const orgnr = orgnrFra(inn.orgnr);
  const start = ISO_DAG.test(inn.start || "") ? inn.start : null;
  if (!orgnr) return json({ feil: "Skriv inn et gyldig organisasjonsnummer." }, 400);
  if (!navn || !epost) return json({ feil: "Skriv inn navn og e-post." }, 400);
  if (!start) return json({ feil: "Velg en dato." }, 400);
  const sted = (await adresser(inn.adresse))[0];
  if (!sted) return json({ feil: "Fant ikke adressen. Gå tilbake og velg den på nytt." }, 400);
  const o = await slaaOppVirksomhet(orgnr);
  if (o.feil) return json({ feil: o.feil }, o.kode);
  if (o.underenhet) return json({ feil: underenhetTekst(o) }, 409);
  const v = o.virksomhet;
  const g = grunnlag(p, o);
  const t = sprintTilbud(p, g).find((x) => x.id === inn.tilbud);
  if (!t) return json({ feil: "Det tilbudet gjelder ikke for denne virksomheten." }, 400);
  const fri = await ledigeStarter(env, t, sted.reise);
  const forespurt = fri.forespurt.includes(start);
  if (!forespurt && !fri.ledige.includes(start)) return json({ feil: "Den datoen er ikke ledig lenger. Velg en annen." }, 409);

  const slutt = sluttFor(start, t.dager);
  const data = {
    ...t,
    navn,
    epost,
    telefon: tekstFra(inn.telefon, 40),
    melding: tekstFra(inn.melding, 3000),
    firma: v.navn,
    adresse: v.adresse,
    mva: v.mva,
    sted: sted.tekst,
    km: sted.km,
    reise: sted.reise,
  };
  // Datoen holdes fra bestillingen («forespurt») til eieren har merket fakturaen som betalt, eller slipper den.
  const h = await lager(env).holdSprint(kalenderType(t.id), start, slutt, null, orgnr, data);
  if (!h) return json({ feil: "Den datoen ble nettopp tatt. Velg en annen." }, 409);
  try {
    const hva = t.id === "oppsett" ? "oppsettsdag" : t.id === "kort" ? "kort sprint" : "sprint";
    const tid = tidTekst(start, slutt);
    const belop = forskudd(t);
    // En sprint over en oppsettsdag: eieren flytter oppsettsdagen før han fakturerer.
    const over = h.forespurt ? (await lager(env).oppsettIPerioden(start, slutt)).map((r) => `${datoTekst(r.start)} (${r.data.firma})`) : [];
    const bestilling = {
      type: "sprint",
      sprint: h.id,
      orgnr,
      navn: v.navn,
      adresse: v.adresse,
      mvaRegistrert: v.mva,
      epost,
      referanse: "",
      // Bookingskjemaet spør ikke om EHF. Eieren ser i katalogen hva de tar imot.
      ehf: null,
      kanEhf: await kanEhf(orgnr),
      beskrivelse: sprintBeskrivelse(t, v.navn, orgnr, start, slutt),
      linjer: [{ tekst: SPRINT_LINJE[t.id], belop }],
      belop,
      dato: idag(),
    };
    const r = await nyBestilling(env, bestilling, {
      emne: `bestillingen av ${hva} er mottatt`,
      kunde: (b) => [
        `Hei ${navn},`,
        ``,
        `takk for bestillingen av ${hva} hos ${v.navn} ${tid}. Datoen er holdt av til dere.`,
        ...(h.forespurt ? [`Det ligger en annen avtale i perioden, som jeg flytter først. Jeg bekrefter datoene før fakturaen sendes.`] : []),
        ``,
        `Bestilling: ${b.ordre}`,
        `${SPRINT_LINJE[t.id]}: ${kroner(belop)} eks. mva, ${kroner(inklMva(belop))} inkl. 25 % mva.`,
        ...(t.id === "oppsett" ? [] : [`Resten, ${kroner(t.total - t.grunn)} eks. mva, faktureres bare hvis suksesskriteriet er nådd. Ellers faller den bort.`]),
        `Fakturaen kommer for seg, med ${FRIST_DAGER} dagers betalingsfrist. Bookingen gjelder når fakturaen er betalt. Da får dere bekreftelsen med kalenderfil.`,
        ``,
        ...stedLinjer(data),
        ``,
        `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`,
        ``,
        `Hilsen Esbjug Consult`,
      ],
      eier: (b) => [
        `Hva: ${b.beskrivelse}`,
        `Kontakt: ${navn} <${epost}>${data.telefon ? `, ${data.telefon}` : ""}`,
        `Størrelse: ${t.trinn}`,
        ...(data.sted ? [`Sted: ${data.sted} (${data.km} km)${data.reise ? ". Reisedag dagen før, den er holdt av i kalenderen." : "."}`] : []),
        ...(h.forespurt ? [`NB: Det ligger en oppsettsdag i perioden: ${over.join(", ") || "se kalenderen"}. Flytt den før du fakturerer.`] : []),
        `Melding: ${data.melding || "(ingen)"}`,
      ],
      naarBetalt: `Datoen er holdt av i kalenderen. Åpne denne lenken når fakturaen er betalt (da bookes datoen og kunden får bekreftelsen med kalenderfil), eller for å slippe datoen:`,
    });
    return json({ bestilt: true, ordre: r.ordre, start, slutt, epost, belop, belopInkl: inklMva(belop), frist: FRIST_DAGER, flyttes: Boolean(h.forespurt) });
  } catch (err) {
    await lager(env).fjernSperring(h.id);
    throw err;
  }
}

/** Sted og reise i e-postene. Gamle bookinger har ikke sted. */
function stedLinjer(d) {
  if (!d.sted) return [];
  return [`Sted: ${d.sted}.`, d.reise ? "Jeg reiser dagen før. Reise og hotell ordner og dekker jeg selv." : "Reise ordner og dekker jeg selv."];
}

/** Eldre kortbetalinger (webhooken): datoen er booket, og begge får bekreftelse med kalenderfil én gang. */
async function sprintBetalt(env, okt) {
  if (okt.status !== "complete" || okt.payment_status !== "paid") return null;
  const epost = (okt.customer_details?.email || okt.customer_email || "").toLowerCase();
  const r = await lager(env).betalSprint(okt.id, epost);
  if (!r) return null;
  if (r.ny) await sprintBekreftelse(env, r.rad, epost, `Stripe: ${okt.id}`, sendEpost, (ics) => [{ filename: "klart.ics", content: base64(ics) }]);
  return r.rad;
}

/** Bekreftelsen til kunden og eieren når en booking er betalt. «send» er e-postutsendingen, «vedleggFra» lager
    vedlegget slik den vil ha det. */
async function sprintBekreftelse(env, rad, epost, sporing, send, vedleggFra) {
  const r = { rad };
  {
    const d = r.rad.data;
    const vedlegg = vedleggFra(sprintIcs(r.rad));
    const tid = tidTekst(r.rad.start, r.rad.slutt);
    const mottaker = d.epost || epost;
    const hva = d.id === "oppsett" ? "Oppsettsdagen" : d.id === "kort" ? "Den korte sprinten" : "Sprinten";
    // En kort sprint innen tre måneder etter en betalt oppsettsdag: de 35 000 trekkes fra resten.
    const fradrag = d.id === "kort" ? await lager(env).oppsettBetalt(r.rad.orgnr, omDager(-OPPSETT_FRADRAG_DAGER)) : null;
    const linjer =
      d.id === "oppsett"
        ? [
            `${hva} hos ${d.firma} er booket ${tid}. ${kroner(d.fast)} eks. mva er betalt.`,
            "",
            OPPSETT_INNHOLD,
            "",
            "Jeg sender sjekklisten før dagen. Datoen kan i sjeldne tilfeller flyttes etter avtale; da får dere 10 % avslag.",
            "Bookes en kort sprint innen tre måneder, trekkes oppsettsdagen fra.",
          ]
        : [
            `${hva} hos ${d.firma} er booket ${tid} (${d.dager} dager). Grunnhonoraret på ${kroner(d.grunn)} eks. mva er betalt og beholdes.`,
            `Resten, ${kroner(d.total - d.grunn)} eks. mva, faktureres bare hvis suksesskriteriet er nådd. Ellers faller den bort.` +
              (fradrag ? ` Oppsettsdagen dere hadde ${datoTekst(fradrag.start)}, ${kroner(fradrag.data.fast)}, trekkes fra.` : ""),
            ...(d.id === "kort"
              ? [`Dag 1 er oppsettsdagen. Nås ikke kriteriet innen 5 dager, kan sprinten utvides til 10 dager mot at dere betaler differansen opp til ${kroner(d.utvidetTotal)} eks. mva.`]
              : []),
            "",
            SPRINT_KRITERIER,
            "",
            "Dere stiller med et arbeidsrom hos dere der jeg kan jobbe uforstyrret, 12–14 timer om dagen.",
            "Jeg tar kontakt for å avtale hvordan et renset dokument skal se ut, skriftlig før dag én.",
          ];
    await send(env, {
      til: mottaker,
      emne: `Klart: ${hva.toLowerCase()} er booket ${tid}`,
      tekst: [`Hei ${d.navn},`, "", ...linjer, "", ...stedLinjer(d), "", "Kalenderfilen ligger vedlagt.", "", "Hilsen Esbjug Consult"].join("\n"),
      vedlegg,
    });
    await send(env, {
      til: EIER,
      svarTil: mottaker,
      emne: `Klart: ${hva.toLowerCase()} booket hos ${d.firma}, ${tid}`,
      tekst: [
        `${d.navn} <${mottaker}>${d.telefon ? `, ${d.telefon}` : ""}`,
        `${d.firma}, org.nr ${orgnrTekst(r.rad.orgnr)}, ${d.trinn}`,
        ...(d.sted ? [`Sted: ${d.sted} (${d.km} km)${d.reise ? ". Reisedag dagen før, den er holdt av i kalenderen." : "."}`] : []),
        d.id === "oppsett"
          ? `Oppsettsdag betalt: ${kroner(d.fast)} eks. mva.`
          : `Grunnhonorar betalt (beholdes): ${kroner(d.grunn)} eks. mva. Resten ved nådd kriterium: ${kroner(d.total - d.grunn)} eks. mva.`,
        fradrag ? `Trekk fra oppsettsdagen ${datoTekst(fradrag.start)}: ${kroner(fradrag.data.fast)}.` : "",
        sporing,
        "",
        d.melding || "(ingen melding)",
      ].join("\n"),
      vedlegg,
    });
  }
}

function base64(tekst) {
  let bin = "";
  for (const b of new TextEncoder().encode(tekst)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function icsDag(iso) {
  return iso.replace(/-/g, "");
}

function sprintIcs(rad) {
  const tekst = (t) => String(t).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const d = rad.data;
  const hva = d.id === "oppsett" ? "Klart-oppsettsdag" : d.id === "kort" ? "Kort Klart-sprint" : "Klart-sprint";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Esbjug Consult//Klart//NO",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:klart-sprint-${rad.id}@esbjugconsult.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${icsDag(rad.start)}`,
    `DTEND;VALUE=DATE:${icsDag(omDager(1, Date.parse(`${rad.slutt}T00:00:00Z`)))}`,
    `SUMMARY:${tekst(`${hva} hos ${d.firma}`)}`,
    ...(d.sted ? [`LOCATION:${tekst(d.sted)}`] : []),
    `DESCRIPTION:${tekst(`Med Esbjug Consult, ${d.dager || 10} ${d.dager === 1 ? "dag" : "dager"}. Kontakt: ${EIER}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

async function sprintIcsSvar(env, url) {
  const id = url.searchParams.get("session") || "";
  const rad = OKT_ID.test(id) ? await lager(env).sprintForOkt(id) : null;
  if (!rad || rad.status !== "betalt") return json({ feil: "Fant ikke bookingen." }, 404);
  return new Response(sprintIcs(rad), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="klart.ics"',
      "cache-control": "no-store",
    },
  });
}

/** Eieren sperrer dager i kalenderen ({ fra, til }), eller fjerner en sperring eller forespørsel ({ fjern: id }). */
async function sprintSperr(request, env) {
  const hode = request.headers.get("authorization") || "";
  const ventet = `Bearer ${env.ADMIN_TOKEN || ""}`;
  if (!env.ADMIN_TOKEN || hode.length !== ventet.length || !likt(hode, ventet)) return json({ feil: "Ikke tilgang." }, 401);
  const inn = await body(request);
  if (inn.fjern) {
    await lager(env).fjernSperring(Number(inn.fjern));
  } else {
    if (!ISO_DAG.test(inn.fra || "") || !ISO_DAG.test(inn.til || "") || inn.til < inn.fra) {
      return json({ feil: "fra og til må være datoer (ÅÅÅÅ-MM-DD), og til kan ikke være før fra." }, 400);
    }
    await lager(env).sperrSprint(inn.fra, inn.til, tekstFra(inn.notat, 200));
  }
  return json({ sprinter: await lager(env).sprinter() });
}

async function utboks(request, env) {
  const hode = request.headers.get("authorization") || "";
  const ventet = `Bearer ${env.ADMIN_TOKEN || ""}`;
  if (!env.ADMIN_TOKEN || hode.length !== ventet.length || !likt(hode, ventet)) return json({ feil: "Ikke tilgang." }, 401);
  const l = lager(env);
  return json({ eposter: await l.utboks(), henvendelser: await l.henvendelser(), sprinter: await l.sprinter() });
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
  // En fireårslisens betalt per år har fast pris i hele perioden: bare et varsel om neste betaling.
  if (m.fire_aar) {
    const til = abo.customer?.email;
    if (!til) return;
    const belop = abo.items.data.reduce((s, item) => s + item.price.unit_amount * (item.quantity || 1), 0) / 100;
    await sendEpost(env, {
      til,
      emne: `Klart: neste årlige betaling ${datoTekst(dato(periodeSlutt(abo) * 1000))}`,
      tekst: [
        "Hei,",
        "",
        `neste årlige betaling for lisensen til Klart for ${m.company_name} (org.nr ${orgnrTekst(m.orgnr)}) er ${datoTekst(dato(periodeSlutt(abo) * 1000))}: ${kroner(belop)}, eks. mva. Det er ingen binding.`,
        "",
        "Når betalingen er gjort, kommer en ny lisensnøkkel på e-post.",
        "",
        `Spørsmål? Svar på denne e-posten, eller skriv til ${EIER}.`,
        "",
        "Klart",
      ].join("\n"),
    });
    return;
  }
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
    const g = grunnlag(p, o);
    let belop = (leverandor ? kundepris(p, g.v, g.regnskap) : lisenspris(p, g.v, g.regnskap).pris) * 100;
    if (m.betaling === "avdrag") belop = Math.round(belop / 4);
    // Regnskapet endrer seg hvert år. Prisen kan gå ned så mye den skal, men opp med høyst 25 % per fornyelse.
    belop = fornyetBelop(p, item.price.unit_amount, belop);
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
      const l = lisenspris(p, g.v, g.regnskap);
      const ny = {
        tier: prisgrunnlag(l, g),
        sector: l.sektor ? l.sektor.id : "",
        employees_at_renewal: String(v.ansatte),
        document_workers: String(l.ansatte),
        value_factor: l.faktor.toFixed(2),
        accounts_year: g.regnskap ? g.regnskap.aar : "",
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
        : `Ny pris fra fornyelsen: ${kroner(perAar(etter))} per år, eks. mva (i dag ${kroner(perAar(foer))}). Prisen følger det som er registrert om virksomheten i Brønnøysundregistrene.`,
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

/** Bare for e-postene fra webhooken (eldre kjøp gjennom Stripe). Alt annet går med klartEpost.
    Havner i utboksen i lageret. Med RESEND_API_KEY og KLART_EPOST_FRA sendes det også. */
async function sendEpost(env, { til, emne, tekst, svarTil, vedlegg }) {
  const id = await lager(env).iUtboks(til, emne, tekst);
  if (!env.RESEND_API_KEY || !env.KLART_EPOST_FRA) return;
  const svar = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `klart-utboks-${id}`,
    },
    body: JSON.stringify({
      from: env.KLART_EPOST_FRA,
      to: [til],
      subject: emne,
      text: tekst,
      reply_to: svarTil || EIER,
      ...(vedlegg ? { attachments: vedlegg } : {}),
    }),
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
      // Kjøp fra prissiden har license_type, sprinten har sprint. De gamle, maskinbundne kjøpene har ingen av dem.
      if (obj.metadata?.sprint) await sprintBetalt(env, obj);
      else if (obj.metadata?.license_type) await ordreFullfort(env, obj);
      else await lisensFraOkt(env, obj);
      break;
    case "checkout.session.expired":
      if (obj.metadata?.sprint) await lager(env).slippOkt(obj.id);
      break;
    case "invoice.paid": {
      const aboId = aboFra(obj);
      if (aboId) {
        const abo = await stripe(env, "GET", `subscriptions/${aboId}`);
        await lager(env).settUtloper(abo.id, utloperFor(abo), "aktiv");
        // Ny nøkkel når en periode er betalt, med kort eller faktura.
        if (abo.metadata?.license_type) {
          await sendNokkel(env, await orgLisens(env, abo, abo.metadata.nokkel_epost || obj.customer_email));
        }
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
    // FrostCopy: bestillinger på faktura. id er løpenummeret fakturanummeret lages av (FC-1001, FC-1002 …).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS us_ordrer (
      id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, laget TEXT, betalt TEXT, utloper TEXT)`);
    // Alles Klar: bestillinger på faktura i euro. id er løpenummeret fakturanummeret lages av (AK-1001, AK-1002 …).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS de_ordrer (
      id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, laget TEXT, betalt TEXT, utloper TEXT)`);
    // De andre utgavene (handleUtgave): alle i én tabell. Løpenummeret deles, prefikset (UK-, CC- …) er utgavens.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS utgave_ordrer (
      id INTEGER PRIMARY KEY AUTOINCREMENT, utgave TEXT, data TEXT, laget TEXT, betalt TEXT, utloper TEXT)`);
    // Klart: bestillinger på faktura. id er løpenummeret bestillingsnummeret lages av (K-1001, K-1002 …).
    // «betalt» settes når eieren har merket bestillingen som ferdig, «utfall» sier hva som da skjedde.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ordrer (
      id INTEGER PRIMARY KEY AUTOINCREMENT, orgnr TEXT, data TEXT, laget TEXT, betalt TEXT, utloper TEXT, utfall TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS henvendelser (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hva TEXT, data TEXT, laget TEXT)`);
    // Kalenderen for oppsett og sprinter: status «forespurt» (bestilt på faktura, venter på at eieren merker
    // den som betalt), «betalt», «sperret» (eieren kan ikke), og «holdt» (fra kortbetalingen som er borte).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sprinter (
      id INTEGER PRIMARY KEY AUTOINCREMENT, start TEXT, slutt TEXT, status TEXT, holdt_til TEXT,
      okt TEXT, orgnr TEXT, epost TEXT, data TEXT, laget TEXT, betalt TEXT)`);
    // «type» kom med oppsettsdagen: «oppsett» eller «sprint» (kort og full). Rader fra før er sprinter.
    const sprintKolonner = this.sql.exec(`PRAGMA table_info(sprinter)`).toArray().map((k) => k.name);
    if (!sprintKolonner.includes("type")) this.sql.exec(`ALTER TABLE sprinter ADD COLUMN type TEXT DEFAULT 'sprint'`);
    // Fireårslisenser til kommuner og delene av dem: hele beløpet eks. mva per kjøp, på kommunen («rot»),
    // så det trekkes fra når andre i samme kommune kjøper.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kommunekjop (
      id TEXT PRIMARY KEY, rot TEXT, orgnr TEXT, belop INTEGER, til TEXT, laget TEXT)`);
  }

  nyttKommunekjop(id, rot, orgnr, belop, til) {
    this.sql.exec(
      `INSERT OR IGNORE INTO kommunekjop (id, rot, orgnr, belop, til, laget) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      rot,
      orgnr,
      belop,
      til,
      new Date().toISOString()
    );
  }

  /** Kjøp i kommunen som gjelder på dagen: summen, om kommunen selv har kjøpt, og om org.nr har. */
  kommunekjop(rot, orgnr, dag) {
    const rader = this.sql.exec(`SELECT orgnr, belop, til FROM kommunekjop WHERE rot = ? AND til >= ?`, rot, dag).toArray();
    return {
      betalt: rader.reduce((s, r) => s + r.belop, 0),
      forsteSlutt: rader.map((r) => r.til).sort()[0] || null,
      rotHar: rader.some((r) => r.orgnr === rot),
      egen: rader.some((r) => r.orgnr === orgnr),
    };
  }

  /** Bookinger og sperringer som overlapper fra–til. Holdte datoer bare til de går ut. */
  sprintOpptatt(fra, til, na) {
    return this.sql
      .exec(
        `SELECT id, type, start, slutt, status, data FROM sprinter WHERE start <= ? AND slutt >= ?
         AND (status IN ('betalt', 'sperret', 'forespurt') OR (status = 'holdt' AND holdt_til > ?))`,
        omDager(1, Date.parse(`${til}T00:00:00Z`)), // en reisedag kan ligge dagen før starten
        fra,
        na
      )
      .toArray()
      .map(({ data, ...r }) => ({ ...r, reise: Boolean(JSON.parse(data || "{}").reise) }));
  }

  /** Holder datoen hvis kalenderen tillater det (ledigFor). Sjekk og innsetting i samme kall, så to kan ikke
      få samme dag. Uten «holdtTil» (bestilling på faktura) lagres den som «forespurt» og holdes til eieren
      booker eller slipper den. { id, forespurt } eller null; forespurt = en oppsettsdag ligger i perioden. */
  holdSprint(type, start, slutt, holdtTil, orgnr, data) {
    const fra = data.reise ? forrigeDag(start) : start;
    const l = ledigFor(this.sprintOpptatt(fra, slutt, new Date().toISOString()), type, fra, slutt);
    if (!l.ok) return null;
    const id = this.sql
      .exec(
        `INSERT INTO sprinter (type, start, slutt, status, holdt_til, orgnr, data, laget) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        type,
        start,
        slutt,
        l.forespurt || !holdtTil ? "forespurt" : "holdt",
        l.forespurt ? null : holdtTil,
        orgnr,
        JSON.stringify(data),
        new Date().toISOString()
      )
      .one().id;
    return { id, forespurt: l.forespurt };
  }

  /** Oppsettsdagene (betalte eller bestilte) i perioden: de eieren må flytte før han fakturerer en sprint over dem. */
  oppsettIPerioden(fra, til) {
    return this.sql
      .exec(`SELECT * FROM sprinter WHERE type = 'oppsett' AND status IN ('betalt', 'holdt', 'forespurt') AND start <= ? AND slutt >= ?`, til, fra)
      .toArray()
      .map((r) => ({ ...r, data: JSON.parse(r.data || "{}") }));
  }

  /** Siste betalte oppsettsdag for org.nr fra og med datoen «fra», eller null. */
  oppsettBetalt(orgnr, fra) {
    const r = this.sql
      .exec(`SELECT * FROM sprinter WHERE type = 'oppsett' AND status = 'betalt' AND orgnr = ? AND start >= ? ORDER BY start DESC`, orgnr, fra)
      .toArray()[0];
    return r ? { ...r, data: JSON.parse(r.data || "{}") } : null;
  }

  sprintRad(id) {
    const r = this.sql.exec(`SELECT * FROM sprinter WHERE id = ?`, id).toArray()[0];
    return r ? { ...r, data: JSON.parse(r.data || "{}") } : null;
  }

  sprintOkt(id, okt) {
    this.sql.exec(`UPDATE sprinter SET okt = ? WHERE id = ?`, okt, id);
  }

  slippSprint(id) {
    this.sql.exec(`DELETE FROM sprinter WHERE id = ? AND status = 'holdt'`, id);
  }

  slippOkt(okt) {
    this.sql.exec(`DELETE FROM sprinter WHERE okt = ? AND status = 'holdt'`, okt);
  }

  sprintForOkt(okt) {
    const r = this.sql.exec(`SELECT * FROM sprinter WHERE okt = ?`, okt).toArray()[0];
    return r ? { ...r, data: JSON.parse(r.data || "{}") } : null;
  }

  /** Booker datoen for en betalt økt. «ny» er true bare første gang, så bekreftelsen sendes én gang. */
  betalSprint(okt, epost) {
    const r = this.sprintForOkt(okt);
    if (!r) return null;
    if (r.status === "betalt") return { rad: r, ny: false };
    this.sql.exec(
      `UPDATE sprinter SET status = 'betalt', epost = ?, betalt = ? WHERE id = ?`,
      epost || null,
      new Date().toISOString(),
      r.id
    );
    return { rad: this.sprintForOkt(okt), ny: true };
  }

  /** Booker en bestilt dato når fakturaen er betalt. «ny» er true bare første gang. */
  betalSprintId(id, epost) {
    const r = this.sprintRad(id);
    if (!r || r.status === "sperret") return null;
    if (r.status === "betalt") return { rad: r, ny: false };
    this.sql.exec(`UPDATE sprinter SET status = 'betalt', epost = ?, betalt = ? WHERE id = ?`, epost || null, new Date().toISOString(), id);
    return { rad: this.sprintRad(id), ny: true };
  }

  sperrSprint(fra, til, notat) {
    this.sql.exec(
      `INSERT INTO sprinter (type, start, slutt, status, data, laget) VALUES ('sperret', ?, ?, 'sperret', ?, ?)`,
      fra,
      til,
      JSON.stringify({ notat }),
      new Date().toISOString()
    );
  }

  fjernSperring(id) {
    this.sql.exec(`DELETE FROM sprinter WHERE id = ? AND status IN ('sperret', 'forespurt')`, id);
  }

  sprinter() {
    return this.sql
      .exec(`SELECT * FROM sprinter WHERE status != 'holdt' OR holdt_til > ? ORDER BY start`, new Date().toISOString())
      .toArray()
      .map((r) => ({ ...r, data: JSON.parse(r.data || "{}") }));
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

  usNyOrdre(data) {
    return this.sql.exec(`INSERT INTO us_ordrer (data, laget) VALUES (?, ?) RETURNING id`, JSON.stringify(data), new Date().toISOString()).one().id;
  }
  usOppdater(id, data) {
    this.sql.exec(`UPDATE us_ordrer SET data = ? WHERE id = ?`, JSON.stringify(data), id);
  }
  usOrdre(id) {
    const r = this.sql.exec(`SELECT data, laget, betalt, utloper FROM us_ordrer WHERE id = ?`, id).toArray()[0];
    return r ? { data: JSON.parse(r.data), laget: r.laget, betalt: r.betalt, utloper: r.utloper } : null;
  }
  usMerkBetalt(id, utloper) {
    this.sql.exec(`UPDATE us_ordrer SET betalt = ?, utloper = ? WHERE id = ?`, new Date().toISOString(), utloper, id);
  }
  utNyOrdre(utgave, data) {
    return this.sql.exec(`INSERT INTO utgave_ordrer (utgave, data, laget) VALUES (?, ?, ?) RETURNING id`, utgave, JSON.stringify(data), new Date().toISOString()).one().id;
  }
  utOppdater(id, data) {
    this.sql.exec(`UPDATE utgave_ordrer SET data = ? WHERE id = ?`, JSON.stringify(data), id);
  }
  utOrdre(id) {
    const r = this.sql.exec(`SELECT utgave, data, laget, betalt, utloper FROM utgave_ordrer WHERE id = ?`, id).toArray()[0];
    return r ? { utgave: r.utgave, data: JSON.parse(r.data), laget: r.laget, betalt: r.betalt, utloper: r.utloper } : null;
  }
  utMerkBetalt(id, utloper) {
    this.sql.exec(`UPDATE utgave_ordrer SET betalt = ?, utloper = ? WHERE id = ?`, new Date().toISOString(), utloper, id);
  }
  deNyOrdre(data) {
    return this.sql.exec(`INSERT INTO de_ordrer (data, laget) VALUES (?, ?) RETURNING id`, JSON.stringify(data), new Date().toISOString()).one().id;
  }
  deOppdater(id, data) {
    this.sql.exec(`UPDATE de_ordrer SET data = ? WHERE id = ?`, JSON.stringify(data), id);
  }
  deOrdre(id) {
    const r = this.sql.exec(`SELECT data, laget, betalt, utloper FROM de_ordrer WHERE id = ?`, id).toArray()[0];
    return r ? { data: JSON.parse(r.data), laget: r.laget, betalt: r.betalt, utloper: r.utloper } : null;
  }
  deMerkBetalt(id, utloper) {
    this.sql.exec(`UPDATE de_ordrer SET betalt = ?, utloper = ? WHERE id = ?`, new Date().toISOString(), utloper, id);
  }
  nyOrdre(orgnr, data) {
    return this.sql.exec(`INSERT INTO ordrer (orgnr, data, laget) VALUES (?, ?, ?) RETURNING id`, orgnr, JSON.stringify(data), new Date().toISOString()).one().id;
  }
  oppdaterOrdre(id, data) {
    this.sql.exec(`UPDATE ordrer SET data = ? WHERE id = ?`, JSON.stringify(data), id);
  }
  ordre(id) {
    const r = this.sql.exec(`SELECT data, laget, betalt, utloper, utfall FROM ordrer WHERE id = ?`, id).toArray()[0];
    return r ? { ...r, data: JSON.parse(r.data) } : null;
  }
  merkOrdreBetalt(id, utloper, utfall) {
    this.sql.exec(`UPDATE ordrer SET betalt = ?, utloper = ?, utfall = ? WHERE id = ?`, new Date().toISOString(), utloper, utfall, id);
  }
  /** Bestillingene for et org.nr som er betalt og gjelder ennå (kundene på en leverandørlisens). */
  betalteOrdrer(orgnr) {
    return this.sql
      .exec(`SELECT data FROM ordrer WHERE orgnr = ? AND betalt IS NOT NULL AND utloper >= ?`, orgnr, idag())
      .toArray()
      .map((r) => ({ data: JSON.parse(r.data) }));
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
