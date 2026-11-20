// Prüft die Preispunkte von Alles Klar (alles-klar/pris/preis.js). Ausführen: node .worker/de-preis.test.mjs
// Die Kommunen werden auch gegen die Rechnung von kommune-eur.js und die Punkte in data-punkter auf der Seite geprüft.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRANCHEN, KOMMUNE, preis } from "../alles-klar/pris/preis.js";

const hier = new URL("../alles-klar/pris/", import.meta.url);
const buero = BRANCHEN.findIndex((b) => b[0].startsWith("Beratung"));

console.log("Unternehmen (Büro):");
for (const [n, soll] of [[1, 260], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]]) {
  const p = preis({ art: "unternehmen", personen: n, branche: buero });
  console.log(`  ${n} Personen: ${p.preis}`);
  assert.equal(p.preis, soll);
}

// Dieselbe Rechnung wie in kommune-eur.js (dort als Funktion in der Seite), mit den Punkten aus dem HTML.
const html = readFileSync(new URL("index.html", hier), "utf8");
const punkte = JSON.parse(html.match(/data-punkter="([^"]+)"/)[1]);
assert.deepEqual(punkte, KOMMUNE);
function kommuneEur(n) {
  let p = punkte[punkte.length - 1][1];
  if (n <= punkte[0][0]) p = punkte[0][1];
  else for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1], b = punkte[i];
    if (n <= b[0]) { p = a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]); break; }
  }
  const fire = Math.round(p / 100) * 100;
  return [fire, Math.round(fire / 4)];
}
console.log("Kommunen (vier Jahre / pro Jahr):");
for (const [n, soll] of [[500, 1500], [20000, 14500], [250000, 135000], [1000000, 135000]]) {
  const p = preis({ art: "kommune", einwohner: n });
  console.log(`  ${n} Einwohner: ${p.vierJahre} / ${p.preis}`);
  assert.equal(p.vierJahre, soll);
}
for (let n = 1; n <= 400000; n += 37) {
  const p = preis({ art: "kommune", einwohner: n });
  assert.deepEqual([p.vierJahre, p.preis], kommuneEur(n), "Einwohner " + n);
}
console.log("  1 bis 400.000 Einwohner in Schritten von 37: gleich wie kommune-eur.js");

console.log("Behörden:");
for (const [n, soll] of [[10, 3660], [100, 5100], [431, 10400], [5000, 10400]]) {
  const p = preis({ art: "behoerde", beschaeftigte: n });
  console.log(`  ${n} Beschäftigte: ${p.preis}` + (n === 431 ? " (3500 + 16 × 431 = 10396, auf 10 € gerundet)" : ""));
  assert.equal(p.preis, soll);
}

assert.equal(preis({ art: "unternehmen", personen: 0, branche: 0 }), null);
assert.equal(preis({ art: "unternehmen", personen: 5, branche: 99 }), null);
assert.equal(preis({ art: "kommune", einwohner: "" }), null);
assert.equal(preis({ art: "etwas", personen: 5 }), null);
assert.equal(preis({ art: "unternehmen", personen: 4000, branche: BRANCHEN.findIndex((b) => b[0] === "Zeitarbeit") }).preis >= 260, true);
console.log("Alles stimmt.");
