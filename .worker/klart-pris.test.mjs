// Prøver prislogikken i klart-pris.js mot prisene i det private repoet: node .worker/klart-pris.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  orgnrFra,
  lesPriser,
  lisenspris,
  kundepris,
  kurvepris,
  rund,
  telteAnsatte,
  verdifaktor,
  regnskapFra,
  grunnlagFra,
  kundedataPris,
  fornyetBelop,
  sprintFor,
  sprintTilbudFor,
  betalingFor,
  sektorFor,
  aktiv,
  virksomhetFra,
} from "./klart-pris.js";

const P = lesPriser(readFileSync(new URL("../../verktoy/klart-priser.json", import.meta.url), "utf8"));
const v = (ansatte, naering = "62.010", form = "AS") => ({ ansatte, naering, form });
const pris = (n, kode) => lisenspris(P, v(n, kode)).pris;
// Et regnskap der driftsresultat + lønn per ansatt er «perAnsatt».
const regnskap = (ansatte, perAnsatt, inntekt = 1e12) => ({ aar: "2025", inntekt, lonn: perAnsatt * ansatte, drift: 0 });

// MOD11
assert.equal(orgnrFra("923 609 016"), "923609016");
assert.equal(orgnrFra("923609017"), null);
assert.equal(orgnrFra("12345678"), null);
assert.equal(orgnrFra("974760673"), "974760673");

// Kurven: ankerpunktene treffes, og ingen trinn mellom dem
assert.equal(pris(0), 3000);
assert.equal(pris(1), 5000);
assert.equal(pris(2), 6000);
assert.equal(pris(6), 15000);
assert.equal(pris(23), 45000);
assert.equal(pris(113), 120000);
assert.equal(pris(500), 250000);
assert.equal(pris(2000), 450000);
assert.equal(pris(10), 23000);
assert.equal(pris(11), 24500); // i trinnene var 10 → 15 000 og 11 → 45 000
assert.equal(pris(47), 70000);
assert.equal(pris(50), 72500);
assert.equal(pris(51), 73500); // i trinnene var 51 → 120 000
assert.equal(pris(21231, "06.100"), 1225000); // ingen tak over det siste punktet
let forrige = 0;
for (let n = 0; n <= 6000; n++) {
  const k = kurvepris(P, n);
  assert.ok(k >= forrige, `kurven synker ved ${n}`);
  forrige = k;
}
assert.equal(rund(8412), 8400);
assert.equal(rund(24612), 24500);
assert.equal(rund(101934), 102000);

// De som jobber med dokumenter: andelen per bransje, rundet opp
assert.equal(telteAnsatte(P, v(144, "43.223")), 22); // ventilasjon: 144 × 0,15
assert.equal(pris(144, "43.223"), 43500);
assert.equal(telteAnsatte(P, v(100, "43.220")), 15); // ikke 16 (flyttall)
assert.equal(telteAnsatte(P, v(1, "43.220")), 1); // én ansatt er ikke Solo
assert.equal(telteAnsatte(P, v(5358, "78.200")), 268); // utleie av arbeidskraft
assert.equal(telteAnsatte(P, v(40, "78.100")), 40); // rekruttering teller fullt (lengste prefiks)
assert.equal(telteAnsatte(P, v(1143, "84.110", "KOMM")), 458); // kommune: 1143 × 0,4
assert.equal(telteAnsatte(P, v(600, "84.240", "ORGL")), 600); // statlig etat teller fullt

// Hva de tjener: (driftsresultat + lønn) per ansatt mot 1,2 mill., kvadratrot, mellom 0,8 og 2,0
assert.equal(verdifaktor(P, 10, null), 1);
assert.equal(verdifaktor(P, 0, regnskap(0, 5e6)), 1);
assert.equal(verdifaktor(P, 10, regnskap(10, 1.2e6)), 1);
assert.equal(verdifaktor(P, 10, regnskap(10, 4.8e6)), 2);
assert.equal(verdifaktor(P, 10, regnskap(10, 20e6)), 2);
assert.equal(verdifaktor(P, 10, regnskap(10, 0.3e6)), 0.8);
assert.equal(verdifaktor(P, 10, { aar: "2025", inntekt: 1e6, lonn: 1e5, drift: -5e6 }), 0.8);
// Harris Advokatfirma, 47 ansatte, regnskapet for 2023
const harris = { aar: "2023", inntekt: 149942046, lonn: 82240735, drift: 37543559 };
assert.equal(lisenspris(P, v(47, "69.100"), harris).pris, 102000);
// Aldri mer enn 1 % av omsetningen, og aldri under Solo
assert.equal(lisenspris(P, v(50), regnskap(50, 1.2e6, 3e6)).pris, 30000);
assert.equal(lisenspris(P, v(5), regnskap(5, 1.2e6, 1e5)).pris, 3000);

// Regnskapsregisteret: selskapets siste regnskap i NOK, med inntekt og lønn. Ellers null.
const r = (type, til, valuta, inntekt, lonn, drift = 0) => ({
  regnskapstype: type,
  valuta,
  regnskapsperiode: { tilDato: til },
  resultatregnskapResultat: {
    driftsresultat: { driftsresultat: drift, driftsinntekter: { sumDriftsinntekter: inntekt }, driftskostnad: { loennskostnad: lonn } },
  },
});
assert.deepEqual(
  regnskapFra([r("SELSKAP", "2023-12-31", "NOK", 100, 50, 10), r("SELSKAP", "2024-12-31", "NOK", 200, 80, 20), r("KONSERN", "2025-12-31", "NOK", 900, 400)]),
  { aar: "2024", inntekt: 200, lonn: 80, drift: 20 }
);
assert.equal(regnskapFra([r("SELSKAP", "2025-12-31", "USD", 7e10, 5e9)]), null); // Equinor fører i USD
assert.equal(regnskapFra([r("SELSKAP", "2023-12-31", "NOK", 80000, 5000), r("SELSKAP", "2025-12-31", "NOK", 0, 0)]), null); // tomt siste år
assert.equal(regnskapFra([r("SELSKAP", "2025-12-31", "NOK", -341829, 0)]), null);
assert.equal(regnskapFra(null), null);
assert.equal(regnskapFra([]), null);

// Konsern: et morselskap med konsernregnskap prises på hele konsernet
const selskap = (t) => r("SELSKAP", "2025-12-31", "NOK", t.inntekt, t.lonn, t.drift);
const konsern = (t) => r("KONSERN", "2025-12-31", "NOK", t.inntekt, t.lonn, t.drift);
const norwegianKonsern = { inntekt: 37646e6, lonn: 8645e6, drift: 3732e6 };
const norwegian = v(212, "51.100", "ASA");
const ng = grunnlagFra(P, norwegian, [selskap({ inntekt: 872e6, lonn: 328e6, drift: -392e6 }), konsern(norwegianKonsern)]);
assert.equal(ng.konsern, true);
assert.equal(ng.v.ansatte, 9606); // 8 645 mill. i lønn / 900 000
assert.equal(ng.regnskap.inntekt, 37646e6);
// Uten konsernregnskap (eller bare i USD): selskapet selv
const eg = grunnlagFra(P, v(47, "69.100"), [selskap({ inntekt: 15e7, lonn: 8e7, drift: 3e7 }), r("KONSERN", "2025-12-31", "USD", 1e9, 1e8)]);
assert.equal(eg.konsern, false);
assert.equal(eg.v.ansatte, 47);
// Registrerte ansatte vinner om de er flere enn anslaget
assert.equal(grunnlagFra(P, v(5000), [konsern({ inntekt: 1e9, lonn: 9e8, drift: 0 })]).v.ansatte, 5000);

// Kundedata: forbrukerbransjer etter omsetning, under 50 mill. ingenting
assert.equal(kundedataPris(P, v(313, "47.400"), { inntekt: 49e6, lonn: 1, drift: 0 }), 0);
assert.equal(rund(kundedataPris(P, v(313, "47.400"), { inntekt: 5.6e9, lonn: 1, drift: 0 })), 265000);
assert.equal(kundedataPris(P, v(47, "69.100"), { inntekt: 5.6e9, lonn: 1, drift: 0 }), 0); // advokat selger ikke til forbrukere
assert.equal(kundedataPris(P, v(313, "47.400"), null), 0);
// En nettbutikk med få ansatte og stor omsetning prises etter kundene
const nettbutikk = lisenspris(P, v(313, "47.400"), { aar: "2025", inntekt: 5.6e9, lonn: 313 * 1.2e6, drift: 0 });
assert.equal(nettbutikk.kundedata, true);
assert.equal(nettbutikk.pris, 265000);

// Norwegian: konsernet, luftfart 30 %, kundedata, påslag 1,5 på sluttprisen
const nl = lisenspris(P, ng.v, ng.regnskap);
assert.equal(nl.ansatte, 2882); // 9 606 × 0,3
assert.equal(nl.kundedata, true);
assert.equal(nl.sektor.id, "luftfart");
assert.equal(nl.pris, 1040000);
// Fraktflyging (51.2) får andelen, men ikke påslaget eller kundedata
assert.equal(lisenspris(P, v(100, "51.210")).sektor, null);

// Fornyelse: opp med høyst 25 %, ned så mye den skal
assert.equal(fornyetBelop(P, 4500000, 7000000), 5625000);
assert.equal(fornyetBelop(P, 4500000, 5000000), 5000000);
assert.equal(fornyetBelop(P, 4500000, 3000000), 3000000);
assert.equal(fornyetBelop({ ...P, fornyelseMaksOkning: undefined }, 4500000, 7000000), 7000000);

// Sektor: med faktor 1.0 vises den ikke. Med en annen faktor endrer den prisen.
assert.equal(sektorFor(P, "69.100").id, "juridisk");
assert.equal(sektorFor(P, "69.200"), null);
assert.equal(sektorFor(P, "86.211").id, "helse");
assert.equal(sektorFor(P, "64.110").id, "finans");
assert.equal(sektorFor(P, "64.323"), null); // egeninvesteringsselskaper er ikke finans her
assert.equal(sektorFor(P, "64.220"), null); // holdingselskaper heller ikke
assert.equal(sektorFor(P, null), null);
assert.equal(lisenspris(P, v(23, "69.100")).sektor, null);
const hoyere = { ...P, sektorer: P.sektorer.map((s) => (s.id === "juridisk" ? { ...s, faktor: 1.2 } : s)) };
assert.equal(lisenspris(hoyere, v(23, "69.100")).pris, 54000); // 45 000 × 1,2
assert.equal(lisenspris(hoyere, v(23, "69.100")).sektor.navn, "juridisk sektor");

// Tjenesteleverandør per kunde: kundens egen pris, med andel og regnskap, ganger faktoren
assert.equal(kundepris(P, v(23)), 135000);
assert.equal(kundepris(P, v(47, "69.100"), harris), 306000);

// Oppsett og sprint etter talte ansatte: ingenting til 50, oppsettsdag fra 51, kort sprint i tillegg fra 151, full fra 251
const ider = (n) => sprintTilbudFor(P, n).map((t) => t.id);
assert.deepEqual(ider(50), []);
assert.deepEqual(ider(51), ["oppsett"]);
assert.deepEqual(ider(151), ["oppsett", "kort"]);
assert.deepEqual(ider(250), ["oppsett", "kort"]);
assert.deepEqual(ider(251), ["sprint"]);
assert.equal(sprintFor(P, 150), null);
assert.deepEqual(sprintTilbudFor(P, 200)[0], { id: "oppsett", navn: "Oppsettsdag", trinn: "51–250 ansatte", dager: 1, fast: 35000 });
assert.deepEqual(sprintFor(P, 200), { id: "kort", navn: "Kort sprint", trinn: "151–250 ansatte", dager: 5, grunn: 30000, total: 125000, utvidetTotal: 250000 });
assert.deepEqual(sprintFor(P, 251), { id: "sprint", navn: "Sprint", trinn: "251–1\u00a0000 ansatte", dager: 10, grunn: 50000, total: 250000 });
assert.deepEqual(sprintFor(P, 5000), { id: "sprint", navn: "Sprint", trinn: "Over 1\u00a0000 ansatte", dager: 10, grunn: 80000, total: 400000 });
// Den gamle formen i KLART_PRISER virker fortsatt
const gammel = { sprint: { fra: 251, trinn: [{ til: 1000, navn: "x", grunn: 50000, total: 250000 }, { til: null, navn: "y", grunn: 80000, total: 400000 }] } };
assert.equal(sprintFor(gammel, 5000).total, 400000);
assert.equal(sprintFor(gammel, 250), null);

// Betaling: avdrag for de små, faktura for de store, etter registrerte ansatte
const grenser = { fakturaFra: 51, avdragTil: 50 };
assert.deepEqual(betalingFor(P, 0, 3000), { kort: true, faktura: false, avdrag: true, kvartal: 750, ...grenser });
assert.deepEqual(betalingFor(P, 50, 72500), { kort: true, faktura: false, avdrag: true, kvartal: 18125, ...grenser });
assert.deepEqual(betalingFor(P, 51, 73500), { kort: true, faktura: true, avdrag: false, kvartal: 18375, ...grenser });

// Ugyldig kurve stoppes
assert.throws(() => lesPriser(JSON.stringify({ kurve: { solo: 3000, punkter: [[1, 5000], [1, 6000]] } })));
assert.throws(() => lesPriser(JSON.stringify({ kurve: { solo: 3000, punkter: [[1, 5000], [2, 4000]] } })));

// Enhetsregisteret
assert.equal(aktiv({ konkurs: false }), true);
assert.equal(aktiv({ konkurs: true }), false);
assert.equal(aktiv({ underAvvikling: true }), false);
assert.equal(aktiv({ underTvangsavviklingEllerTvangsopplosning: true }), false);
assert.equal(aktiv({ slettedato: "2020-01-01" }), false);
assert.equal(virksomhetFra({ organisasjonsnummer: "1", navn: "X" }).ansatte, 0);

console.log("klart-pris: alt stemmer");
