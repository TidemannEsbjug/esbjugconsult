// The price of Klip en Klaar (Dutch edition) in euros. One file, used both by the page (the price appears as you type)
// and by the server (/klip-en-klaar/api/order, via .worker/utgaver/nl.js), which works it out again and decides what
// goes on the invoice. Only the price is ever shown, never how it is worked out (the owner, 20.11.2026).
//
// The owner has not set these prices. Choices made when the Dutch site was built (24.11.2026), from
// Klart-nl-grunnlag/research/102-nl-market-thresholds.md:
//
//   The line that matters: the Netherlands has no national direct-award ceiling below the EU thresholds. Each buyer's
//   own inkoopbeleid sets it. The Rijk (Circulaire grensbedragen, in force 1 Jan 2025) awards one-to-one up to
//   € 50 000 excl. VAT; published gemeente/provincie/waterschap tables say € 50 000 or € 70 000. A licence is valued
//   over its whole term, options and renewals included (Aanbestedingswet 2012 art. 2.15, 2.17, 2.21), so the four-year
//   total must stay under € 50 000. Every public price here stays at or under € 49 000 for four years.
//
//   business   Businesses, law firms, practices, foundations: people and sector, price per year. The same curve and
//              sector shares as Alles Klar (alles-klar/pris/preis.js), in euros, sector names in Dutch.
//   municipal  Gemeenten: inhabitants. The curve gives the total for four years; one year, a quarter of it, is ordered
//              and invoiced at a time (as Alles Klar). The points sit on the bands from note 102 (4 900 / 12 900 /
//              24 900 / 49 000): € 4 900 up to 1 000 inhabitants, € 12 900 at 20 000, € 24 900 at 50 000, € 49 000 at
//              100 000 and above. Between the points a straight line. Up to 20 000 inhabitants this is close to the
//              German curve; above that it bends down to stay under the € 50 000 line.
//   state      Rijk (ministries, agencies, ZBO's), provincies, waterschappen, courts and other public bodies: staff,
//              price per year. € 3 500 + € 16 per member of staff (as Alles Klar), at most € 12 250 a year, so that
//              four years of renewals come to € 49 000, under the Rijk's € 50 000 one-to-one line.
//              Provincies and waterschappen are here, not under inhabitants: their populations are large but their
//              offices small.
//
// The invoice carries no Dutch VAT (btw verlegd, Wet OB art. 12), so every amount here is a net price.
export const SOLO = 260;
const CURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Gemeenten: a straight line between the points, flat above the last one. The same points are in the table on the page.
export const MUNICIPAL = [[1000, 4900], [20000, 12900], [50000, 24900], [100000, 49000]];
const STATE = { base: 3500, perHead: 16, max: 12250 };
export const MAX_COUNT = 100000000;
// The share of the people that is counted. A third number is a factor on the price.
export const SECTORS = [
  ["Advocatuur of notariaat", 1], ["Belastingadvies, accountancy of administratie", 1],
  ["Bank, financiën of verzekeringen", 1], ["Werving, selectie of hr-diensten", 1],
  ["Advies, ict of ander kantoorwerk", 1], ["Vastgoed en makelaardij", 1], ["Vereniging, stichting of woningcorporatie", 1],
  ["Zorg", 0.4], ["Onderwijs", 0.4], ["Welzijn, jeugdzorg en maatschappelijke dienstverlening", 0.4],
  ["Luchtvaart", 0.3, 1.5], ["Detailhandel", 0.2],
  ["Bouw en installatie", 0.15], ["Industrie en productie", 0.15], ["Transport en logistiek", 0.15],
  ["Land- en bosbouw, visserij", 0.15], ["Mijnbouw en delfstoffen", 0.15], ["Energie, water en afval", 0.15], ["Autoherstel", 0.15],
  ["Horeca", 0.1], ["Beveiliging", 0.1], ["Schoonmaak en facilitair beheer", 0.1],
  ["Uitzendbureau", 0.05],
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
export function price({ art, persons, sector, inhabitants, employees }) {
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
  const s = SECTORS[Number(sector)];
  if (!s) return null;
  const counted = Math.max(1, n * s[1]);
  return { price: Math.max(SOLO, round(loglog(CURVE, counted) * (s[2] || 1))), art, persons: n, sector: s[0] };
}
