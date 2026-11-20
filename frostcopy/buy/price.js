// The US price for FrostCopy. One file, used both by the page (to show the price as you type) and by the
// server (/frostcopy/api/checkout), which calculates it again and is the one that decides what is charged.
// The Norwegian curve in dollars: a straight line in log-log between the points, continuing with the last
// slope above the last point.
export const SOLO = 300;
const CURVE = [[1, 500], [2, 600], [6, 1500], [23, 4500], [113, 12000], [500, 25000], [2000, 45000]];
// Government: its own table, never above 14,500 dollars a year.
const GOV = [[1, 240], [5, 590], [20, 1490], [50, 2900], [200, 5900], [1000, 9800], [3000, 14500]];
const GOV_CAP = 14500;
export const MAX_PEOPLE = 5000000;
// The share of the people on the payroll that is counted. A third number is a factor on the price.
export const BUSINESS = [
  ["Law firm", 1], ["Accounting, tax or bookkeeping", 1], ["Finance or insurance", 1], ["Recruiting or HR services", 1],
  ["Consulting, IT or other office work", 1], ["Real estate", 1], ["Nonprofit or association", 1],
  ["Healthcare", 0.4], ["Schools and education", 0.4], ["Care and social services", 0.4],
  ["Aviation", 0.3, 1.5], ["Retail", 0.2],
  ["Construction and trades", 0.15], ["Manufacturing", 0.15], ["Transport and warehousing", 0.15],
  ["Farming, forestry or fishing", 0.15], ["Mining", 0.15], ["Utilities and waste", 0.15], ["Auto repair", 0.15],
  ["Hotels and restaurants", 0.1], ["Security", 0.1], ["Cleaning and property services", 0.1],
  ["Staffing agency", 0.05],
];

function loglog(points, x) {
  if (x <= points[0][0]) return points[0][1];
  let i = points.findIndex((p) => p[0] >= x);
  if (i === -1) i = points.length - 1;
  const [x0, y0] = points[i - 1], [x1, y1] = points[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}
function round(p) {
  const step = p < 1000 ? 10 : p < 10000 ? 50 : 100;
  return Math.round(p / step) * step;
}

/** { price (whole dollars a year), people, kind, business (name or null) }, or null for bad input. */
export function price({ people, kind, business }) {
  const n = Math.floor(Number(people));
  if (!Number.isFinite(n) || n < 1 || n > MAX_PEOPLE) return null;
  if (kind === "gov") {
    const p = Math.min(GOV_CAP, round(loglog(GOV, n)));
    return { price: p, people: n, kind: "gov", business: null };
  }
  if (n === 1) return { price: SOLO, people: 1, kind: "business", business: null };
  const b = BUSINESS[Number(business)];
  if (!b) return null;
  const share = b[1], factor = b[2] || 1;
  const counted = Math.max(1, n * share);
  return {
    price: Math.max(SOLO, round(loglog(CURVE, counted) * factor)),
    people: n, kind: "business", business: b[0],
  };
}
