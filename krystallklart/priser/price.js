// The price of Krystallklart in Danish kroner, excl. moms. One file, used both by the page (the price appears as you
// type) and by the server (/krystallklart/api/order, via .worker/utgaver/dk.js), which works it out again and decides
// what goes on the invoice. Only the price is ever shown, never how it is worked out (the owner, 20.11.2026).
//
// The owner has not set these prices. Choices made when the Danish site was built (26.11.2026):
//
//   business   Firms, law and accounting offices, clinics and associations: people and sector, price per year.
//              The same curve and sector shares as Alles Klar (alles-klar/pris/preis.js), converted at about
//              7.46 kr. to 1 € and rounded to the nearest 100 kr. (solo: 260 € → 1 900 kr.).
//              Note: Klart-dk-grunnlag/research/142 §6 proposed other business prices (2 900 kr. per user per year,
//              a 9 900 kr. office pack up to 5 users). This file follows the brief (German curve × 7.46); the owner decides.
//   municipal  Kommuner and regioner: population. The curve gives the total for four years, straight lines between
//              the points below (the bands of research/142 §6: 12 900 / 34 900 / 99 000 / 189 000 / 490 000 kr.),
//              flat at 12 900 kr. up to 2 000 people and capped at 490 000 kr. from 300 000 people. One year, a quarter
//              of it, is ordered and invoiced at a time (as Alles Klar).
//              Threshold used: udbudsloven § 11 (lov nr. 1564/2015, LBK nr. 10 af 06/01/2023): the procedure rules
//              (afsnit V) apply to supplies and services only from 500 000 kr. excl. moms, and the whole four-year
//              value counts (§ 30). 490 000 kr. stays under it, so no public buyer needs an udbud or a § 193 market
//              check. Kommuner up to 50 000 people stay at or under 99 000 kr. for four years, below the 100 000 kr.
//              line where municipal purchase rules ask for 2–3 quotes (Albertslund, Lyngby-Taarbæk, Tønder; 142 §4.2).
//              Tilbudsloven covers building works only and does not apply here.
//              Open owner choice (handover DK 25.11, point 4): 490 000 or 365 000 kr. for the top band.
//   state      Ministries, styrelser, courts and other state bodies: staff, price per year. Alles Klar's state line
//              × 7.46 (26 000 kr. + 120 kr. per member of staff), at most 122 500 kr. a year, so that four years
//              (490 000 kr.) also stay under the 500 000 kr. of udbudsloven § 11.
//
// The invoice carries no Danish moms: the buyer accounts for it (omvendt betalingspligt, momsloven § 46, stk. 1, nr. 3),
// so every amount here is a net price. Open (research/142 §5.3): whether each kommune or region is registered for
// buying services from abroad must be checked per buyer.
export const SOLO = 1900;
const CURVE = [[1, 3300], [2, 3900], [6, 9700], [23, 29100], [113, 77600], [500, 161900], [2000, 291700]];
// Kommuner and regioner: a straight line between the points (inhabitants, kroner for four years), flat below the
// first and above the last one. The same points are in the table on the page (priser/index.html).
export const MUNICIPAL = [[2000, 12900], [10000, 34900], [50000, 99000], [100000, 189000], [300000, 490000]];
const STATE = { base: 26000, perHead: 120, max: 122500 };
export const MAX_COUNT = 100000000;
// The share of the people that is counted. A third number is a factor on the price.
export const SECTORS = [
  ["Advokatvirksomhed", 1], ["Revision, skatterådgivning eller bogføring", 1],
  ["Bank, finans eller forsikring", 1], ["Rekruttering eller HR-ydelser", 1],
  ["Rådgivning, IT eller andet kontorarbejde", 1], ["Ejendomme", 1], ["Forening, organisation eller fond", 1],
  ["Sundhed", 0.4], ["Skole og uddannelse", 0.4], ["Pleje og socialt arbejde", 0.4],
  ["Luftfart", 0.3, 1.5], ["Detailhandel", 0.2],
  ["Byggeri og håndværk", 0.15], ["Industri og produktion", 0.15], ["Transport og lager", 0.15],
  ["Landbrug, skovbrug eller fiskeri", 0.15], ["Råstofudvinding", 0.15], ["Energi, vand og affald", 0.15], ["Autoværksted", 0.15],
  ["Hotel og restauration", 0.1], ["Vagt og sikkerhed", 0.1], ["Rengøring og ejendomsservice", 0.1],
  ["Vikarbureau", 0.05],
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
  const step = p < 10000 ? 50 : 100;
  return Math.round(p / step) * step;
}
function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= MAX_COUNT ? n : null;
}

/** { price (whole kroner a year, excl. moms), art, and by kind: persons and sector (its display name), inhabitants and
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
    const p = Math.min(STATE.max, Math.round((STATE.base + STATE.perHead * n) / 100) * 100);
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
