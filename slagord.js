// Prøvebenk for teksten i heroen: ?h1 blar i overskriften, ?ingress i teksten under, med piltast høyre/venstre.
// Ingen teller eller annet på siden.
// Lastes bare med ?h1, så vanlige besøkende ser ikke noe av dette. To deler = to linjer (andre del i kursiv på egen
// linje). Én streng = én linje, der *ord* blir kursiv i linjen.
(() => {
  const SLAGORD = [
    ['Du velger toppen.', 'Jeg bærer utstyret opp.'],
    ['Sammen til topps.', 'Jeg bærer det tunge.'],
    ['Du har målet.', 'Jeg kjenner veien.'],
    ['Toppen er din.', 'Ruten er min jobb.'],
    ['KI uten høydeskrekk.', 'Jeg sikrer taulaget.'],
    ['Lettere til topps.', 'Med KI på ryggen.'],
    ['Du klatrer.', 'Jeg sikrer.'],
    ['Ett skritt foran.', 'Hele veien opp.'],
    ['Fra dal til topp.', 'Med systemene på plass.'],
    ['Bratt?', 'Jeg går foran.'],
    ['Du ser toppen.', 'Jeg finner ruten.'],
    ['Det tunge er mitt.', 'Utsikten er din.'],
    ['Til topps med KI.', 'Uten å bære alt selv.'],
    ['Høyere med KI.', 'Jeg legger løypa.'],
    ['Følg sporet.', 'Jeg har tråkket det opp.'],
    ['Gå lett.', 'Jeg bærer sekken.'],
    ['Toppen venter.', 'Utstyret er pakket.'],
    ['KI i sekken.', 'Sherpaen på laget.'],
    ['Ingen går alene.', 'Vi går i taulag.'],
    ['Du tar steget.', 'Jeg tar vekten.'],
    ['Du drømmer om toppen.', 'Jeg har tauet.'],
    ['Ikke bær KI alene.', 'Ta med en sherpa.'],
    ['KI er fjellet.', 'Jeg er sherpaen.'],
    ['Høydemeterne er dine.', 'Kiloene er mine.'],
    ['Start i dalen.', 'Slutt på toppen.'],
    'Sammen til topps.',
    'Du velger toppen.',
    'Vi går i taulag.',
    'Lettere til topps.',
    'Jeg bærer det tunge.',
    'Ingen går alene.',
    'Bratt er greit.',
    'KI uten tunge løft.',
    'Gå lett. Jeg bærer.',
    'Til topps med *KI*.',
    'Toppen er *din*.',
    'Din topp, *min sekk*.',
    'KI, *ferdig båret opp*.',
    'Oppover, *sammen*.',
    'KI på *din* fjellside.',
  ];
  const INGRESS = [
    'Du vil være helt i front med KI, men å få systemene på plass kan være tungt. Det er der jeg kommer inn.',
    'KI er tryggest når personopplysningene aldri forlater huset. Jeg lærer bort hvordan, og setter opp verktøyene som gjør det.',
    'Bedriften din vil bruke KI, men dokumentene er fulle av personopplysninger. Jeg viser hvordan dere bruker KI trygt, innenfor GDPR.',
    'Jeg lærer bedrifter å bruke KI trygt, med Klart, som renser dokumentene for personopplysninger før de brukes.',
    'KI uten GDPR-hodepine. Jeg lærer laget ditt å bruke KI riktig, og gir dere verktøyet som rydder dokumentene først.',
    'Det tunge med KI er ikke å komme i gang, men å gjøre det trygt. Det er der jeg kommer inn.',
    'Navn, fødselsnummer og helseopplysninger hører ikke hjemme i en chatbot. Jeg lærer dere å bruke KI uten dem.',
    'Før dokumentene går til KI, må personopplysningene ut. Jeg lærer dere hvordan, og Klart gjør jobben lokalt på maskinen.',
    'Trygg KI i hverdagen: kurs for laget ditt og et verktøy som renser dokumentene uten å gå på nett.',
    'Du vil bruke KI på ekte arbeid. Jeg sørger for at det skjer innenfor GDPR.',
    'Jeg underviser i trygg bruk av KI og har laget Klart, som sladder personopplysninger lokalt før dokumentene deles.',
    'KI gjør jobben lettere. GDPR gjør den tyngre. Jeg lærer dere å få begge deler til å gå opp.',
    'De ansatte bruker allerede KI. Jeg sørger for at de gjør det trygt, med opplæring og et verktøy som fjerner personopplysningene.',
    'Først rydder vi dokumentene. Så tar vi i bruk KI. Jeg viser veien og bærer verktøyene.',
    'Kurs i trygg KI-bruk, og Klart: programmet som renser dokumenter for personopplysninger på din egen maskin.',
    'Personvern er utstyret du trenger på vei opp. Jeg lærer dere å bruke KI trygt, og gir dere verktøyet som gjør det enkelt.',
    'KI uten risiko for personopplysningene. Jeg lærer bort metoden og leverer verktøyet.',
    'Jeg hjelper bedrifter å ta i bruk KI uten å sende personopplysninger ut av huset.',
    'Rensede dokumenter, trygg KI og et lag som kan det. Det er det jeg leverer.',
    'Du vil være helt i front med KI, men personvernet må være på plass først. Det er der jeg kommer inn.',
    'Den tryggeste veien til KI går gjennom rene dokumenter. Jeg viser dere den.',
  ];
  const ingress = new URLSearchParams(location.search).has('ingress');
  const el = document.querySelector(ingress ? '.sh-ingress' : '.sh-hero h1');
  if (!el) return;
  const LISTE = ingress ? INGRESS : SLAGORD;
  let n = 0;
  const vis = () => {
    const s = LISTE[n];
    el.innerHTML = Array.isArray(s) ? `${s[0]} <i>${s[1]}</i>` : s.replace(/\*(.+?)\*/g, '<i style="display:inline">$1</i>');
  };
  addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    n = (n + (e.key === 'ArrowRight' ? 1 : LISTE.length - 1)) % LISTE.length;
    vis();
  });
  vis();
})();
