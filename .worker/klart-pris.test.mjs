// Prøver prislogikken i klart-pris.js mot prisene i det private repoet: node .worker/klart-pris.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  orgnrFra,
  lesPriser,
  lisenspris,
  kundepris,
  sprintFor,
  betalingFor,
  sektorFor,
  aktiv,
  virksomhetFra,
} from "./klart-pris.js";

const P = lesPriser(readFileSync(new URL("../../verktoy/klart-priser.json", import.meta.url), "utf8"));

// MOD11
assert.equal(orgnrFra("923 609 016"), "923609016");
assert.equal(orgnrFra("923609017"), null);
assert.equal(orgnrFra("12345678"), null);
assert.equal(orgnrFra("974760673"), "974760673");

// Trinn ved grensene
const pris = (n, kode = "62.010") => lisenspris(P, n, kode).pris;
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
assert.equal(pris(21231), 450000);

// Sektor: med faktor 1.0 vises den ikke. Med en annen faktor endrer den prisen.
assert.equal(sektorFor(P, "69.100").id, "juridisk");
assert.equal(sektorFor(P, "69.200"), null);
assert.equal(sektorFor(P, "86.211").id, "helse");
assert.equal(sektorFor(P, "84.110").id, "offentlig");
assert.equal(sektorFor(P, null), null);
assert.equal(lisenspris(P, 20, "69.100").sektor, null);
const hoyere = { ...P, sektorer: P.sektorer.map((s) => (s.id === "helse" ? { ...s, faktor: 1.25 } : s)) };
assert.equal(lisenspris(hoyere, 20, "86.211").pris, 56250);
assert.equal(lisenspris(hoyere, 20, "86.211").sektor.navn, "helsesektoren");

// Tjenesteleverandør per kunde
assert.equal(kundepris(P, 20, "62.010"), 135000);

// Sprint bare fra 251
assert.equal(sprintFor(P, 250), null);
assert.deepEqual(sprintFor(P, 251), { trinn: "251–1 000 ansatte", grunn: 50000, total: 250000 });
assert.deepEqual(sprintFor(P, 5000), { trinn: "Over 1 000 ansatte", grunn: 80000, total: 400000 });

// Betaling: avdrag for de små, faktura for de store
const grenser = { fakturaFra: 51, avdragTil: 50 };
assert.deepEqual(betalingFor(P, 0, 3000), { kort: true, faktura: false, avdrag: true, kvartal: 750, ...grenser });
assert.deepEqual(betalingFor(P, 50, 45000), { kort: true, faktura: false, avdrag: true, kvartal: 11250, ...grenser });
assert.deepEqual(betalingFor(P, 51, 120000), { kort: true, faktura: true, avdrag: false, kvartal: 30000, ...grenser });
assert.deepEqual(betalingFor(P, 5000, 450000), { kort: true, faktura: true, avdrag: false, kvartal: 112500, ...grenser });

// Enhetsregisteret
assert.equal(aktiv({ konkurs: false }), true);
assert.equal(aktiv({ konkurs: true }), false);
assert.equal(aktiv({ underAvvikling: true }), false);
assert.equal(aktiv({ underTvangsavviklingEllerTvangsopplosning: true }), false);
assert.equal(aktiv({ slettedato: "2020-01-01" }), false);
assert.equal(virksomhetFra({ organisasjonsnummer: "1", navn: "X" }).ansatte, 0);

console.log("klart-pris: alt stemmer");
