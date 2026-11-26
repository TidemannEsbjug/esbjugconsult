// Die Preis- und Bestellseite von Glockenklar. Der Preis kommt aus price.js, derselben Datei, mit der der Server
// die Rechnung schreibt; die beiden können also nicht voneinander abweichen. Gesendet wird erst, wenn
// „Auf Rechnung bestellen“ gedrückt wird.
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
const euro = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ".") + " €";
const personen = el("personen"), branche = el("branche"), einwohner = el("einwohner"), beschaeftigte = el("beschaeftigte");
SECTORS.forEach((b, i) => branche.add(new Option(b[0], i)));
branche.value = String(SECTORS.findIndex((b) => b[0].startsWith("Beratung")));

const FEHLT = {
  business: "Geben Sie an, wie viele Personen in der Organisation arbeiten.",
  municipal: "Geben Sie die Einwohnerzahl ein.",
  state: "Geben Sie die Zahl der Beschäftigten ein.",
};
const zahl = (feld) => Math.floor(Number(String(feld.value).replace(/[^0-9]/g, ""))) || 0;

function wahl() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: zahl(einwohner) };
  if (art === "state") return { art, employees: zahl(beschaeftigte) };
  return { art: "business", persons: zahl(personen), sector: Number(branche.value) };
}
function zeige() {
  const w = wahl();
  const p = price(w);
  el("feld-unternehmen").hidden = w.art !== "business";
  el("feld-gemeinde").hidden = w.art !== "municipal";
  el("feld-dienststelle").hidden = w.art !== "state";
  el("gemeinden").hidden = w.art !== "municipal";
  // Wer allein arbeitet, braucht keine Branche.
  el("feld-branche").hidden = w.art === "business" && w.persons === 1;
  // Gemeinden: der Betrag für vier Jahre, bestellt wird ein Jahr.
  el("vier").hidden = w.art !== "municipal" || !p;
  if (p && p.fourYears) {
    el("vier").textContent = "";
    const b = document.createElement("b");
    b.textContent = euro(p.fourYears);
    el("vier").append(b, " für vier Jahre (" + euro(p.price) + " pro Jahr)");
  }
  el("preiszeile").hidden = w.art === "municipal" || !p;
  el("betrag").textContent = p ? euro(p.price) : "";
  // Nur der Preis wird gezeigt, nie der Rechenweg.
  const h = el("hinweis");
  h.textContent = !p ? FEHLT[w.art] : w.art === "municipal" ? "Sie bestellen das erste Jahr: " + euro(p.price) + ". Die Rechnung kommt jedes Jahr, und der Lizenzschlüssel gilt jeweils ein Jahr." : "";
  h.hidden = !h.textContent;
  return p;
}
[personen, einwohner, beschaeftigte].forEach((f) => f.addEventListener("input", zeige));
branche.addEventListener("change", zeige);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", zeige));
zeige();

function fehler(text) {
  const e = el("fehler");
  e.textContent = text;
  e.hidden = !text;
}
el("habe").addEventListener("click", () => {
  el("habeText").hidden = !el("habeText").hidden;
});
el("bestellung").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  fehler("");
  const w = wahl();
  if (!price(w)) {
    fehler(FEHLT[w.art]);
    return (w.art === "municipal" ? einwohner : w.art === "state" ? beschaeftigte : personen).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("adresse").value.trim();
  if (name.length < 2) return fehler("Geben Sie den Namen der Organisation ein."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fehler("Geben Sie die E-Mail-Adresse ein, an die die Rechnung gehen soll."), el("email").focus();
  if (address.length < 8) return fehler("Geben Sie die Rechnungsadresse ein."), el("adresse").focus();
  const knopf = el("bestellen");
  knopf.disabled = true;
  try {
    const antwort = await fetch("/glockenklar/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        art: w.art,
        persons: w.persons ?? null,
        sector: w.sector ?? null,
        inhabitants: w.inhabitants ?? null,
        employees: w.employees ?? null,
        name,
        email,
        address,
        reference: el("zeichen").value.trim(),
        website: el("website").value,
      }),
    });
    const daten = await antwort.json().catch(() => ({}));
    if (!antwort.ok || !daten.ok) throw new Error(daten.error || "Bei uns ist etwas schiefgegangen. Versuchen Sie es gleich noch einmal.");
    const betrag = euro(daten.price);
    el("dankeText").textContent = daten.sent
      ? "Die Rechnung " + daten.invoice + " über " + betrag + " ist unterwegs an " + email + ". Den Lizenzschlüssel senden wir an dieselbe Adresse, sobald die Zahlung eingegangen ist."
      : "Ihre Bestellung ist eingegangen: " + daten.invoice + " über " + betrag + ". Die Rechnung senden wir in Kürze an " + email + ". Der Lizenzschlüssel folgt, sobald die Zahlung eingegangen ist.";
    el("bestellung").hidden = true;
    el("danke").hidden = false;
    el("danke").focus();
  } catch (e) {
    fehler(e instanceof TypeError ? "Die Bestellung konnte nicht gesendet werden. Prüfen Sie die Verbindung und versuchen Sie es noch einmal." : e.message);
    knopf.disabled = false;
  }
});
