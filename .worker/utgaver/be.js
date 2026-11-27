// Clair & Klaar (Belgian edition). Pages in clair-klaar/ (Dutch) and clair-klaar/fr/ (French), served at /clair-klaar/.
// Copied from nl.js (same keys as gb.js), customer texts in Belgian Dutch (u-form).
//
// Belgium is bilingual: the app asks for Dutch or French at first start, and opens the same activation page for both
// (clair-klaar/activeren, which shows both languages). The worker format has one language, so the normal keys below
// are DUTCH, and the same customer texts in FRENCH are under the extra key `fr` (navn, lisensfil, penger, dato and t,
// with exactly the shapes of the Dutch ones). klart.js does not use `fr` yet; the lead decides how. Both order forms
// send `lang: "nl" | "fr"` as an extra JSON key, and price() takes an optional `lang` that gives the French sector name.
import { price } from "../../clair-klaar/prijzen/price.js";

const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");
const tallFr = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, " ");
const MÅNEDER = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const BANK = (houder, bank) => [
  [houder, "ESBJUG CONSULT"],
  ["IBAN", "NO91 1080 2731 456"],
  ["BIC / SWIFT", "SPTRNO22"],
  [bank[0], bank[1]],
];

export default {
  kode: "be",
  land: "Belgia",
  sti: "clair-klaar",
  alias: ["clairklaar", "clair-et-klaar", "clair-en-klaar", "clair&klaar", "clair-&-klaar", "clair_klaar", "clairetklaar", "clairenklaar", "be", "belgie", "belgië", "belgique"],
  // The path the app opens for «Koop een licentie» / «Acheter une licence» and «Ik heb een licentie» / «J'ai une licence»
  // in both languages (lisens_apne_side in aktivering.rs: concat!(be_naam!(sti), "/activeren")):
  // clair-klaar/activeren?hva=kjop|aktiver&maskin=…
  aktivering: "activeren",
  prisSti: "prijzen",
  navn: "Clair & Klaar",
  avsender: { email: "clairklaar@esbjugconsult.com", name: "Clair & Klaar" },
  // PREFIKS_BE = concat!(be_naam!(stor), "-") in aktivering.rs.
  prefiks: "CLAIRKLAAR-",
  nrPrefiks: "BE-",
  // The extension is fr_naam!(lisens) / nl_naam!(liten)+"licentie" = .clairklaarlicentie in every language.
  lisensfil: "Clair & Klaar licentie.clairklaarlicentie",
  frist: 30,
  penger: (n) => "€ " + tall(n),
  dato: (iso) => `${Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Noorwegen", "Org.nr. 938 441 405"],
  // All four builds exist. The lead fixes sizes and checksums.
  filer: {
    mac: { key: "2026-11-26/be/Clair-Klaar_0.1.0_universal.dmg", navn: "Clair & Klaar.dmg" },
    windows: { key: "2026-11-27c/be/Clair-Klaar_0.1.0_x64-setup.exe", navn: "Clair & Klaar.exe" },
    linux: { key: "2026-11-26/be/Clair-Klaar_0.1.0_amd64.deb", navn: "Clair-Klaar_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/be/Clair-Klaar_0.1.0_arm64.deb", navn: "Clair-Klaar_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Niet gevonden.",
    ikkeApen: "Bestellen is nog niet mogelijk.",
    feilServer: (eier) => `Er ging bij ons iets mis. Probeer het zo nog eens, of schrijf naar ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Vul het aantal inwoners in." : art === "state" ? "Vul het aantal medewerkers in." : "Vul in hoeveel mensen er in de organisatie werken.",
      navn: "Vul de naam van de organisatie in.",
      epost: "Vul het e-mailadres in waar de factuur naartoe moet.",
      adresse: "Vul het factuuradres in.",
    },
    // What the order covers, as it reads on the invoice.
    fakturaLinje: (o) => `Clair & Klaar, licentie voor een jaar, voor de hele organisatie (${
      o.art === "municipal" ? `${tall(o.inhabitants)} inwoners${o.fourYears ? ", jaar 1 van 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} medewerkers`
      : o.persons === 1 ? "1 persoon" : `${tall(o.persons)} personen, ${o.sector}`})`,
    faktura: {
      tittel: "Factuurnummer",
      dato: "Factuurdatum",
      forfall: "Vervaldatum",
      fristTekst: (d, dager) => `${d} (${dager} dagen)`,
      referanse: "Uw bestelbonnummer / kenmerk",
      fra: "Van",
      til: "Aan",
      belop: "Te betalen",
      mva: "Verlegging van heffing. De btw is verschuldigd door de medecontractant (art. 51, § 2, 1°, Btw-Wetboek; art. 196 Btw-richtlijn 2006/112/EG).",
      betaling: "Betaling",
      betalTekst: (nr) => `Betaal per overschrijving en vermeld ${nr} als mededeling. De bank is in Noorwegen; een SEPA-overschrijving in euro is mogelijk.`,
      bank: BANK("Rekeninghouder", ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Noorwegen"]),
      formaal: "Mededeling",
      nokkel: "We sturen de licentiecode naar dit e-mailadres zodra de betaling binnen is. Tot dan werkt Clair & Klaar 30 dagen volledig vanaf het eerste gebruik.",
      sporsmal: "Vragen",
    },
    emneFaktura: (nr, navn) => `Factuur ${nr} voor Clair & Klaar: ${navn}`,
    emneLisens: (navn) => `Uw licentiecode voor Clair & Klaar: ${navn}`,
    // The same text the app writes in a licence file (aktivering.rs, the nl: arm with nl_naam!() = be_naam!()).
    lisensfilTekst: (navn, kode) => `Licentie voor Clair & Klaar: ${navn}\n\nDubbelklik op dit bestand of sleep het naar het venster van Clair & Klaar, en Clair & Klaar is geactiveerd.\nU kunt de code hieronder ook plakken in Clair & Klaar › Licentie.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Hartelijk dank. De betaling voor factuur ${faktura} is binnen. Hier is de licentiecode voor ${navn}.`,
      ``,
      `Open Clair & Klaar en klik rechtsboven op “Licentie” (tijdens de proefperiode staat daar “Proefperiode: nog … dagen”). Plak de code hieronder in het veld en klik op “Activeer”.`,
      `Op een Mac kunt u ook dubbelklikken op het bijgevoegde bestand of het naar het venster van Clair & Klaar slepen.`,
      `Iedereen in de organisatie gebruikt dezelfde licentiecode. Deel hem onder Licentie › “Deel met collega's”. Hij geldt tot en met ${utloper}.`,
      ``,
      kode,
      ``,
      `Vragen: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
  // FRENCH copies of the customer-facing keys above (same shapes). Not read by klart.js today: when an order arrives
  // with `lang: "fr"`, the lead can use u.fr.t / u.fr.penger / u.fr.dato / u.fr.lisensfil instead of the Dutch ones.
  fr: {
    navn: "Clair & Klaar",
    lisensfil: "Licence Clair & Klaar.clairklaarlicentie",
    penger: (n) => tallFr(n) + " €",
    dato: (iso) => `${Number(iso.slice(8, 10)) === 1 ? "1er" : Number(iso.slice(8, 10))} ${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
    selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norvège", "N° d’organisation 938 441 405"],
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
      fakturaLinje: (o) => `Clair & Klaar, licence d’un an pour toute l’organisation (${
        o.art === "municipal" ? `${tallFr(o.inhabitants)} habitants${o.fourYears ? ", année 1 sur 4" : ""}`
        : o.art === "state" ? `${tallFr(o.employees)} agents`
        : o.persons === 1 ? "1 personne" : `${tallFr(o.persons)} personnes, ${o.sector}`})`,
      faktura: {
        tittel: "Facture n°",
        dato: "Date de facture",
        forfall: "Date d’échéance",
        fristTekst: (d, dager) => `${d} (${dager} jours)`,
        referanse: "Votre bon de commande / référence",
        fra: "De",
        til: "À",
        belop: "Montant à payer",
        mva: "Autoliquidation. La TVA est due par le cocontractant (art. 51, § 2, 1°, du Code de la TVA ; art. 196 de la directive 2006/112/CE).",
        betaling: "Paiement",
        betalTekst: (nr) => `Merci de payer par virement en indiquant ${nr} en communication. La banque est en Norvège ; un virement SEPA en euros convient.`,
        bank: BANK("Titulaire du compte", ["Banque", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norvège"]),
        formaal: "Communication",
        nokkel: "Nous envoyons la clé de licence à cette adresse e-mail dès réception du paiement. D’ici là, Clair & Klaar fonctionne pleinement pendant 30 jours à partir de la première utilisation.",
        sporsmal: "Questions",
      },
      emneFaktura: (nr, navn) => `Facture ${nr} pour Clair & Klaar : ${navn}`,
      emneLisens: (navn) => `Votre clé de licence Clair & Klaar : ${navn}`,
      // The fr: arm in aktivering.rs with fr_naam!(krum) = be_naam!().
      lisensfilTekst: (navn, kode) => `Licence Clair & Klaar : ${navn}\n\nDouble-cliquez sur ce fichier ou déposez-le dans la fenêtre de Clair & Klaar : Clair & Klaar sera activé.\nVous pouvez aussi coller le code ci-dessous dans Clair & Klaar › Licence.\n\n${kode}\n`,
      lisensEpost: ({ faktura, navn, kode, utloper }) => [
        `Merci. Le paiement de la facture ${faktura} est bien arrivé. Voici la clé de licence pour ${navn}.`,
        ``,
        `Ouvrez Clair & Klaar et cliquez sur « Licence » en haut à droite (pendant l’essai, il est écrit « Essai : … jours restants »). Collez le code ci-dessous dans le champ et cliquez sur « Activer ».`,
        `Sur Mac, vous pouvez aussi double-cliquer sur le fichier joint ou le faire glisser sur la fenêtre de Clair & Klaar.`,
        `Toute l’organisation utilise la même clé de licence. Partagez-la sous Licence › « Partager avec des collègues ». Elle est valable jusqu’au ${utloper} inclus.`,
        ``,
        kode,
        ``,
        `Questions : tidemann@esbjugconsult.com`,
      ].join("\n"),
    },
  },
};
