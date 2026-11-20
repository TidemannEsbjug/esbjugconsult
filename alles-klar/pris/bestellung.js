// Die Preis- und Bestellseite von Alles Klar. Der Preis kommt aus preis.js, derselben Datei, mit der der Server
// die Rechnung schreibt; die beiden können also nicht voneinander abweichen. Für Kommunen zeigt kommune-eur.js
// den Betrag für vier Jahre (#ke-svar). Gesendet wird erst, wenn „Auf Rechnung bestellen“ gedrückt wird.
import { BRANCHEN, preis } from "./preis.js";

const el = (id) => document.getElementById(id);
const euro = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ".") + " €";
const personen = el("personen"), branche = el("branche"), einwohner = el("ke-innbyggere"), beschaeftigte = el("beschaeftigte");
BRANCHEN.forEach((b, i) => branche.add(new Option(b[0], i)));
branche.value = String(BRANCHEN.findIndex((b) => b[0].startsWith("Beratung")));

const FEHLT = {
  unternehmen: "Geben Sie an, wie viele Personen in der Organisation arbeiten.",
  kommune: "Geben Sie die Einwohnerzahl ein.",
  behoerde: "Geben Sie die Zahl der Beschäftigten ein.",
};
const zahl = (feld) => Math.floor(Number(String(feld.value).replace(/[^0-9]/g, ""))) || 0;

function wahl() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "kommune") return { art, einwohner: zahl(einwohner) };
  if (art === "behoerde") return { art, beschaeftigte: zahl(beschaeftigte) };
  return { art: "unternehmen", personen: zahl(personen), branche: Number(branche.value) };
}
function zeige() {
  const w = wahl();
  const p = preis(w);
  el("feld-unternehmen").hidden = w.art !== "unternehmen";
  el("ke-skjema").hidden = w.art !== "kommune";
  el("feld-behoerde").hidden = w.art !== "behoerde";
  el("kommune-eur").hidden = w.art !== "kommune";
  // Wer allein arbeitet, braucht keine Branche.
  el("feld-branche").hidden = w.art === "unternehmen" && w.personen === 1;
  // Kommunen: der Betrag für vier Jahre steht in #ke-svar (kommune-eur.js), bestellt wird ein Jahr.
  el("ke-boks").hidden = w.art !== "kommune" || !p;
  el("preiszeile").hidden = w.art === "kommune" || !p;
  el("betrag").textContent = p ? euro(p.preis) : "";
  // Nur der Preis wird gezeigt, nie der Rechenweg (Eigentümer, 20.11.2026).
  const h = el("hinweis");
  h.textContent = !p ? FEHLT[w.art] : w.art === "kommune" ? "Sie bestellen das erste Jahr: " + euro(p.preis) + ". Die Rechnung kommt jedes Jahr, und der Lizenzschlüssel gilt jeweils ein Jahr." : "";
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
  if (!preis(w)) {
    fehler(FEHLT[w.art]);
    return (w.art === "kommune" ? einwohner : w.art === "behoerde" ? beschaeftigte : personen).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), adresse = el("adresse").value.trim();
  if (name.length < 2) return fehler("Geben Sie den Namen der Organisation ein."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fehler("Geben Sie die E-Mail-Adresse ein, an die die Rechnung gehen soll."), el("email").focus();
  if (adresse.length < 8) return fehler("Geben Sie die Rechnungsadresse ein."), el("adresse").focus();
  const knopf = el("bestellen");
  knopf.disabled = true;
  try {
    const antwort = await fetch("/alles-klar/api/bestellung", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...w, name, email, adresse, zeichen: el("zeichen").value.trim(), website: el("website").value }),
    });
    const daten = await antwort.json().catch(() => ({}));
    if (!antwort.ok || !daten.ok) throw new Error(daten.error || "Bei uns ist etwas schiefgegangen. Versuchen Sie es gleich noch einmal.");
    const betrag = euro(daten.preis);
    el("dankeText").textContent = daten.gesendet
      ? "Die Rechnung " + daten.rechnung + " über " + betrag + " ist unterwegs an " + email + ". Den Lizenzschlüssel senden wir an dieselbe Adresse, sobald die Zahlung eingegangen ist."
      : "Ihre Bestellung ist eingegangen: " + daten.rechnung + " über " + betrag + ". Die Rechnung senden wir in Kürze an " + email + ". Der Lizenzschlüssel folgt, sobald die Zahlung eingegangen ist.";
    el("bestellung").hidden = true;
    el("danke").hidden = false;
    el("danke").focus();
  } catch (e) {
    fehler(e instanceof TypeError ? "Die Bestellung konnte nicht gesendet werden. Prüfen Sie die Verbindung und versuchen Sie es noch einmal." : e.message);
    knopf.disabled = false;
  }
});
