// Klappat och Klart (Swedish edition). Pages in klappatochklart/, served at /klappatochklart/.
// Copied from pl.js / gb.js (the model): the same keys, the customer texts in Swedish (du, as Swedish public bodies write).
import { price } from "../../klappatochklart/priser/price.js";

// 12 345, Swedish style: a space between thousands.
const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, " ");
// Months in lower case, as in «26 november 2026».
const MÅNEDER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

export default {
  kode: "se",
  land: "Sverige",
  sti: "klappatochklart",
  alias: ["klappat-och-klart", "klappat", "klappat_och_klart", "klappatochklart-se", "se", "sverige"],
  // The path the app opens for «Köp licens» / activation (lisens_apne_side in aktivering.rs):
  // klappatochklart/aktivera?hva=kjop|aktiver&maskin=…
  aktivering: "aktivera",
  prisSti: "priser",
  navn: "Klappat och Klart",
  avsender: { email: "klappatochklart@esbjugconsult.com", name: "Klappat och Klart" },
  prefiks: "KLAPPATOCHKLART-",
  nrPrefiks: "SE-",
  lisensfil: "Licens för Klappat och Klart.klappatochklartlicens",
  frist: 30,
  penger: (n) => tall(n) + " kr",
  dato: (iso) => `${Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norge", "Org.nr 938 441 405"],
  // Mac, Windows and Linux (x64 and ARM64) builds exist; the lead fixes sizes and checksums.
  filer: {
    mac: { key: "2026-11-26/se/Klappat-och-Klart_0.1.0_universal.dmg", navn: "Klappat och Klart.dmg" },
    windows: { key: "2026-11-26/se/Klappat-och-Klart_0.1.0_x64-setup.exe", navn: "Klappat och Klart.exe" },
    linux: { key: "2026-11-26/se/Klappat-och-Klart_0.1.0_amd64.deb", navn: "Klappat-och-Klart_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/se/Klappat-och-Klart_0.1.0_arm64.deb", navn: "Klappat-och-Klart_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Hittades inte.",
    ikkeApen: "Beställningar har inte öppnat än.",
    feilServer: (eier) => `Något gick fel hos oss. Försök igen om en stund eller skriv till ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Ange antal invånare." : art === "state" ? "Ange antal anställda." : "Ange hur många personer som arbetar i organisationen.",
      navn: "Ange organisationens namn.",
      epost: "Ange den e-postadress som fakturan ska skickas till.",
      adresse: "Ange fakturaadressen.",
    },
    // What the order covers, as it reads on the invoice.
    fakturaLinje: (o) => `Klappat och Klart, licens för ett år för hela organisationen (${
      o.art === "municipal" ? `${tall(o.inhabitants)} invånare${o.fourYears ? ", år 1 av 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} anställda`
      : o.persons === 1 ? "1 person" : `${tall(o.persons)} personer, ${o.sector}`})`,
    faktura: {
      tittel: "Faktura nr",
      dato: "Fakturadatum",
      forfall: "Förfallodatum",
      fristTekst: (d, dager) => `${d} (${dager} dagar)`,
      referanse: "Er referens / beställningsnummer",
      fra: "Säljare",
      til: "Köpare",
      belop: "Att betala",
      mva: "Ingen svensk moms. Omvänd betalningsskyldighet: köparen redovisar momsen (16 kap. 9 § mervärdesskattelagen (2023:200); artikel 196 i direktiv 2006/112/EG).",
      betaling: "Betalning",
      betalTekst: (nr) => `Betala till kontot nedan och ange ${nr} som meddelande. Banken finns i Norge; betala med en utlandsbetalning (SWIFT) i svenska kronor.`,
      bank: [
        ["Mottagare", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norge"],
      ],
      formaal: "Meddelande till mottagaren",
      nokkel: "Licensnyckeln skickas till den här e-postadressen så snart betalningen har kommit in. Fram till dess fungerar Klappat och Klart fullt ut i 30 dagar från första användningen.",
      sporsmal: "Frågor",
    },
    emneFaktura: (nr, navn) => `Faktura ${nr} för Klappat och Klart: ${navn}`,
    emneLisens: (navn) => `Licensnyckel för Klappat och Klart: ${navn}`,
    // The same text the app writes in a licence file (aktivering.rs).
    lisensfilTekst: (navn, kode) => `Licens för Klappat och Klart: ${navn}\n\nDubbelklicka på den här filen eller släpp den i fönstret för Klappat och Klart, så är Klappat och Klart aktiverat.\nDu kan också klistra in koden nedan under Klappat och Klart › Licens.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Tack. Betalningen för faktura ${faktura} har kommit in. Här är licensnyckeln för ${navn}.`,
      ``,
      `Öppna Klappat och Klart och klicka på ”Licens” uppe till höger (under provperioden står det ”Provperiod: … dagar kvar” där). Klistra in koden nedan i fältet och klicka på ”Aktivera”.`,
      `På en Mac kan du också dubbelklicka på den bifogade filen eller släppa den i fönstret för Klappat och Klart.`,
      `Alla i organisationen använder samma licensnyckel. Du kan skicka den vidare under Licens › ”Dela med kollegor”. Den gäller till och med ${utloper}.`,
      ``,
      kode,
      ``,
      `Frågor: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
