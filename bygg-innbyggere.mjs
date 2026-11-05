// Lager .worker/innbyggere.json (org.nr → innbyggere) og .worker/kommuneansatte.json (org.nr → ansatte i
// hele kommunen) for alle kommuner og fylkeskommuner, som Klart-prisen for kommuner bygger på (se
// kommunepris i .worker/klart-pris.js). Kjør på nytt når SSB har publisert nye tall (februar) og etter
// kommunesammenslåinger: node bygg-innbyggere.mjs (et par minutter, ett oppslag per avdeling og etat)
//
// Kommunene og fylkeskommunene kommer fra Enhetsregisteret, innbyggertallet fra SSB (tabell 07459, siste år).
// En kommune finnes i SSB på kommunenummeret i forretningsadressen sin. En fylkeskommune finnes på navnet,
// fordi adressen kan ligge i et annet fylke (Akershus fylkeskommune ligger i Oslo). De ansatte telles i hele
// treet av avdelinger og etater (.worker/kommunetre.js); bydeler og etater prises som en andel av dem.
//
// Lager også .worker/statsansatte.json (org.nr → ansatte i hele virksomheten) for statlige etater,
// helseforetak og domstolene, som Klart-prisen for staten bygger på (helStatspris).
import { writeFileSync } from "node:fs";
import { ansatteITre, statlig, SAMLET_STAT } from "./.worker/kommunetre.js";

async function enheter(form) {
  const svar = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter?organisasjonsform=${form}&size=1000`, {
    headers: { accept: "application/json" },
  });
  if (!svar.ok) throw new Error(`Enhetsregisteret ${form}: ${svar.status}`);
  return ((await svar.json())._embedded?.enheter || []).filter((e) => !e.slettedato);
}

const komm = await enheter("KOMM");
const fylk = await enheter("FYLK");
const kommunenr = komm.map((e) => e.forretningsadresse?.kommunenummer);
if (kommunenr.some((n) => !n)) throw new Error("En kommune mangler kommunenummer i adressen");

// Alle tosifrede regioner er fylker; SSB svarer bare med dem som finnes det året.
const meta = await (await fetch("https://data.ssb.no/api/v0/no/table/07459")).json();
const fylkenr = meta.variables.find((v) => v.code === "Region").values.filter((r) => /^\d\d$/.test(r));
const svar = await fetch("https://data.ssb.no/api/v0/no/table/07459", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: [
      { code: "Region", selection: { filter: "item", values: [...kommunenr, ...fylkenr] } },
      { code: "Tid", selection: { filter: "top", values: ["1"] } },
      { code: "ContentsCode", selection: { filter: "item", values: ["Personer1"] } },
    ],
    response: { format: "json-stat2" },
  }),
});
if (!svar.ok) throw new Error(`SSB: ${svar.status} ${await svar.text()}`);
const d = await svar.json();
const region = d.dimension.Region.category;
const ssb = {};
for (const [kode, i] of Object.entries(region.index)) {
  if (d.value[i] > 0) ssb[kode] = { navn: region.label[kode], innbyggere: d.value[i] };
}

const ut = {};
for (const e of komm) {
  const r = ssb[e.forretningsadresse.kommunenummer];
  if (!r) throw new Error(`Fant ikke ${e.navn} (${e.forretningsadresse.kommunenummer}) hos SSB`);
  ut[e.organisasjonsnummer] = r.innbyggere;
}
// «Trøndelag - Trööndelage» → «TRØNDELAG», som Enhetsregisteret skriver «TRØNDELAG FYLKESKOMMUNE».
const fylker = Object.entries(ssb).filter(([kode]) => kode.length === 2 && kode !== "03");
for (const e of fylk) {
  const treff = fylker.filter(([, r]) => e.navn.startsWith(`${r.navn.split(" - ")[0].toUpperCase()} `));
  if (treff.length !== 1) throw new Error(`Fant ${treff.length} fylker hos SSB for ${e.navn}`);
  ut[e.organisasjonsnummer] = treff[0][1].innbyggere;
}

writeFileSync(new URL(".worker/innbyggere.json", import.meta.url), JSON.stringify(ut) + "\n");
const aar = Object.keys(d.dimension.Tid.category.index)[0];
console.log(`${komm.length} kommuner og ${fylk.length} fylkeskommuner, innbyggere 1. januar ${aar} (SSB 07459).`);

async function barn(orgnr) {
  const liste = [];
  for (let side = 0; ; side++) {
    const svar = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter?overordnetEnhet=${orgnr}&size=100&page=${side}`, {
      headers: { accept: "application/json" },
    });
    if (!svar.ok) throw new Error(`Enhetsregisteret under ${orgnr}: ${svar.status}`);
    const d = await svar.json();
    liste.push(...(d._embedded?.enheter || []));
    if (side + 1 >= (d.page?.totalPages || 0)) return liste;
  }
}
// Fire om gangen, så Enhetsregisteret ikke får alt på én gang.
const ansatte = {};
const ko = [...komm, ...fylk];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let e = ko.shift(); e; e = ko.shift()) ansatte[e.organisasjonsnummer] = await ansatteITre(e, barn, 1000);
  })
);
writeFileSync(new URL(".worker/kommuneansatte.json", import.meta.url), JSON.stringify(ansatte) + "\n");
console.log(`Ansatte i hele kommunen: Oslo ${ansatte["958935420"]}, Bergen ${ansatte["964338531"]}.`);

// Staten: alle i statsforvaltningen (sektor 6100) som kjøper selv. Det er de rett under et departement, de
// uten noen over seg (helseforetak) og STAT-enhetene der leddene kjøper samlet (domstolene). Departementene
// selv teller bare sine egne ansatte og trengs ikke her.
const stat = [];
for (let side = 0; ; side++) {
  const svar = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter?institusjonellSektorkode=6100&size=100&page=${side}`, {
    headers: { accept: "application/json" },
  });
  if (!svar.ok) throw new Error(`Enhetsregisteret, staten: ${svar.status}`);
  const d = await svar.json();
  stat.push(...(d._embedded?.enheter || []).filter((e) => !e.slettedato));
  if (side + 1 >= (d.page?.totalPages || 0)) break;
}
const departement = new Set(stat.filter((e) => e.organisasjonsform?.kode === "STAT").map((e) => e.organisasjonsnummer));
const kjopere = stat.filter(
  (e) =>
    statlig(e) &&
    (SAMLET_STAT.has(e.organisasjonsnummer) ||
      (e.organisasjonsform.kode !== "STAT" && (!e.overordnetEnhet || (departement.has(e.overordnetEnhet) && !SAMLET_STAT.has(e.overordnetEnhet)))))
);
const statsansatte = {};
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let e = kjopere.shift(); e; e = kjopere.shift()) {
      const n = await ansatteITre(e, barn, 1000);
      if (n > 0) statsansatte[e.organisasjonsnummer] = n;
    }
  })
);
writeFileSync(new URL(".worker/statsansatte.json", import.meta.url), JSON.stringify(statsansatte) + "\n");
console.log(`${Object.keys(statsansatte).length} statlige kjøpere. Domstolene ${statsansatte["984195796"]}, Datatilsynet ${statsansatte["974761467"]}.`);
