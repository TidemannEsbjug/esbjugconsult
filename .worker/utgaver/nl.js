// Klip en Klaar (Dutch edition). Pages in klip-en-klaar/, served at /klip-en-klaar/.
// Copied from gb.js: same keys, texts in Dutch (u-form).
import { price } from "../../klip-en-klaar/prijzen/price.js";

const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");
const MÅNEDER = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export default {
  kode: "nl",
  land: "Nederland",
  sti: "klip-en-klaar",
  alias: ["klipenklaar", "klip", "klipklaar", "klip-klaar", "nl", "nederland"],
  // The path the app opens for «Koop een licentie» / «Ik heb een licentie» (lisens_apne_side in aktivering.rs:
  // klip-en-klaar/activeren?hva=kjop|aktiver&maskin=…).
  aktivering: "activeren",
  prisSti: "prijzen",
  navn: "Klip en Klaar",
  avsender: { email: "klipenklaar@esbjugconsult.com", name: "Klip en Klaar" },
  prefiks: "KLIPENKLAAR-",
  nrPrefiks: "NL-",
  lisensfil: "Klip en Klaar licentie.klipenklaarlicentie",
  frist: 30,
  penger: (n) => "€ " + tall(n),
  dato: (iso) => `${Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Noorwegen", "Org.nr. 938 441 405"],
  filer: {
    mac: { key: "2026-11-26/nl/Klip-en-Klaar_0.1.0_universal.dmg", navn: "Klip en Klaar.dmg" },
    windows: { key: "2026-11-27/nl/Klip-en-Klaar_0.1.0_x64-setup.exe", navn: "Klip en Klaar.exe" },
    linux: { key: "2026-11-26/nl/Klip-en-Klaar_0.1.0_amd64.deb", navn: "Klip-en-Klaar_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/nl/Klip-en-Klaar_0.1.0_arm64.deb", navn: "Klip-en-Klaar_0.1.0_arm64.deb" },
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
    fakturaLinje: (o) => `Klip en Klaar, licentie voor een jaar, voor de hele organisatie (${
      o.art === "municipal" ? `${tall(o.inhabitants)} inwoners${o.fourYears ? ", jaar 1 van 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} medewerkers`
      : o.persons === 1 ? "1 persoon" : `${tall(o.persons)} personen, ${o.sector}`})`,
    faktura: {
      tittel: "Factuurnummer",
      dato: "Factuurdatum",
      forfall: "Vervaldatum",
      fristTekst: (d, dager) => `${d} (${dager} dagen)`,
      referanse: "Uw inkoopordernummer / kenmerk",
      fra: "Van",
      til: "Aan",
      belop: "Te betalen",
      mva: "Btw verlegd. De afnemer voldoet de btw (art. 12 lid 3 Wet OB 1968; art. 196 Btw-richtlijn 2006/112/EG).",
      betaling: "Betaling",
      betalTekst: (nr) => `Betaal per overschrijving en vermeld ${nr} als betalingskenmerk. De bank is in Noorwegen; een SEPA-overschrijving in euro is mogelijk.`,
      bank: [
        ["Rekeninghouder", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Noorwegen"],
      ],
      formaal: "Betalingskenmerk",
      nokkel: "We sturen de licentiecode naar dit e-mailadres zodra de betaling binnen is. Tot dan werkt Klip en Klaar 30 dagen volledig vanaf het eerste gebruik.",
      sporsmal: "Vragen",
    },
    emneFaktura: (nr, navn) => `Factuur ${nr} voor Klip en Klaar: ${navn}`,
    emneLisens: (navn) => `Uw licentiecode voor Klip en Klaar: ${navn}`,
    // The same text the app writes in a licence file (aktivering.rs).
    lisensfilTekst: (navn, kode) => `Licentie voor Klip en Klaar: ${navn}\n\nDubbelklik op dit bestand of sleep het naar het venster van Klip en Klaar, en Klip en Klaar is geactiveerd.\nU kunt de code hieronder ook plakken in Klip en Klaar › Licentie.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Hartelijk dank. De betaling voor factuur ${faktura} is binnen. Hier is de licentiecode voor ${navn}.`,
      ``,
      `Open Klip en Klaar en klik rechtsboven op “Licentie” (tijdens de proefperiode staat daar “Proefperiode: nog … dagen”). Plak de code hieronder in het veld en klik op “Activeer”.`,
      `Op een Mac kunt u ook dubbelklikken op het bijgevoegde bestand of het naar het venster van Klip en Klaar slepen.`,
      `Iedereen in de organisatie gebruikt dezelfde licentiecode. Deel hem onder Licentie › “Deel met collega's”. Hij geldt tot en met ${utloper}.`,
      ``,
      kode,
      ``,
      `Vragen: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
