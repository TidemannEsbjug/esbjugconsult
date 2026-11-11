// «Går Klart på maskinen din?» — søket i maskinlisten bak GET /klart/api/maskin?q=…
//
// Listen (maskiner.js, laget av ../bygg-maskiner.mjs) sier bare hva slags maskin hver modell er.
// Svaret regnes ut her, av kravene under, så de kan endres ett sted. Listen og svarene bygger på
// systemkravene: hva maskinen kan kjøre. De sier ikke at Klart er prøvd på akkurat den modellen.
//
// Ren logikk uten nett og uten lagring: søketeksten brukes til å lete i listen og blir ikke tatt vare på.
// Kan kjøres i Node (den lokale tjeneren gjør det): node .worker/klart-maskin.js "thinkpad t14"

import MASKINER from "./maskiner.js";

/**
 * Kravene Klart stiller. Bare macOS 13 er erklært i appen (tauri.conf.json, minimumSystemVersion).
 * Windows-versjonen og minnet er anbefalinger satt her 11.11.2026: appen bruker rundt 0,5 GB med
 * setningsmodellen lastet, men er ikke målt på en maskin med 8 GB eller mindre. Endres de, endres
 * også teksten under feltet på forsiden og «Systemkrav» på til-it.html.
 */
export const KRAV = {
  macos: 13,
  windows: "Windows 10 eller 11",
  minne: 8,
};

// Første år hver Mac-familie kan få macOS 13 (Apples liste for macOS Ventura).
const MAC_FRA = [
  [/^MacBook Air/, 2018],
  [/^MacBook Pro/, 2017],
  [/^MacBook /, 2017],
  [/^iMac Pro/, 2017],
  [/^iMac/, 2017],
  [/^Mac mini/, 2018],
  [/^Mac Pro/, 2019],
];

const SLAG = { b: "Bærbar", s: "Stasjonær", n: "Nettbrett", t: "Telefon" };

/** Svaret for en rad: "ja", "usikkert" eller "nei", og én setning om hvorfor. */
export function svarFor([navn, , , system, aar]) {
  if (system === "ma") return ["ja", "Alle Mac-er med Apple-prosessor kjører Klart."];
  if (system === "mi") {
    const fra = (MAC_FRA.find(([m]) => m.test(navn)) || [null, 2017])[1];
    return aar >= fra
      ? ["ja", `Med macOS ${KRAV.macos} eller nyere.`]
      : ["nei", `Den kan ikke få macOS ${KRAV.macos}, som Klart trenger.`];
  }
  if (system === "w") return ["ja", `Med ${KRAV.windows}. Vi anbefaler ${KRAV.minne} GB minne.`];
  if (system === "l") return ["ja", `Med en nyere Linux. Vi anbefaler ${KRAV.minne} GB minne.`];
  if (system === "wa") return ["usikkert", "Den har ARM-prosessor. Klart er laget for Intel og AMD, og er ikke prøvd på denne."];
  if (system === "la") return ["nei", "Den har ARM-prosessor. Klart for Linux er laget for Intel og AMD."];
  if (system === "w-gammel") return ["nei", `Klart trenger ${KRAV.windows}.`];
  if (system === "c") return ["nei", "Klart går ikke på Chromebook."];
  return ["nei", "Klart er et program for Mac, Windows og Linux."];
}

/** Små bokstaver, uten aksenter og tegn: «ThinkPad T14s Gen 3», «thinkpad-t14s gen3» og «13″» møtes. */
function vask(tekst, generasjon = true) {
  let t = String(tekst || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/(\d)\s*(?:tommer|toms|inch|in\b|["″”])/g, "$1 ");
  // «Gen 3», «3. gen» og «G3» blir alle «g3».
  if (generasjon) {
    t = t.replace(/\b(gen|generasjon|g)\s*\.?\s*(\d{1,2})\b/g, "g$2").replace(/\b(\d{1,2})\s*\.?\s*(gen|generasjon)\b/g, "g$1");
  }
  return t.replace(/[^a-z0-9+]+/g, " ").trim();
}

// Søkeordene for hver rad, laget én gang: navnet, merket og de andre navnene.
// - Tallet i «Gen 11» står også alene, så «x1 carbon 11» finner fram.
// - «V14» finnes også som «v» og «14», og «V 14» også som «v14», så mellomrommet ikke avgjør.
function ordFor(tekst) {
  const ord = new Set([...vask(tekst).split(" "), ...vask(tekst, false).split(" ")]);
  for (const o of [...ord]) {
    const m = /^([a-z]{1,3})(\d[a-z0-9+]*)$/.exec(o);
    if (m) {
      ord.add(m[1]);
      ord.add(m[2]);
    }
  }
  const rekke = vask(tekst, false).split(" ");
  for (let i = 0; i + 1 < rekke.length; i++) {
    if (/^[a-z]{1,3}$/.test(rekke[i]) && /^\d/.test(rekke[i + 1])) ord.add(rekke[i] + rekke[i + 1]);
  }
  ord.delete("");
  return ord;
}
const ORD = MASKINER.map((r) => ordFor(`${r[1]} ${r[0]} ${r[5]}`));

// Merkene i listen, og hva slags system de fleste maskinene deres har. Brukes når modellen ikke
// finnes: skriver noen «lenovo», skal svaret handle om PC-er, ikke om Mac.
const MERKER = new Map();
for (const r of MASKINER) {
  const m = vask(r[1]).split(" ")[0];
  const s = r[3] === "mi" || r[3] === "ma" ? "mac" : r[3] === "l" || r[3] === "la" ? "linux" : r[3] === "c" ? "chromebook" : "pc";
  const tell = MERKER.get(m) || { navn: r[1], pc: 0, mac: 0, linux: 0, chromebook: 0 };
  tell[s]++;
  MERKER.set(m, tell);
}
const SYSTEMORD = {
  mac: ["mac", "macbook", "imac", "macos", "apple"],
  linux: ["linux", "ubuntu", "debian", "fedora", "mint"],
  pc: ["pc", "windows", "win10", "win11", "laptop", "barbar", "stasjonaer"],
};
const GENERELLE = {
  pc: ["PC med Windows 11", "PC med Windows 10"],
  mac: ["Mac med Apple-prosessor"],
  linux: ["PC med Ubuntu"],
};

/** Hvor godt ett søkeord passer en rad: 3 = hele ordet, 1 = begynnelsen av et ord, 0 = ikke. Tall må stemme helt. */
function passer(ord, sokeord) {
  if (ord.has(sokeord)) return 3;
  if (/^\d+$/.test(sokeord) || sokeord.length < 2) return 0;
  for (const o of ord) if (o.startsWith(sokeord)) return 1;
  return 0;
}

function rad(r) {
  const [svar, tekst] = svarFor(r);
  return { navn: r[0], merke: r[1], slag: SLAG[r[2]] || "", svar, tekst };
}

/** Radene der alle søkeordene passer, de beste først. */
function finn(sokeord) {
  const funn = [];
  for (let i = 0; i < MASKINER.length; i++) {
    let sum = 0;
    for (const s of sokeord) {
      const p = passer(ORD[i], s);
      if (!p) {
        sum = -1;
        break;
      }
      sum += p;
    }
    // Like gode treff: det korteste navnet først, så «T14 Gen 1» kommer før «T14s Gen 1». For Mac: de nyeste først.
    if (sum > 0) funn.push([sum * 100 - MASKINER[i][0].length + (MASKINER[i][4] ? (MASKINER[i][4] - 2000) * 3 : 0), i]);
  }
  funn.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  // Finnes det rader der hvert ord står helt, vises bare de: «v14» skal ikke også gi «V145».
  const hele = funn.filter(([, i]) => sokeord.every((s) => ORD[i].has(s)));
  return hele.length ? hele : funn;
}

/** Hva søket handler om når modellen ikke finnes: merket, og om det er PC, Mac eller Linux. */
function gjett(sokeord) {
  for (const s of sokeord) {
    const m = MERKER.get(s);
    if (m) {
      const system = ["pc", "mac", "linux", "chromebook"].sort((a, b) => m[b] - m[a])[0];
      return { merke: m.navn, system: system === "chromebook" ? "pc" : system };
    }
  }
  for (const [system, ord] of Object.entries(SYSTEMORD)) if (sokeord.some((s) => ord.includes(s))) return { merke: "", system };
  return { merke: "", system: "" };
}

/**
 * Søk i listen. Svaret har de seks beste, hvor mange flere som passer, og hvor mange maskiner listen har.
 *
 * 1. Alle ordene passer: treffene.
 * 2. Ingen rad har alle ordene: de nærmeste, der ett ord er lagt bort («thinkpad t14 gen 9» gir
 *    T14-ene som finnes). Da er `naer` sann, og siden sier at det ikke er akkurat den.
 * 3. Heller ikke det: det som gjelder for slike maskiner i det hele tatt (`generelt`), valgt etter
 *    merket eller systemet i søket. Et søk på en Lenovo får aldri svar om Mac. Sier søket verken
 *    merke eller system, er `treff` tom, og siden ber om merke og modell.
 */
export function sokMaskin(q, maks = 6) {
  const sokeord = vask(String(q || "").slice(0, 80)).split(" ").filter(Boolean).slice(0, 8);
  const antall = MASKINER.length;
  const tomt = { treff: [], flere: 0, antall, naer: false, generelt: false, merke: "" };
  if (!sokeord.length || sokeord.join("").length < 2) return tomt;

  let funn = finn(sokeord);
  let naer = false;
  if (!funn.length && sokeord.length > 1) {
    // Legg bort ett ord om gangen, det siste først. Det som står igjen, må være mer enn bare merket.
    for (let i = sokeord.length - 1; i >= 0 && !funn.length; i--) {
      const rest = sokeord.filter((_, j) => j !== i);
      if (rest.every((s) => MERKER.has(s) || Object.values(SYSTEMORD).flat().includes(s))) continue;
      funn = finn(rest);
    }
    naer = funn.length > 0;
  }
  if (funn.length) {
    return { ...tomt, treff: funn.slice(0, maks).map(([, i]) => rad(MASKINER[i])), flere: Math.max(0, funn.length - maks), naer };
  }
  const { merke, system } = gjett(sokeord);
  const navn = GENERELLE[system] || [];
  return { ...tomt, treff: navn.map((n) => MASKINER.find((r) => r[0] === n)).filter(Boolean).map(rad), generelt: true, merke };
}


// Fra kommandolinjen (den lokale tjeneren): skriv svaret som JSON.
if (typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("klart-maskin.js")) {
  console.log(JSON.stringify(sokMaskin(process.argv[2] || "")));
}
