// Wszystko Jasne (Polish edition). Pages in wszystko-jasne/, served at /wszystko-jasne/.
// Copied from gb.js (the model): the same keys, the customer texts in Polish (formal Pan/Pani form, «Państwo»).
import { price } from "../../wszystko-jasne/cennik/price.js";

// 12 345, Polish style: a space between thousands.
const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, " ");
// Months in the genitive, as in «24 listopada 2026».
const MÅNEDER = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

export default {
  kode: "pl",
  land: "Polen",
  sti: "wszystko-jasne",
  alias: ["wszystkojasne", "wszystko_jasne", "wszystko-jasne-pl", "wszystko", "jasne", "pl", "polska"],
  // The path the app opens for «Kup licencję» / «Mam licencję» (lisens_apne_side in aktivering.rs):
  // wszystko-jasne/aktywuj?hva=kjop|aktiver&maskin=…
  aktivering: "aktywuj",
  prisSti: "cennik",
  navn: "Wszystko Jasne",
  avsender: { email: "wszystkojasne@esbjugconsult.com", name: "Wszystko Jasne" },
  prefiks: "WSZYSTKOJASNE-",
  nrPrefiks: "PL-",
  lisensfil: "Licencja Wszystko Jasne.wszystkojasnelicencja",
  frist: 30,
  penger: (n) => tall(n) + " zł",
  dato: (iso) => `${Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norwegia", "Nr org. 938 441 405"],
  // Only the Mac build exists so far; the pages say Windows and Linux are coming.
  filer: {
    mac: { key: "2026-11-26/pl/Wszystko-Jasne_0.1.0_universal.dmg", navn: "Wszystko Jasne.dmg" },
    windows: { key: "2026-11-27c/pl/Wszystko-Jasne_0.1.0_x64-setup.exe", navn: "Wszystko Jasne.exe" },
    linux: { key: "2026-11-26/pl/Wszystko-Jasne_0.1.0_amd64.deb", navn: "Wszystko-Jasne_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/pl/Wszystko-Jasne_0.1.0_arm64.deb", navn: "Wszystko-Jasne_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Nie znaleziono.",
    ikkeApen: "Zamówienia nie są jeszcze otwarte.",
    feilServer: (eier) => `Coś poszło nie tak po naszej stronie. Proszę spróbować za chwilę albo napisać na ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Proszę podać liczbę mieszkańców." : art === "state" ? "Proszę podać liczbę pracowników." : "Proszę podać, ile osób pracuje w organizacji.",
      navn: "Proszę podać nazwę organizacji.",
      epost: "Proszę podać adres e-mail, na który ma trafić faktura.",
      adresse: "Proszę podać adres do faktury.",
    },
    // What the order covers, as it reads on the invoice.
    fakturaLinje: (o) => `Wszystko Jasne, licencja na jeden rok dla całej organizacji (${
      o.art === "municipal" ? `liczba mieszkańców ${tall(o.inhabitants)}${o.fourYears ? ", rok 1 z 4" : ""}`
      : o.art === "state" ? `pracownicy: ${tall(o.employees)}`
      : o.persons === 1 ? "1 osoba" : `osoby: ${tall(o.persons)}, ${o.sector}`})`,
    faktura: {
      tittel: "Faktura nr",
      dato: "Data wystawienia",
      forfall: "Termin płatności",
      fristTekst: (d, dager) => `${d} (${dager} dni)`,
      referanse: "Numer zamówienia / znak sprawy",
      fra: "Sprzedawca",
      til: "Nabywca",
      belop: "Do zapłaty",
      mva: "Bez polskiego VAT. Odwrotne obciążenie (reverse charge): podatek rozlicza nabywca jako import usług (art. 28b i art. 17 ust. 1 pkt 4 ustawy o VAT; art. 196 dyrektywy 2006/112/WE).",
      betaling: "Płatność",
      betalTekst: (nr) => `Prosimy o przelew z tytułem ${nr}. Bank znajduje się w Norwegii; można wykonać przelew zagraniczny (SWIFT) w złotych.`,
      bank: [
        ["Odbiorca", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norwegia"],
      ],
      formaal: "Tytuł przelewu",
      nokkel: "Klucz licencyjny wyślemy na ten adres e-mail, gdy tylko wpłynie płatność. Do tego czasu Wszystko Jasne działa w pełnym zakresie przez 30 dni od pierwszego użycia.",
      sporsmal: "Pytania",
    },
    emneFaktura: (nr, navn) => `Faktura ${nr} za Wszystko Jasne: ${navn}`,
    emneLisens: (navn) => `Klucz licencyjny Wszystko Jasne: ${navn}`,
    // The same text the app writes in a licence file (aktivering.rs).
    lisensfilTekst: (navn, kode) => `Licencja Wszystko Jasne: ${navn}\n\nKliknij dwukrotnie ten plik albo upuść go na okno Wszystko Jasne, a Wszystko Jasne zostanie aktywowane.\nMożna też wkleić poniższy kod w Wszystko Jasne › Licencja.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Dziękujemy. Płatność za fakturę ${faktura} wpłynęła. Oto klucz licencyjny dla: ${navn}.`,
      ``,
      `Proszę otworzyć Wszystko Jasne i kliknąć „Licencja” w prawym górnym rogu (w okresie próbnym widnieje tam „Okres próbny: zostało … dni”). Proszę wkleić poniższy kod w pole i kliknąć „Aktywuj”.`,
      `Na Macu można też dwukrotnie kliknąć załączony plik albo upuścić go na okno Wszystko Jasne.`,
      `Wszyscy w organizacji używają tego samego klucza licencyjnego. Można go przekazać pod Licencja › „Udostępnij współpracownikom”. Jest ważny do ${utloper} włącznie.`,
      ``,
      kode,
      ``,
      `Pytania: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
