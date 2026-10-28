// Prøvebenk for skriften i H1 («Esbjug Consult»): piltast høyre/venstre blar gjennom 20 skrifter, og tilbake til Fraunces.
// Ingen teller eller annet på siden. Skriftene hentes fra Bunny Fonts (EU, logger ikke IP) først ved første trykk,
// så besøkende som ikke trykker henter ingenting. Med ?h1 eller ?ingress styrer slagord.js pilene.
// Ingressen fikk nr. 20 fra forrige runde (IBM Plex Mono), og den står nå fast i index.html.
(() => {
  if (/[?&](h1|ingress)\b/.test(location.search)) return;
  const el = document.querySelector('.sh-hero h1');
  if (!el) return;
  const SANS = '-apple-system,"Helvetica Neue",Arial,sans-serif', SERIF = 'Georgia,"Times New Roman",serif', MONO = 'Menlo,monospace';
  // [navn, id hos Bunny Fonts, reserve]
  const FONTER = [
    ['IBM Plex Sans', 'ibm-plex-sans', SANS],
    ['IBM Plex Serif', 'ibm-plex-serif', SERIF],
    ['IBM Plex Mono', 'ibm-plex-mono', MONO],
    ['Space Grotesk', 'space-grotesk', SANS],
    ['Space Mono', 'space-mono', MONO],
    ['JetBrains Mono', 'jetbrains-mono', MONO],
    ['Inter Tight', 'inter-tight', SANS],
    ['Bricolage Grotesque', 'bricolage-grotesque', SANS],
    ['Syne', 'syne', SANS],
    ['Unbounded', 'unbounded', SANS],
    ['Sora', 'sora', SANS],
    ['Familjen Grotesk', 'familjen-grotesk', SANS],
    ['Archivo', 'archivo', SANS],
    ['Playfair Display', 'playfair-display', SERIF],
    ['DM Serif Display', 'dm-serif-display', SERIF],
    ['Instrument Serif', 'instrument-serif', SERIF],
    ['Cormorant Garamond', 'cormorant-garamond', SERIF],
    ['Young Serif', 'young-serif', SERIF],
    ['Bodoni Moda', 'bodoni-moda', SERIF],
    ['Gloock', 'gloock', SERIF],
  ];
  // H1 er i vekt 500. Skriftene som bare finnes i 400, vises i 400.
  const URL_CSS = 'https://fonts.bunny.net/css?family=' + FONTER.map(f => f[1] + ':400,500').join('|') + '&display=swap';
  let css, n = 0; // 0 er Fraunces, 1–20 er FONTER
  const steg = (i, r) => (i + r + FONTER.length + 1) % (FONTER.length + 1);
  const hent = () => css ??= new Promise(ok => {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: URL_CSS });
    l.onload = l.onerror = ok;
    document.head.append(l);
  });
  const last = async f => { await hent(); await document.fonts.load(`500 20px "${f[0]}"`, el.textContent).catch(() => {}); };
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
