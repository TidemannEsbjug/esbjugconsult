// Der Preis für Alles Klar in Euro. Eine Datei, die sowohl die Seite benutzt (der Preis erscheint beim Tippen)
// als auch der Server (/alles-klar/api/bestellung), der neu rechnet und entscheidet, was auf der Rechnung steht.
// Gezeigt wird immer nur der Preis, nie der Rechenweg (Eigentümer, 20.11.2026).
//
// Drei Arten von Käufern:
//   unternehmen  Unternehmen, Kanzlei, Praxis oder Verein: Personen und Branche, Preis pro Jahr.
//   kommune      Stadt, Gemeinde oder Landkreis: Einwohner. Die Kurve gibt den Betrag für vier Jahre
//                (vom Eigentümer am 16.11.2026 festgelegt); bestellt und berechnet wird jedes Jahr ein Viertel.
//   behoerde     Behörde des Bundes oder eines Landes, Gericht, Hochschule, Körperschaft: Beschäftigte, Preis pro Jahr.
export const ALLEIN = 260;
const KURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Kommunen: gerade Linie zwischen den Punkten, darüber gleichbleibend. Dieselben Punkte stehen in data-punkter
// auf der Seite (für kommune-eur.js und das Angebot als PDF); .worker/de-preis.test.mjs prüft, dass beide übereinstimmen.
export const KOMMUNE = [[500, 1500], [2000, 2600], [5000, 5000], [20000, 14500], [50000, 41000], [100000, 70000], [250000, 135000]];
const BEHOERDE = { grund: 3500, proKopf: 16, hoechstens: 10400 };
export const MAX_ANZAHL = 100000000;
// Der Anteil der Personen, der gezählt wird. Eine dritte Zahl ist ein Faktor auf den Preis.
export const BRANCHEN = [
  ["Rechtsanwaltskanzlei oder Notariat", 1], ["Steuerberatung, Wirtschaftsprüfung oder Buchhaltung", 1],
  ["Banken, Finanzen oder Versicherungen", 1], ["Personalvermittlung oder Personaldienstleistungen", 1],
  ["Beratung, IT oder andere Büroarbeit", 1], ["Immobilien", 1], ["Verein, Verband oder Stiftung", 1],
  ["Gesundheitswesen", 0.4], ["Schulen und Bildung", 0.4], ["Pflege und Soziales", 0.4],
  ["Luftfahrt", 0.3, 1.5], ["Einzelhandel", 0.2],
  ["Bau und Handwerk", 0.15], ["Industrie und Fertigung", 0.15], ["Transport und Lagerei", 0.15],
  ["Land- und Forstwirtschaft, Fischerei", 0.15], ["Bergbau", 0.15], ["Energie, Wasser und Entsorgung", 0.15], ["Kfz-Werkstatt", 0.15],
  ["Hotels und Gastronomie", 0.1], ["Sicherheitsdienste", 0.1], ["Gebäudereinigung und Hausverwaltung", 0.1],
  ["Zeitarbeit", 0.05],
];

function loglog(punkte, x) {
  if (x <= punkte[0][0]) return punkte[0][1];
  let i = punkte.findIndex((p) => p[0] >= x);
  if (i === -1) i = punkte.length - 1;
  const [x0, y0] = punkte[i - 1], [x1, y1] = punkte[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}
function linear(punkte, x) {
  if (x <= punkte[0][0]) return punkte[0][1];
  for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1], b = punkte[i];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return punkte[punkte.length - 1][1];
}
function runde(p) {
  const schritt = p < 1000 ? 10 : p < 10000 ? 50 : 100;
  return Math.round(p / schritt) * schritt;
}
function anzahl(wert) {
  const n = Math.floor(Number(wert));
  return Number.isFinite(n) && n >= 1 && n <= MAX_ANZAHL ? n : null;
}

/** { preis (ganze Euro pro Jahr), art, und je nach Art: personen und branche, einwohner und vierJahre,
    oder beschaeftigte }, oder null bei ungültigen Angaben. */
export function preis({ art, personen, branche, einwohner, beschaeftigte }) {
  if (art === "kommune") {
    const n = anzahl(einwohner);
    if (!n) return null;
    const vierJahre = Math.round(linear(KOMMUNE, n) / 100) * 100;
    return { preis: Math.round(vierJahre / 4), vierJahre, art, einwohner: n };
  }
  if (art === "behoerde") {
    const n = anzahl(beschaeftigte);
    if (!n) return null;
    const p = Math.min(BEHOERDE.hoechstens, Math.round((BEHOERDE.grund + BEHOERDE.proKopf * n) / 10) * 10);
    return { preis: p, art, beschaeftigte: n };
  }
  if (art !== "unternehmen") return null;
  const n = anzahl(personen);
  if (!n) return null;
  if (n === 1) return { preis: ALLEIN, art, personen: 1, branche: null };
  const b = BRANCHEN[Number(branche)];
  if (!b) return null;
  const gezaehlt = Math.max(1, n * b[1]);
  return { preis: Math.max(ALLEIN, runde(loglog(KURVE, gezaehlt) * (b[2] || 1))), art, personen: n, branche: b[0] };
}
