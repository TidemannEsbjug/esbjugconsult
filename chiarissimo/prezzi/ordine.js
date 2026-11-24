// Prissiden og bestillingen for Chiarissimo. Prisen kommer fra price.js, den samme filen serveren skriver fakturaen
// med (.worker/utgaver/it.js); de kan altså ikke spri fra hverandre. For kommuner vises summen for fire år i #ke-svar.
// Ingenting sendes før «Ordina con fattura» trykkes. Bare prisen vises, aldri regnestykket (eieren 20.11.2026).
import { SETTORI, price } from "./price.js";

const el = (id) => document.getElementById(id);
const euro = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ".") + " €";
const persone = el("persone"), settore = el("settore"), abitanti = el("ke-innbyggere"), dipendenti = el("dipendenti");
SETTORI.forEach((s, i) => settore.add(new Option(s[0], i)));
settore.value = String(SETTORI.findIndex((s) => s[0].startsWith("Consulenza")));

const MANCA = {
  business: "Indichi quante persone lavorano nell'organizzazione.",
  municipal: "Indichi il numero di abitanti.",
  state: "Indichi il numero di dipendenti.",
};
const numero = (campo) => Math.floor(Number(String(campo.value).replace(/[^0-9]/g, ""))) || 0;

function scelta() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: numero(abitanti) };
  if (art === "state") return { art, employees: numero(dipendenti) };
  return { art: "business", persons: numero(persone), sector: Number(settore.value) };
}
function mostra() {
  const s = scelta();
  const p = price(s);
  el("campo-azienda").hidden = s.art !== "business";
  el("ke-skjema").hidden = s.art !== "municipal";
  el("campo-ente").hidden = s.art !== "state";
  el("kommune-eur").hidden = s.art !== "municipal";
  // Chi lavora da solo non ha bisogno di un settore.
  el("campo-settore").hidden = s.art === "business" && s.persons === 1;
  // Kommuner: summen for fire år står i #ke-svar; det bestilles ett år.
  el("ke-boks").hidden = s.art !== "municipal" || !p;
  el("riga-prezzo").hidden = s.art === "municipal" || !p;
  el("importo").textContent = p ? euro(p.price) : "";
  const svar = el("ke-svar");
  svar.textContent = "";
  if (s.art === "municipal" && p) {
    const b = document.createElement("b");
    b.textContent = euro(p.fourYears);
    svar.appendChild(b);
    svar.appendChild(document.createTextNode(" per quattro anni (" + euro(p.price) + " all'anno)"));
  }
  svar.hidden = !svar.textContent;
  const n = el("nota");
  n.textContent = !p ? MANCA[s.art] : s.art === "municipal" ? "Ordina il primo anno: " + euro(p.price) + ". La fattura arriva ogni anno, e la chiave di licenza vale ogni volta un anno." : "";
  n.hidden = !n.textContent;
  return p;
}
[persone, abitanti, dipendenti].forEach((c) => c.addEventListener("input", mostra));
settore.addEventListener("change", mostra);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", mostra));
el("ke-skjema").addEventListener("submit", (e) => {
  e.preventDefault();
  mostra();
});
mostra();

function errore(testo) {
  const e = el("errore");
  e.textContent = testo;
  e.hidden = !testo;
}
el("ho-chiave").addEventListener("click", () => {
  el("ho-chiave-testo").hidden = !el("ho-chiave-testo").hidden;
});
el("ordine").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  errore("");
  const s = scelta();
  if (!price(s)) {
    errore(MANCA[s.art]);
    return (s.art === "municipal" ? abitanti : s.art === "state" ? dipendenti : persone).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("adresse").value.trim();
  if (name.length < 2) return errore("Indichi il nome dell'organizzazione."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errore("Indichi l'indirizzo e-mail a cui inviare la fattura."), el("email").focus();
  if (address.length < 8) return errore("Indichi l'indirizzo di fatturazione."), el("adresse").focus();
  if (!el("approva").checked) return errore("Per ordinare approvi specificamente i punti 7 e 8 delle condizioni."), el("approva").focus();
  const pulsante = el("ordina");
  pulsante.disabled = true;
  try {
    const risposta = await fetch("/chiarissimo/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        art: s.art,
        persons: s.persons ?? null,
        sector: s.sector ?? null,
        inhabitants: s.inhabitants ?? null,
        employees: s.employees ?? null,
        name,
        email,
        address,
        reference: el("riferimento").value.trim(),
        website: el("website").value,
      }),
    });
    const dati = await risposta.json().catch(() => ({}));
    if (!risposta.ok || !dati.ok) throw new Error(dati.error || "Qualcosa non ha funzionato da parte nostra. Riprovi tra un momento.");
    const importo = euro(dati.price);
    el("grazie-testo").textContent = dati.sent
      ? "La fattura " + dati.invoice + " di " + importo + " è in arrivo a " + email + ". La chiave di licenza arriva allo stesso indirizzo appena riceviamo il pagamento."
      : "Abbiamo ricevuto il Suo ordine: " + dati.invoice + " di " + importo + ". Le invieremo a breve la fattura a " + email + ". La chiave di licenza segue appena riceviamo il pagamento.";
    el("ordine").hidden = true;
    el("grazie").hidden = false;
    el("grazie").focus();
  } catch (e) {
    errore(e instanceof TypeError ? "Non è stato possibile inviare l'ordine. Controlli la connessione e riprovi." : e.message);
    pulsante.disabled = false;
  }
});
