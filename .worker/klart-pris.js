// Klart: prisen for en virksomhet, fra Enhetsregisteret. Ren logikk uten Stripe og uten lager, så den
// kan prøves for seg: node .worker/klart-pris.test.mjs
//
// Tallene står ikke her. Repoet er offentlig, og trinnene og påslaget for tjenesteleverandører skal
// aldri vises som en tabell. De kommer fra hemmeligheten KLART_PRISER (JSON). Kilden er
// verktoy/klart-priser.json i det private repoet, og verktoy/klart-priser.sh sender den til Cloudflare.

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
  if (!Array.isArray(p.trinn) || !p.trinn.length || p.trinn[p.trinn.length - 1].til !== null) {
    throw new Error("KLART_PRISER: trinn mangler, eller det siste trinnet har en øvre grense");
  }
  lest = { tekst, priser: p };
  return p;
}

export function trinnFor(priser, ansatte) {
  return priser.trinn.find((t) => t.til === null || ansatte <= t.til);
}

/** Bransjen fra næringskoden (SN2025, f.eks. «69.100»). Prefiksene står i KLART_PRISER: «69.1», «64» … */
export function sektorFor(priser, naeringskode) {
  const kode = String(naeringskode || "");
  if (!kode) return null;
  return (priser.sektorer || []).find((s) => s.nace.some((n) => kode.startsWith(n))) || null;
}

/** Årsprisen for virksomhetens egen lisens, i hele kroner eks. mva. Sektoren er med bare når den endrer prisen. */
export function lisenspris(priser, ansatte, naeringskode) {
  const trinn = trinnFor(priser, ansatte);
  const s = sektorFor(priser, naeringskode);
  const faktor = s && typeof s.faktor === "number" ? s.faktor : 1;
  return { trinn, sektor: faktor !== 1 ? s : null, pris: Math.round(trinn.pris * faktor) };
}

/** Prisen en tjenesteleverandør betaler per år for én kunde. */
export function kundepris(priser, ansatte, naeringskode) {
  return lisenspris(priser, ansatte, naeringskode).pris * (priser.leverandorFaktor || 1);
}

/** Sprinten hos virksomheter fra «fra» ansatte og opp, med trinnet som gjelder. Ellers null. */
export function sprintFor(priser, ansatte) {
  const s = priser.sprint;
  if (!s || ansatte < s.fra) return null;
  const t = s.trinn.find((x) => x.til === null || ansatte <= x.til);
  return t ? { trinn: t.navn, grunn: t.grunn, total: t.total } : null;
}

/** Hva virksomheten kan betale med. Faktura er for de store, avdrag for de små som vil spre
    kostnaden. Kvartalsbeløpet regnes i øre, så fire avdrag går opp i årsprisen. */
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
