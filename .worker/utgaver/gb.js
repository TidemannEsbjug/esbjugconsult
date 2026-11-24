// FrostCopy UK (British edition). Pages in frostcopy-uk/, served at /frostcopy-uk/.
// This file is the model for the other editions: copy it, keep the keys, translate the texts.
import { price } from "../../frostcopy-uk/pricing/price.js";

const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ",");
const MÅNEDER = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default {
  kode: "gb",
  land: "Storbritannia",
  sti: "frostcopy-uk",
  alias: ["frostcopyuk", "frost-copy-uk", "uk", "frostcopy-gb", "frostcopygb", "frostcopy_uk"],
  // The path the app opens for «Buy licence» / «Enter key» (aktivering.rs). FrostCopy UK shares it with the
  // US edition (klart/us/buy), so this one is only used by links on our own pages.
  aktivering: "activate",
  prisSti: "pricing",
  navn: "FrostCopy UK",
  avsender: { email: "frostcopy@esbjugconsult.com", name: "FrostCopy UK" },
  prefiks: "FROSTCOPY-",
  nrPrefiks: "UK-",
  lisensfil: "FrostCopy UK licence.frostcopylicense",
  frist: 30,
  penger: (n) => "£" + tall(n),
  dato: (iso) => `${Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norway", "Org. no. 938 441 405"],
  filer: {
    mac: { key: "2026-11-24/gb/FrostCopy-UK_0.1.0_universal.dmg", navn: "FrostCopy UK.dmg" },
    windows: { key: "2026-11-24/gb/FrostCopy-UK_0.1.0_x64-setup.exe", navn: "FrostCopy UK.exe" },
    linux: { key: "2026-11-24/gb/FrostCopy-UK_0.1.0_amd64.deb", navn: "FrostCopy-UK_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-24/gb/FrostCopy-UK_0.1.0_arm64.deb", navn: "FrostCopy-UK_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Not found.",
    ikkeApen: "Ordering is not open yet.",
    feilServer: (eier) => `Something went wrong on our side. Try again in a moment, or write to ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Enter the population." : art === "state" ? "Enter the number of staff." : "Enter how many people work in the organisation.",
      navn: "Enter the name of the organisation.",
      epost: "Enter the email address the invoice should go to.",
      adresse: "Enter the billing address.",
    },
    // What the order covers, as it reads on the invoice.
    fakturaLinje: (o) => `FrostCopy UK, licence for one year, for the whole organisation (${
      o.art === "municipal" ? `population ${tall(o.inhabitants)}${o.fourYears ? ", year 1 of 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} staff`
      : o.persons === 1 ? "1 person" : `${tall(o.persons)} people, ${o.sector}`})`,
    faktura: {
      tittel: "Invoice no.",
      dato: "Invoice date",
      forfall: "Due date",
      fristTekst: (d, dager) => `${d} (${dager} days)`,
      referanse: "Your purchase order / reference",
      fra: "From",
      til: "To",
      belop: "Amount due",
      mva: "No UK VAT charged. Reverse charge: the customer accounts for the VAT to HMRC (Value Added Tax Act 1994, s. 8).",
      betaling: "Payment",
      betalTekst: (nr) => `Please pay by bank transfer and quote ${nr} as the reference. The bank is in Norway; an international (SWIFT) transfer in pounds sterling is fine.`,
      bank: [
        ["Account name", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norway"],
      ],
      formaal: "Reference",
      nokkel: "We send the licence key to this email address as soon as the payment has arrived. Until then FrostCopy UK works in full for 30 days from first use.",
      sporsmal: "Questions",
    },
    emneFaktura: (nr, navn) => `Invoice ${nr} for FrostCopy UK: ${navn}`,
    emneLisens: (navn) => `Your FrostCopy UK licence key: ${navn}`,
    // The same text the app writes in a licence file.
    lisensfilTekst: (navn, kode) => `Licence for FrostCopy: ${navn}\n\nDouble-click this file, or drop it on the FrostCopy window, and FrostCopy is activated.\nYou can also paste the code below in FrostCopy › Licence.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Thank you. The payment for invoice ${faktura} has arrived. Here is the licence key for ${navn}.`,
      ``,
      `Open FrostCopy and click «Licence» at the top right (during the trial it says «Trial: … days left»). Paste the code below into the field and click «Activate».`,
      `On a Mac you can instead double-click the attached file or drop it on the FrostCopy window.`,
      `Everyone in the organisation uses the same licence key. Share it under Licence › «Share with colleagues». It is valid until and including ${utloper}.`,
      ``,
      kode,
      ``,
      `Questions: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
