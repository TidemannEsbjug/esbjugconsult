// Le prix de C’est Clair, en euros hors taxes. Un seul fichier, utilisé par la page (le prix s’affiche pendant la
// saisie) et par le serveur (/cest-clair/api/order), qui refait le calcul et décide de ce qui figure sur la facture.
// Seul le prix est affiché, jamais le calcul (le propriétaire, 20.11.2026).
//
// Trois types d’acheteurs (art) :
//   business   entreprise, cabinet, association : nombre de personnes et secteur, prix par an.
//   municipal  commune, intercommunalité (EPCI), département ou région : nombre d’habitants. La courbe donne le
//              montant pour quatre ans ; un quart est commandé et facturé chaque année.
//   state      service de l’État, établissement public, juridiction, université : nombre d’agents, prix par an.
//
// Choix pour la France (24.11.2026 ; le propriétaire n’a pas encore fixé ces prix) :
// - Entreprises : même courbe et mêmes parts par secteur que l’édition allemande (noms des secteurs traduits).
// - Seuil : depuis le 1.4.2026, tout acheteur public peut acheter des fournitures ou services strictement sous
//   60 000 € HT sans publicité ni mise en concurrence (CCP R2122-8, décret 2025-1386). La valeur comptée est celle
//   de toute la durée, renouvellements compris (R2121-1 et s.), donc quatre ans pour une licence de quatre ans
//   (recherche 42 dans Klart-fr-grunnlag). Les deux courbes publiques plafonnent à 58 000 € pour quatre ans,
//   soit 14 500 € par an, avec une marge sous 60 000 €.
// - Collectivités : jusqu’à 50 000 habitants, le total sur quatre ans reste sous 25 000 € HT (déclaration
//   simplifiée des données essentielles ; pas de contrat écrit obligatoire dans des règlements comme celui
//   d’Hyères). Au-delà, la courbe monte doucement vers le plafond (grandes villes, départements, régions).
// - État : 3 000 € + 8 € par agent et par an, plafonné à 14 500 € par an, pour que même quatre années de suite
//   restent sous 60 000 €. Un service de 200 agents paie 4 600 € par an (18 400 € sur quatre ans).
// - Pas de TVA facturée : vendeur norvégien, autoliquidation par l’acheteur.
export const ALLEIN = 260;
const KURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Collectivités : ligne droite entre les points, constante au-delà du dernier. Montant pour quatre ans.
// Les mêmes points figurent dans le tableau de prix/index.html.
export const COMMUNE = [[500, 1200], [2000, 2400], [5000, 4800], [20000, 12000], [50000, 24000], [100000, 36000], [250000, 50000], [500000, 58000]];
const ETAT = { base: 3000, parAgent: 8, auPlus: 14500 };
export const MAX_NOMBRE = 100000000;
// La part des personnes qui est comptée. Un troisième nombre est un facteur sur le prix.
export const SECTEURS = [
  ["Cabinet d’avocats ou office notarial", 1], ["Expertise comptable, audit ou comptabilité", 1],
  ["Banque, finance ou assurance", 1], ["Recrutement ou services RH", 1],
  ["Conseil, informatique ou autre travail de bureau", 1], ["Immobilier", 1], ["Association, fédération ou fondation", 1],
  ["Santé", 0.4], ["Écoles et formation", 0.4], ["Action sociale et médico-social", 0.4],
  ["Aéronautique", 0.3, 1.5], ["Commerce de détail", 0.2],
  ["Bâtiment et artisanat", 0.15], ["Industrie et production", 0.15], ["Transport et logistique", 0.15],
  ["Agriculture, sylviculture et pêche", 0.15], ["Industries extractives", 0.15], ["Énergie, eau et déchets", 0.15], ["Garage automobile", 0.15],
  ["Hôtellerie et restauration", 0.1], ["Sécurité privée", 0.1], ["Nettoyage et gestion d’immeubles", 0.1],
  ["Travail temporaire", 0.05],
];

function loglog(points, x) {
  if (x <= points[0][0]) return points[0][1];
  let i = points.findIndex((p) => p[0] >= x);
  if (i === -1) i = points.length - 1;
  const [x0, y0] = points[i - 1], [x1, y1] = points[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}
function linear(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return points[points.length - 1][1];
}
function arrondi(p) {
  const pas = p < 1000 ? 10 : p < 10000 ? 50 : 100;
  return Math.round(p / pas) * pas;
}
function nombre(valeur) {
  const n = Math.floor(Number(valeur));
  return Number.isFinite(n) && n >= 1 && n <= MAX_NOMBRE ? n : null;
}

/** { price (euros entiers HT par an), art, et selon le type : persons et sector (nom affiché), inhabitants et
    fourYears, ou employees }, ou null si les données ne sont pas valables. */
export function price({ art, persons, sector, inhabitants, employees }) {
  if (art === "municipal") {
    const n = nombre(inhabitants);
    if (!n) return null;
    const fourYears = Math.round(linear(COMMUNE, n) / 100) * 100;
    return { price: Math.round(fourYears / 4), fourYears, art, inhabitants: n };
  }
  if (art === "state") {
    const n = nombre(employees);
    if (!n) return null;
    const p = Math.min(ETAT.auPlus, Math.round((ETAT.base + ETAT.parAgent * n) / 10) * 10);
    return { price: p, art, employees: n };
  }
  if (art !== "business") return null;
  const n = nombre(persons);
  if (!n) return null;
  if (n === 1) return { price: ALLEIN, art, persons: 1, sector: null };
  const s = SECTEURS[Number(sector)];
  if (!s) return null;
  const comptees = Math.max(1, n * s[1]);
  return { price: Math.max(ALLEIN, arrondi(loglog(KURVE, comptees) * (s[2] || 1))), art, persons: n, sector: s[0] };
}
