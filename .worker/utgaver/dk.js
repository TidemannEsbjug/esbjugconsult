// Krystallklart (Danish edition). Pages in krystallklart/, served at /krystallklart/.
// Copied from gb.js (the model): the same keys, the customer texts in Danish («du»/«I», as the app writes).
import { price } from "../../krystallklart/priser/price.js";

// 12.345, Danish style: a full stop between thousands.
const tal = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");
const MÅNEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export default {
  kode: "dk",
  land: "Danmark",
  sti: "krystallklart",
  alias: ["krystal-klart", "krystalklart"],
  // The path the app opens for «Køb licens» / «Jeg har en licens» (lisens_apne_side in aktivering.rs):
  // krystallklart/aktiver?hva=kjop|aktiver&maskin=…
  aktivering: "aktiver",
  prisSti: "priser",
  navn: "Krystallklart",
  avsender: { email: "krystallklart@esbjugconsult.com", name: "Krystallklart" },
  prefiks: "KRYSTALLKLART-",
  nrPrefiks: "DK-",
  lisensfil: "Licens til Krystallklart.krystallklartlicens",
  frist: 30,
  penger: (n) => tal(n) + " kr.",
  dato: (iso) => `${Number(iso.slice(8, 10))}. ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norge", "Org.nr. 938 441 405"],
  // Mac, Windows, Linux and Linux ARM builds exist (26.11.2026). The lead fixes sizes and checksums.
  filer: {
    mac: { key: "2026-11-26/dk/Krystallklart_0.1.0_universal.dmg", navn: "Krystallklart.dmg" },
    windows: { key: "2026-11-27c/dk/Krystallklart_0.1.0_x64-setup.exe", navn: "Krystallklart.exe" },
    linux: { key: "2026-11-26/dk/Krystallklart_0.1.0_amd64.deb", navn: "Krystallklart_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/dk/Krystallklart_0.1.0_arm64.deb", navn: "Krystallklart_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Siden findes ikke.",
    ikkeApen: "Der kan endnu ikke bestilles.",
    feilServer: (eier) => `Noget gik galt hos os. Prøv igen om lidt, eller skriv til ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Skriv antallet af indbyggere." : art === "state" ? "Skriv antallet af ansatte." : "Skriv, hvor mange personer der arbejder i organisationen.",
      navn: "Skriv organisationens navn.",
      epost: "Skriv den e-mailadresse, fakturaen skal sendes til.",
      adresse: "Skriv faktureringsadressen.",
    },
    // What the order covers, as it reads on the invoice.
    fakturaLinje: (o) => `Krystallklart, licens i et år til hele organisationen (${
      o.art === "municipal" ? `${tal(o.inhabitants)} indbyggere${o.fourYears ? ", år 1 af 4" : ""}`
      : o.art === "state" ? `${tal(o.employees)} ansatte`
      : o.persons === 1 ? "1 person" : `${tal(o.persons)} personer, ${o.sector}`})`,
    faktura: {
      tittel: "Faktura nr.",
      dato: "Fakturadato",
      forfall: "Forfaldsdato",
      fristTekst: (d, dager) => `${d} (${dager} dage)`,
      referanse: "Ordrenummer / reference",
      fra: "Sælger",
      til: "Køber",
      belop: "At betale",
      mva: "Uden dansk moms. Omvendt betalingspligt: køber afregner momsen (momslovens § 46, stk. 1, nr. 3; artikel 196 i direktiv 2006/112/EF).",
      betaling: "Betaling",
      betalTekst: (nr) => `Overfør beløbet med ${nr} som tekst til modtageren. Banken ligger i Norge; brug en udenlandsk overførsel (SWIFT) i danske kroner.`,
      bank: [
        ["Modtager", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norge"],
      ],
      formaal: "Tekst til modtager",
      nokkel: "Licenskoden sender vi til denne e-mailadresse, så snart betalingen er modtaget. Indtil da kan I bruge hele Krystallklart i 30 dage fra første brug.",
      sporsmal: "Spørgsmål",
    },
    emneFaktura: (nr, navn) => `Faktura ${nr} for Krystallklart: ${navn}`,
    emneLisens: (navn) => `Licenskode til Krystallklart: ${navn}`,
    // The same text the app writes in a licence file (aktivering.rs).
    lisensfilTekst: (navn, kode) => `Licens til Krystallklart: ${navn}\n\nDobbeltklik på denne fil, eller slip den i vinduet i Krystallklart, så er Krystallklart aktiveret.\nDu kan også indsætte koden nedenfor under Krystallklart › Licens.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Tak. Betalingen for faktura ${faktura} er modtaget. Her er licenskoden til ${navn}.`,
      ``,
      `Åbn Krystallklart, og klik på »Licens« øverst til højre (i prøveperioden står der »Prøve: … dage tilbage«). Indsæt koden nedenfor i feltet, og klik på »Aktivér«.`,
      `På en Mac kan du også dobbeltklikke på den vedhæftede fil eller slippe den i vinduet i Krystallklart.`,
      `Alle i organisationen bruger den samme licenskode. Du kan give den videre under Licens › »Del med kolleger«. Den gælder til og med ${utloper}.`,
      ``,
      kode,
      ``,
      `Spørgsmål: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
