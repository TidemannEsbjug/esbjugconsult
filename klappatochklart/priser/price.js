// The price of Klappat och Klart in Swedish kronor, excluding VAT (exkl. moms). One file, used both by the page (the
// price appears as you type) and by the server (/klappatochklart/api/order, via .worker/utgaver/se.js), which works it
// out again and decides what goes on the invoice. Only the price is ever shown, never how it is worked out (the owner,
// 20.11.2026).
//
// The owner has not set these prices. Choices made when the Swedish site was built (26.11.2026):
//
//   business   Firms, law offices (advokatbyråer), accountants, practices, foundations and associations: people and
//              sector, price per year. The same curve and sector shares as Alles Klar (alles-klar/pris/preis.js),
//              converted at about 11.5 kr to 1 € and rounded to nice numbers (solo: 260 € → 2 990 kr).
//              Note: Klart-se-grunnlag/research/132 §6 proposed 3 900 kr per user per year and a 14 900 kr pack up
//              to 5 users. This file follows the brief (German curve × 11.5); the owner decides.
//   municipal  Kommuner and regioner: population. The curve gives the total for four years, straight lines between
//              the points, flat at 19 900 kr up to 2 000 people and capped at 590 000 kr from 250 000 people. One
//              year, a quarter of it, is ordered and invoiced at a time (as Alles Klar).
//              Threshold used: direktupphandling is allowed when the value is below 700 000 kr (LOU 2016:1145,
//              19 a kap. 2 §, a fixed amount since 1 Feb 2022, unchanged for 2026), and the whole four-year value
//              counts (5 kap. 3 §). 590 000 kr leaves 110 000 kr for the buyer's own extras (research/132 §6).
//              Up to about 15 000 people the four years stay at or under 99 000 kr, below the 100 000 kr line where
//              most riktlinjer for direktupphandling ask for three written quotes and documentation (19 a kap. 11 §).
//   state      Statliga myndigheter, courts, länsstyrelser, universities: staff, price per year. 19 900 kr + 180 kr
//              per member of staff (the German 16 € per head × 11.5), at most 119 900 kr a year, so four years
//              (479 600 kr) also stay under the 700 000 kr line.
//
// The invoice carries no Swedish VAT for VAT-registered buyers: omvänd betalningsskyldighet (mervärdesskattelagen
// 2023:200, 16 kap. 9 §; art. 196 of directive 2006/112/EC), so every amount here is a net price. Open (research/132):
// public buyers require e-invoices (lag 2018:1277, Peppol), and withholding tax on licence fees should be confirmed.
export const SOLO = 2990;
const CURVE = [[1, 5100], [2, 6000], [6, 15000], [23, 45000], [113, 120000], [500, 250000], [2000, 450000]];
// Municipalities and regions: a straight line between the points, flat below the first and above the last one.
// The same points are in the table on the page (priser/index.html).
export const MUNICIPAL = [[2000, 19900], [5000, 49000], [15000, 99000], [30000, 199000], [60000, 349000], [120000, 490000], [250000, 590000]];
const STATE = { base: 19900, perHead: 180, max: 119900 };
export const MAX_COUNT = 100000000;
// The share of the people that is counted. A third number is a factor on the price.
export const SECTORS = [
  ["Advokatbyrå, juristbyrå eller notarie", 1], ["Skatterådgivning, revision eller redovisning", 1],
  ["Bank, finans eller försäkring", 1], ["Rekrytering eller HR-tjänster", 1],
  ["Konsult, it eller annat kontorsarbete", 1], ["Fastigheter", 1], ["Förening, förbund eller stiftelse", 1],
  ["Hälso- och sjukvård", 0.4], ["Skola och utbildning", 0.4], ["Omsorg och socialt arbete", 0.4],
  ["Flyg", 0.3, 1.5], ["Detaljhandel", 0.2],
  ["Bygg och hantverk", 0.15], ["Industri och tillverkning", 0.15], ["Transport och lager", 0.15],
  ["Jordbruk, skogsbruk eller fiske", 0.15], ["Gruvdrift", 0.15], ["Energi, vatten och avfall", 0.15], ["Bilverkstad", 0.15],
  ["Hotell och restaurang", 0.1], ["Bevakning och säkerhet", 0.1], ["Städning och fastighetsskötsel", 0.1],
  ["Bemanningsföretag", 0.05],
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

/** { price (whole kronor a year, excl. VAT), art, and by kind: persons and sector (its display name), inhabitants and
    fourYears, or employees }, or null for bad input. */
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
