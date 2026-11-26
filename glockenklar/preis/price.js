// Der Preis für Glockenklar in Euro, ohne Umsatzsteuer. Eine Datei, die sowohl die Seite benutzt (der Preis erscheint
// beim Tippen) als auch der Server (/glockenklar/api/order), der neu rechnet und entscheidet, was auf der Rechnung steht.
// Gezeigt wird immer nur der Preis, nie der Rechenweg.
//
// Entscheidungen (26.11.2026; der Eigentümer hat diese Preise noch nicht festgelegt):
//   business   Unternehmen, Kanzlei, Ordination oder Verein: Personen und Branche, Preis pro Jahr. Dieselbe Kurve und
//              dieselben Branchenanteile wie die deutsche Ausgabe (alles-klar/pris/preis.js), in Euro.
//   municipal  Gemeinde, Stadt oder Gemeindeverband: Einwohner. Die Kurve gibt den Betrag für vier Jahre; bestellt
//              und verrechnet wird jedes Jahr ein Viertel. Bis 100.000 Einwohner dieselbe Kurve wie in Deutschland,
//              darüber gedeckelt: die vier Jahre zusammen bleiben bei höchstens 99.000 € netto, also unter der
//              Direktvergabe-Grenze von 100.000 € netto (BVergG 2018, Schwellenwerteverordnung), die hier verwendet wird.
//              Der Auftragswert einer Lizenz über vier Jahre ist die ganze Laufzeit (§ 13 Abs. 1, § 16 BVergG).
//              Hinweis: Laut Klart-at-grunnlag/research/142 liegt die Direktvergabe-Grenze für Liefer- und
//              Dienstleistungen seit dem Vergaberechtsgesetz 2026 bei 140.000 €; 100.000 € ist also die vorsichtigere
//              Wahl und zugleich die Grenze, ab der Verträge nach § 2 Abs. 2 IFG veröffentlicht werden. Ab 50.000 €
//              muss der Auftraggeber sich um drei Angebote bemühen (§ 46 Abs. 4); bis 50.000 Einwohner bleibt der
//              Vierjahresbetrag darunter.
//   state      Bund, Land, Gericht, Universität, Sozialversicherungsträger oder andere Körperschaft: Beschäftigte, Preis
//              pro Jahr. Grundbetrag und Betrag pro Kopf wie in Deutschland; höchstens 24.900 € pro Jahr, damit auch
//              eine Bestellung über vier Jahre (99.600 €) unter 100.000 € netto bleibt.
export const SOLO = 260;
const CURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Gerade Linie zwischen den Punkten (Einwohner, Euro für vier Jahre); über dem letzten gleichbleibend.
export const MUNICIPAL = [[500, 1500], [2000, 2600], [5000, 5000], [20000, 14500], [50000, 41000], [100000, 70000], [250000, 99000]];
const STATE = { base: 3500, perHead: 16, max: 24900 };
export const MAX_COUNT = 100000000;
// Der Anteil der Personen, der gezählt wird. Eine dritte Zahl ist ein Faktor auf den Preis.
export const SECTORS = [
  ["Rechtsanwaltskanzlei oder Notariat", 1], ["Steuerberatung, Wirtschaftsprüfung oder Buchhaltung", 1],
  ["Banken, Finanzen oder Versicherungen", 1], ["Personalvermittlung oder Personaldienstleistungen", 1],
  ["Beratung, IT oder andere Büroarbeit", 1], ["Immobilien", 1], ["Verein, Verband oder Stiftung", 1],
  ["Gesundheitswesen", 0.4], ["Schulen und Bildung", 0.4], ["Pflege und Soziales", 0.4],
  ["Luftfahrt", 0.3, 1.5], ["Einzelhandel", 0.2],
  ["Bau und Gewerbe", 0.15], ["Industrie und Produktion", 0.15], ["Transport und Lagerei", 0.15],
  ["Land- und Forstwirtschaft, Fischerei", 0.15], ["Bergbau", 0.15], ["Energie, Wasser und Entsorgung", 0.15], ["Kfz-Werkstätte", 0.15],
  ["Hotellerie und Gastronomie", 0.1], ["Sicherheitsdienste", 0.1], ["Reinigung und Hausverwaltung", 0.1],
  ["Arbeitskräfteüberlassung", 0.05],
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
// Die Branche kommt als Index in SECTORS (die Seite) oder als ihr Name.
function sectorOf(s) {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "string" && !/^\d+$/.test(s.trim())) return SECTORS.find((b) => b[0] === s) || null;
  return SECTORS[Number(s)] || null;
}

/** { price (ganze Euro pro Jahr, ohne USt.), art, und je nach Art: persons und sector, inhabitants und fourYears,
    oder employees }, oder null bei ungültigen Angaben. */
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
  const b = sectorOf(sector);
  if (!b) return null;
  const counted = Math.max(1, n * b[1]);
  return { price: Math.max(SOLO, round(loglog(CURVE, counted) * (b[2] || 1))), art, persons: n, sector: b[0] };
}
