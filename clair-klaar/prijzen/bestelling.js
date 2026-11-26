// Pris- og bestillingssiden til Clair & Klaar. Prisen kommer fra price.js, den samme filen serveren skriver fakturaen
// med, så de to kan ikke spri. Ingenting sendes før «Bestel op factuur» trykkes.
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
const euro = (n) => "€ " + String(n).replace(/\B(?=(\d{3})+$)/g, ".");
const persons = el("persons"), sector = el("sector"), inhabitants = el("inhabitants"), employees = el("employees");
SECTORS.forEach((s, i) => sector.add(new Option(s[0], i)));
sector.value = String(SECTORS.findIndex((s) => s[0].startsWith("Advies")));

const MISSING = {
  business: "Vul in hoeveel mensen er in de organisatie werken.",
  municipal: "Vul het aantal inwoners in.",
  state: "Vul het aantal medewerkers in.",
};
const number = (field) => Math.floor(Number(String(field.value).replace(/[^0-9]/g, ""))) || 0;

function choice() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: number(inhabitants) };
  if (art === "state") return { art, employees: number(employees) };
  return { art: "business", persons: number(persons), sector: Number(sector.value), lang: "nl" };
}
function show() {
  const c = choice();
  const p = price(c);
  el("field-business").hidden = c.art !== "business";
  el("field-municipal").hidden = c.art !== "municipal";
  el("field-state").hidden = c.art !== "state";
  el("municipal-table").hidden = c.art !== "municipal";
  // Den som jobber alene, trenger ingen bransje.
  el("field-sector").hidden = c.art === "business" && c.persons === 1;
  el("amount").textContent = p ? euro(p.price) : "";
  el("priceline").hidden = !p;
  // Bare prisen vises, aldri regnestykket (eieren 20.11.2026).
  const h = el("note");
  h.textContent = !p
    ? MISSING[c.art]
    : c.art === "municipal"
      ? "Vier jaar kosten " + euro(p.fourYears) + ". U bestelt nu het eerste jaar; de factuur komt elk jaar, en elke licentiecode geldt een jaar."
      : "";
  h.hidden = !h.textContent;
  return p;
}
[persons, inhabitants, employees].forEach((f) => f.addEventListener("input", show));
sector.addEventListener("change", show);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", show));
show();

function fail(text) {
  const e = el("error");
  e.textContent = text;
  e.hidden = !text;
}
el("have").addEventListener("click", () => {
  el("haveText").hidden = !el("haveText").hidden;
});
el("order").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  fail("");
  const c = choice();
  if (!price(c)) {
    fail(MISSING[c.art]);
    return (c.art === "municipal" ? inhabitants : c.art === "state" ? employees : persons).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("address").value.trim();
  if (name.length < 2) return fail("Vul de naam van de organisatie in."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Vul het e-mailadres in waar de factuur naartoe moet."), el("email").focus();
  if (address.length < 8) return fail("Vul het factuuradres in."), el("address").focus();
  const button = el("buy");
  button.disabled = true;
  try {
    const answer = await fetch("/clair-klaar/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        art: c.art,
        persons: c.persons ?? null,
        sector: c.sector ?? null,
        inhabitants: c.inhabitants ?? null,
        employees: c.employees ?? null,
        name,
        email,
        address,
        reference: el("reference").value.trim(),
        website: el("website").value,
        // Extra sleutel for den belgiske utgaven: språket på siden (serveren kan ignorere den).
        lang: "nl",
      }),
    });
    const data = await answer.json().catch(() => ({}));
    if (!answer.ok || !data.ok) throw new Error(data.error || "Er ging bij ons iets mis. Probeer het zo nog eens.");
    const amount = euro(data.price);
    el("thanksText").textContent = data.sent
      ? "Factuur " + data.invoice + " van " + amount + " is onderweg naar " + email + ". De licentiecode sturen we naar hetzelfde adres zodra de betaling binnen is."
      : "Uw bestelling is binnen: " + data.invoice + " van " + amount + ". De factuur sturen we binnenkort naar " + email + ". De licentiecode volgt zodra de betaling binnen is.";
    el("order").hidden = true;
    el("thanks").hidden = false;
    el("thanks").focus();
  } catch (e) {
    fail(e instanceof TypeError ? "De bestelling kon niet worden verstuurd. Controleer de verbinding en probeer het nog eens." : e.message);
    button.disabled = false;
  }
});
