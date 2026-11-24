// The price of Wszystko Jasne in złoty, net. One file, used both by the page (the price appears as you type) and by
// the server (/wszystko-jasne/api/order, via .worker/utgaver/pl.js), which works it out again and decides what goes on
// the invoice. Only the price is ever shown, never how it is worked out (the owner, 20.11.2026).
//
// The owner has not set these prices. Choices made when the Polish site was built (24.11.2026):
//
//   business   Firms, law offices, accounting offices, practices, foundations and associations: people and sector,
//              price per year. The same curve and sector shares as Alles Klar (alles-klar/pris/preis.js), converted at
//              about 4.3 zł to 1 € and rounded to the nearest 100 zł (solo: 260 € → 1 100 zł).
//              Note: Klart-pl-grunnlag/research/102 §6 proposed lower business prices (390 zł per user per year,
//              a 1 490 zł pack up to 5 users). This file follows the brief (German curve × 4.3); the owner decides.
//   municipal  Gminy, miasta, powiaty and województwa: population. The curve gives the total for four years, straight
//              lines between the points of research/102 §6, flat at 4 900 zł up to 2 000 people and capped at
//              149 000 zł from 400 000 people. One year, a quarter of it, is ordered and invoiced at a time (as Alles
//              Klar). Why the cap: Pzp applies from 170 000 zł net from 1 January 2026 (art. 2 ust. 1 pkt 1, Dz.U.
//              2025 poz. 1173), and the whole four-year value counts (art. 28, art. 31 ust. 2). 149 000 zł leaves
//              21 000 zł for the buyer's own extras, so no public buyer needs a Pzp procedure.
//   state      Ministries, urzędy wojewódzkie, inspectorates, courts and other state units: staff, price per year.
//              4 000 zł + 40 zł per member of staff (research/102 §6), at most 37 200 zł a year, so that four years
//              (148 800 zł) also stay under 149 000 zł.
//
// The invoice carries no Polish VAT for VAT-registered buyers (reverse charge, art. 28b and art. 17 ust. 1 pkt 4
// ustawy o VAT), so every amount here is a net price. Open (research/102 §7): state units that are not VAT
// taxpayers may owe 23 % on top, and withholding tax on licence fees has not been settled.
export const SOLO = 1100;
const CURVE = [[1, 1900], [2, 2200], [6, 5600], [23, 16800], [113, 44700], [500, 93300], [2000, 168000]];
// Municipalities: a straight line between the points, flat below the first and above the last one.
// The same points are in the table on the page (cennik/index.html).
export const MUNICIPAL = [[2000, 4900], [5000, 9900], [10000, 14900], [20000, 24900], [50000, 49900], [100000, 79000], [250000, 129000], [400000, 149000]];
const STATE = { base: 4000, perHead: 40, max: 37200 };
export const MAX_COUNT = 100000000;
// The share of the people that is counted. A third number is a factor on the price.
export const SECTORS = [
  ["Kancelaria adwokacka, radcowska lub notarialna", 1], ["Doradztwo podatkowe, biegły rewident lub biuro rachunkowe", 1],
  ["Bankowość, finanse lub ubezpieczenia", 1], ["Rekrutacja lub usługi kadrowe", 1],
  ["Doradztwo, IT lub inna praca biurowa", 1], ["Nieruchomości", 1], ["Stowarzyszenie, związek lub fundacja", 1],
  ["Ochrona zdrowia", 0.4], ["Szkoły i edukacja", 0.4], ["Opieka i pomoc społeczna", 0.4],
  ["Lotnictwo", 0.3, 1.5], ["Handel detaliczny", 0.2],
  ["Budownictwo i rzemiosło", 0.15], ["Przemysł i produkcja", 0.15], ["Transport i magazynowanie", 0.15],
  ["Rolnictwo, leśnictwo lub rybołówstwo", 0.15], ["Górnictwo", 0.15], ["Energia, woda i gospodarka odpadami", 0.15], ["Warsztat samochodowy", 0.15],
  ["Hotele i gastronomia", 0.1], ["Usługi ochrony", 0.1], ["Sprzątanie i zarządzanie nieruchomościami", 0.1],
  ["Agencja pracy tymczasowej", 0.05],
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

/** { price (whole złoty a year, net), art, and by kind: persons and sector (its display name), inhabitants and
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
