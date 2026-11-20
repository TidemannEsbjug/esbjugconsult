// The US purchase page. The price shown here comes from price.js, the same file the server uses when it
// writes the invoice, so the two cannot disagree. Nothing is sent before "Order with invoice" is pressed.
import { BUSINESS, price } from "./price.js";

const el = (id) => document.getElementById(id);
const people = el("people"), business = el("business"), businessField = el("businessField");
BUSINESS.forEach((b, i) => business.add(new Option(b[0], i)));

function choice() {
  return {
    people: Math.max(1, Math.floor(Number(people.value) || 1)),
    kind: document.querySelector("input[name=kind]:checked").value === "gov" ? "gov" : "business",
    business: Number(business.value),
  };
}
function update() {
  const c = choice();
  businessField.hidden = c.kind === "gov";
  const p = price(c);
  el("amount").textContent = p ? "$" + p.price.toLocaleString("en-US") : "";
  el("how").textContent = p ? p.how : "Enter how many people work in the organization.";
}
people.addEventListener("input", update);
business.addEventListener("change", update);
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
