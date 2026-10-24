// Klart: prisen for en virksomhet, fra Enhetsregisteret. Ren logikk uten Stripe og uten lager, så den
// kan prøves for seg: node .worker/klart-pris.test.mjs
//
// Tallene står ikke her. Repoet er offentlig, og kurven og påslaget for tjenesteleverandører skal
// aldri vises som en tabell. De kommer fra hemmeligheten KLART_PRISER (JSON). Kilden er
// verktoy/klart-priser.json i det private repoet, og verktoy/klart-priser.sh sender den til Cloudflare.
//
// Prisen settes i tre ledd, og siden viser bare resultatet:
//
// 1. Hvem som telles. Ikke alle ansatte, men de som jobber med dokumenter. Et rørleggerfirma med 144
//    ansatte har kanskje 20 på kontoret; i et advokatfirma jobber alle med personopplysninger. «andeler»
//    gir andelen per bransje (næringskode, lengste prefiks vinner) eller per organisasjonsform (kommuner
//    teller lærere og pleiere). Bransjer som ikke står der, teller fullt.
// 2. Kurven. Prisen stiger med hver ansatt som telles, uten trinn: 50 og 51 ansatte koster nesten det
//    samme. Ankerpunktene står i «kurve».
// 3. Hva de tjener. Driftsresultat + lønn per ansatt fra Regnskapsregisteret, mot en referanse. Et
//    advokatfirma som tjener 2,6 mill. per ansatt betaler mer enn et som tjener 1 mill. «verdiskaping».

/** Norsk org.nr: ni sifre, MOD11 med vektene 3 2 7 6 5 4 3 2. Rest 11 gir 0, rest 10 er ugyldig. */
export function orgnrFra(verdi) {
  const o = String(verdi || "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(o)) return null;
  const vekter = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = vekter.reduce((s, v, i) => s + v * Number(o[i]), 0);
  const k = 11 - (sum % 11);
  if (k === 10) return null;
  return (k === 11 ? 0 : k) === Number(o[8]) ? o : null;
}

let lest = null;

/** Prisene fra KLART_PRISER, eller null når hemmeligheten ikke er satt. */
export function lesPriser(tekst) {
  if (!tekst) return null;
  if (lest && lest.tekst === tekst) return lest.priser;
  const p = typeof tekst === "string" ? JSON.parse(tekst) : tekst;
  const punkter = p.kurve?.punkter;
  const stigende =
    Array.isArray(punkter) &&
    punkter.length >= 2 &&
    punkter.every(([x, y], i) => x > 0 && y > 0 && (i === 0 || (x > punkter[i - 1][0] && y > punkter[i - 1][1])));
  if (!Number.isFinite(p.kurve?.solo) || !stigende) {
    throw new Error("KLART_PRISER: kurve.solo og minst to stigende kurve.punkter [ansatte, pris] trengs");
  }
  lest = { tekst, priser: p };
  return p;
}

/** Prisen for n talte ansatte, før justering. Mellom ankerpunktene går den som en rett linje i log-log
    (samme prosent dyrere for hver prosent flere ansatte), og etter det siste fortsetter den med den siste
    stigningen, uten tak. Uten talte ansatte er prisen kurve.solo. */
export function kurvepris(priser, n) {
  const { solo, punkter } = priser.kurve;
  if (n <= 0) return solo;
  if (n <= punkter[0][0]) return punkter[0][1];
  let i = punkter.findIndex(([x]) => x >= n);
  if (i === -1) i = punkter.length - 1;
  const [x0, y0] = punkter[i - 1];
  const [x1, y1] = punkter[i];
  return y0 * Math.exp((Math.log(n / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}

/** Pene priser: hele hundre under 10 000, hele fem hundre under 100 000, ellers hele tusen. */
export function rund(pris) {
  const steg = pris < 10000 ? 100 : pris < 100000 ? 500 : 1000;
  return Math.round(pris / steg) * steg;
}

/** Siste årsregnskap fra Regnskapsregisteret, hvis det kan brukes: selskapets eget (ikke konsernets), i
    NOK, med inntekter og lønn. Equinor fører i USD, og noen leverer tomme regnskap; da er svaret null,
    og prisen justeres ikke. */
export function regnskapFra(liste) {
  if (!Array.isArray(liste)) return null;
  const s = liste
    .filter((r) => r.regnskapstype === "SELSKAP" && r.valuta === "NOK")
    .sort((a, b) => String(b.regnskapsperiode?.tilDato).localeCompare(String(a.regnskapsperiode?.tilDato)))[0];
  const d = s?.resultatregnskapResultat?.driftsresultat;
  const inntekt = d?.driftsinntekter?.sumDriftsinntekter ?? 0;
  const lonn = d?.driftskostnad?.loennskostnad ?? 0;
  if (inntekt <= 0 || lonn <= 0) return null;
  return { aar: String(s.regnskapsperiode.tilDato).slice(0, 4), inntekt, lonn, drift: d.driftsresultat ?? 0 };
}

/** Hva virksomheten tjener per registrerte ansatt, mot referansen: (driftsresultat + lønn) / ansatte.
    Det er verdiskapingen, uten varer og materialer som bare går gjennom. Faktoren er forholdet opphøyd i
    eksponenten, mellom min og maks. Uten brukbart regnskap eller uten ansatte er den 1. */
export function verdifaktor(priser, ansatte, regnskap) {
  const vs = priser.verdiskaping;
  if (!vs || !regnskap || !(ansatte > 0)) return 1;
  const perAnsatt = Math.max(0, regnskap.drift + regnskap.lonn) / ansatte;
  return Math.min(vs.maks, Math.max(vs.min, Math.pow(perAnsatt / vs.referanse, vs.eksponent)));
}

/** Ny pris ved fornyelse, i øre: ned så mye den skal, opp med høyst fornyelseMaksOkning (0,25 = 25 %). */
export function fornyetBelop(priser, gammel, ny) {
  const maks = priser.fornyelseMaksOkning;
  return maks == null ? ny : Math.min(ny, Math.round(gammel * (1 + maks)));
}

/** Bransjen fra næringskoden (SN2025, f.eks. «69.100»). Prefiksene står i KLART_PRISER: «69.1», «64» … */
export function sektorFor(priser, naeringskode) {
  const kode = String(naeringskode || "");
  if (!kode) return null;
  return (priser.sektorer || []).find((s) => s.nace.some((n) => kode.startsWith(n))) || null;
}

/** Andelen av de ansatte som jobber med dokumenter. Organisasjonsform går foran næringskode. */
export function andelFor(priser, v) {
  const regler = priser.andeler || [];
  const form = regler.find((r) => r.former && r.former.includes(v.form));
  if (form) return form.andel;
  const kode = String(v.naering || "");
  let funnet = null;
  let lengde = -1;
  for (const r of regler) {
    for (const n of r.nace || []) {
      if (kode.startsWith(n) && n.length > lengde) {
        funnet = r;
        lengde = n.length;
      }
    }
  }
  return funnet ? funnet.andel : 1;
}

/** De ansatte som telles: andelen av de registrerte, rundet opp, så bare en virksomhet uten ansatte blir Solo. */
export function telteAnsatte(priser, v) {
  // Avrundet først, så 100 × 0,15 blir 15 og ikke 16 (flyttall).
  return Math.ceil(Math.round(v.ansatte * andelFor(priser, v) * 1e6) / 1e6);
}

/** Årsprisen for virksomhetens egen lisens, i hele kroner eks. mva. Sektoren er med bare når den endrer
    prisen. «regnskap» er fra regnskapFra, eller null. */
export function lisenspris(priser, v, regnskap = null) {
  const ansatte = telteAnsatte(priser, v);
  const s = sektorFor(priser, v.naering);
  const sektor = s && typeof s.faktor === "number" ? s.faktor : 1;
  const faktor = verdifaktor(priser, v.ansatte, regnskap);
  let pris = rund(kurvepris(priser, ansatte) * sektor * faktor);
  // Aldri mer enn en liten del av omsetningen (1 %), og aldri under Solo.
  const andel = priser.verdiskaping?.maksAndelAvInntekt;
  if (regnskap && andel) pris = Math.min(pris, rund(regnskap.inntekt * andel));
  return { ansatte, faktor, sektor: sektor !== 1 ? s : null, pris: Math.max(priser.kurve.solo, pris) };
}

/** Prisen en tjenesteleverandør betaler per år for én kunde, ut fra kundens egen størrelse og regnskap. */
export function kundepris(priser, v, regnskap = null) {
  return lisenspris(priser, v, regnskap).pris * (priser.leverandorFaktor || 1);
}

/** Sprinten hos virksomheter fra «fra» ansatte og opp, med trinnet som gjelder. Ellers null.
    Får de talte ansatte: sprinten handler om hvor mye dokumentarbeid det er. */
export function sprintFor(priser, ansatte) {
  const s = priser.sprint;
  if (!s || ansatte < s.fra) return null;
  const t = s.trinn.find((x) => x.til === null || ansatte <= x.til);
  return t ? { trinn: t.navn, grunn: t.grunn, total: t.total } : null;
}

/** Hva virksomheten kan betale med. Faktura er for de store, avdrag for de små som vil spre
    kostnaden. Får de registrerte ansatte, ikke de talte: et rørleggerfirma med 144 ansatte har
    regnskapsavdeling og råd, selv om prisen er satt etter kontorfolket. Kvartalsbeløpet regnes i
    øre, så fire avdrag går opp i årsprisen. */
export function betalingFor(priser, ansatte, pris) {
  return {
    kort: true,
    faktura: priser.fakturaFra != null && ansatte >= priser.fakturaFra,
    avdrag: priser.avdragTil != null && ansatte <= priser.avdragTil,
    kvartal: Math.round((pris * 100) / 4) / 100,
    fakturaFra: priser.fakturaFra ?? null,
    avdragTil: priser.avdragTil ?? null,
  };
}

/** En enhet fra Enhetsregisteret kan kjøpe når den ikke er slettet, konkurs eller under avvikling. */
export function aktiv(enhet) {
  return Boolean(
    enhet &&
      !enhet.slettedato &&
      !enhet.konkurs &&
      !enhet.underAvvikling &&
      !enhet.underTvangsavviklingEllerTvangsopplosning
  );
}

/** Feltene vi bruker fra en enhet. Mangler antall ansatte, regnes det som 0. */
export function virksomhetFra(enhet) {
  const adr = enhet.forretningsadresse || enhet.postadresse || null;
  return {
    orgnr: enhet.organisasjonsnummer,
    navn: enhet.navn,
    form: enhet.organisasjonsform?.kode || null,
    ansatte: Number.isFinite(enhet.antallAnsatte) ? enhet.antallAnsatte : 0,
    naering: enhet.naeringskode1?.kode || null,
    mva: Boolean(enhet.registrertIMvaregisteret),
    adresse: adr
      ? {
          linjer: adr.adresse || [],
          postnummer: adr.postnummer || "",
          poststed: adr.poststed || "",
          land: adr.landkode || "NO",
        }
      : null,
  };
}
