// Klart: hvor mange som jobber i en kommune eller en del av den, fra Enhetsregisteret. Brukes av
// bygg-innbyggere.mjs (hele kommunen, til kommuneansatte.json) og av prissiden (én bydel eller etat).
//
// En kommune er ett rettssubjekt, men registrert som et tre: kommunen, organisasjonsledd under den
// (byrådsavdelinger, bydeler, etater) og kommunale foretak (KF). Antall ansatte er ført ulikt: Bergen
// kommune står med summen av avdelingene sine, Oslo kommune bare med sine egne 553. Derfor teller hvert
// ledd det største av sitt eget tall og summen av leddene under det. Aksjeselskaper, IKS og stiftelser
// under kommunen er egne rettssubjekter og telles ikke.

// Statlige virksomheter (statsforvaltningen, sektor 6100) som kjøper som staten: etater og andre ledd,
// helseforetak og andre særlovsselskaper, statsforetak, Den norske kirke og departementene selv.
// Aksjeselskaper og stiftelser eid av staten kjøper som andre virksomheter.
export const STATSFORMER = new Set(["ORGL", "SÆR", "SF", "KIRK", "STAT"]);

// Der leddene under en STAT-enhet kjøper samlet, og STAT-enheten selv er kjøperen: domstolene
// (Domstoladministrasjonen kjøper for dem), så 36 domstoler ikke blir 36 kjøp som til sammen går over grensen.
export const SAMLET_STAT = new Set(["984195796"]);

/** Om en enhet er en del av staten som kjøper etter anskaffelsesloven (se STATSFORMER). */
export function statlig(enhet) {
  return enhet.institusjonellSektorkode?.kode === "6100" && STATSFORMER.has(enhet.organisasjonsform?.kode);
}

const SELVSTENDIGE = new Set(["AS", "ASA", "IKS", "SF", "STI", "FLI", "SA", "ANS", "DA", "KS", "BA"]);

/** Om en enhet under en kommune er en del av kommunen (ikke et eget rettssubjekt). */
export function delAvKommunen(enhet) {
  return !enhet.slettedato && !SELVSTENDIGE.has(enhet.organisasjonsform?.kode);
}

/** Ansatte i enheten og alt under den. «barn(orgnr)» gir enhetene rett under (Enhetsregisteret,
    overordnetEnhet). Høyst «maks» oppslag, så et uventet stort tre ikke henger. */
export async function ansatteITre(enhet, barn, maks = 200) {
  let oppslag = 0;
  async function tell(e, dybde) {
    const egne = Number.isFinite(e.antallAnsatte) ? e.antallAnsatte : 0;
    if (dybde > 6 || oppslag >= maks) return egne;
    oppslag++;
    let sum = 0;
    for (const b of (await barn(e.organisasjonsnummer)).filter(delAvKommunen)) sum += await tell(b, dybde + 1);
    return Math.max(egne, sum);
  }
  return tell(enhet, 0);
}
