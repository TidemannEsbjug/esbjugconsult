// The US purchase page. The price shown here comes from price.js, the same file the server uses when it
// creates the payment, so the two cannot disagree. Nothing is sent before "Buy a license" is pressed.
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
  const name = el("org").value.trim(), email = el("email").value.trim();
  if (name.length < 2) return fail("Write the name of the organization."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Write your email address."), el("email").focus();
  const button = el("buy");
  button.disabled = true;
  try {
    const answer = await fetch("/frostcopy/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...choice(), name, email }),
    });
    const data = await answer.json().catch(() => ({}));
    if (!answer.ok || !data.url) throw new Error(data.error || "Something went wrong on our side. Try again in a moment.");
    location.href = data.url;
  } catch (e) {
    fail(e.message);
    button.disabled = false;
  }
});
