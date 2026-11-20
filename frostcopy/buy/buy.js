// The US purchase page. The price shown here comes from price.js, the same file the server uses when it
// writes the invoice, so the two cannot disagree. Nothing is sent before "Order with invoice" is pressed.
import { BUSINESS, STATES, price } from "./price.js";

const el = (id) => document.getElementById(id);
const people = el("people"), business = el("business"), businessField = el("businessField");
BUSINESS.forEach((b, i) => business.add(new Option(b[0], i)));
const state = el("state");
state.add(new Option("Choose your state", ""));
Object.keys(STATES).forEach((k) => state.add(new Option(STATES[k][0], k)));

function choice() {
  const kind = document.querySelector("input[name=kind]:checked").value;
  return {
    people: Math.max(1, Math.floor(Number(people.value) || 1)),
    kind: kind === "private" ? "business" : kind,
    business: Number(business.value),
    state: state.value,
  };
}
function update() {
  const c = choice();
  const gov = c.kind !== "business";
  businessField.hidden = gov;
  el("stateField").hidden = !(c.kind === "state" || c.kind === "local");
  // A government office is priced by the people who would use the program, not by everyone it employs.
  el("peopleLabel").textContent = gov ? "People who would use FrostCopy" : "People in the organization";
  el("peopleHint").textContent = gov ? "The people in your office who work with the documents." : "Everyone on the payroll. Enter 1 if it is just you.";
  const p = price(c);
  el("amount").textContent = p ? "$" + p.price.toLocaleString("en-US") : "";
  // Only the price is shown, never how it was worked out (the owner, November 20, 2026).
  el("how").textContent = p ? "" : gov && !el("stateField").hidden && !c.state ? "Choose your state to see the price." : "Enter how many people.";
  el("how").hidden = Boolean(p);
}
people.addEventListener("input", update);
business.addEventListener("change", update);
state.addEventListener("change", update);
document.querySelectorAll("input[name=kind]").forEach((r) => r.addEventListener("change", update));
update();

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
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("address").value.trim();
  if (!price(choice())) return fail("Fill in the fields above the price first."), people.focus();
  if (name.length < 2) return fail("Write the name of the organization."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Write the email address the invoice should go to."), el("email").focus();
  if (address.length < 8) return fail("Write the billing address."), el("address").focus();
  const button = el("buy");
  button.disabled = true;
  try {
    const answer = await fetch("/frostcopy/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...choice(), name, email, address, reference: el("reference").value.trim(), website: el("website").value }),
    });
    const data = await answer.json().catch(() => ({}));
    if (!answer.ok || !data.ok) throw new Error(data.error || "Something went wrong on our side. Try again in a moment.");
    const amount = "$" + Number(data.price).toLocaleString("en-US");
    el("thanksText").textContent = data.sent
      ? "Invoice " + data.invoice + " for " + amount + " is on its way to " + email + ". The license is emailed to the same address when the payment has arrived."
      : "We have your order, " + data.invoice + " for " + amount + ". The invoice will be emailed to " + email + " shortly. The license follows when the payment has arrived.";
    el("order").hidden = true;
    el("thanks").hidden = false;
    el("thanks").focus();
  } catch (e) {
    fail(e.message);
    button.disabled = false;
  }
});
