// Clarísimo (edición española). Páginas en clarisimo/, servidas en /clarisimo/.
// Copia de gb.js con las mismas claves; los textos que ve el cliente, en español de España (usted).
import { price } from "../../clarisimo/precios/price.js";

// Miles con punto, como se escribe en España: 14.900 €.
const tall = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+$)/g, ".");
const MÅNEDER = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default {
  kode: "es",
  land: "Spania",
  sti: "clarisimo",
  alias: ["clarísimo", "clarisimo-es"], // «clarissimo» er Portugal (Claríssimo) fra 27.11.2026
  // La ruta que abre la aplicación con «Comprar una licencia» / «Introducir la clave» (aktivering.rs, lisens_apne_side).
  aktivering: "activar",
  prisSti: "precios",
  navn: "Clarísimo",
  avsender: { email: "clarisimo@esbjugconsult.com", name: "Clarísimo" },
  prefiks: "CLARISIMO-",
  nrPrefiks: "ES-",
  lisensfil: "Licencia de Clarísimo.clarisimolicencia",
  frist: 30,
  penger: (n) => tall(n) + " €",
  dato: (iso) => `${Number(iso.slice(8, 10))} de ${MÅNEDER[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`,
  pris: price,
  selger: ["ESBJUG CONSULT", "Glenneveien 272B", "1455 Nordre Frogn", "Noruega", "N.º de organización 938 441 405"],
  // Solo existe la versión para Mac (primer paquete del 24.11.2026). Windows y Linux, cuando estén construidos.
  filer: {
    mac: { key: "2026-11-26/es/Clarisimo_0.1.0_universal.dmg", navn: "Clarísimo.dmg" },
    windows: { key: "2026-11-27c/es/Clarisimo_0.1.0_x64-setup.exe", navn: "Clarísimo.exe" },
    linux: { key: "2026-11-26/es/Clarisimo_0.1.0_amd64.deb", navn: "Clarisimo_0.1.0_amd64.deb" },
    "linux-arm": { key: "2026-11-26/es/Clarisimo_0.1.0_arm64.deb", navn: "Clarisimo_0.1.0_arm64.deb" },
  },
  t: {
    ikkeFunnet: "No encontrado.",
    ikkeApen: "Los pedidos aún no están abiertos.",
    feilServer: (eier) => `Algo ha fallado por nuestra parte. Inténtelo de nuevo dentro de un momento o escriba a ${eier}.`,
    mangler: {
      antall: (art) => art === "municipal" ? "Indique el número de habitantes." : art === "state" ? "Indique el número de empleados." : "Indique cuántas personas trabajan en la organización.",
      navn: "Indique el nombre de la organización.",
      epost: "Indique el correo electrónico al que debe ir la factura.",
      adresse: "Indique la dirección de facturación.",
    },
    // Lo que cubre el pedido, tal como figura en la factura.
    fakturaLinje: (o) => `Clarísimo, licencia de un año para toda la organización (${
      o.art === "municipal" ? `${tall(o.inhabitants)} habitantes${o.fourYears ? ", año 1 de 4" : ""}`
      : o.art === "state" ? `${tall(o.employees)} empleados`
      : o.persons === 1 ? "1 persona" : `${tall(o.persons)} personas, ${o.sector}`})`,
    faktura: {
      tittel: "Factura n.º",
      dato: "Fecha de factura",
      forfall: "Vencimiento",
      fristTekst: (d, dager) => `${d} (${dager} días)`,
      referanse: "Su número de pedido o referencia",
      fra: "De",
      til: "Para",
      belop: "Importe a pagar",
      mva: "Factura sin IVA. Operación con inversión del sujeto pasivo: el IVA lo declara el destinatario (Ley 37/1992, art. 84.Uno.2.º).",
      betaling: "Pago",
      betalTekst: (nr) => `Pague por transferencia bancaria indicando ${nr} como concepto. El banco está en Noruega; una transferencia SEPA en euros sirve.`,
      bank: [
        ["Titular", "ESBJUG CONSULT"],
        ["IBAN", "NO91 1080 2731 456"],
        ["BIC / SWIFT", "SPTRNO22"],
        ["Banco", "SpareBank 1 Østfold Akershus, Postboks 130, 1501 Moss, Noruega"],
      ],
      formaal: "Concepto",
      nokkel: "Enviaremos la clave de licencia a este correo en cuanto recibamos el pago. Hasta entonces, Clarísimo funciona completo durante 30 días desde el primer uso.",
      sporsmal: "Preguntas",
    },
    emneFaktura: (nr, navn) => `Factura ${nr} de Clarísimo: ${navn}`,
    emneLisens: (navn) => `Su clave de licencia de Clarísimo: ${navn}`,
    // El mismo texto que escribe la aplicación en un archivo de licencia.
    lisensfilTekst: (navn, kode) => `Licencia de Clarísimo: ${navn}\n\nHaga doble clic en este archivo o suéltelo en la ventana de Clarísimo, y Clarísimo quedará activado.\nTambién puede pegar el código de abajo en Clarísimo › Licencia.\n\n${kode}\n`,
    lisensEpost: ({ faktura, navn, kode, utloper }) => [
      `Gracias. Hemos recibido el pago de la factura ${faktura}. Esta es la clave de licencia de ${navn}.`,
      ``,
      `Abra Clarísimo y haga clic en «Licencia», arriba a la derecha (durante la prueba pone «Prueba: quedan … días»). Pegue el código de abajo en el campo y haga clic en «Activar».`,
      `En el Mac también puede hacer doble clic en el archivo adjunto o arrastrarlo a la ventana de Clarísimo.`,
      `Todas las personas de la organización usan la misma clave de licencia. Compártala en Licencia › «Compartir con compañeros». Es válida hasta el ${utloper}, incluido.`,
      ``,
      kode,
      ``,
      `Preguntas: tidemann@esbjugconsult.com`,
    ].join("\n"),
  },
};
