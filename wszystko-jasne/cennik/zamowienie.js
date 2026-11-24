// Strona z ceną i zamówieniem Wszystko Jasne. Cena pochodzi z price.js, tego samego pliku, którym serwer liczy
// fakturę, więc te dwie nie mogą się różnić. Dla samorządów kwota za cztery lata stoi w #ke-svar. Nic nie jest
// wysyłane, dopóki nie zostanie naciśnięte „Zamów na fakturę”.
import { SECTORS, price } from "./price.js";

const el = (id) => document.getElementById(id);
// 12 345 zł, z niełamliwymi spacjami, jak w polskiej pisowni.
const zl = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, " ") + " zł";
const osoby = el("osoby"), branza = el("branza"), mieszkancy = el("ke-innbyggere"), pracownicy = el("pracownicy");
SECTORS.forEach((s, i) => branza.add(new Option(s[0], i)));
branza.value = String(SECTORS.findIndex((s) => s[0].startsWith("Doradztwo, IT")));

const BRAK = {
  business: "Proszę podać, ile osób pracuje w organizacji.",
  municipal: "Proszę podać liczbę mieszkańców.",
  state: "Proszę podać liczbę pracowników.",
};
const liczba = (pole) => Math.floor(Number(String(pole.value).replace(/[^0-9]/g, ""))) || 0;

function wybor() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: liczba(mieszkancy) };
  if (art === "state") return { art, employees: liczba(pracownicy) };
  return { art: "business", persons: liczba(osoby), sector: Number(branza.value) };
}
function pokaz() {
  const w = wybor();
  const p = price(w);
  el("pole-firma").hidden = w.art !== "business";
  el("ke-skjema").hidden = w.art !== "municipal";
  el("pole-panstwo").hidden = w.art !== "state";
  el("kommune-eur").hidden = w.art !== "municipal";
  // Kto pracuje sam, nie potrzebuje branży.
  el("pole-branza").hidden = w.art === "business" && w.persons === 1;
  // Samorządy: kwota za cztery lata stoi w #ke-svar, zamawia się jeden rok.
  const svar = el("ke-svar");
  svar.textContent = "";
  if (w.art === "municipal" && p) {
    const b = document.createElement("b");
    b.textContent = zl(p.fourYears);
    svar.appendChild(b);
    svar.appendChild(document.createTextNode(" za cztery lata"));
  }
  el("ke-boks").hidden = w.art !== "municipal" || !p;
  el("linia-ceny").hidden = w.art === "municipal" || !p;
  el("kwota").textContent = p ? zl(p.price) : "";
  // Pokazujemy tylko cenę, nigdy sposób jej wyliczenia (właściciel, 20.11.2026).
  const u = el("uwaga");
  u.textContent = !p
    ? BRAK[w.art]
    : w.art === "municipal"
      ? "Zamawiają Państwo pierwszy rok: " + zl(p.price) + ". Faktura przychodzi co roku, a klucz licencyjny jest ważny przez rok."
      : "";
  u.hidden = !u.textContent;
  return p;
}
[osoby, mieszkancy, pracownicy].forEach((f) => f.addEventListener("input", pokaz));
branza.addEventListener("change", pokaz);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", pokaz));
pokaz();

function blad(tekst) {
  const e = el("blad");
  e.textContent = tekst;
  e.hidden = !tekst;
}
el("mam").addEventListener("click", () => {
  el("mamTekst").hidden = !el("mamTekst").hidden;
});
el("zamowienie").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  blad("");
  const w = wybor();
  if (!price(w)) {
    blad(BRAK[w.art]);
    return (w.art === "municipal" ? mieszkancy : w.art === "state" ? pracownicy : osoby).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("adres").value.trim();
  if (name.length < 2) return blad("Proszę podać nazwę organizacji."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return blad("Proszę podać adres e-mail, na który ma trafić faktura."), el("email").focus();
  if (address.length < 8) return blad("Proszę podać adres do faktury."), el("adres").focus();
  const przycisk = el("zamow");
  przycisk.disabled = true;
  try {
    const odpowiedz = await fetch("/wszystko-jasne/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        art: w.art,
        persons: w.persons ?? null,
        sector: w.sector ?? null,
        inhabitants: w.inhabitants ?? null,
        employees: w.employees ?? null,
        name,
        email,
        address,
        reference: el("znak").value.trim(),
        website: el("website").value,
      }),
    });
    const dane = await odpowiedz.json().catch(() => ({}));
    if (!odpowiedz.ok || !dane.ok) throw new Error(dane.error || "Coś poszło nie tak po naszej stronie. Proszę spróbować za chwilę.");
    const kwota = zl(dane.price);
    el("dziekiTekst").textContent = dane.sent
      ? "Faktura " + dane.invoice + " na " + kwota + " jest w drodze na adres " + email + ". Klucz licencyjny wyślemy na ten sam adres, gdy tylko wpłynie płatność."
      : "Zamówienie dotarło: " + dane.invoice + " na " + kwota + ". Fakturę wyślemy wkrótce na adres " + email + ". Klucz licencyjny przyjdzie, gdy tylko wpłynie płatność.";
    el("zamowienie").hidden = true;
    el("dzieki").hidden = false;
    el("dzieki").focus();
  } catch (e) {
    blad(e instanceof TypeError ? "Nie udało się wysłać zamówienia. Proszę sprawdzić połączenie i spróbować ponownie." : e.message);
    przycisk.disabled = false;
  }
});
