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
    'Du vil være helt i front med KI. Jeg setter opp systemene, så du slipper å bære dem selv.',
    'KI kan gjøre bedriften din raskere. Jeg tar de tunge løftene med å få det til å virke i hverdagen.',
    'Du bestemmer hvor bedriften skal. Jeg velger verktøyene, setter dem opp og får dem til å virke.',
    'De fleste vil bruke KI, få har tid til å sette det opp. Det er det jeg gjør.',
    'Jeg setter opp KI og systemene rundt, så du kan bruke tiden på det du er god på.',
    'Fra første idé til systemer som går av seg selv. Jeg går foran og bærer det tunge.',
    'KI er ikke vanskelig når noen har gått ruten før. Jeg har gått den mange ganger.',
    'Du trenger ikke kunne alt om KI. Du trenger noen som kan det, og som setter det opp for deg.',
    'Mindre manuelt arbeid, færre feil, mer tid. Jeg bygger KI-løsningene som gjør det mulig.',
    'Jeg finner hvor KI sparer deg mest, setter det opp og sørger for at det fortsetter å virke.',
    'Som en sherpa: Jeg kjenner fjellet, bærer utstyret og sørger for at hele laget kommer opp.',
    'Teknologien finnes allerede. Jobben er å få den på plass hos deg, og den tar jeg.',
    'Du vil ha KI som virker, ikke enda et prosjekt. Jeg leverer det ferdig satt opp.',
    'Nye verktøy kommer hver uke. Jeg holder oversikten, velger riktig og setter det opp for deg.',
    'Jeg bygger systemene, kobler sammen verktøyene og lærer laget ditt å bruke dem.',
    'KI gir et forsprang til dem som kommer i gang. Jeg får deg i gang, og holder deg der.',
    'Det tunge med KI er ikke ideen, men oppsettet. Det er der jeg kommer inn.',
    'Kartlegging, oppsett og drift av KI og systemene rundt. Du går lett, jeg bærer.',
    'Du får forspranget. Jeg tar slitet.',
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
