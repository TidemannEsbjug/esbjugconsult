// C'est Clair (édition française). Pages dans cest-clair/, servies sous /cest-clair/.
// Copié de gb.js : mêmes clés, textes en français (vouvoiement).
import { price } from "../../cest-clair/prix/price.js";

const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, " ");
const MÅNEDER = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default {
  kode: "fr",
  land: "Frankrike",
  sti: "cest-clair",
  alias: ["cestclair", "c-est-clair", "cest_clair", "c'est-clair", "c’est-clair", "c'est clair", "c’est clair", "cest clair", "c'estclair", "fr"],
  // Le chemin que l'app ouvre pour « Acheter une licence » / « J'ai une licence » (lisens_apne_side dans aktivering.rs) :
  // cest-clair/activer?hva=kjop|aktiver&maskin=…
  aktivering: "activer",
  prisSti: "prix",
  navn: "C’est Clair",
  avsender: { email: "cestclair@esbjugconsult.com", name: "C’est Clair" },
  prefiks: "CESTCLAIR-",
  nrPrefiks: "FR-",
  lisensfil: "Licence C’est Clair.cestclairlicence",
  frist: 30,
  penger: (n) => tall(n) + " €",
  dato: (iso) => `${Number(iso.slice(8, 10)) === 1 ? "1er" : Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norvège", "N° d’organisation 938 441 405"],
  // Seule la version Mac existe pour l'instant.
  filer: {
    mac: { key: "2026-11-26/fr/Cest-Clair_0.1.0_universal.dmg", navn: "C'est Clair.dmg" },
    windows: { key: "2026-11-27c/fr/Cest-Clair_0.1.0_x64-setup.exe", navn: "C'est Clair.exe" },
    linux: { key: "2026-11-26/fr/Cest-Clair_0.1.0_amd64.deb", navn: "Cest-Clair_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/fr/Cest-Clair_0.1.0_arm64.deb", navn: "Cest-Clair_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Introuvable.",
    ikkeApen: "Les commandes ne sont pas encore ouvertes.",
    feilServer: (eier) => `Un problème est survenu de notre côté. Réessayez dans un instant, ou écrivez à ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Indiquez le nombre d’habitants." : art === "state" ? "Indiquez le nombre d’agents." : "Indiquez combien de personnes travaillent dans l’organisation.",
      navn: "Indiquez le nom de l’organisation.",
      epost: "Indiquez l’adresse e-mail à laquelle envoyer la facture.",
      adresse: "Indiquez l’adresse de facturation.",
    },
    // Ce que couvre la commande, tel qu'il figure sur la facture.
    fakturaLinje: (o) => `C’est Clair, licence d’un an pour toute l’organisation (${
      o.art === "municipal" ? `${tall(o.inhabitants)} habitants${o.fourYears ? ", année 1 sur 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} agents`
      : o.persons === 1 ? "1 personne" : `${tall(o.persons)} personnes, ${o.sector}`})`,
    faktura: {
      tittel: "Facture n°",
      dato: "Date de facture",
      forfall: "Date d’échéance",
      fristTekst: (d, dager) => `${d} (${dager} jours)`,
      referanse: "Votre bon de commande / référence",
      fra: "De",
      til: "À",
      belop: "Montant à payer",
      mva: "TVA non facturée. Autoliquidation : la TVA est due par le preneur (articles 259-1 et 283-2 du CGI).",
      betaling: "Paiement",
      betalTekst: (nr) => `Merci de payer par virement en indiquant ${nr} comme référence. La banque est en Norvège ; un virement SEPA en euros convient. En cas de retard de paiement, une indemnité forfaitaire pour frais de recouvrement de 40 € est due.`,
      bank: [
        ["Titulaire du compte", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Banque", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norvège"],
      ],
      formaal: "Référence",
      nokkel: "Nous envoyons la clé de licence à cette adresse e-mail dès réception du paiement. D’ici là, C’est Clair fonctionne pleinement pendant 30 jours à partir de la première utilisation.",
      sporsmal: "Questions",
    },
    emneFaktura: (nr, navn) => `Facture ${nr} pour C’est Clair : ${navn}`,
    emneLisens: (navn) => `Votre clé de licence C’est Clair : ${navn}`,
    // Le même texte que celui que l'app écrit dans un fichier de licence (aktivering.rs).
    lisensfilTekst: (navn, kode) => `Licence C’est Clair : ${navn}\n\nDouble-cliquez sur ce fichier ou déposez-le dans la fenêtre de C’est Clair : C’est Clair sera activé.\nVous pouvez aussi coller le code ci-dessous dans C’est Clair › Licence.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Merci. Le paiement de la facture ${faktura} est bien arrivé. Voici la clé de licence pour ${navn}.`,
      ``,
      `Ouvrez C’est Clair et cliquez sur « Licence » en haut à droite (pendant l’essai, il est écrit « Essai : … jours restants »). Collez le code ci-dessous dans le champ et cliquez sur « Activer ».`,
      `Sur Mac, vous pouvez aussi double-cliquer sur le fichier joint ou le faire glisser sur la fenêtre de C’est Clair.`,
      `Toute l’organisation utilise la même clé de licence. Partagez-la sous Licence › « Partager avec des collègues ». Elle est valable jusqu’au ${utloper} inclus.`,
      ``,
      kode,
      ``,
      `Questions : tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
