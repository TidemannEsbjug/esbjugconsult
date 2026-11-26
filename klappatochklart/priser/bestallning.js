// Sidan med pris och beställning för Klappat och Klart. Priset kommer från price.js, samma fil som servern räknar
// fakturan med, så de två kan inte skilja sig åt. För kommuner och regioner står beloppet för fyra år i #ke-svar.
// Ingenting skickas förrän någon klickar på ”Beställ mot faktura”.
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
// 12 345 kr, med hårt mellanslag mellan tusentalen som i svensk skrift.
const kr = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, " ") + " kr";
const personer = el("personer"), bransch = el("bransch"), invanare = el("ke-innbyggere"), anstallda = el("anstallda");
SECTORS.forEach((s, i) => bransch.add(new Option(s[0], i)));
bransch.value = String(SECTORS.findIndex((s) => s[0].startsWith("Konsult, it")));

const SAKNAS = {
  business: "Ange hur många personer som arbetar i organisationen.",
  municipal: "Ange antal invånare.",
  state: "Ange antal anställda.",
};
const tal = (falt) => Math.floor(Number(String(falt.value).replace(/[^0-9]/g, ""))) || 0;

function val() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: tal(invanare) };
  if (art === "state") return { art, employees: tal(anstallda) };
  return { art: "business", persons: tal(personer), sector: Number(bransch.value) };
}
function visa() {
  const v = val();
  const p = price(v);
  el("falt-foretag").hidden = v.art !== "business";
  el("ke-skjema").hidden = v.art !== "municipal";
  el("falt-stat").hidden = v.art !== "state";
  el("kommune-eur").hidden = v.art !== "municipal";
  // Den som arbetar ensam behöver ingen bransch.
  el("falt-bransch").hidden = v.art === "business" && v.persons === 1;
  // Kommuner och regioner: beloppet för fyra år står i #ke-svar, ett år i taget beställs.
  const svar = el("ke-svar");
  svar.textContent = "";
  if (v.art === "municipal" && p) {
    const b = document.createElement("b");
    b.textContent = kr(p.fourYears);
    svar.appendChild(b);
    svar.appendChild(document.createTextNode(" för fyra år"));
  }
  el("ke-boks").hidden = v.art !== "municipal" || !p;
  el("prisrad").hidden = v.art === "municipal" || !p;
  el("belopp").textContent = p ? kr(p.price) : "";
  // Bara priset visas, aldrig hur det räknas fram (ägaren, 20.11.2026).
  const n = el("notis");
  n.textContent = !p
    ? SAKNAS[v.art]
    : v.art === "municipal"
      ? "Ni beställer det första året: " + kr(p.price) + ". Fakturan kommer en gång om året, och licensnyckeln gäller ett år."
      : "";
  n.hidden = !n.textContent;
  return p;
}
[personer, invanare, anstallda].forEach((f) => f.addEventListener("input", visa));
bransch.addEventListener("change", visa);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", visa));
visa();

function fel(tekst) {
  const e = el("fel");
  e.textContent = tekst;
  e.hidden = !tekst;
}
el("harkod").addEventListener("click", () => {
  el("harkodTekst").hidden = !el("harkodTekst").hidden;
});
el("bestallning").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  fel("");
  const v = val();
  if (!price(v)) {
    fel(SAKNAS[v.art]);
    return (v.art === "municipal" ? invanare : v.art === "state" ? anstallda : personer).focus();
  }
  const name = el("org").value.trim(), email = el("epost").value.trim(), address = el("adress").value.trim();
  if (name.length < 2) return fel("Ange organisationens namn."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fel("Ange den e-postadress som fakturan ska skickas till."), el("epost").focus();
  if (address.length < 8) return fel("Ange fakturaadressen."), el("adress").focus();
  const knapp = el("bestall");
  knapp.disabled = true;
  try {
    const svar = await fetch("/klappatochklart/api/order", {
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
        reference: el("referens").value.trim(),
        website: el("website").value,
      }),
    });
    const data = await svar.json().catch(() => ({}));
    if (!svar.ok || !data.ok) throw new Error(data.error || "Något gick fel hos oss. Försök igen om en stund.");
    const belopp = kr(data.price);
    el("tackTekst").textContent = data.sent
      ? "Faktura " + data.invoice + " på " + belopp + " är på väg till " + email + ". Licensnyckeln skickar vi till samma adress så snart betalningen har kommit in."
      : "Vi har tagit emot beställningen: " + data.invoice + " på " + belopp + ". Fakturan skickas snart till " + email + ". Licensnyckeln kommer så snart betalningen har kommit in.";
    el("bestallning").hidden = true;
    el("tack").hidden = false;
    el("tack").focus();
  } catch (e) {
    fel(e instanceof TypeError ? "Det gick inte att skicka beställningen. Kontrollera anslutningen och försök igen." : e.message);
    knapp.disabled = false;
  }
});
