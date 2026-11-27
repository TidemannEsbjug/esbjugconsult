// Glockenklar (österreichische Ausgabe). Seiten in glockenklar/, ausgeliefert unter /glockenklar/.
// Kopie von gb.js (dem Muster) mit denselben Schlüsseln; die Texte, die der Kunde sieht, auf Deutsch für Österreich (Sie).
import { price } from "../../glockenklar/preis/price.js";

// 12.345, wie in Österreich geschrieben: Punkt als Tausendertrennzeichen.
const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");

export default {
  kode: "at",
  land: "Østerrike",
  sti: "glockenklar",
  alias: ["glocken-klar", "glockenklar-at", "glocken_klar", "glocken"],
  // Der Pfad, den die App für „Lizenz kaufen“ / „Lizenz eingeben“ öffnet (lisens_apne_side in aktivering.rs):
  // glockenklar/aktiver?hva=kjop|aktiver&maskin=…
  aktivering: "aktiver",
  prisSti: "preis",
  navn: "Glockenklar",
  avsender: { email: "glockenklar@esbjugconsult.com", name: "Glockenklar" },
  prefiks: "GLOCKENKLAR-",
  nrPrefiks: "AT-",
  lisensfil: "Glockenklar Lizenz.glockenklarlizenz",
  frist: 30,
  penger: (n) => tall(n) + " €",
  dato: (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Norwegen", "Org.-Nr. 938 441 405"],
  // Alle vier Pakete gibt es; Größen und Prüfsummen setzt der Leiter.
  filer: {
    mac: { key: "2026-11-26/at/Glockenklar_0.1.0_universal.dmg", navn: "Glockenklar.dmg" },
    windows: { key: "2026-11-27/at/Glockenklar_0.1.0_x64-setup.exe", navn: "Glockenklar.exe" },
    linux: { key: "2026-11-26/at/Glockenklar_0.1.0_amd64.deb", navn: "Glockenklar_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/at/Glockenklar_0.1.0_arm64.deb", navn: "Glockenklar_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "Nicht gefunden.",
    ikkeApen: "Die Bestellung ist noch nicht geöffnet.",
    feilServer: (eier) => `Bei uns ist etwas schiefgegangen. Versuchen Sie es gleich noch einmal, oder schreiben Sie an ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Geben Sie die Einwohnerzahl ein." : art === "state" ? "Geben Sie die Zahl der Beschäftigten ein." : "Geben Sie an, wie viele Personen in der Organisation arbeiten.",
      navn: "Geben Sie den Namen der Organisation ein.",
      epost: "Geben Sie die E-Mail-Adresse ein, an die die Rechnung gehen soll.",
      adresse: "Geben Sie die Rechnungsadresse ein.",
    },
    // Was die Bestellung umfasst, wie es auf der Rechnung steht.
    fakturaLinje: (o) => `Glockenklar, Lizenz für ein Jahr, für die gesamte Organisation (${
      o.art === "municipal" ? `${tall(o.inhabitants)} Einwohner${o.fourYears ? ", Jahr 1 von 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} Beschäftigte`
      : o.persons === 1 ? "1 Person" : `${tall(o.persons)} Personen, ${o.sector}`})`,
    faktura: {
      tittel: "Rechnung Nr.",
      dato: "Rechnungsdatum",
      forfall: "Zahlbar bis",
      fristTekst: (d, dager) => `${d} (fällig in ${dager} Tagen)`,
      referanse: "Ihre Bestellnummer / Ihr Zeichen",
      fra: "Von",
      til: "An",
      belop: "Rechnungsbetrag",
      mva: "Ohne Umsatzsteuer. Übergang der Steuerschuld auf den Leistungsempfänger (Reverse Charge, § 19 Abs. 1 UStG 1994; Art. 196 der Richtlinie 2006/112/EG).",
      betaling: "Zahlung",
      betalTekst: (nr) => `Bitte überweisen Sie den Betrag per SEPA-Überweisung in Euro und geben Sie als Verwendungszweck ${nr} an.`,
      bank: [
        ["Kontoinhaber", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC", "SPTRNO22"],
        ["Bank", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Norwegen"],
      ],
      formaal: "Verwendungszweck",
      nokkel: "Den Lizenzschlüssel senden wir an diese E-Mail-Adresse, sobald die Zahlung eingegangen ist. Bis dahin funktioniert Glockenklar 30 Tage ab der ersten Verwendung in vollem Umfang.",
      sporsmal: "Fragen",
    },
    emneFaktura: (nr, navn) => `Rechnung ${nr} für Glockenklar: ${navn}`,
    emneLisens: (navn) => `Ihr Lizenzschlüssel für Glockenklar: ${navn}`,
    // Derselbe Text, den die App in eine Lizenzdatei schreibt (aktivering.rs, lisens_lagre_fil).
    lisensfilTekst: (navn, kode) => `Lizenz für Glockenklar: ${navn}\n\nDoppelklicken Sie auf diese Datei oder ziehen Sie sie in das Glockenklar-Fenster, dann ist Glockenklar aktiviert.\nSie können den Code unten auch in Glockenklar › Lizenz einfügen.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Vielen Dank. Die Zahlung für die Rechnung ${faktura} ist eingegangen. Hier ist der Lizenzschlüssel für ${navn}.`,
      ``,
      `Öffnen Sie Glockenklar und klicken Sie oben rechts auf „Lizenz“ (während der Testphase steht dort „Test: noch … Tage“). Fügen Sie den Code unten in das Feld ein und klicken Sie auf „Aktivieren“.`,
      `Auf dem Mac können Sie stattdessen die angehängte Datei doppelklicken oder in das Glockenklar-Fenster ziehen.`,
      `Alle in der Organisation verwenden denselben Lizenzschlüssel. Unter Lizenz › „Mit Kollegen teilen“ geben Sie ihn weiter. Er gilt bis einschließlich ${utloper}.`,
      ``,
      kode,
      ``,
      `Fragen: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
