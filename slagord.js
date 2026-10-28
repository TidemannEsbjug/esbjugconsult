// Prøvebenk for H1 i heroen: åpne siden med ?h1 og bla med piltast høyre/venstre. Ingen teller eller annet på siden.
// Lastes bare med ?h1, så vanlige besøkende ser ikke noe av dette.
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
  ];
  const h1 = document.querySelector('.sh-hero h1');
  if (!h1) return;
  let n = 0;
  const vis = () => {
    const [a, b] = SLAGORD[n];
    h1.innerHTML = `${a} <i>${b}</i>`;
  };
  addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    n = (n + (e.key === 'ArrowRight' ? 1 : SLAGORD.length - 1)) % SLAGORD.length;
    vis();
  });
  vis();
})();
