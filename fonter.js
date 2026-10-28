// Prøvebenk for skriften i ingressen: piltast høyre/venstre blar gjennom 20 skrifter, og tilbake til den vanlige.
// Ingen teller eller annet på siden. Skriftene hentes fra Bunny Fonts (EU, logger ikke IP) først ved første trykk,
// så besøkende som ikke trykker henter ingenting. Med ?h1 eller ?ingress styrer slagord.js pilene.
(() => {
  if (/[?&](h1|ingress)\b/.test(location.search)) return;
  const el = document.querySelector('.sh-ingress');
  if (!el) return;
  const SANS = '-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif', SERIF = 'Georgia,"Times New Roman",serif';
  // [navn, id hos Bunny Fonts (tom = ligger på siden fra før), reserve]
  const FONTER = [
    ['Inter', 'inter', SANS],
    ['DM Sans', 'dm-sans', SANS],
    ['Manrope', 'manrope', SANS],
    ['Plus Jakarta Sans', 'plus-jakarta-sans', SANS],
    ['Outfit', 'outfit', SANS],
    ['Figtree', 'figtree', SANS],
    ['Work Sans', 'work-sans', SANS],
    ['IBM Plex Sans', 'ibm-plex-sans', SANS],
    ['Source Sans 3', 'source-sans-3', SANS],
    ['Nunito Sans', 'nunito-sans', SANS],
    ['Space Grotesk', 'space-grotesk', SANS],
    ['Karla', 'karla', SANS],
    ['Fraunces', '', SERIF],
    ['Newsreader', 'newsreader', SERIF],
    ['Source Serif 4', 'source-serif-4', SERIF],
    ['Lora', 'lora', SERIF],
    ['EB Garamond', 'eb-garamond', SERIF],
    ['Libre Baskerville', 'libre-baskerville', SERIF],
    ['Spectral', 'spectral', SERIF],
    ['IBM Plex Mono', 'ibm-plex-mono', 'Menlo,monospace'],
  ];
  const URL_CSS = 'https://fonts.bunny.net/css?family=' + FONTER.filter(f => f[1]).map(f => f[1] + ':400').join('|') + '&display=swap';
  let css, n = 0; // 0 er den vanlige skriften, 1–20 er FONTER
  const steg = (i, r) => (i + r + FONTER.length + 1) % (FONTER.length + 1);
  const hent = () => css ??= new Promise(ok => {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: URL_CSS });
    l.onload = l.onerror = ok;
    document.head.append(l);
  });
  const last = async f => { await hent(); await document.fonts.load(`400 20px "${f[0]}"`, el.textContent).catch(() => {}); };
  // Skriften byttes først når den er lastet, så teksten ikke blinker i reserveskriften.
  const vis = async (i, retning) => {
    const f = FONTER[i - 1];
    if (f) await last(f);
    if (i !== n) return;
    el.style.fontFamily = f ? `"${f[0]}",${f[2]}` : '';
    const neste = FONTER[steg(i, retning) - 1];
    if (neste) last(neste);
  };
  addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    const retning = e.key === 'ArrowRight' ? 1 : -1;
    n = steg(n, retning);
    vis(n, retning);
  });
})();
