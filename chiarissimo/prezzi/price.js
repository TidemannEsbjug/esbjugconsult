// Prisen for Chiarissimo (den italienske utgaven), i euro uten moms. Én fil som både siden bruker (prisen vises mens
// man skriver, ordine.js) og serveren (/chiarissimo/api/order, .worker/utgaver/it.js), som regner på nytt og bestemmer
// hva som står på fakturaen. Bare prisen vises, aldri regnestykket (eieren 20.11.2026).
//
// Eieren har IKKE satt disse prisene. Valgene (24.11.2026), fra Klart-it-grunnlag/research/82-it-market-thresholds.md:
//   business   Bedrift, studio, praksis eller forening: personer og bransje, pris per år. Samme kurve og bransjeandeler
//              som Alles Klar (alles-klar/pris/preis.js), bransjene oversatt; «Commercialista, CAF …» er lagt til navnet
//              fordi CAF-ene er en egen kjøpergruppe i Italia (82 §6).
//   municipal  Comune, unione di comuni, provincia eller città metropolitana: innbyggere. Kurven gir summen for fire år;
//              det bestilles og faktureres ett år om gangen, en fjerdedel. Punktene er lagt på terskelbåndene i 82 §6:
//              4 900 € ved 5 000 innbyggere (under 5 000 €: unntak fra rotasjon, art. 49 c. 6 d.lgs. 36/2023, og ingen
//              MePA-plikt, l. 296/2006 c. 450), 9 900 € (under skoleledernes egen grense på 10 000 €), 19 900 €,
//              39 000 € ved 150 000 innbyggere (under 40 000 €: bare egenerklæring, art. 52) og tak 139 000 € fra
//              3 millioner (Roma). Hele fireårssummen er alltid under 140 000 €, grensen for affidamento diretto
//              (art. 50 c. 1 lett. b), som ikke har noen tidsgrense; verdien regnes over hele løpetiden (art. 14 c. 4).
//   state      Statlig organ, domstol, universitet, ASL/sykehus, regionalt organ: ansatte, pris per år. 2 900 € + 14 € per
//              ansatt, høyst 9 750 € per år, så fire år er høyst 39 000 €: under 40 000 € selv om kontrakten skrives for
//              fire år. (Staten har ingen egen negotiated-sone: EU-terskelen er også 140 000 €, 82 §3.)
export const ALENE = 260;
const KURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Kommuner: rett linje mellom punktene (innbyggere, euro for fire år), likt over siste punkt.
export const COMUNI = [[1000, 2400], [5000, 4900], [15000, 9900], [50000, 19900], [150000, 39000], [500000, 79000], [3000000, 139000]];
const STATO = { grunn: 2900, perHode: 14, hoyst: 9750 };
export const MAKS_ANTALL = 100000000;
// Andelen av personene som telles. Et tredje tall er en faktor på prisen.
export const SETTORI = [
  ["Studio legale o notarile", 1], ["Commercialista, CAF, revisione o consulenza del lavoro", 1],
  ["Banca, finanza o assicurazioni", 1], ["Selezione o servizi per il personale", 1],
  ["Consulenza, informatica o altro lavoro d'ufficio", 1], ["Immobiliare", 1], ["Associazione, fondazione o ente del terzo settore", 1],
  ["Sanità", 0.4], ["Scuola e formazione", 0.4], ["Assistenza e servizi sociali", 0.4],
  ["Aviazione", 0.3, 1.5], ["Commercio al dettaglio", 0.2],
  ["Edilizia e artigianato", 0.15], ["Industria e manifattura", 0.15], ["Trasporti e logistica", 0.15],
  ["Agricoltura, silvicoltura e pesca", 0.15], ["Attività estrattive", 0.15], ["Energia, acqua e rifiuti", 0.15], ["Autofficina", 0.15],
  ["Alberghi e ristorazione", 0.1], ["Vigilanza e sicurezza", 0.1], ["Pulizie e gestione di immobili", 0.1],
  ["Lavoro interinale", 0.05],
];

function loglog(punkter, x) {
  if (x <= punkter[0][0]) return punkter[0][1];
  let i = punkter.findIndex((p) => p[0] >= x);
  if (i === -1) i = punkter.length - 1;
  const [x0, y0] = punkter[i - 1], [x1, y1] = punkter[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}
function lineaer(punkter, x) {
  if (x <= punkter[0][0]) return punkter[0][1];
  for (let i = 1; i < punkter.length; i++) {
    const a = punkter[i - 1], b = punkter[i];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return punkter[punkter.length - 1][1];
}
function rund(p) {
  const steg = p < 1000 ? 10 : p < 10000 ? 50 : 100;
  return Math.round(p / steg) * steg;
}
function antall(verdi) {
  const n = Math.floor(Number(verdi));
  return Number.isFinite(n) && n >= 1 && n <= MAKS_ANTALL ? n : null;
}

/** { price (hele euro per år), art, og etter art: persons og sector (navnet), inhabitants og fourYears, eller employees },
    eller null ved ugyldige tall. `sector` inn er nummeret i SETTORI. */
export function price({ art, persons, sector, inhabitants, employees }) {
  if (art === "municipal") {
    const n = antall(inhabitants);
    if (!n) return null;
    const fourYears = Math.round(lineaer(COMUNI, n) / 100) * 100;
    return { price: Math.round(fourYears / 4), fourYears, art, inhabitants: n };
  }
  if (art === "state") {
    const n = antall(employees);
    if (!n) return null;
    const p = Math.min(STATO.hoyst, Math.round((STATO.grunn + STATO.perHode * n) / 10) * 10);
    return { price: p, art, employees: n };
  }
  if (art !== "business") return null;
  const n = antall(persons);
  if (!n) return null;
  if (n === 1) return { price: ALENE, art, persons: 1, sector: null };
  const s = SETTORI[Number(sector)];
  if (!s) return null;
  const telt = Math.max(1, n * s[1]);
  return { price: Math.max(ALENE, rund(loglog(KURVE, telt) * (s[2] || 1))), art, persons: n, sector: s[0] };
}
