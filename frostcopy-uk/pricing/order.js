// The British price and order page. The price comes from price.js, the same file the server uses when it writes the
// invoice, so the two cannot disagree. Nothing is sent before "Order on invoice" is pressed.
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
const pounds = (n) => "£" + String(n).replace(/\B(?=(\d{3})+$)/g, ",");
const persons = el("persons"), sector = el("sector"), inhabitants = el("inhabitants"), employees = el("employees");
SECTORS.forEach((s, i) => sector.add(new Option(s[0], i)));
sector.value = String(SECTORS.findIndex((s) => s[0].startsWith("Consultancy")));

const MISSING = {
  business: "Enter how many people work in the organisation.",
  municipal: "Enter the population.",
  state: "Enter the number of staff.",
};
const number = (field) => Math.floor(Number(String(field.value).replace(/[^0-9]/g, ""))) || 0;

function choice() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: number(inhabitants) };
  if (art === "state") return { art, employees: number(employees) };
  return { art: "business", persons: number(persons), sector: Number(sector.value) };
}
function show() {
  const c = choice();
  const p = price(c);
  el("field-business").hidden = c.art !== "business";
  el("field-municipal").hidden = c.art !== "municipal";
  el("field-state").hidden = c.art !== "state";
  el("municipal-table").hidden = c.art !== "municipal";
  // Someone working alone needs no sector.
  el("field-sector").hidden = c.art === "business" && c.persons === 1;
  el("amount").textContent = p ? pounds(p.price) : "";
  el("priceline").hidden = !p;
  // Only the price is shown, never how it is worked out (the owner, 20.11.2026).
  const h = el("note");
  h.textContent = !p
    ? MISSING[c.art]
    : c.art === "municipal"
      ? "Four years cost " + pounds(p.fourYears) + ". You order the first year now; the invoice comes once a year, and each licence key lasts one year."
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
  if (name.length < 2) return fail("Enter the name of the organisation."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter the email address the invoice should go to."), el("email").focus();
  if (address.length < 8) return fail("Enter the billing address."), el("address").focus();
  const button = el("buy");
  button.disabled = true;
  try {
    const answer = await fetch("/frostcopy-uk/api/order", {
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
      }),
    });
    const data = await answer.json().catch(() => ({}));
    if (!answer.ok || !data.ok) throw new Error(data.error || "Something went wrong on our side. Try again in a moment.");
    const amount = pounds(data.price);
    el("thanksText").textContent = data.sent
      ? "Invoice " + data.invoice + " for " + amount + " is on its way to " + email + ". The licence key is emailed to the same address as soon as the payment has arrived."
      : "We have your order, " + data.invoice + " for " + amount + ". The invoice will be emailed to " + email + " shortly. The licence key follows as soon as the payment has arrived.";
    el("order").hidden = true;
    el("thanks").hidden = false;
    el("thanks").focus();
  } catch (e) {
    fail(e instanceof TypeError ? "The order could not be sent. Check the connection and try again." : e.message);
    button.disabled = false;
  }
});
