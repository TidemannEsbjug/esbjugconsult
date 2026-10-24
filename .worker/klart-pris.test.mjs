// Prøver prislogikken i klart-pris.js mot prisene i det private repoet: node .worker/klart-pris.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  orgnrFra,
  lesPriser,
  lisenspris,
  kundepris,
  telteAnsatte,
  sprintFor,
  betalingFor,
  sektorFor,
  aktiv,
  virksomhetFra,
} from "./klart-pris.js";

const P = lesPriser(readFileSync(new URL("../../verktoy/klart-priser.json", import.meta.url), "utf8"));
const v = (ansatte, naering = "62.010", form = "AS") => ({ ansatte, naering, form });

// MOD11
assert.equal(orgnrFra("923 609 016"), "923609016");
assert.equal(orgnrFra("923609017"), null);
assert.equal(orgnrFra("12345678"), null);
assert.equal(orgnrFra("974760673"), "974760673");

// Trinn ved grensene, i en bransje der alle teller
const pris = (n, kode) => lisenspris(P, v(n, kode)).pris;
assert.equal(pris(0), 3000);
assert.equal(pris(1), 6000);
assert.equal(pris(3), 6000);
assert.equal(pris(4), 15000);
assert.equal(pris(10), 15000);
assert.equal(pris(11), 45000);
assert.equal(pris(50), 45000);
assert.equal(pris(51), 120000);
assert.equal(pris(250), 120000);
assert.equal(pris(251), 250000);
assert.equal(pris(1000), 250000);
assert.equal(pris(1001), 450000);
assert.equal(pris(21231, "06.100"), 450000);

// De som jobber med dokumenter: andelen per bransje, rundet opp
assert.equal(telteAnsatte(P, v(144, "43.223")), 22); // ventilasjon: 144 × 0,15
assert.equal(pris(144, "43.223"), 45000);
assert.equal(telteAnsatte(P, v(100, "43.220")), 15); // ikke 16 (flyttall)
assert.equal(telteAnsatte(P, v(1, "43.220")), 1); // én ansatt er ikke Solo
assert.equal(telteAnsatte(P, v(0, "43.220")), 0);
assert.equal(pris(5358, "78.200"), 250000); // utleie av arbeidskraft: vikarene er de ansatte
assert.equal(telteAnsatte(P, v(40, "78.100")), 40); // rekruttering teller fullt (lengste prefiks)
assert.equal(pris(290, "69.100"), 250000); // advokatfirma teller fullt
assert.equal(telteAnsatte(P, v(30, "95.310")), 5); // bilverksted
assert.equal(lisenspris(P, v(1143, "84.110", "KOMM")).pris, 250000); // kommune: 1143 × 0,4
assert.equal(lisenspris(P, v(600, "84.240", "ORGL")).pris, 250000); // statlig etat teller fullt
assert.equal(lisenspris(P, v(3273, "84.110", "KOMM")).pris, 450000);

// Sektor: med faktor 1.0 vises den ikke. Med en annen faktor endrer den prisen.
assert.equal(sektorFor(P, "69.100").id, "juridisk");
assert.equal(sektorFor(P, "69.200"), null);
assert.equal(sektorFor(P, "86.211").id, "helse");
assert.equal(sektorFor(P, "64.110").id, "finans");
assert.equal(sektorFor(P, "64.323"), null); // egeninvesteringsselskaper er ikke finans her
assert.equal(sektorFor(P, "64.220"), null); // holdingselskaper heller ikke
assert.equal(sektorFor(P, null), null);
assert.equal(lisenspris(P, v(20, "69.100")).sektor, null);
const hoyere = { ...P, sektorer: P.sektorer.map((s) => (s.id === "juridisk" ? { ...s, faktor: 1.25 } : s)) };
assert.equal(lisenspris(hoyere, v(20, "69.100")).pris, 56250);
assert.equal(lisenspris(hoyere, v(20, "69.100")).sektor.navn, "juridisk sektor");

// Tjenesteleverandør per kunde: kundens egen pris, med andelen, ganger faktoren
assert.equal(kundepris(P, v(20)), 135000);
assert.equal(kundepris(P, v(144, "43.223")), 135000);

// Sprint bare fra 251 talte ansatte
assert.equal(sprintFor(P, 250), null);
assert.deepEqual(sprintFor(P, 251), { trinn: "251–1 000 ansatte", grunn: 50000, total: 250000 });
assert.deepEqual(sprintFor(P, 5000), { trinn: "Over 1 000 ansatte", grunn: 80000, total: 400000 });

// Betaling: avdrag for de små, faktura for de store, etter registrerte ansatte
const grenser = { fakturaFra: 51, avdragTil: 50 };
assert.deepEqual(betalingFor(P, 0, 3000), { kort: true, faktura: false, avdrag: true, kvartal: 750, ...grenser });
assert.deepEqual(betalingFor(P, 50, 45000), { kort: true, faktura: false, avdrag: true, kvartal: 11250, ...grenser });
assert.deepEqual(betalingFor(P, 51, 120000), { kort: true, faktura: true, avdrag: false, kvartal: 30000, ...grenser });
assert.deepEqual(betalingFor(P, 144, 45000), { kort: true, faktura: true, avdrag: false, kvartal: 11250, ...grenser });

// Enhetsregisteret
assert.equal(aktiv({ konkurs: false }), true);
assert.equal(aktiv({ konkurs: true }), false);
assert.equal(aktiv({ underAvvikling: true }), false);
assert.equal(aktiv({ underTvangsavviklingEllerTvangsopplosning: true }), false);
assert.equal(aktiv({ slettedato: "2020-01-01" }), false);
assert.equal(virksomhetFra({ organisasjonsnummer: "1", navn: "X" }).ansatte, 0);

console.log("klart-pris: alt stemmer");
