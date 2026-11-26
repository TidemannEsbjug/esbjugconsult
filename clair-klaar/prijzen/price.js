// The price of Clair & Klaar (Belgian edition) in euros, excluding VAT. One file, used by both price pages
// (clair-klaar/prijzen/ in Dutch and clair-klaar/fr/prix/ in French; the price appears as you type) and by the server
// (/clair-klaar/api/order, via .worker/utgaver/be.js), which works it out again and decides what goes on the invoice.
// Only the price is ever shown, never how it is worked out (the owner, 20.11.2026).
//
// The owner has not set these prices. Choices made when the Belgian site was built (26.11.2026), from
// lokalisering/grunnlag/Klart-be-grunnlag/research/162-be-marked.md:
//
//   The line that matters: one national rule for every public buyer (wet van 17 juni 2016 inzake overheidsopdrachten /
//   loi du 17 juin 2016 relative aux marchés publics, KB plaatsing 18.04.2017). Below € 30 000 excl. VAT, estimated
//   over the whole term (renewals included), a public buyer may buy on an accepted invoice: "opdracht van beperkte
//   waarde / marché de faible montant" (art. 92). THE VALUE USED HERE IS € 30 000 excl. VAT (the threshold in force
//   on 26.11.2026). Bill 1785/01 (filed 09.10.2026, not passed) would raise it to € 75 000; nothing here assumes that.
//   Every public price stays at or under € 29 500 for four years.
//
//   business   Businesses, law firms, practices, non-profits: people and sector, price per year. The same curve and
//              sector shares as Alles Klar (alles-klar/pris/preis.js) and Klip en Klaar, in euros; sector names in
//              Dutch (SECTORS) and French (SECTEURS_FR, same order).
//   municipal  Gemeenten / communes (with their OCMW / CPAS): inhabitants. The curve gives the total for four years;
//              one year, a quarter of it, is ordered and invoiced at a time (as Alles Klar). The points sit on the
//              bands in note 162 §6 (2 900 / 4 900 / 12 900 / 24 900 / 29 500): € 2 900 up to 2 000 inhabitants,
//              € 4 900 at 20 000 (a typical Flemish or Walloon commune), € 12 900 at 50 000, € 24 900 at 100 000,
//              € 29 500 at 200 000 and above (Antwerpen, Gent, Charleroi, Liège, Brussel). A straight line between.
//   state      Federal, regional and community bodies (FOD/SPF, agencies), provinces, police zones, courts and other
//              public bodies: staff, price per year. € 3 000 + € 10 per member of staff, at most € 7 350 a year, so
//              that four years of renewals come to € 29 400, under the € 30 000 line.
//
// The invoice carries no Belgian VAT (verlegging van heffing / autoliquidation, art. 51 § 2, 1° WBTW / CTVA;
// art. 196 directive 2006/112/EC), so every amount here is a net price.
//
// `lang: "fr"` (optional) gives the French sector name in the result; anything else gives the Dutch one.
export const SOLO = 260;
const CURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Gemeenten / communes: a straight line between the points, flat above the last one. Total for four years.
// The same points are in the table on both price pages.
export const MUNICIPAL = [[2000, 2900], [20000, 4900], [50000, 12900], [100000, 24900], [200000, 29500]];
const STATE = { base: 3000, perHead: 10, max: 7350 };
export const MAX_COUNT = 100000000;
// The share of the people that is counted. A third number is a factor on the price.
export const SECTORS = [
  ["Advocatuur of notariaat", 1], ["Boekhouding, fiscaal advies of bedrijfsrevisoren", 1],
  ["Bank, financiën of verzekeringen", 1], ["Werving, selectie of hr-diensten", 1],
  ["Advies, ict of ander kantoorwerk", 1], ["Vastgoed en makelaardij", 1], ["Vzw, stichting of sociale huisvesting", 1],
  ["Zorg", 0.4], ["Onderwijs", 0.4], ["Welzijn, jeugdhulp en maatschappelijke dienstverlening", 0.4],
  ["Luchtvaart", 0.3, 1.5], ["Detailhandel", 0.2],
  ["Bouw en installatie", 0.15], ["Industrie en productie", 0.15], ["Transport en logistiek", 0.15],
  ["Land- en bosbouw, visserij", 0.15], ["Mijnbouw en delfstoffen", 0.15], ["Energie, water en afval", 0.15], ["Autoherstel", 0.15],
  ["Horeca", 0.1], ["Bewaking en beveiliging", 0.1], ["Schoonmaak en facilitair beheer", 0.1],
  ["Uitzendbureau", 0.05],
];
// The same sectors in French, in the same order (the index is what the form sends).
export const SECTEURS_FR = [
  "Cabinet d’avocats ou étude notariale", "Comptabilité, conseil fiscal ou révisorat",
  "Banque, finance ou assurance", "Recrutement, sélection ou services RH",
  "Conseil, informatique ou autre travail de bureau", "Immobilier", "ASBL, fondation ou logement social",
  "Soins de santé", "Enseignement", "Action sociale, aide à la jeunesse et services sociaux",
  "Aviation", "Commerce de détail",
  "Construction et installation", "Industrie et production", "Transport et logistique",
  "Agriculture, sylviculture, pêche", "Industries extractives", "Énergie, eau et déchets", "Réparation automobile",
  "Horeca", "Gardiennage et sécurité", "Nettoyage et facility management",
  "Agence d’intérim",
];

function loglog(points, x) {
  if (x <= points[0][0]) return points[0][1];
  let i = points.findIndex((p) => p[0] >= x);
  if (i === -1) i = points.length - 1;
  const [x0, y0] = points[i - 1], [x1, y1] = points[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}
function linear(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return points[points.length - 1][1];
}
function round(p) {
  const step = p < 1000 ? 10 : p < 10000 ? 50 : 100;
  return Math.round(p / step) * step;
}
function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= MAX_COUNT ? n : null;
}

/** { price (whole euros a year), art, and by kind: persons and sector (its display name), inhabitants and fourYears,
    or employees }, or null for bad input. */
export function price({ art, persons, sector, inhabitants, employees, lang }) {
  if (art === "municipal") {
    const n = count(inhabitants);
    if (!n) return null;
    const fourYears = Math.round(linear(MUNICIPAL, n) / 100) * 100;
    return { price: Math.round(fourYears / 4), fourYears, art, inhabitants: n };
  }
  if (art === "state") {
    const n = count(employees);
    if (!n) return null;
    const p = Math.min(STATE.max, Math.round((STATE.base + STATE.perHead * n) / 10) * 10);
    return { price: p, art, employees: n };
  }
  if (art !== "business") return null;
  const n = count(persons);
  if (!n) return null;
  if (n === 1) return { price: SOLO, art, persons: 1, sector: null };
  const i = Number(sector);
  const s = Number.isInteger(i) ? SECTORS[i] : undefined;
  if (!s) return null;
  const counted = Math.max(1, n * s[1]);
  const name = lang === "fr" ? SECTEURS_FR[i] : s[0];
  return { price: Math.max(SOLO, round(loglog(CURVE, counted) * (s[2] || 1))), art, persons: n, sector: name };
}
