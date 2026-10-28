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
    'Det er godt å ha med noen som kan KI ut og inn. Snart har du systemer som jobber mens du sover, og du lurer på hvordan du noen gang gjorde det annerledes.',
    'Jeg lever og ånder for KI, så du slipper. Du får systemer som jobber for deg døgnet rundt og sparer deg timevis hver uke.',
    'Tenk deg toppen: systemene jobber mens du sover, uka har fått flere timer, og du lurer på hvordan du noen gang klarte deg uten.',
    'Med en som er dypt inne i KI på laget går veien opp lettere. På toppen jobber systemene for deg, også om natten.',
    'Jeg følger KI tettere enn de fleste. Du får gleden av det: systemer som tar jobben mens du sover, og timer spart hver eneste uke.',
    'Utsikten fra toppen: arbeid som gjør seg selv, timer tilbake hver uke, og en hverdag du ikke vil bytte tilbake.',
    'Du trenger ikke kunne KI. Du trenger noen som kan det. Resten er utsikt.',
    'Jeg kjenner KI som min egen bukselomme. Du får systemer som jobber mens du sover, og timer spart hver uke.',
    'En dag ser du tilbake og lurer på hvordan du gjorde det før. Systemene jobber mens du sover, og uka har fått flere timer.',
    'Det kjekkeste med KI er ikke teknologien, men timene du får tilbake. Jeg tar teknologien, du tar timene.',
    'Ha med en som kan veien. Så står du på toppen med systemer som jobber for deg, også når du sover.',
    'Jeg bruker dagene mine på KI, så du kan bruke dine på noe annet. Systemene jobber, du sparer timer hver uke.',
    'Fra toppen ser alt enklere ut: rutinene går av seg selv, timene kommer tilbake, og de gamle arbeidsmåtene virker fjerne.',
    'Godt å ha en sherpa som kan KI på rams. Enda bedre å våkne til arbeid som allerede er gjort.',
    'Systemer som jobber mens du sover. Timer spart hver uke. Jeg er den som får deg dit.',
    'Du sover. Systemene jobber. Om morgenen er jobben gjort, og du lurer på hvordan du klarte deg uten.',
    'KI forandrer seg hver uke. Jeg holder følge, så du kan nyte utsikten fra toppen.',
    'Med noen som kan KI ved siden av deg blir veien kortere og toppen bedre: systemer som jobber for deg, døgnet rundt.',
    'Timevis spart hver uke, systemer som aldri sover og en guide som kjenner terrenget. Velkommen til toppen.',
    'Snart lurer du på hvordan du noen gang gjorde det annerledes. Jeg kan KI, og jeg viser deg veien opp.',
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
