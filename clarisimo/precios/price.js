// El precio de Clarísimo en euros, sin IVA. Un solo archivo que usan la página (el precio aparece mientras se
// escribe) y el servidor (/clarisimo/api/order), que lo vuelve a calcular y decide qué figura en la factura.
// Solo se muestra el precio, nunca el cálculo.
//
// Elecciones (24.11.2026; el propietario aún no ha fijado estos precios):
//   business   Empresa, despacho, consulta o asociación: personas y sector, precio por año. La misma curva y
//              las mismas cuotas por sector que la edición alemana (alles-klar/pris/preis.js), en euros.
//   municipal  Ayuntamiento, diputación, comarca o mancomunidad: habitantes. La curva da el total de cuatro años;
//              se pide y se factura un año cada vez, una cuarta parte. Límite: un contrato menor de suministro o
//              servicio debe quedar por debajo de 15 000 € sin IVA y no puede durar más de un año (LCSP arts.
//              118.1 y 29.8; Klart-es-grunnlag/research/62). Por eso cada factura anual queda en 14 900 € como
//              máximo, y los cuatro años juntos (59 600 €) quedan por debajo de los 60 000 € del procedimiento
//              abierto simplificado abreviado (art. 159.6). Hasta 5 000 habitantes los cuatro años caben en
//              4 900 € (bajo las líneas de 5 000 € de pagos menores) y hasta 20 000 en 14 500 € (Navarra:
//              menor cuantía con gasto de 48 meses ≤ 15 000 €, LF 2/2018 art. 81.3).
//   state      Administración General del Estado, comunidad autónoma, juzgado, universidad u otro organismo
//              público: empleados, precio por año, con el mismo tope anual de 14 900 € (contrato menor).
export const SOLO = 260;
const CURVE = [[1, 440], [2, 520], [6, 1300], [23, 3900], [113, 10400], [500, 21700], [2000, 39100]];
// Línea recta entre los puntos (habitantes, euros por cuatro años); por encima del último, igual.
export const MUNICIPAL = [[500, 1500], [2000, 2600], [5000, 4900], [20000, 14500], [50000, 36000], [100000, 59600]];
const STATE = { base: 3500, perHead: 16, max: 14900 };
export const MAX_COUNT = 100000000;
// La parte de las personas que se cuenta. Un tercer número es un factor sobre el precio.
export const SECTORS = [
  ["Despacho de abogados o notaría", 1], ["Asesoría fiscal, auditoría o contabilidad", 1],
  ["Banca, finanzas o seguros", 1], ["Selección de personal o recursos humanos", 1],
  ["Consultoría, informática u otro trabajo de oficina", 1], ["Inmobiliaria", 1], ["Asociación, fundación o colegio profesional", 1],
  ["Sanidad", 0.4], ["Enseñanza y formación", 0.4], ["Servicios sociales y cuidados", 0.4],
  ["Aviación", 0.3, 1.5], ["Comercio minorista", 0.2],
  ["Construcción y oficios", 0.15], ["Industria y fabricación", 0.15], ["Transporte y almacenamiento", 0.15],
  ["Agricultura, silvicultura y pesca", 0.15], ["Minería", 0.15], ["Energía, agua y residuos", 0.15], ["Taller de automóviles", 0.15],
  ["Hostelería y restauración", 0.1], ["Seguridad privada", 0.1], ["Limpieza y administración de fincas", 0.1],
  ["Empresa de trabajo temporal", 0.05],
];

function loglog(points, x) {
  if (x <= points[0][0]) return points[0][1];
  let i = points.findIndex((p) => p[0] >= x);
  if (i === -1) i = points.length - 1;
  const [x0, y0] = points[i - 1], [x1, y1] = points[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}
function linear(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return points[points.length - 1][1];
}
function round(p) {
  const step = p < 1000 ? 10 : p < 10000 ? 50 : 100;
  return Math.round(p / step) * step;
}
function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= MAX_COUNT ? n : null;
}
// El sector llega como índice en SECTORS (la página) o como su nombre.
function sectorOf(s) {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s === "string" && !/^\d+$/.test(s.trim())) return SECTORS.find((b) => b[0] === s) || null;
  return SECTORS[Number(s)] || null;
}

/** { price (euros enteros por año, sin IVA), art, y según el tipo: persons y sector, inhabitants y fourYears,
    o employees }, o null si los datos no valen. */
export function price({ art, persons, sector, inhabitants, employees }) {
  if (art === "municipal") {
    const n = count(inhabitants);
    if (!n) return null;
    const fourYears = Math.round(linear(MUNICIPAL, n) / 100) * 100;
    return { price: Math.round(fourYears / 4), fourYears, art, inhabitants: n };
  }
  if (art === "state") {
    const n = count(employees);
    if (!n) return null;
    const p = Math.min(STATE.max, Math.round((STATE.base + STATE.perHead * n) / 10) * 10);
    return { price: p, art, employees: n };
  }
  if (art !== "business") return null;
  const n = count(persons);
  if (!n) return null;
  if (n === 1) return { price: SOLO, art, persons: 1, sector: null };
  const b = sectorOf(sector);
  if (!b) return null;
  const counted = Math.max(1, n * b[1]);
  return { price: Math.max(SOLO, round(loglog(CURVE, counted) * (b[2] || 1))), art, persons: n, sector: b[0] };
}
