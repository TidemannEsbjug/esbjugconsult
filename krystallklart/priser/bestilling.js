// Prissiden og bestillingen for Krystallklart. Prisen kommer fra price.js, den samme fil, som serveren beregner
// fakturaen med, så de to kan ikke være forskellige. For kommuner og regioner står beløbet for fire år i #ke-svar.
// Intet sendes, før der er trykket på »Bestil mod faktura«.
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
// 12.345 kr., med punktum mellem tusinderne, som på dansk.
const kr = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ".") + " kr.";
const personer = el("personer"), branche = el("branche"), indbyggere = el("ke-innbyggere"), ansatte = el("ansatte");
SECTORS.forEach((s, i) => branche.add(new Option(s[0], i)));
branche.value = String(SECTORS.findIndex((s) => s[0].startsWith("Rådgivning, IT")));

const MANGLER = {
  business: "Skriv, hvor mange personer der arbejder i organisationen.",
  municipal: "Skriv antallet af indbyggere.",
  state: "Skriv antallet af ansatte.",
};
const tal = (felt) => Math.floor(Number(String(felt.value).replace(/[^0-9]/g, ""))) || 0;

function valg() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: tal(indbyggere) };
  if (art === "state") return { art, employees: tal(ansatte) };
  return { art: "business", persons: tal(personer), sector: Number(branche.value) };
}
function vis() {
  const v = valg();
  const p = price(v);
  el("felt-virksomhed").hidden = v.art !== "business";
  el("ke-skjema").hidden = v.art !== "municipal";
  el("felt-stat").hidden = v.art !== "state";
  el("kommune-eur").hidden = v.art !== "municipal";
  // Den, der arbejder alene, behøver ingen branche.
  el("felt-branche").hidden = v.art === "business" && v.persons === 1;
  // Kommuner og regioner: beløbet for fire år står i #ke-svar, der bestilles ét år.
  const svar = el("ke-svar");
  svar.textContent = "";
  if (v.art === "municipal" && p) {
    const b = document.createElement("b");
    b.textContent = kr(p.fourYears);
    svar.appendChild(b);
    svar.appendChild(document.createTextNode(" for fire år"));
  }
  el("ke-boks").hidden = v.art !== "municipal" || !p;
  el("prislinje").hidden = v.art === "municipal" || !p;
  el("belob").textContent = p ? kr(p.price) : "";
  // Kun prisen vises, aldrig hvordan den er regnet ud (ejeren, 20.11.2026).
  const n = el("note");
  n.textContent = !p
    ? MANGLER[v.art]
    : v.art === "municipal"
      ? "I bestiller det første år: " + kr(p.price) + ". Fakturaen kommer hvert år, og licenskoden gælder et år ad gangen."
      : "";
  n.hidden = !n.textContent;
  return p;
}
[personer, indbyggere, ansatte].forEach((f) => f.addEventListener("input", vis));
branche.addEventListener("change", vis);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", vis));
vis();

function fejl(tekst) {
  const e = el("fejl");
  e.textContent = tekst;
  e.hidden = !tekst;
}
el("harkode").addEventListener("click", () => {
  el("harkodeTekst").hidden = !el("harkodeTekst").hidden;
});
el("bestilling").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  fejl("");
  const v = valg();
  if (!price(v)) {
    fejl(MANGLER[v.art]);
    return (v.art === "municipal" ? indbyggere : v.art === "state" ? ansatte : personer).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("adresse").value.trim();
  if (name.length < 2) return fejl("Skriv organisationens navn."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fejl("Skriv den e-mailadresse, fakturaen skal sendes til."), el("email").focus();
  if (address.length < 8) return fejl("Skriv faktureringsadressen."), el("adresse").focus();
  const knap = el("bestil");
  knap.disabled = true;
  try {
    const svar = await fetch("/krystallklart/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        art: v.art,
        persons: v.persons ?? null,
        sector: v.sector ?? null,
        inhabitants: v.inhabitants ?? null,
        employees: v.employees ?? null,
        name,
        email,
        address,
        reference: el("reference").value.trim(),
        website: el("website").value,
      }),
    });
    const data = await svar.json().catch(() => ({}));
    if (!svar.ok || !data.ok) throw new Error(data.error || "Noget gik galt hos os. Prøv igen om lidt.");
    const belob = kr(data.price);
    el("takTekst").textContent = data.sent
      ? "Faktura " + data.invoice + " på " + belob + " er på vej til " + email + ". Licenskoden sender vi til samme adresse, så snart betalingen er modtaget."
      : "Bestillingen er modtaget: " + data.invoice + " på " + belob + ". Fakturaen sender vi snart til " + email + ". Licenskoden kommer, så snart betalingen er modtaget.";
    el("bestilling").hidden = true;
    el("tak").hidden = false;
    el("tak").focus();
  } catch (e) {
    fejl(e instanceof TypeError ? "Bestillingen kunne ikke sendes. Tjek forbindelsen, og prøv igen." : e.message);
    knap.disabled = false;
  }
});
