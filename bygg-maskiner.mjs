// Lager .worker/maskiner.js: listen over maskiner som «Går Klart på maskinen din?» på /klart søker i
// (GET /klart/api/maskin, se .worker/klart-maskin.js).
//
//   node bygg-maskiner.mjs
//
// Listen er skrevet som familier, ikke som rader: «ThinkPad T14 Gen 1–5» blir fem maskiner. Hver
// maskin har bare det som avgjør svaret: hva slags system den kjører, prosessortypen, og for Mac
// hvilket år den er fra (det avgjør om den kan få macOS-versjonen Klart trenger). Selve svaret
// regnes ut i klart-maskin.js, så kravene kan endres ett sted uten å bygge listen på nytt.
//
// Listen sier hva maskinen KAN kjøre ut fra systemkravene. Den er ikke en liste over maskiner
// Klart er prøvd på, og siden sier ikke det heller.
//
// En rad i maskiner.js: [navn, merke, slag, system, år, flere navn]
//   slag:    b = bærbar, s = stasjonær, n = nettbrett, t = telefon
//   system:  mi = Mac med Intel, ma = Mac med Apple-prosessor, w = Windows-PC (x64),
//            wa = Windows-PC med ARM-prosessor, l = Linux-PC (x64), la = Linux med ARM,
//            c = Chromebook, i = iPad/iPhone, a = Android
//   år:      for Mac året modellen kom (0 = ikke relevant)

import { writeFileSync } from "node:fs";

const rader = [];
const sett = new Set();

function legg(navn, merke, slag, system, aar = 0, alias = "") {
  const n = navn.replace(/\s+/g, " ").trim();
  const nokkel = (merke + " " + n).toLowerCase();
  if (sett.has(nokkel)) return;
  sett.add(nokkel);
  rader.push([n, merke, slag, system, aar, alias]);
}

/** «a–b» som tall, begge med. */
function fra(a, b) {
  const ut = [];
  for (let i = a; i <= b; i++) ut.push(i);
  return ut;
}

/** En familie der hver generasjon er en egen maskin: «ThinkPad T14 Gen 3». */
function gen(merke, navn, generasjoner, slag = "b", system = "w", ord = "Gen") {
  // HP skriver «G8» i ett, Lenovo «Gen 3» i to.
  for (const g of generasjoner) legg(ord === "G" ? `${navn} G${g}` : `${navn} ${ord} ${g}`, merke, slag, system, 0, `${navn} g${g} gen ${g}`);
}

/** En familie der modellnummeret er navnet: «Latitude 5420». */
function modeller(merke, forstavelse, liste, slag = "b", system = "w") {
  for (const m of liste) legg(`${forstavelse} ${m}`.trim(), merke, slag, system);
}

// ---------------------------------------------------------------------------
// Apple. Året avgjør: macOS 13 går på MacBook Pro, MacBook og iMac fra 2017, MacBook Air og
// Mac mini fra 2018, Mac Pro fra 2019, og alle med Apple-prosessor.
// ---------------------------------------------------------------------------

const A = "Apple";
// MacBook Air
for (const [aar, tommer] of [[2010, [11, 13]], [2011, [11, 13]], [2012, [11, 13]], [2013, [11, 13]], [2014, [11, 13]], [2015, [11, 13]], [2017, [13]]])
  for (const t of tommer) legg(`MacBook Air ${t}″ (${aar})`, A, "b", "mi", aar);
for (const aar of [2018, 2019, 2020]) legg(`MacBook Air 13″ (Intel, ${aar})`, A, "b", "mi", aar, "retina");
legg("MacBook Air 13″ (M1, 2020)", A, "b", "ma", 2020, "a2337 macbookair10,1");
legg("MacBook Air 13″ (M2, 2022)", A, "b", "ma", 2022, "a2681");
legg("MacBook Air 15″ (M2, 2023)", A, "b", "ma", 2023, "a2941");
legg("MacBook Air 13″ (M3, 2024)", A, "b", "ma", 2024, "a3113");
legg("MacBook Air 15″ (M3, 2024)", A, "b", "ma", 2024, "a3114");
legg("MacBook Air 13″ (M4, 2025)", A, "b", "ma", 2025);
legg("MacBook Air 15″ (M4, 2025)", A, "b", "ma", 2025);

// MacBook Pro
for (const aar of [2010, 2011, 2012]) for (const t of [13, 15]) legg(`MacBook Pro ${t}″ (${aar})`, A, "b", "mi", aar);
for (const aar of [2010, 2011]) legg(`MacBook Pro 17″ (${aar})`, A, "b", "mi", aar);
for (const aar of [2012, 2013, 2014, 2015]) for (const t of [13, 15]) legg(`MacBook Pro ${t}″ Retina (${aar})`, A, "b", "mi", aar);
for (const aar of [2016, 2017, 2018, 2019]) for (const t of [13, 15]) legg(`MacBook Pro ${t}″ (${aar})`, A, "b", "mi", aar, "touch bar");
legg("MacBook Pro 16″ (Intel, 2019)", A, "b", "mi", 2019, "a2141");
legg("MacBook Pro 13″ (Intel, 2020)", A, "b", "mi", 2020);
legg("MacBook Pro 13″ (M1, 2020)", A, "b", "ma", 2020, "a2338");
for (const t of [14, 16]) {
  legg(`MacBook Pro ${t}″ (M1 Pro, 2021)`, A, "b", "ma", 2021);
  legg(`MacBook Pro ${t}″ (M1 Max, 2021)`, A, "b", "ma", 2021);
  legg(`MacBook Pro ${t}″ (M2 Pro, 2023)`, A, "b", "ma", 2023);
  legg(`MacBook Pro ${t}″ (M2 Max, 2023)`, A, "b", "ma", 2023);
  legg(`MacBook Pro ${t}″ (M3 Pro, 2023)`, A, "b", "ma", 2023);
  legg(`MacBook Pro ${t}″ (M3 Max, 2023)`, A, "b", "ma", 2023);
  legg(`MacBook Pro ${t}″ (M4 Pro, 2024)`, A, "b", "ma", 2024);
  legg(`MacBook Pro ${t}″ (M4 Max, 2024)`, A, "b", "ma", 2024);
}
legg("MacBook Pro 13″ (M2, 2022)", A, "b", "ma", 2022);
legg("MacBook Pro 14″ (M3, 2023)", A, "b", "ma", 2023);
legg("MacBook Pro 14″ (M4, 2024)", A, "b", "ma", 2024);
legg("MacBook Pro 14″ (M5, 2025)", A, "b", "ma", 2025);

// MacBook 12″
for (const aar of [2015, 2016, 2017]) legg(`MacBook 12″ (${aar})`, A, "b", "mi", aar, "retina");
for (const aar of [2008, 2009, 2010]) legg(`MacBook 13″ (${aar})`, A, "b", "mi", aar, "hvit");

// iMac
for (const aar of [2009, 2010, 2011, 2012, 2013, 2014, 2015]) for (const t of ["21,5", "27"]) legg(`iMac ${t}″ (${aar})`, A, "s", "mi", aar);
for (const aar of [2017, 2019]) for (const t of ["21,5", "27"]) legg(`iMac ${t}″ (${aar})`, A, "s", "mi", aar, "retina 4k 5k");
legg("iMac 27″ (2020)", A, "s", "mi", 2020, "retina 5k");
legg("iMac Pro (2017)", A, "s", "mi", 2017);
legg("iMac 24″ (M1, 2021)", A, "s", "ma", 2021);
legg("iMac 24″ (M3, 2023)", A, "s", "ma", 2023);
legg("iMac 24″ (M4, 2024)", A, "s", "ma", 2024);

// Mac mini, Mac Studio, Mac Pro
for (const aar of [2010, 2011, 2012, 2014, 2018]) legg(`Mac mini (${aar})`, A, "s", "mi", aar);
legg("Mac mini (M1, 2020)", A, "s", "ma", 2020);
legg("Mac mini (M2, 2023)", A, "s", "ma", 2023);
legg("Mac mini (M2 Pro, 2023)", A, "s", "ma", 2023);
legg("Mac mini (M4, 2024)", A, "s", "ma", 2024);
legg("Mac mini (M4 Pro, 2024)", A, "s", "ma", 2024);
legg("Mac Studio (M1 Max, 2022)", A, "s", "ma", 2022);
legg("Mac Studio (M1 Ultra, 2022)", A, "s", "ma", 2022);
legg("Mac Studio (M2 Max, 2023)", A, "s", "ma", 2023);
legg("Mac Studio (M2 Ultra, 2023)", A, "s", "ma", 2023);
legg("Mac Studio (M4 Max, 2025)", A, "s", "ma", 2025);
legg("Mac Studio (M3 Ultra, 2025)", A, "s", "ma", 2025);
for (const aar of [2010, 2012, 2013, 2019]) legg(`Mac Pro (${aar})`, A, "s", "mi", aar);
legg("Mac Pro (M2 Ultra, 2023)", A, "s", "ma", 2023);

// Det som ikke er en datamaskin med macOS.
for (const m of ["iPad", "iPad Air", "iPad Pro 11″", "iPad Pro 13″", "iPad mini"]) legg(m, A, "n", "i");
legg("iPhone", A, "t", "i");

// ---------------------------------------------------------------------------
// Lenovo
// ---------------------------------------------------------------------------

const L = "Lenovo";
modeller(L, "ThinkPad", [
  "T420", "T420s", "T430", "T430s", "T440", "T440s", "T440p", "T450", "T450s", "T460", "T460s", "T460p", "T470", "T470s", "T470p",
  "T480", "T480s", "T490", "T490s", "T495", "T495s", "T520", "T530", "T540p", "T550", "T560", "T570", "T580", "T590",
  "X220", "X230", "X240", "X250", "X260", "X270", "X280", "X380 Yoga", "X390", "X390 Yoga", "X395",
  "L380", "L380 Yoga", "L390", "L390 Yoga", "L440", "L450", "L460", "L470", "L480", "L490", "L540", "L560", "L570", "L580", "L590",
  "E470", "E480", "E490", "E495", "E570", "E580", "E590", "E595",
  "P50", "P51", "P52", "P53", "P50s", "P51s", "P52s", "P53s", "P70", "P71", "P72", "P73", "P43s",
  "A275", "A285", "A475", "A485", "13 (1. gen)", "13 (2. gen)", "25",
]);
gen(L, "ThinkPad T14", fra(1, 5));
gen(L, "ThinkPad T14s", fra(1, 6));
gen(L, "ThinkPad T15", fra(1, 2));
gen(L, "ThinkPad T16", fra(1, 3));
gen(L, "ThinkPad T15p", fra(1, 3));
gen(L, "ThinkPad X13", fra(1, 5));
gen(L, "ThinkPad X13 Yoga", fra(1, 4));
gen(L, "ThinkPad X1 Carbon", fra(1, 13));
gen(L, "ThinkPad X1 Yoga", fra(1, 9));
gen(L, "ThinkPad X1 2-in-1", fra(9, 10));
gen(L, "ThinkPad X1 Nano", fra(1, 3));
gen(L, "ThinkPad X1 Extreme", fra(1, 5));
gen(L, "ThinkPad X1 Titanium Yoga", [1]);
gen(L, "ThinkPad X12 Detachable", fra(1, 2));
gen(L, "ThinkPad L13", fra(1, 5));
gen(L, "ThinkPad L13 Yoga", fra(1, 4));
gen(L, "ThinkPad L14", fra(1, 5));
gen(L, "ThinkPad L15", fra(1, 4));
gen(L, "ThinkPad L16", fra(1, 2));
gen(L, "ThinkPad E14", fra(1, 7));
gen(L, "ThinkPad E15", fra(1, 4));
gen(L, "ThinkPad E16", fra(1, 3));
gen(L, "ThinkPad P1", fra(1, 7));
gen(L, "ThinkPad P14s", fra(1, 5));
gen(L, "ThinkPad P15", fra(1, 2));
gen(L, "ThinkPad P15s", fra(1, 2));
gen(L, "ThinkPad P15v", fra(1, 3));
gen(L, "ThinkPad P16", fra(1, 2));
gen(L, "ThinkPad P16s", fra(1, 3));
gen(L, "ThinkPad P16v", fra(1, 2));
gen(L, "ThinkPad P17", fra(1, 2));
gen(L, "ThinkPad Z13", fra(1, 2));
gen(L, "ThinkPad Z16", fra(1, 2));
legg("ThinkPad X13s", L, "b", "wa", 0, "snapdragon arm");
legg("ThinkPad T14s Gen 6 (Snapdragon)", L, "b", "wa", 0, "arm");
gen(L, "ThinkBook 13s", fra(1, 4), "b", "w", "G");
gen(L, "ThinkBook 14", fra(1, 7), "b", "w", "G");
gen(L, "ThinkBook 14s Yoga", fra(1, 3), "b", "w", "G");
gen(L, "ThinkBook 15", fra(1, 5), "b", "w", "G");
gen(L, "ThinkBook 16", fra(4, 7), "b", "w", "G");
gen(L, "ThinkBook 16p", fra(1, 5), "b", "w", "G");
modeller(L, "IdeaPad", [
  "1 14", "1 15", "3 14", "3 15", "3 17", "5 14", "5 15", "5 Pro 14", "5 Pro 16", "Slim 3 14", "Slim 3 15", "Slim 3 16", "Slim 5 14", "Slim 5 16",
  "Flex 5 14", "Flex 5 16", "S145", "S340", "S540", "L340", "320", "330", "330S", "520", "530S", "720S", "Gaming 3",
]);
modeller(L, "Yoga", ["Slim 6", "Slim 7", "Slim 7 Pro", "Slim 9", "6", "7", "7i", "9i", "C740", "C930", "C940", "S730", "S740", "Pro 7", "Pro 9", "Book 9i", "530", "730", "920"]);
legg("Yoga Slim 7x (Snapdragon)", L, "b", "wa", 0, "arm");
modeller(L, "Legion", ["5", "5 Pro", "5i", "7", "7i", "Slim 5", "Slim 7", "Pro 5", "Pro 7", "Y520", "Y530", "Y540", "Y740"]);
modeller(L, "", ["V14", "V15", "V17", "V110", "V130", "V145", "V330", "V340"]);
modeller(L, "ThinkCentre", [
  "M70q", "M70s", "M70t", "M80q", "M80s", "M80t", "M90q", "M90s", "M90t", "M75q", "M75s", "M700", "M710q", "M710s", "M720q", "M720s", "M720t",
  "M900", "M910q", "M910s", "M920q", "M920s", "M920t", "M93p", "neo 50q", "neo 50s", "neo 50t", "neo 30a", "M70a", "M90a",
], "s");
modeller(L, "ThinkStation", ["P320", "P330", "P340", "P350", "P360", "P3 Tiny", "P3 Tower", "P520", "P620", "P5", "P7"], "s");
modeller(L, "IdeaCentre", ["3", "5", "AIO 3", "AIO 5", "Mini 5"], "s");
legg("IdeaPad Duet Chromebook", L, "n", "c");
legg("IdeaPad Flex 5 Chromebook", L, "b", "c");
legg("Lenovo Chromebook 14e", L, "b", "c", 0, "500e 300e 100e");
legg("Lenovo Tab", L, "n", "a", 0, "tab m10 p11 p12");

// ---------------------------------------------------------------------------
// HP
// ---------------------------------------------------------------------------

const H = "HP";
for (const n of [820, 840, 850]) gen(H, `EliteBook ${n}`, fra(1, 4), "b", "w", "G");
for (const n of [830, 840, 850]) gen(H, `EliteBook ${n}`, fra(5, 8), "b", "w", "G");
for (const n of [830, 840, 860]) gen(H, `EliteBook ${n}`, fra(9, 11), "b", "w", "G");
for (const n of [835, 845, 855]) gen(H, `EliteBook ${n}`, fra(7, 8), "b", "w", "G");
for (const n of [835, 845, 865]) gen(H, `EliteBook ${n}`, fra(9, 11), "b", "w", "G");
for (const n of [630, 640, 650, 645, 655]) gen(H, `EliteBook ${n}`, fra(9, 11), "b", "w", "G");
gen(H, "EliteBook 1040", fra(3, 11), "b", "w", "G");
gen(H, "EliteBook x360 1030", fra(2, 8), "b", "w", "G");
gen(H, "EliteBook x360 1040", fra(5, 11), "b", "w", "G");
gen(H, "EliteBook x360 830", fra(5, 11), "b", "w", "G");
gen(H, "EliteBook Folio 1040", fra(1, 3), "b", "w", "G");
modeller(H, "EliteBook", ["Folio 9470m", "Folio 9480m", "8470p", "8570p", "2570p", "Folio G1", "1050 G1", "Ultra G1i"]);
legg("EliteBook Ultra G1q (Snapdragon)", H, "b", "wa", 0, "arm");
gen(H, "Elite Dragonfly", fra(1, 4), "b", "w", "G");
gen(H, "Dragonfly Folio", [3], "b", "w", "G");
for (const n of [440, 450, 455]) gen(H, `ProBook ${n}`, fra(1, 11), "b", "w", "G");
gen(H, "ProBook 430", fra(1, 8), "b", "w", "G");
gen(H, "ProBook 470", fra(1, 10), "b", "w", "G");
for (const n of [640, 650]) gen(H, `ProBook ${n}`, fra(1, 8), "b", "w", "G");
gen(H, "ProBook 645", fra(1, 4), "b", "w", "G");
for (const n of [445, 465, 460]) gen(H, `ProBook ${n}`, fra(6, 11), "b", "w", "G");
gen(H, "ProBook x360 435", fra(7, 8), "b", "w", "G");
gen(H, "ProBook x360 440", [1], "b", "w", "G");
for (const n of ["Firefly 14", "Firefly 15", "Firefly 16", "Power", "Power 15", "Power 16", "Studio", "Studio 16", "Fury 15", "Fury 16", "Fury 17", "Create"]) gen(H, `ZBook ${n}`, fra(7, 11), "b", "w", "G");
for (const n of [14, 15, 17]) gen(H, `ZBook ${n}`, fra(1, 6), "b", "w", "G");
for (const n of ["14u", "15u", "15v"]) gen(H, `ZBook ${n}`, fra(4, 6), "b", "w", "G");
for (const n of [240, 245, 250, 255]) gen(H, `HP ${n}`, fra(4, 10), "b", "w", "G");
gen(H, "HP 470", fra(8, 10), "b", "w", "G");
modeller(H, "Pavilion", ["13", "14", "15", "17", "Aero 13", "Plus 14", "Plus 16", "x360 14", "x360 15", "Gaming 15", "Gaming 16"]);
modeller(H, "Envy", ["13", "14", "15", "16", "17", "x360 13", "x360 14", "x360 15", "x360 16"]);
modeller(H, "Spectre", ["x360 13", "x360 14", "x360 15", "x360 16", "13", "Folio 13"]);
modeller(H, "OmniBook", ["X 14", "Ultra 14", "Ultra Flip 14", "5 Flip 14", "7 Flip 16"]);
legg("OmniBook X 14 (Snapdragon)", H, "b", "wa", 0, "arm");
modeller(H, "HP", ["Laptop 14", "Laptop 15", "Laptop 17", "Stream 11", "Stream 14", "Victus 15", "Victus 16", "Omen 15", "Omen 16", "Omen 17"]);
gen(H, "EliteDesk 800", fra(1, 9), "s", "w", "G");
gen(H, "EliteDesk 705", fra(1, 5), "s", "w", "G");
gen(H, "EliteDesk 880", fra(3, 9), "s", "w", "G");
gen(H, "EliteDesk 805", fra(6, 9), "s", "w", "G");
gen(H, "ProDesk 400", fra(1, 9), "s", "w", "G");
gen(H, "ProDesk 600", fra(1, 6), "s", "w", "G");
gen(H, "ProDesk 405", fra(4, 9), "s", "w", "G");
gen(H, "Elite Mini 800", [9], "s", "w", "G");
gen(H, "Elite Mini 600", [9], "s", "w", "G");
gen(H, "Elite SFF 800", [9], "s", "w", "G");
gen(H, "Pro Mini 400", [9], "s", "w", "G");
gen(H, "EliteOne 800", fra(1, 9), "s", "w", "G");
gen(H, "EliteOne 840", [9], "s", "w", "G");
gen(H, "ProOne 400", fra(1, 9), "s", "w", "G");
gen(H, "ProOne 440", fra(3, 9), "s", "w", "G");
gen(H, "ProOne 600", fra(1, 6), "s", "w", "G");
for (const n of ["Z2 Mini", "Z2 SFF", "Z2 Tower", "Z4", "Z6", "Z8"]) gen(H, n, fra(4, 9), "s", "w", "G");
modeller(H, "", ["Z240", "Z440", "Z640", "Z840", "Z1 Entry Tower"], "s");
modeller(H, "HP Chromebook", ["11", "14", "15", "x360 14", "Elite c1030", "Pro c640"], "b", "c");

// ---------------------------------------------------------------------------
// Dell
// ---------------------------------------------------------------------------

const D = "Dell";
const latitude = [];
for (const serie of [3, 5, 7]) for (const str of [2, 3, 4, 5]) for (const aar of [8, 9]) latitude.push(`${serie}${str}${aar}0`);
for (const serie of [3, 5, 7]) for (const str of [3, 4, 5]) for (const g of [0, 1, 2, 3, 4, 5]) latitude.push(`${serie}${str}${g}0`);
for (const g of [1, 2, 3, 4, 5]) latitude.push(`72${g}0`);
for (const g of [3, 4, 5]) latitude.push(`76${g}0`, `56${g}0`);
// Tallrekkene over lager også noen numre Dell aldri ga ut. De tas bort her.
const ikkeLatitude = new Set(["3280", "3290", "5380", "5390", "7580", "7590", "7500", "7510", "7540", "7550"]);
modeller(D, "Latitude", [...new Set(latitude)].filter((m) => !ikkeLatitude.has(m)).sort());
modeller(D, "Latitude", [
  "E5250", "E5270", "E5450", "E5470", "E5550", "E5570", "E6230", "E6330", "E6430", "E6530", "E6440", "E6540", "E7240", "E7250", "E7270",
  "E7440", "E7450", "E7470", "9330", "9410", "9420", "9430", "9440 2-in-1", "9450 2-in-1", "9510", "9520", "7200 2-in-1", "7210 2-in-1", "7320 Detachable",
  "5290 2-in-1", "5300 2-in-1", "5310 2-in-1", "7390 2-in-1", "7400 2-in-1", "7410 2-in-1", "3120", "3140", "3189", "3190", "3310", "3301",
  "5285 2-in-1", "7285 2-in-1", "5411", "5421", "5431", "5511", "5521", "5531", "5401", "5501", "5491", "5591", "5495", "7455",
]);
legg("Latitude 7455 (Snapdragon)", D, "b", "wa", 0, "arm");
modeller(D, "XPS", [
  "13 9343", "13 9350", "13 9360", "13 9365 2-in-1", "13 9370", "13 9380", "13 7390", "13 7390 2-in-1", "13 9300", "13 9305", "13 9310", "13 9310 2-in-1",
  "13 9315", "13 9315 2-in-1", "13 Plus 9320", "13 9340", "13 9350 (2024)", "14 9440", "15 9550", "15 9560", "15 9570", "15 9575 2-in-1", "15 7590",
  "15 9500", "15 9510", "15 9520", "15 9530", "16 9640", "17 9700", "17 9710", "17 9720", "17 9730", "12 9250", "8930", "8940", "8950", "8960",
]);
legg("XPS 13 9345 (Snapdragon)", D, "b", "wa", 0, "arm");
modeller(D, "Inspiron", [
  "13 5310", "13 5320", "13 5330", "13 7370", "13 7380", "13 7390", "14 5400 2-in-1", "14 5410", "14 5420", "14 5430", "14 5440", "14 7420 2-in-1",
  "14 7430 2-in-1", "14 Plus 7420", "14 Plus 7430", "14 Plus 7440", "15 3510", "15 3511", "15 3520", "15 3530", "15 3535", "15 5501", "15 5510",
  "15 5515", "15 5570", "15 5580", "15 5590", "15 7501", "15 7510", "16 5620", "16 5630", "16 5640", "16 Plus 7610", "16 Plus 7620", "16 Plus 7630",
  "16 Plus 7640", "17 3780", "17 3793", "24 5400 AIO", "24 5410 AIO", "24 5420 AIO", "27 7700 AIO", "27 7710 AIO", "3880", "3891", "3910", "3020",
]);
modeller(D, "Vostro", [
  "3400", "3401", "3410", "3420", "3430", "3440", "3500", "3501", "3510", "3515", "3520", "3525", "3530", "3535", "3540", "3568", "3578", "3580", "3590",
  "5301", "5310", "5320", "5330", "5370", "5390", "5391", "5401", "5402", "5410", "5415", "5471", "5481", "5490", "5501", "5502", "5510", "5515",
  "5568", "5581", "5590", "5620", "5625", "5630", "5640", "7500", "7510", "7590", "7620",
]);
modeller(D, "Precision", [
  "3510", "3520", "3530", "3540", "3541", "3550", "3551", "3560", "3561", "3570", "3571", "3580", "3581", "3590", "3591", "5510", "5520", "5530", "5540",
  "5550", "5560", "5570", "5470", "5480", "5490", "5680", "5690", "5750", "5760", "5770", "7510", "7520", "7530", "7540", "7550", "7560", "7670", "7680",
  "7710", "7720", "7730", "7740", "7750", "7760", "7770", "7780",
]);
modeller(D, "Precision", ["3240 Compact", "3260 Compact", "3280 CFF", "3420 Tower", "3430 SFF", "3440 SFF", "3450 SFF", "3460 SFF", "3620 Tower", "3630 Tower", "3640 Tower", "3650 Tower", "3660 Tower", "3680 Tower", "5810 Tower", "5820 Tower", "5860 Tower", "7820 Tower", "7920 Tower", "7960 Tower"], "s");
const optiplex = [];
for (const serie of [30, 50, 70]) for (const g of [20, 40, 50, 60, 70, 80, 90]) optiplex.push(`${serie}${g}`);
modeller(D, "OptiPlex", [...optiplex.filter((m) => m !== "5020"), "3000", "5000", "7000", "7010", "7020", "3010", "9010", "9020", "7010 (2023)", "7020 (2024)", "3280 AIO", "5270 AIO", "5400 AIO", "5490 AIO", "7400 AIO", "7410 AIO", "7420 AIO", "7480 AIO", "7490 AIO", "7770 AIO", "7780 AIO", "Micro 3000", "Micro 5000", "Micro 7000", "Micro 7010", "Micro 7020"], "s");
modeller(D, "Dell Pro", ["13 Plus", "14", "14 Plus", "14 Premium", "16", "16 Plus", "Max 14", "Max 16"]);
modeller(D, "Dell", ["14 Plus", "16 Plus", "G15", "G16", "Alienware m15", "Alienware m16", "Alienware x14", "Alienware x16", "Alienware Aurora"]);
modeller(D, "Dell Chromebook", ["3100", "3110", "3120", "Latitude 5400 Chromebook", "Latitude 7410 Chromebook"], "b", "c");

// ---------------------------------------------------------------------------
// Microsoft Surface
// ---------------------------------------------------------------------------

const M = "Microsoft";
modeller(M, "Surface", ["Pro 3", "Pro 4", "Pro (2017)", "Pro 6", "Pro 7", "Pro 7+", "Pro 8", "Pro 9", "Pro 10", "Pro 11 (Intel)"], "n");
modeller(M, "Surface", ["Pro X", "Pro 9 5G", "Pro 11 (Snapdragon)", "Pro 12″ (2025)"], "n", "wa");
modeller(M, "Surface", ["Laptop 1", "Laptop 2", "Laptop 3", "Laptop 4", "Laptop 5", "Laptop 6", "Laptop 7 (Intel)", "Laptop Go", "Laptop Go 2", "Laptop Go 3", "Laptop Studio", "Laptop Studio 2", "Laptop SE", "Book", "Book 2", "Book 3"]);
modeller(M, "Surface", ["Laptop 7 (Snapdragon)", "Laptop 13″ (2025)"], "b", "wa");
modeller(M, "Surface", ["Go", "Go 2", "Go 3", "Go 4"], "n");
modeller(M, "Surface", ["Studio", "Studio 2", "Studio 2+"], "s");
modeller(M, "Surface", ["RT", "2", "3"], "n", "wa");

// ---------------------------------------------------------------------------
// Acer, ASUS
// ---------------------------------------------------------------------------

const AC = "Acer";
modeller(AC, "Swift", ["1", "3", "3 OLED", "5", "7", "X 14", "X 16", "Go 14", "Go 16", "Edge 16", "14 AI", "16 AI"]);
modeller(AC, "Aspire", ["1", "3", "5", "7", "Vero", "Go 15", "E 15", "ES 15", "V Nitro", "C24 AIO", "C27 AIO", "TC", "XC"]);
modeller(AC, "TravelMate", ["B1", "P2", "P214", "P215", "P4", "P414", "P416", "P6", "P614", "Spin B3", "Spin P4", "X5"]);
modeller(AC, "Spin", ["1", "3", "5", "7"]);
modeller(AC, "Acer", ["Nitro 5", "Nitro 7", "Nitro V 15", "Predator Helios 300", "Predator Helios Neo 16", "Predator Triton 300", "ConceptD 3", "ConceptD 7", "Extensa 15", "Enduro N3"]);
modeller(AC, "Veriton", ["N4660G", "N4680G", "N4690G", "X2660G", "X2680G", "X2690G", "X4660G", "X4680G", "Z4660G", "Z4860G"], "s");
modeller(AC, "Acer Chromebook", ["311", "314", "315", "317", "Spin 311", "Spin 513", "Spin 713", "Spin 714", "Plus 515"], "b", "c");
legg("Swift 14 AI (Snapdragon)", AC, "b", "wa", 0, "arm");

const AS = "ASUS";
modeller(AS, "ZenBook", [
  "13 UX325", "13 UX331", "13 UX333", "13 UX334", "13 OLED UM325", "14 UX425", "14 UX431", "14 UX433", "14 UX434", "14 UX435", "14 OLED UX3402", "14 OLED UX3405",
  "14 OLED UM3402", "14 Flip OLED", "14X OLED", "15 UX533", "15 UX534", "15 OLED UM3504", "S 13 OLED", "S 14", "S 16", "Pro 14 OLED", "Pro 15", "Pro 16X", "Duo 14", "Pro Duo 15", "Flip 13", "Flip S", "3 UX390", "UX305", "UX310", "UX330", "UX410",
]);
modeller(AS, "VivoBook", [
  "14 X412", "14 X415", "14 X420", "14 X1402", "14 X1404", "15 X512", "15 X515", "15 X540", "15 X542", "15 X1500", "15 X1502", "15 X1504", "16 X1605", "17 X705", "17 X712", "17 X1702",
  "S13", "S14", "S14 OLED", "S15", "S15 OLED", "S16 OLED", "Flip 14", "Go 14", "Go 15", "Pro 14 OLED", "Pro 15 OLED", "Pro 16X OLED", "E203", "E410", "E510",
]);
modeller(AS, "ExpertBook", ["B1 B1400", "B1 B1402", "B1 B1500", "B1 B1502", "B3 Flip", "B5 B5302", "B5 B5402", "B5 B5404", "B5 B5602", "B7 Flip", "B9 B9400", "B9 B9403", "B9 B9450", "P1", "P2 P2451", "P5 P5440", "P5405"]);
modeller(AS, "ASUS", ["ROG Zephyrus G14", "ROG Zephyrus G15", "ROG Zephyrus G16", "ROG Strix G15", "ROG Strix G16", "ROG Flow X13", "ROG Flow Z13", "TUF Gaming A15", "TUF Gaming F15", "TUF Dash F15", "ProArt StudioBook 16", "ProArt PX13", "Laptop X509", "Laptop X543"]);
modeller(AS, "ASUS", ["ExpertCenter D5", "ExpertCenter D7", "ExpertCenter D9", "ExpertCenter E5 AIO", "Mini PC PN50", "Mini PC PN51", "Mini PC PN52", "Mini PC PN53", "Mini PC PN62", "Mini PC PN63", "Mini PC PN64", "NUC 13 Pro", "NUC 14 Pro", "Zen AiO 24", "Zen AiO 27", "Vivo AiO V241"], "s");
modeller(AS, "ASUS Chromebook", ["C223", "C423", "C523", "CX1", "CX5", "Flip C434", "Flip CX3"], "b", "c");
legg("VivoBook S 15 (Snapdragon)", AS, "b", "wa", 0, "arm");
legg("ZenBook A14 (Snapdragon)", AS, "b", "wa", 0, "arm");

// ---------------------------------------------------------------------------
// Fujitsu, Samsung, LG, Huawei, MSI, Razer, Framework, Dynabook/Toshiba, Intel NUC m.fl.
// ---------------------------------------------------------------------------

const F = "Fujitsu";
modeller(F, "Lifebook", [
  "U727", "U728", "U729", "U729X", "U747", "U748", "U749", "U757", "U758", "U759", "U7310", "U7311", "U7312", "U7313", "U7410", "U7411", "U7412", "U7413",
  "U7510", "U7511", "U7512", "U7513", "U7613", "U937", "U938", "U939", "U939X", "U9310", "U9310X", "U9311", "U9311X", "U9312", "U9312X", "U9313", "U9413",
  "E448", "E449", "E458", "E459", "E548", "E549", "E558", "E559", "E5410", "E5411", "E5412", "E5413", "E5510", "E5511", "E5512", "E5513",
  "E734", "E744", "E746", "E754", "E756", "A3510", "A3511", "A357", "A359", "A555", "A557", "S938", "T937", "T938", "T939",
]);
modeller(F, "Esprimo", ["D538", "D556", "D738", "D756", "D757", "D7010", "D7011", "D7012", "D9010", "D9011", "G558", "G5010", "G5011", "G9010", "G9012", "P558", "P758", "P5010", "P9010", "Q558", "Q958", "Q7010", "K558 AIO", "K5010 AIO"], "s");
modeller(F, "Celsius", ["H780", "H7510", "H7613", "W580", "W5010", "W5012", "J580", "J5010", "M770", "M7010"], "s");

const S = "Samsung";
modeller(S, "Galaxy Book", [
  "(2021)", "Pro", "Pro 360", "Flex", "Flex2", "Ion", "Ion2", "Odyssey", "2", "2 Business", "2 Pro", "2 Pro 360", "2 360", "3", "3 Pro", "3 Pro 360", "3 360", "3 Ultra",
  "4", "4 Pro", "4 Pro 360", "4 360", "4 Ultra", "5 Pro", "5 Pro 360", "5 360",
]);
modeller(S, "Galaxy Book", ["S", "Go", "Go 5G", "2 Pro 360 5G (Snapdragon)", "4 Edge", "S7 (ARM)"], "b", "wa");
modeller(S, "Samsung Notebook", ["9", "9 Pen", "7", "7 Spin", "5", "Series 9"]);
modeller(S, "Samsung Chromebook", ["3", "4", "4+", "Plus", "Pro", "Galaxy Chromebook", "Galaxy Chromebook 2", "Galaxy Chromebook Go"], "b", "c");
legg("Galaxy Tab", S, "n", "a", 0, "tab s7 s8 s9 s10 a7 a8 a9");

const LG = "LG";
for (const t of [13, 14, 15, 16, 17]) for (const aar of [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
  if (t === 13 && aar > 2020) continue;
  if (t === 16 && aar < 2021) continue;
  if (t === 17 && aar < 2019) continue;
  legg(`gram ${t} (${aar})`, LG, "b", "w", 0, `${t}z90 ${t}z980 ${t}z990`);
}
modeller(LG, "gram", ["Style 14", "Style 16", "SuperSlim 15", "Pro 16", "Pro 17", "2-in-1 14", "2-in-1 16"]);

const HU = "Huawei";
modeller(HU, "MateBook", ["13", "13s", "14", "14s", "16", "16s", "D 14", "D 15", "D 16", "X", "X Pro (2018)", "X Pro (2019)", "X Pro (2020)", "X Pro (2021)", "X Pro (2022)", "X Pro (2023)", "X Pro (2024)", "E"]);
legg("MateBook E Go (Snapdragon)", HU, "n", "wa", 0, "arm");
legg("MatePad", HU, "n", "a");

const MS = "MSI";
modeller(MS, "MSI", [
  "Modern 14", "Modern 15", "Prestige 13 Evo", "Prestige 14", "Prestige 14 Evo", "Prestige 15", "Prestige 16", "Summit E13 Flip Evo", "Summit E14", "Summit E16 Flip",
  "Creator 15", "Creator 17", "Creator Z16", "Creator Z17", "GF63 Thin", "GF65 Thin", "Katana 15", "Katana 17", "Cyborg 15", "Stealth 14 Studio", "Stealth 15", "Stealth 16 Studio",
  "Raider GE76", "Raider GE78", "Titan GT77", "Titan 18 HX", "Pulse 15", "Pulse 17", "Sword 15", "Vector 16", "Bravo 15", "Alpha 15", "Thin 15",
]);
modeller(MS, "MSI", ["Cubi 5", "Cubi N", "PRO DP21", "PRO DP180", "PRO AP242", "PRO AP272", "Modern AM242", "Modern AM272", "Trident 3", "Codex R"], "s");

const R = "Razer";
modeller(R, "Razer Blade", ["14", "15", "15 Advanced", "15 Base", "16", "17", "18", "Stealth 13", "Pro 17"]);
modeller(R, "Razer", ["Book 13"]);

const FW = "Framework";
modeller(FW, "Framework Laptop", ["13 (Intel 11. gen)", "13 (Intel 12. gen)", "13 (Intel 13. gen)", "13 (Intel Core Ultra)", "13 (AMD Ryzen 7040)", "13 (AMD Ryzen AI 300)", "12", "16"]);
legg("Framework Desktop", FW, "s", "w");

const DY = "Dynabook";
modeller(DY, "Portégé", ["X20W", "X30", "X30-D", "X30-E", "X30-F", "X30-G", "X30L-G", "X30L-J", "X30L-K", "X30W-J", "X30W-K", "X40-J", "X40-K", "X40L-K", "X40L-M", "X50-G", "Z30", "Z30-A", "Z30-B", "Z30-C", "Z20t", "R30", "A30-C", "A30-D", "A30-E"]);
modeller(DY, "Tecra", ["A40-D", "A40-E", "A40-G", "A40-J", "A40-K", "A50-A", "A50-C", "A50-D", "A50-E", "A50-EC", "A50-F", "A50-J", "A50-K", "X40-D", "X40-E", "X40-F", "X50-F", "Z40-C", "Z50-C", "Z50-D"]);
modeller(DY, "Satellite Pro", ["A50-C", "A50-D", "A50-E", "C40-G", "C40-H", "C40-K", "C50-G", "C50-H", "C50-J", "C50-K", "L50-G", "L50-J", "R50-C", "R50-D", "R50-E"]);
modeller("Toshiba", "Satellite", ["C50", "C55", "C660", "C850", "L50", "L50-B", "L50-C", "L850", "P50", "P850", "S50", "Radius 12", "Radius 15", "Click 10"]);

const IN = "Intel";
modeller(IN, "NUC", [
  "5i3RYH", "5i5RYH", "5i7RYH", "6i3SYH", "6i5SYH", "6i7KYK", "7i3BNH", "7i5BNH", "7i7BNH", "8i3BEH", "8i5BEH", "8i7BEH", "8i7HVK", "10i3FNH", "10i5FNH", "10i7FNH",
  "11 Pro (Tiger Canyon)", "11 Performance (Panther Canyon)", "11 Enthusiast", "12 Pro (Wall Street Canyon)", "12 Enthusiast", "13 Pro (Arena Canyon)", "13 Extreme",
], "s");

// Flere merker som er vanlige i Norge, med modellene folk faktisk spør om.
modeller("Medion", "Medion", ["Akoya E14", "Akoya E15", "Akoya E16", "Akoya S15", "Akoya S17", "Erazer Crawler", "Erazer Deputy"]);
modeller("Gigabyte", "Gigabyte", ["Aero 14", "Aero 15", "Aero 16", "Aero 17", "Aorus 15", "Aorus 17", "G5", "G6", "U4"]);
modeller("Gigabyte", "Gigabyte Brix", ["GB-BRi3", "GB-BRi5", "GB-BRi7", "GB-BER5"], "s");
modeller("Panasonic", "Toughbook", ["CF-20", "CF-33", "CF-54", "FZ-55", "FZ-40", "CF-SV8", "CF-XZ6"]);
modeller("Getac", "Getac", ["B360", "S410", "V110", "F110", "K120", "UX10"]);
modeller("VAIO", "VAIO", ["SX12", "SX14", "SE14", "FE14", "FE15", "Z"]);
modeller("Sony", "VAIO", ["Pro 11", "Pro 13", "Duo 13", "Fit 15", "S13", "Z Canvas"]);
modeller("Xiaomi", "Xiaomi", ["Mi Notebook Air 12", "Mi Notebook Air 13", "Mi Notebook Pro 15", "RedmiBook 14", "RedmiBook 15", "RedmiBook Pro 14", "RedmiBook Pro 15", "Book Pro 14", "Book Pro 16"]);
modeller("Honor", "Honor MagicBook", ["14", "15", "16", "X 14", "X 15", "X 16", "Pro 16", "View 14", "Art 14"]);
modeller("Chuwi", "Chuwi", ["HeroBook Pro", "GemiBook", "CoreBook X", "LapBook Pro", "MiniBook X"]);
modeller("Google", "Pixelbook", ["(2017)", "Go"], "b", "c");
legg("Chromebook (alle merker)", "Google", "b", "c", 0, "chrome os chromeos chromebox");
legg("Android-nettbrett", "Google", "n", "a", 0, "pixel tablet nettbrett");
legg("Android-telefon", "Google", "t", "a", 0, "pixel mobil");

// Linux-maskiner
modeller("System76", "System76", ["Lemur Pro", "Darter Pro", "Pangolin", "Galago Pro", "Gazelle", "Oryx Pro", "Adder WS", "Serval WS", "Bonobo WS"], "b", "l");
modeller("System76", "System76", ["Meerkat", "Thelio", "Thelio Mira", "Thelio Major"], "s", "l");
modeller("Tuxedo", "Tuxedo", ["InfinityBook Pro 14", "InfinityBook Pro 15", "InfinityBook Pro 16", "InfinityBook S 15", "Pulse 14", "Pulse 15", "Aura 14", "Aura 15", "Stellaris 15", "Stellaris 16", "Polaris 15", "Book XP14", "Book XP15"], "b", "l");
modeller("Tuxedo", "Tuxedo", ["Nano Pro", "Cube", "Core"], "s", "l");
modeller("Slimbook", "Slimbook", ["Executive 14", "Executive 16", "Elemental 14", "Elemental 15", "ProX 14", "ProX 15", "Fedora Slimbook 14", "Fedora Slimbook 16"], "b", "l");
modeller("Star Labs", "StarBook", ["Mk VI", "Mk VII", "StarLite 12", "StarFighter 16"], "b", "l");
modeller("Purism", "Librem", ["13", "14", "15"], "b", "l");
modeller("Raspberry Pi", "Raspberry Pi", ["3", "4", "5", "400", "500"], "s", "la");
legg("PC med Ubuntu", "Linux", "s", "l", 0, "ubuntu 22.04 24.04 debian fedora mint linux");

// Generelle rader, for dem som ikke finner modellen sin.
legg("PC med Windows 11", "Windows", "s", "w", 0, "win11 windows11 hjemmebygd egenbygd stasjonær bærbar");
legg("PC med Windows 10", "Windows", "s", "w", 0, "win10 windows10 hjemmebygd egenbygd stasjonær bærbar");
legg("PC med Windows 8 eller eldre", "Windows", "s", "w-gammel", 0, "win7 win8 windows 7 windows 8 vista xp");
legg("PC med Windows 11 på ARM", "Windows", "b", "wa", 0, "snapdragon x elite copilot+ arm64");
legg("Mac med Apple-prosessor", A, "s", "ma", 2020, "apple silicon m1 m2 m3 m4 m5 m6");

rader.sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0], "nb", { numeric: true }));
const ut =
  "// Laget av bygg-maskiner.mjs. Ikke rediger for hånd: endre kilden og bygg på nytt.\n" +
  "// En rad: [navn, merke, slag, system, år, flere navn]\n" +
  "export default " +
  JSON.stringify(rader).replace(/\],\[/g, "],\n[") +
  ";\n";
writeFileSync(new URL("./.worker/maskiner.js", import.meta.url), ut);
console.log(`${rader.length} maskiner, ${(ut.length / 1024).toFixed(0)} kB`);
