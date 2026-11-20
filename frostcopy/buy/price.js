// The US price for FrostCopy. One file, used both by the page (to show the price as you type) and by the
// server (/frostcopy/api/checkout), which calculates it again and is the one that decides what is charged.
// The Norwegian curve in dollars: a straight line in log-log between the points, continuing with the last
// slope above the last point.
export const SOLO = 300;
const CURVE = [[1, 500], [2, 600], [6, 1500], [23, 4500], [113, 12000], [500, 25000], [2000, 45000]];
// Government: priced by how many people would use FrostCopy, and never above what that office can buy on its own
// authority, without quotes or bids (the owner, November 20, 2026). The limits are from
// Klart-us-grunnlag/research/16-us-government-thresholds (looked up November 20, 2026):
// federal: the micro-purchase threshold, $15,000 (FAR 2.101). State agencies: each state's own no-quote limit.
// Cities, counties and schools: the limit state law sets for them where it does, otherwise LOCAL_TYPICAL.
// A state with no figure found also uses LOCAL_TYPICAL.
const GOV = [[1, 240], [5, 590], [20, 1490], [50, 2900], [200, 5900], [1000, 9800], [3000, 14500]];
const FEDERAL_LIMIT = 15000;
const LOCAL_TYPICAL = 5000;
// [name, state agencies' limit, local governments' limit under state law]
export const STATES = {
  AL: ["Alabama", 5000, null],
  AK: ["Alaska", 25000, null],
  AZ: ["Arizona", 10000, 10000],
  AR: ["Arkansas", 20000, null],
  CA: ["California", 19999, null],
  CO: ["Colorado", 50000, null],
  CT: ["Connecticut", 25000, null],
  DE: ["Delaware", 50000, 50000],
  DC: ["District of Columbia", 10000, null],
  FL: ["Florida", 2500, null],
  GA: ["Georgia", 24999, null],
  HI: ["Hawaii", 4999, 4999],
  ID: ["Idaho", 15000, null],
  IL: ["Illinois", 100000, null],
  IN: ["Indiana", 2500, null],
  IA: ["Iowa", 15000, null],
  KS: ["Kansas", 5000, null],
  KY: ["Kentucky", 1000, null],
  LA: ["Louisiana", 30000, 30000],
  ME: ["Maine", 10000, null],
  MD: ["Maryland", 5000, null],
  MA: ["Massachusetts", 10000, 10000],
  MI: ["Michigan", 5000, null],
  MN: ["Minnesota", 5000, 25000],
  MS: ["Mississippi", 5000, 5000],
  MO: ["Missouri", 10000, null],
  MT: ["Montana", 9999, null],
  NE: ["Nebraska", 5000, null],
  NV: ["Nevada", null, 50000],
  NH: ["New Hampshire", null, null],
  NJ: ["New Jersey", 1000, 4800],
  NM: ["New Mexico", 20000, 20000],
  NY: ["New York", 50000, null],
  NC: ["North Carolina", 25000, 30000],
  ND: ["North Dakota", 9999, null],
  OH: ["Ohio", 5000, null],
  OK: ["Oklahoma", 25000, null],
  OR: ["Oregon", 25000, 25000],
  PA: ["Pennsylvania", 10000, 12600],
  RI: ["Rhode Island", 500, null],
  SC: ["South Carolina", 10000, 10000],
  SD: ["South Dakota", 4000, 4000],
  TN: ["Tennessee", 25000, null],
  TX: ["Texas", 10000, null],
  UT: ["Utah", 5000, null],
  VT: ["Vermont", 10000, null],
  VA: ["Virginia", 10000, null],
  WA: ["Washington", 40000, 40000],
  WV: ["West Virginia", 5000, null],
  WI: ["Wisconsin", 5000, null],
  WY: ["Wyoming", 2500, null],
};
/** The highest price that stays under a limit: a little below it, on a round number. */
function under(limit) {
  const step = limit <= 1000 ? 10 : 50;
  return Math.floor((limit - 1) / step) * step;
}
function govCap(kind, state) {
  if (kind === "federal") return under(FEDERAL_LIMIT);
  const s = STATES[state];
  if (!s) return null;
  return under((kind === "state" ? s[1] : s[2]) ?? LOCAL_TYPICAL);
}
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

/** { price (whole dollars a year), people, kind (business, federal, state or local), state, business } or null for bad input.
    For government, "people" is the number of people who would use FrostCopy. */
export function price({ people, kind, business, state }) {
  const n = Math.floor(Number(people));
  if (!Number.isFinite(n) || n < 1 || n > MAX_PEOPLE) return null;
  if (kind === "federal" || kind === "state" || kind === "local") {
    const cap = govCap(kind, state);
    if (cap === null) return null;
    return { price: Math.min(cap, round(loglog(GOV, n))), people: n, kind, state: kind === "federal" ? null : state, business: null };
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
