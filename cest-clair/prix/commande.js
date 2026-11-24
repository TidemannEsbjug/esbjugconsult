// La page de prix et de commande de C’est Clair. Le prix vient de price.js, le même fichier avec lequel le serveur
// établit la facture ; les deux ne peuvent donc pas diverger. Pour les collectivités, la page affiche aussi le
// montant pour quatre ans (#ke-svar). Rien n’est envoyé avant que l’on clique sur « Commander sur facture ».
import { SECTEURS, price } from "./price.js";

const el = (id) => document.getElementById(id);
const euro = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, " ") + " €";
const persons = el("persons"), sector = el("sector"), inhabitants = el("ke-innbyggere"), employees = el("employees");
SECTEURS.forEach((s, i) => sector.add(new Option(s[0], i)));
sector.value = String(SECTEURS.findIndex((s) => s[0].startsWith("Conseil")));

const MANQUE = {
  business: "Indiquez combien de personnes travaillent dans l’organisation.",
  municipal: "Indiquez le nombre d’habitants.",
  state: "Indiquez le nombre d’agents.",
};
const chiffre = (champ) => Math.floor(Number(String(champ.value).replace(/[^0-9]/g, ""))) || 0;

function choix() {
  const art = document.querySelector("input[name=art]:checked").value;
  if (art === "municipal") return { art, inhabitants: chiffre(inhabitants) };
  if (art === "state") return { art, employees: chiffre(employees) };
  return { art: "business", persons: chiffre(persons), sector: Number(sector.value) };
}
function affiche() {
  const c = choix();
  const p = price(c);
  el("champ-business").hidden = c.art !== "business";
  el("ke-skjema").hidden = c.art !== "municipal";
  el("champ-state").hidden = c.art !== "state";
  el("kommune-eur").hidden = c.art !== "municipal";
  // Qui travaille seul n’a pas besoin de secteur.
  el("champ-sector").hidden = c.art === "business" && c.persons === 1;
  // Collectivités : le montant pour quatre ans s’affiche dans #ke-svar ; on commande une année.
  el("ke-boks").hidden = c.art !== "municipal" || !p;
  const svar = el("ke-svar");
  svar.textContent = "";
  if (c.art === "municipal" && p) {
    const b = document.createElement("b");
    b.textContent = euro(p.fourYears);
    svar.append(b, " pour quatre ans (" + euro(p.price) + " par an)");
  }
  svar.hidden = !svar.textContent;
  el("prixligne").hidden = c.art === "municipal" || !p;
  el("montant").textContent = p ? euro(p.price) : "";
  // Seul le prix est affiché, jamais le calcul (le propriétaire, 20.11.2026).
  const h = el("indication");
  h.textContent = !p ? MANQUE[c.art] : c.art === "municipal" ? "Vous commandez la première année : " + euro(p.price) + ". La facture arrive chaque année, et la clé de licence vaut chaque fois pour un an." : "";
  h.hidden = !h.textContent;
  return p;
}
[persons, inhabitants, employees].forEach((f) => f.addEventListener("input", affiche));
sector.addEventListener("change", affiche);
document.querySelectorAll("input[name=art]").forEach((r) => r.addEventListener("change", affiche));
el("ke-skjema").addEventListener("submit", (e) => e.preventDefault());
affiche();

function erreur(texte) {
  const e = el("erreur");
  e.textContent = texte;
  e.hidden = !texte;
}
el("deja").addEventListener("click", () => {
  el("dejaTexte").hidden = !el("dejaTexte").hidden;
});
el("commande").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  erreur("");
  const c = choix();
  if (!price(c)) {
    erreur(MANQUE[c.art]);
    return (c.art === "municipal" ? inhabitants : c.art === "state" ? employees : persons).focus();
  }
  const name = el("org").value.trim(), email = el("email").value.trim(), address = el("adresse").value.trim();
  if (name.length < 2) return erreur("Indiquez le nom de l’organisation."), el("org").focus();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur("Indiquez l’adresse e-mail à laquelle envoyer la facture."), el("email").focus();
  if (address.length < 8) return erreur("Indiquez l’adresse de facturation."), el("adresse").focus();
  const bouton = el("commander");
  bouton.disabled = true;
  try {
    const reponse = await fetch("/cest-clair/api/order", {
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
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok || !donnees.ok) throw new Error(donnees.error || "Un problème est survenu de notre côté. Réessayez dans un instant.");
    const montant = euro(donnees.price);
    el("merciTexte").textContent = donnees.sent
      ? "La facture " + donnees.invoice + " d’un montant de " + montant + " a été envoyée à " + email + ". Nous enverrons la clé de licence à la même adresse dès réception du paiement."
      : "Votre commande est bien reçue : " + donnees.invoice + ", d’un montant de " + montant + ". Nous enverrons la facture sous peu à " + email + ". La clé de licence suivra dès réception du paiement.";
    el("commande").hidden = true;
    el("merci").hidden = false;
    el("merci").focus();
  } catch (e) {
    erreur(e instanceof TypeError ? "La commande n’a pas pu être envoyée. Vérifiez la connexion et réessayez." : e.message);
    bouton.disabled = false;
  }
});
