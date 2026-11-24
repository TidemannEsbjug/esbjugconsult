// La página de precio y pedido de Clarísimo. El precio sale de price.js, el mismo archivo con el que el servidor
// escribe la factura, así que no pueden diferir. No se envía nada hasta que se pulsa «Pedir con factura».
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
const euros = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ".") + " €";
const persons = el("personas"), sector = el("sector"), inhabitants = el("habitantes"), employees = el("empleados");
SECTORS.forEach((b, i) => sector.add(new Option(b[0], i)));
sector.value = String(SECTORS.findIndex((b) => b[0].startsWith("Consultoría")));

const MISSING = {
  business: "Indique cuántas personas trabajan en la organización.",
  municipal: "Indique el número de habitantes.",
  state: "Indique el número de empleados.",
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
  el("campo-empresa").hidden = c.art !== "business";
  el("campo-municipio").hidden = c.art !== "municipal";
  el("campo-estado").hidden = c.art !== "state";
  el("municipios").hidden = c.art !== "municipal";
  // Quien trabaja solo no necesita sector.
  el("campo-sector").hidden = c.art === "business" && c.persons === 1;
  el("cuatro").hidden = c.art !== "municipal" || !p;
  if (p && p.fourYears) {
    el("cuatro").textContent = "";
    const b = document.createElement("b");
    b.textContent = euros(p.fourYears);
    el("cuatro").append(b, " por cuatro años (" + euros(p.price) + " al año)");
  }
  el("linea-precio").hidden = c.art === "municipal" || !p;
  el("importe").textContent = p ? euros(p.price) : "";
  // Solo se muestra el precio, nunca el cálculo.
  const h = el("aviso");
  h.textContent = !p ? MISSING[c.art] : c.art === "municipal" ? "Usted pide el primer año: " + euros(p.price) + ". La factura llega cada año, y la clave de licencia vale un año cada vez." : "";
  h.hidden = !h.textContent;
  return p;
}
[persons, inhabitants, employees].forEach((f) => f.addEventListener("input", show));
sector.addEventListener("change", show);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", show));
show();

function error(text) {
  const e = el("error");
  e.textContent = text;
  e.hidden = !text;
}
el("tengo").addEventListener("click", () => {
  el("tengoTexto").hidden = !el("tengoTexto").hidden;
});
el("pedido").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  error("");
  const c = choice();
  if (!price(c)) {
    error(MISSING[c.art]);
    return (c.art === "municipal" ? inhabitants : c.art === "state" ? employees : persons).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("direccion").value.trim();
  if (name.length < 2) return error("Indique el nombre de la organización."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Indique el correo electrónico al que debe ir la factura."), el("email").focus();
  if (address.length < 8) return error("Indique la dirección de facturación."), el("direccion").focus();
  const button = el("pedir");
  button.disabled = true;
  try {
    const answer = await fetch("/clarisimo/api/order", {
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
        reference: el("referencia").value.trim(),
        website: el("website").value,
      }),
    });
    const data = await answer.json().catch(() => ({}));
    if (!answer.ok || !data.ok) throw new Error(data.error || "Algo ha fallado por nuestra parte. Inténtelo de nuevo dentro de un momento.");
    const amount = euros(data.price);
    el("graciasTexto").textContent = data.sent
      ? "La factura " + data.invoice + " por " + amount + " va de camino a " + email + ". Enviaremos la clave de licencia a la misma dirección en cuanto recibamos el pago."
      : "Hemos recibido su pedido: " + data.invoice + " por " + amount + ". Enviaremos la factura en breve a " + email + ". La clave de licencia llegará en cuanto recibamos el pago.";
    el("pedido").hidden = true;
    el("gracias").hidden = false;
    el("gracias").focus();
  } catch (e) {
    error(e instanceof TypeError ? "No se ha podido enviar el pedido. Compruebe la conexión e inténtelo de nuevo." : e.message);
    button.disabled = false;
  }
});
