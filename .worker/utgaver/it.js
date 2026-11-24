// Chiarissimo (den italienske utgaven). Sidene ligger i chiarissimo/, servert på /chiarissimo/.
// Bygd på gb.js: de samme nøklene, tekstene kunden ser på italiensk (Lei-formen). Det gamle arbeidsnavnet skal ikke brukes.
import { price } from "../../chiarissimo/prezzi/price.js";

const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");
const MÅNEDER = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export default {
  kode: "it",
  land: "Italia",
  sti: "chiarissimo",
  alias: ["chiarissimo-it", "chiarisimo", "chiarissmo", "it"],
  // Stien appen åpner for «Acquista una licenza» / «Ho una licenza» (lisens_apne_side i aktivering.rs): chiarissimo/attiva.
  aktivering: "attiva",
  prisSti: "prezzi",
  navn: "Chiarissimo",
  avsender: { email: "chiarissimo@esbjugconsult.com", name: "Chiarissimo" },
  prefiks: "CHIARISSIMO-",
  nrPrefiks: "IT-",
  lisensfil: "Licenza Chiarissimo.chiarissimolicenza",
  frist: 30,
  penger: (n) => tall(n) + " €",
  dato: (iso) => `${Number(iso.slice(8, 10))} ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norvegia", "N. org. 938 441 405"],
  // Bare Mac-bygget finnes ennå (24.11.2026). Windows og Linux nevnes på sidene som på vei, uten lenker.
  filer: {
    mac: { key: "2026-11-24/it/Chiarissimo_0.1.0_universal.dmg", navn: "Chiarissimo.dmg" },
    windows: { key: "2026-11-24/it/Chiarissimo_0.1.0_x64-setup.exe", navn: "Chiarissimo.exe" },
    linux: { key: "2026-11-24/it/Chiarissimo_0.1.0_amd64.deb", navn: "Chiarissimo_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-24/it/Chiarissimo_0.1.0_arm64.deb", navn: "Chiarissimo_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Non trovato.",
    ikkeApen: "Gli ordini non sono ancora aperti.",
    feilServer: (eier) => `Qualcosa non ha funzionato da parte nostra. Riprovi tra un momento o scriva a ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Indichi il numero di abitanti." : art === "state" ? "Indichi il numero di dipendenti." : "Indichi quante persone lavorano nell'organizzazione.",
      navn: "Indichi il nome dell'organizzazione.",
      epost: "Indichi l'indirizzo e-mail a cui inviare la fattura.",
      adresse: "Indichi l'indirizzo di fatturazione.",
    },
    // Hva bestillingen gjelder, slik det står på fakturaen.
    fakturaLinje: (o) => `Chiarissimo, licenza per un anno, per tutta l'organizzazione (${
      o.art === "municipal" ? `${tall(o.inhabitants)} abitanti${o.fourYears ? ", anno 1 di 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} dipendenti`
      : o.persons === 1 ? "1 persona" : `${tall(o.persons)} persone, ${o.sector}`})`,
    faktura: {
      tittel: "Fattura n.",
      dato: "Data fattura",
      forfall: "Scadenza",
      fristTekst: (d, dager) => `${d} (${dager} giorni)`,
      referanse: "Il Suo riferimento (ordine, CIG, codice univoco)",
      fra: "Da",
      til: "A",
      belop: "Importo da pagare",
      mva: "Operazione non soggetta a IVA in Italia ai sensi dell'art. 7-ter del D.P.R. 633/1972: inversione contabile, l'imposta è assolta dal committente (art. 17, c. 2; art. 196 della direttiva 2006/112/CE).",
      betaling: "Pagamento",
      betalTekst: (nr) => `Paghi con bonifico indicando ${nr} come causale. La banca è in Norvegia; un bonifico SEPA in euro va bene.`,
      bank: [
        ["Intestatario", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Banca", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norvegia"],
      ],
      formaal: "Causale",
      nokkel: "Inviamo la chiave di licenza a questo indirizzo e-mail appena riceviamo il pagamento. Fino ad allora Chiarissimo funziona con tutte le funzioni per 30 giorni dal primo utilizzo.",
      sporsmal: "Domande",
    },
    emneFaktura: (nr, navn) => `Fattura ${nr} per Chiarissimo: ${navn}`,
    emneLisens: (navn) => `La Sua chiave di licenza di Chiarissimo: ${navn}`,
    // Den samme teksten som appen skriver i en lisensfil.
    lisensfilTekst: (navn, kode) => `Licenza di Chiarissimo: ${navn}\n\nFaccia doppio clic su questo file o lo trascini nella finestra di Chiarissimo, e Chiarissimo sarà attivato.\nPuò anche incollare il codice qui sotto in Chiarissimo › Licenza.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Grazie. Il pagamento della fattura ${faktura} è arrivato. Ecco la chiave di licenza per ${navn}.`,
      ``,
      `Apra Chiarissimo e faccia clic su «Licenza» in alto a destra (durante il periodo di prova lì c'è scritto «Prova: restano … giorni»). Incolli il codice qui sotto nel campo e faccia clic su «Attiva».`,
      `Sul Mac può invece fare doppio clic sul file allegato o trascinarlo nella finestra di Chiarissimo.`,
      `Tutti nell'organizzazione usano la stessa chiave di licenza. La condivida da Licenza › «Condividi con i colleghi». È valida fino al ${utloper} compreso.`,
      ``,
      kode,
      ``,
      `Domande: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
