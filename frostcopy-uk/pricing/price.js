// The price of FrostCopy UK in pounds sterling. One file, used both by the page (the price appears as you type)
// and by the server (/frostcopy-uk/api/order, via .worker/utgaver/gb.js), which works it out again and decides what
// goes on the invoice. Only the price is ever shown, never how it is worked out (the owner, 20.11.2026).
//
// The owner has not set these prices. Choices made when the British site was built (24.11.2026):
//
//   business   Businesses, charities, firms of solicitors, surgeries: people and sector, price per year. The same
//              curve and sector shares as Alles Klar (alles-klar/pris/preis.js), converted at about £0.85 to €1 and
//              rounded.
//   municipal  Councils (county, district, unitary, metropolitan, London borough, Scottish, Welsh and NI councils,
//              town and parish councils): population. The curve gives the total for four years; one year, a quarter of
//              it, is ordered and invoiced at a time (as Alles Klar). Up to 100,000 people it is the German curve at
//              £0.85/€. Above that it rises to £170,000 for four years at 500,000 people and stays there. That cap is
//              just under the Procurement Act 2023 threshold for councils ("all other contracting authorities"):
//              £173,100 excluding VAT, £207,720 including VAT from 1 January 2026 (Klart-gb-grunnlag/research/
//              26-uk-government-thresholds.md). £170,000 + 20% VAT = £204,000. The whole four-year term counts towards
//              the threshold, which is why the cap is on four years. Below the threshold the Act allows a direct
//              award; each council's own standing orders still decide how many quotes it needs.
//              Not solved here: Scotland. Scottish councils must advertise from £50,000 excluding VAT over the whole
//              term (Procurement Reform (Scotland) Act 2014), which this curve passes at about 70,000 people. The order
//              keys carry no nation, so the curve cannot tell a Scottish council apart.
//   state      Central government departments and agencies, NHS trusts and other public bodies: staff, price per year.
//              £3,000 + £14 per member of staff (Alles Klar's 3,500 € + 16 € at £0.85/€), at most £8,300 a year.
//              £8,300 + 20% VAT = £9,960: under the £10,000 one-written-quote band in the NHS trust rules that were
//              read, and under the £12,000 including VAT line from which central government and NHS trusts must
//              publish a contract details notice. Renewals with the same supplier may be added together by a buyer's
//              own rules; that is the buyer's call.
//
// The invoice carries no UK VAT (reverse charge), so every amount here is a net price.
export const SOLO = 220;
const CURVE = [[1, 370], [2, 440], [6, 1100], [23, 3300], [113, 8850], [500, 18500], [2000, 33300]];
// Councils: a straight line between the points, flat above the last one. The same points are in the table on the page.
export const MUNICIPAL = [[500, 1300], [2000, 2200], [5000, 4300], [20000, 12300], [50000, 34900], [100000, 59500], [250000, 114800], [500000, 170000]];
const STATE = { base: 3000, perHead: 14, max: 8300 };
export const MAX_COUNT = 100000000;
// The share of the people that is counted. A third number is a factor on the price.
export const SECTORS = [
  ["Solicitors, barristers or other legal services", 1], ["Accountancy, tax or bookkeeping", 1],
  ["Banking, finance or insurance", 1], ["Recruitment or HR services", 1],
  ["Consultancy, IT or other office work", 1], ["Property and estate agents", 1], ["Charity, housing association or membership body", 1],
  ["Healthcare", 0.4], ["Schools and education", 0.4], ["Care and social services", 0.4],
  ["Aviation", 0.3, 1.5], ["Retail", 0.2],
  ["Construction and trades", 0.15], ["Manufacturing", 0.15], ["Transport and logistics", 0.15],
  ["Farming, forestry or fishing", 0.15], ["Mining and quarrying", 0.15], ["Energy, water and waste", 0.15], ["Motor repair", 0.15],
  ["Hospitality", 0.1], ["Security", 0.1], ["Cleaning and facilities management", 0.1],
  ["Staffing agency", 0.05],
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

/** { price (whole pounds a year), art, and by kind: persons and sector (its display name), inhabitants and fourYears,
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
