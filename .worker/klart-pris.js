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
//
// Og tre ting til:
//
// - Konsern. Et morselskap med konsernregnskap prises på hele konsernet (ansatte anslått fra lønnen i
//   konsernet), og lisensen gjelder hele konsernet. Ellers koster Norwegian Air Shuttle ASA det samme som
//   212 kontoransatte, og AF Gruppen ASA (0 ansatte) som Solo. «konsern».
// - Kundedata. Bransjer som selger til forbrukere, har kundedata i forhold til omsetningen, ikke de
//   ansatte. Der er prisen den høyeste av det de ansatte gir og det omsetningen gir. «kundedata».
// - Påslag for bransjer med mye eller følsom data (luftfart: pass og helseopplysninger), på sluttprisen.
//   «sektorer».
//
// Kommuner og fylkeskommuner er unntaket: de kjøper en lisens for fire år (kommune.aar), betalt på forskudd
// eller per år, og prisen følger innbyggertallet fra SSB (innbyggere.json), ikke de ansatte. Hele perioden
// koster aldri mer enn kommune.tak, så de kan kjøpe uten anbud. Bydeler, etater og andre deler av kommunen
// kan kjøpe selv, for sin andel av kommunens ansatte (kommuneansatte.json). Det delene har betalt, trekkes
// fra når andre deler eller kommunen kjøper, så hele kommunen aldri betaler mer enn kommunens pris. «kommune».
//
// Statlige virksomheter (etater, helseforetak, departementer) kjøper på samme måte, for fire år under samme
// grense, men prisen følger de ansatte: en grunnpris og et beløp per ansatt per år, med et påslag der
// personopplysninger er kjernen i arbeidet. Kontorer og ledd under en etat kjøper for sin andel. «stat».

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
  if (!Number.isFinite(p.kurve?.solo) || !stigende(p.kurve?.punkter)) {
    throw new Error("KLART_PRISER: kurve.solo og minst to stigende kurve.punkter [ansatte, pris] trengs");
  }
  if (p.kundedata && (!stigende(p.kundedata.punkter) || !Array.isArray(p.kundedata.nace))) {
    throw new Error("KLART_PRISER: kundedata trenger nace og minst to stigende punkter [omsetning, pris]");
  }
  if (p.kommune && (!stigende(p.kommune.punkter) || !Number.isFinite(p.kommune.tak) || !p.kommune.former)) {
    throw new Error("KLART_PRISER: kommune trenger former, tak og minst to stigende punkter [innbyggere, pris]");
  }
  lest = { tekst, priser: p };
  return p;
}

function stigende(punkter) {
  return (
    Array.isArray(punkter) &&
    punkter.length >= 2 &&
    punkter.every(([x, y], i) => x > 0 && y > 0 && (i === 0 || (x > punkter[i - 1][0] && y > punkter[i - 1][1])))
  );
}

/** Mellom punktene en rett linje i log-log (samme prosent mer for hver prosent mer), og etter det siste
    videre med den siste stigningen, uten tak. Før det første: første verdi, eller uten gulv videre ned med
    den første stigningen. */
function loglog(punkter, x, gulv = true) {
  if (gulv && x <= punkter[0][0]) return punkter[0][1];
  let i = punkter.findIndex(([px]) => px >= x);
  if (i === -1) i = punkter.length - 1;
  if (i === 0) i = 1;
  const [x0, y0] = punkter[i - 1];
  const [x1, y1] = punkter[i];
  return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
}

/** Prisen for n talte ansatte, før justering. Uten talte ansatte er prisen kurve.solo. */
export function kurvepris(priser, n) {
  return n <= 0 ? priser.kurve.solo : loglog(priser.kurve.punkter, n);
}

/** Det omsetningen gir for en bransje som selger til forbrukere (kundedata.nace), ellers 0. Under det
    første punktet (50 mill.) gir den ingenting, så en vanlig butikk merker det ikke. */
export function kundedataPris(priser, v, regnskap) {
  const k = priser.kundedata;
  if (!k || !regnskap || !(regnskap.inntekt >= k.punkter[0][0])) return 0;
  if (!k.nace.some((n) => String(v.naering || "").startsWith(n))) return 0;
  return loglog(k.punkter, regnskap.inntekt);
}

/** Pene priser: hele hundre under 10 000, hele fem hundre under 100 000, ellers hele tusen. */
export function rund(pris) {
  const steg = pris < 10000 ? 100 : pris < 100000 ? 500 : 1000;
  return Math.round(pris / steg) * steg;
}

/** Siste årsregnskap av typen (SELSKAP eller KONSERN) fra Regnskapsregisteret, hvis det kan brukes: i NOK,
    med inntekter og lønn. Equinor fører i USD, og noen leverer tomme regnskap; da er svaret null, og
    prisen justeres ikke. */
export function regnskapFra(liste, type = "SELSKAP") {
  if (!Array.isArray(liste)) return null;
  const s = liste
    .filter((r) => r.regnskapstype === type && r.valuta === "NOK")
    .sort((a, b) => String(b.regnskapsperiode?.tilDato).localeCompare(String(a.regnskapsperiode?.tilDato)))[0];
  const d = s?.resultatregnskapResultat?.driftsresultat;
  const inntekt = d?.driftsinntekter?.sumDriftsinntekter ?? 0;
  const lonn = d?.driftskostnad?.loennskostnad ?? 0;
  if (inntekt <= 0 || lonn <= 0) return null;
  return { aar: String(s.regnskapsperiode.tilDato).slice(0, 4), inntekt, lonn, drift: d.driftsresultat ?? 0 };
}

/** Det prisen regnes på, fra hele listen i Regnskapsregisteret. Et morselskap med brukbart konsernregnskap
    prises på konsernet: ansatte anslått som lønnen i konsernet delt på konsern.lonnPerAnsatt (eller de
    registrerte, om det er flere), og konsernets tall. Ellers virksomheten selv og dens eget regnskap. */
export function grunnlagFra(priser, v, liste) {
  const konsern = regnskapFra(liste, "KONSERN");
  const perAnsatt = priser.konsern?.lonnPerAnsatt;
  if (konsern && perAnsatt) {
    return { v: { ...v, ansatte: Math.max(v.ansatte, Math.round(konsern.lonn / perAnsatt)) }, regnskap: konsern, konsern: true };
  }
  return { v, regnskap: regnskapFra(liste, "SELSKAP"), konsern: false };
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

/** Hva hele kommunen koster for fire år: innbyggertallet ganger andelen for organisasjonsformen
    (kommune.former, 1 for begge nå) gir prisen på kurven, uten gulv nederst og aldri over kommune.tak.
    k.innbyggere er fra SSB; mangler det (en ny kommune), anslås det fra de ansatte med
    kommune.innbyggerePerAnsatt. null når k ikke er en kommune eller fylkeskommune. */
export function helKommunepris(priser, k) {
  if (k.stat) return helStatspris(priser, k);
  const kp = priser.kommune;
  const andel = kp?.former?.[k.form];
  if (andel == null) return null;
  const innbyggere = k.innbyggere > 0 ? k.innbyggere : Math.round(k.ansatte * (kp.innbyggerePerAnsatt?.[k.form] ?? 0));
  return { innbyggere, pris: Math.min(kp.tak, rund(loglog(kp.punkter, innbyggere * andel, false))) };
}

/** Hva en hel statlig virksomhet (etat, helseforetak, departement; k.stat) koster for fire år: en grunnpris
    og et beløp per ansatt per år, aldri over stat.takAar per år. Der personopplysninger om folk er kjernen i
    arbeidet (tilsyn, ombud, klagenemnder: stat.verdi), er verktøyet verdt mer, og årsprisen ganges med
    stat.verdi.faktor. Fire år under taket holder seg under 500 000-grensen i anskaffelsesloven. */
export function helStatspris(priser, k) {
  const s = priser.stat;
  if (!s) return null;
  const faktor = s.verdi?.orgnr?.includes(k.orgnr) ? s.verdi.faktor : 1;
  const perAar = Math.min(s.takAar, rund((s.grunn + s.perAnsatt * k.ansatte) * faktor));
  return { innbyggere: 0, pris: perAar * (s.aar || 4), faktor };
}

/** Fireårsprisen for en kommune, fylkeskommune eller statlig virksomhet, eller en del av en (v.kommune er
    da kommunen eller virksomheten den hører til; for staten står v.stat eller v.kommune.stat), eller null
    for alle andre. «betalt» er det kommunen og delene av den alt har betalt for lisenser som
    gjelder nå; det trekkes fra, så hele kommunen aldri betaler mer enn kommunens pris. En del betaler sin
    andel av kommunens ansatte (v.ansatte av v.kommune.ansatte), minst kommune.delMin, og aldri mer enn
    det som er igjen av kommunens pris. */
export function kommunepris(priser, v, betalt = 0) {
  const del = Boolean(v.kommune);
  const kommune = del ? v.kommune : v;
  const hel = helKommunepris(priser, kommune);
  if (!hel) return null;
  const igjen = Math.max(0, hel.pris - betalt);
  const andel = del ? Math.min(1, kommune.ansatte > 0 ? v.ansatte / kommune.ansatte : 1) : 1;
  const regler = kommune.stat ? priser.stat : priser.kommune;
  const egen = del ? Math.max(regler.delMin || 0, rund(hel.pris * andel)) : hel.pris;
  return { innbyggere: hel.innbyggere, hel: hel.pris, andel, betalt, pris: Math.min(egen, igjen), aar: regler.aar || 4, stat: Boolean(kommune.stat), verdi: hel.faktor || 1 };
}

/** Prisen for lisensen, i hele kroner eks. mva. For kommuner og delene av dem prisen for hele perioden
    (kommunepris, fireAar: true), for alle andre årsprisen. «v» og «regnskap» er fra grunnlagFra (eller
    regnskapFra), og regnskap kan være null. «betalt»: se kommunepris. */
export function lisenspris(priser, v, regnskap = null, betalt = 0) {
  const k = kommunepris(priser, v, betalt);
  if (k) {
    return { ansatte: telteAnsatte(priser, v), faktor: 1, kundedata: false, sektor: null, ...k, fireAar: true, del: Boolean(v.kommune) };
  }
  return aarspris(priser, v, regnskap);
}

/** Årsprisen: det høyeste av det de ansatte gir (kurven, justert for hva de tjener) og det kundedataene
    gir, ganger påslaget for bransjen. */
export function aarspris(priser, v, regnskap = null) {
  const ansatte = telteAnsatte(priser, v);
  const faktor = verdifaktor(priser, v.ansatte, regnskap);
  const fraAnsatte = kurvepris(priser, ansatte) * faktor;
  const fraKunder = kundedataPris(priser, v, regnskap);
  const s = sektorFor(priser, v.naering);
  const sektor = s && typeof s.faktor === "number" ? s.faktor : 1;
  let pris = rund(Math.max(fraAnsatte, fraKunder) * sektor);
  // Aldri mer enn en liten del av omsetningen (1 %), og aldri under Solo.
  const andel = priser.verdiskaping?.maksAndelAvInntekt;
  if (regnskap && andel) pris = Math.min(pris, rund(regnskap.inntekt * andel));
  return { ansatte, faktor, kundedata: fraKunder > fraAnsatte, sektor: sektor !== 1 ? s : null, pris: Math.max(priser.kurve.solo, pris) };
}

/** Prisen en tjenesteleverandør betaler per år for én kunde, ut fra kundens egen størrelse og regnskap.
    Alltid årsprisen, også når kunden er en kommune. */
export function kundepris(priser, v, regnskap = null) {
  return aarspris(priser, v, regnskap).pris * (priser.leverandorFaktor || 1);
}

/** Om virksomheten trolig behandler data for andre (IT, regnskap, rådgivning, HR-tjenester …). Da spør
    kassen om det som et eget steg; for andre (et flyselskap) er det bare en lenke. «leverandorBransjer». */
export function leverandorAktuell(priser, v) {
  const kode = String(v.naering || "");
  return (priser.leverandorBransjer || []).some((n) => kode.startsWith(n));
}

/** Oppsettsdag og sprinter: tilbudene som gjelder for så mange ansatte, i rekkefølge (tom liste for de små).
    Får de talte ansatte: oppsett og sprint handler om hvor mye dokumentarbeid det er.
    KLART_PRISER.sprint.tilbud: [{ id: "oppsett"|"kort"|"sprint", navn, fra, til, dager, fast | grunn+total }].
    Den gamle formen ({ fra, trinn: [{ til, navn, grunn, total }] }) leses som sprinter på 10 dager. */
export function sprintTilbudFor(priser, ansatte) {
  const s = priser.sprint;
  if (!s) return [];
  let liste = s.tilbud;
  if (!liste) {
    let fra = s.fra;
    liste = (s.trinn || []).map((t) => {
      const x = { id: "sprint", navn: "Sprint", fra, til: t.til, dager: 10, grunn: t.grunn, total: t.total };
      fra = t.til === null ? null : t.til + 1;
      return x;
    });
  }
  // En kort sprint kan utvides til en full; prisen den da går opp til, er den laveste fulle sprinten.
  const full = liste.filter((t) => t.id === "sprint").map((t) => t.total).sort((x, y) => x - y)[0] ?? null;
  return liste
    .filter((t) => ansatte >= t.fra && (t.til === null || ansatte <= t.til))
    .map((t) => ({
      id: t.id,
      navn: t.navn,
      trinn: t.til === null ? `Over ${tusen(t.fra - 1)} ansatte` : `${tusen(t.fra)}–${tusen(t.til)} ansatte`,
      dager: t.dager,
      ...(t.fast != null ? { fast: t.fast } : { grunn: t.grunn, total: t.total }),
      ...(t.id === "kort" && full ? { utvidetTotal: full } : {}),
    }));
}

/** Sprinten (kort eller full) for så mange ansatte, eller null. Forsiden viser skreddersydd oppsett da. */
export function sprintFor(priser, ansatte) {
  return sprintTilbudFor(priser, ansatte).find((t) => t.id !== "oppsett") || null;
}

function tusen(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

/** Hva virksomheten kan betale med. Alle kan velge kort eller faktura, uansett størrelse. */
export function betalingFor() {
  return { kort: true, faktura: true };
}

/** Hvor langt fra eieren adressen er, og om det trengs en reisedag før oppstart. Luftlinje fra Drøbak;
    fra 150 km (Lillehammer, Kristiansand, Bergen, Trondheim …) reiser eieren dagen før. */
const HJEM = { lat: 59.663, lon: 10.63 };
const REISEDAG_KM = 150;
export function reiseFor(lat, lon) {
  const rad = (g) => (g * Math.PI) / 180;
  const a =
    Math.sin(rad(lat - HJEM.lat) / 2) ** 2 +
    Math.cos(rad(HJEM.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lon - HJEM.lon) / 2) ** 2;
  const km = Math.round(6371 * 2 * Math.asin(Math.sqrt(a)));
  return { km, reise: km >= REISEDAG_KM };
}

/** Om EHF skal være forhåndsvalgt på fakturaen. Det offentlige må ha EHF, og fra 5 ansatte bruker de fleste
    det. De aller minste får vanlig faktura som utgangspunkt. Kunden kan alltid endre valget. */
const OFFENTLIG = new Set(["STAT", "SF", "KOMM", "FYLK", "KF", "FKF", "IKS", "ORGL"]);
export function ehfForvalgt(form, ansatte) {
  return OFFENTLIG.has(form) || ansatte >= 5;
}

/** Domenet virksomheten selv har oppgitt i Enhetsregisteret (hjemmeside, ellers e-post), uten «www.»:
    «oslo.kommune.no». null uten noe av det. */
export function domeneFra(enhet) {
  const kilde = enhet.hjemmeside || String(enhet.epostadresse || "").split("@")[1] || "";
  const d = String(kilde).toLowerCase().trim().replace(/^[a-z]+:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/** Om e-postadressen er på et av domenene, eller et underdomene av dem (navn@bga.oslo.kommune.no hører
    til oslo.kommune.no). Slik vet vi at en nøkkel som gis før betaling, havner hos virksomheten selv. */
export function epostPaaDomene(epost, domener) {
  const d = String(epost || "").toLowerCase().split("@")[1];
  return Boolean(d) && domener.some((x) => x && (d === x || d.endsWith(`.${x}`)));
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
  // Underenheter (en skole i en kommune) har beliggenhetsadresse i stedet for forretningsadresse.
  const adr = enhet.forretningsadresse || enhet.beliggenhetsadresse || enhet.postadresse || null;
  return {
    orgnr: enhet.organisasjonsnummer,
    navn: enhet.navn,
    form: enhet.organisasjonsform?.kode || null,
    ansatte: Number.isFinite(enhet.antallAnsatte) ? enhet.antallAnsatte : 0,
    naering: enhet.naeringskode1?.kode || null,
    domene: domeneFra(enhet),
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
