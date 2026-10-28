#!/usr/bin/env python3
"""Lager /sherpa/ (sherpa/index.html) fra forsiden (index.html).

Øverst kommer en ny hero (AI-sherpaen, vinterbildet fra Midjourney i media/sherpa.*). Rett under ligger kartdelen
og resten av forsiden, med kartet i vinterfarger (VINTER under) i stedet for høstfargene. Siden har noindex mens den er et forsøk.
Kjør etter endringer i index.html:  python3 bygg-sherpa.py  (og publiser med npx wrangler deploy).
"""
import pathlib, re

HER = pathlib.Path(__file__).parent
s = (HER / "index.html").read_text(encoding="utf-8")


def bytt(gammel, ny, tekst=None):
    """Bytter nøyaktig én forekomst. Stopper hvis forsiden er endret så teksten ikke finnes."""
    global s
    n = s.count(gammel)
    if n != 1:
        raise SystemExit(f"bygg-sherpa: fant {n} av {gammel[:70]!r} i index.html (ventet 1)")
    s = s.replace(gammel, ny)


# --- hode ---
bytt("<title>Esbjug Consult</title>", "<title>AI-sherpaen · Esbjug Consult</title>")
bytt('content="Kode og design har gått gjennom en revolusjon som ikke må oversees."',
     'content="Tidemann Esbjug er AI-sherpaen: han tar de tunge løftene med å sette opp systemene riktig, så bedriften kan ta del i AI."')
bytt('<meta name="theme-color" content="#cfe4f6">', '<meta name="theme-color" content="#74a8d4">\n<meta name="robots" content="noindex">')
bytt('<link rel="alternate" hreflang="nb" href="https://esbjugconsult.com/">\n', "")
bytt('<link rel="alternate" hreflang="en" href="https://esbjugconsult.com/en/">\n', "")
bytt('<link rel="preload" href="/media/fonts/fraunces.woff2"',
     '<link rel="preload" href="/media/sherpa.webp" as="image" type="image/webp" media="(min-width:761px)">\n'
     '<link rel="preload" href="/media/sherpa-900.webp" as="image" type="image/webp" media="(max-width:760px)">\n'
     '<link rel="preload" href="/media/fonts/fraunces.woff2"')

CSS = """
  /* ===== /sherpa/: AI-sherpaen (bygges av bygg-sherpa.py) ===== */
  .sh-hero{width:100%;flex:none}
  .natt-lag{display:none}
  .focus .sh-hero{opacity:0;filter:blur(8px);pointer-events:none}
  .sh-hero{--sky:#74a8d4;position:relative;min-height:100svh;display:flex;flex-direction:column;background:var(--sky);color:#00205B;overflow:hidden;isolation:isolate}
  .sh-bilde{position:absolute;left:0;right:0;bottom:0;height:min(100%,calc(100vw * .4286));z-index:-2;margin:0}
  .sh-bilde img{width:100%;height:100%;object-fit:cover;object-position:70% 100%;display:block}
  .sh-sno{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
  .sh-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px var(--g) 0}
  .sh-merke{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font:600 15px/1 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;letter-spacing:.01em}
  .sh-merke svg{width:26px;height:26px;border-radius:7px;flex:none}
  .sh-merke span{opacity:.6;font-weight:500}
  .sh-lenker{display:flex;align-items:center;gap:26px}
  .sh-lenker a{color:inherit;text-decoration:none;font:500 15px/1 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif}
  .sh-lenker a:hover{text-decoration:underline;text-underline-offset:4px}
  .sh-lenker .sh-kontakt{padding:11px 18px;border-radius:999px;border:1.5px solid rgba(0,32,91,.35);background:rgba(255,255,255,.25)}
  .sh-lenker .sh-kontakt:hover{text-decoration:none;background:rgba(255,255,255,.5)}
  .sh-i{padding:clamp(28px,7vh,90px) var(--g) 0;max-width:calc(880px + 2 * var(--g))}
  .sh-ey{margin:0;font:600 12px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,32,91,.72)}
  .sh-hero h1{margin:.38em 0 .34em;font:500 clamp(42px,5.4vw,84px)/1.02 var(--serif);letter-spacing:-.022em;font-variation-settings:"opsz" 144}
  .sh-hero h1 i{font-style:italic;font-weight:400}
  .sh-ingress{margin:0;max-width:31em;font:400 clamp(17px,1.45vw,21px)/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:rgba(0,32,91,.88)}
  .sh-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
  .sh-knapp{display:inline-flex;align-items:center;gap:10px;padding:16px 24px;border-radius:999px;text-decoration:none;font:600 16px/1 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
  .sh-knapp:hover{transform:translateY(-1px)}
  .sh-knapp.sh-p{background:#BA0C2F;color:#fff;box-shadow:0 10px 28px rgba(186,12,47,.32)}
  .sh-knapp.sh-s{background:rgba(255,255,255,.62);color:#00205B;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
  .sh-knapp.sh-s:hover{background:rgba(255,255,255,.85)}
  .sh-knapp svg{width:16px;height:16px}
  .sh-live[hidden]{display:none}
  .sh-live{display:flex;align-items:center;gap:9px;margin:22px 0 0;font:500 13px/1.3 "SF Mono",Menlo,monospace;color:rgba(0,32,91,.75)}
  .sh-prikk{width:8px;height:8px;border-radius:50%;background:#BA0C2F;flex:none;box-shadow:0 0 0 0 rgba(186,12,47,.5);animation:shPuls 2s ease-out infinite}
  @keyframes shPuls{to{box-shadow:0 0 0 9px rgba(186,12,47,0)}}
  .sh-sted{color:#00205B;font-weight:600}
  @media (max-width:760px){
    .sh-lenker a:not(.sh-kontakt){display:none}
    .sh-i{padding-top:34px}
    .sh-bilde{display:block;position:relative;inset:auto;height:auto;flex:1 0 300px;order:3;margin-top:-20px}
    .sh-merke span{display:none}
    .sh-hero h1{font-size:clamp(38px,10.5vw,48px)}
    .sh-ingress{font-size:17px}
    .sh-knapp{padding:15px 20px}
  }
  @media (prefers-reduced-motion:reduce){.sh-prikk{animation:none}}
  /* Hvit tekst i heroen (standard). Et svakt blått slør bak teksten gir nok kontrast mot den lyse himmelen.
     ?tekst=bla viser den mørkeblå teksten (klassen .bla) for å sammenligne. */
  .sh-hero:not(.bla){color:#fff}
  .sh-hero:not(.bla)::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(100deg,rgba(0,32,91,.42) 0%,rgba(0,32,91,.22) 40%,rgba(0,32,91,0) 66%)}
  .sh-hero:not(.bla) .sh-i{text-shadow:0 1px 22px rgba(0,25,70,.35)}
  .sh-hero:not(.bla) .sh-ey{color:rgba(255,255,255,.82)}
  .sh-hero:not(.bla) .sh-ingress{color:rgba(255,255,255,.94)}
  .sh-hero:not(.bla) .sh-live{color:rgba(255,255,255,.85)}
  .sh-hero:not(.bla) .sh-sted{color:#fff}
  .sh-hero:not(.bla) .sh-lenker .sh-kontakt{border-color:rgba(255,255,255,.6);background:rgba(255,255,255,.12)}
  .sh-hero:not(.bla) .sh-lenker .sh-kontakt:hover{background:rgba(255,255,255,.25)}
  .sh-hero:not(.bla) .sh-knapp{text-shadow:none}
  .sh-hero:not(.bla) .sh-knapp.sh-s{background:rgba(255,255,255,.18);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.55)}
  .sh-hero:not(.bla) .sh-knapp.sh-s:hover{background:rgba(255,255,255,.3)}
  @media (max-width:760px){.sh-hero:not(.bla)::before{background:linear-gradient(180deg,rgba(0,32,91,.38) 0%,rgba(0,32,91,.22) 55%,rgba(0,32,91,0) 85%)}}

  /* Kartet i vinterfarger: lys bunn mens det lastes, lyse kontroller */
  .hero{background:#dfe9f4}
  #kart{background:#eef3f9}
  .kart-venter{background:radial-gradient(60% 50% at 50% 50%,#ffffff,#d6e4f2)}
  .kv-i b{color:#00205B}.kv-t{color:rgba(0,32,91,.45)}
  #kart .maplibregl-ctrl-group{background:rgba(255,255,255,.8);border-color:rgba(0,32,91,.12)}
  #kart .maplibregl-ctrl-group button+button{border-top-color:rgba(0,32,91,.12)}
  #kart .maplibregl-ctrl-group .maplibregl-ctrl-icon{filter:none}
  #kart .maplibregl-ctrl-attrib{background:rgba(255,255,255,.7);color:rgba(0,32,91,.55)}
  #kart .maplibregl-ctrl-attrib a{color:rgba(0,32,91,.7)}
  #kart .maplibregl-ctrl-attrib-button{filter:none}
  #kart .maplibregl-cooperative-gesture-screen{background:rgba(0,32,91,.45);color:#fff}
"""
bytt("</style>\n</head>", CSS + "</style>\n</head>")

LOGO = ('<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" fill="#00205B"/>'
        '<circle cx="16" cy="16" r="9" fill="#BA0C2F" stroke="#fff" stroke-width="3"/></svg>')
PIL = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
       'stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>')

HTML = f"""<section class="sh-hero" aria-label="AI-sherpaen">
  <picture class="sh-bilde"><source type="image/webp" media="(max-width:760px)" srcset="/media/sherpa-900.webp"><source type="image/webp" srcset="/media/sherpa.webp"><img src="/media/sherpa.jpg" alt="Tegning av et taulag på vei opp en snødekt fjellrygg i Norge, med en rød hytte nede i dalen" width="1680" height="720" fetchpriority="high"></picture>
  <canvas class="sh-sno" aria-hidden="true"></canvas>
  <nav class="sh-nav"><a class="sh-merke" href="/sherpa/">{LOGO}Esbjug Consult <span>· AI-sherpaen</span></a><div class="sh-lenker"><a href="#live">Live</a><a class="sh-kontakt" href="mailto:tidemann@esbjugconsult.com">Kontakt</a></div></nav>
  <div class="sh-i">
    <p class="sh-ey">AI-sherpaen Tidemann Esbjug</p>
    <h1>Du velger toppen. <i>Jeg bærer utstyret opp.</i></h1>
    <p class="sh-ingress">Du vil være helt i front med AI, men å få systemene på plass kan være tungt. Det er der jeg kommer inn.</p>
    <div class="sh-cta"><a class="sh-knapp sh-p" href="mailto:tidemann@esbjugconsult.com">Snakk med meg</a><a class="sh-knapp sh-s" href="#live">Se hvor jeg er nå {PIL}</a></div>
    <p class="sh-live" hidden><i class="sh-prikk"></i><span>Live:</span> <span class="sh-sted">Henter posisjonen …</span></p>
  </div>
</section>
"""
bytt('<header class="hero">', HTML + '<header class="hero" id="live">')

JS = """<script>
// /sherpa/: snø over bildet (musa blåser litt på den) og stedet fra kartpanelet i heroen.
(() => {
  const $ = q => document.querySelector(q);
  if (/[?&]tekst=bla\b/.test(location.search)) $('.sh-hero').classList.add('bla');
  const navn = $('.sted .s-navn'), sted = $('.sh-sted');
  if (navn && sted) {
    const sett = () => {
      const t = navn.textContent.trim(), ok = t && t !== '–' && !/^(Henter posisjonen|Ingen posisjon)/.test(t);
      if (ok) sted.textContent = t;
      sted.parentNode.hidden = !ok;
    };
    sett(); new MutationObserver(sett).observe(navn, { childList: true, characterData: true, subtree: true });
  }

  const c = $('.sh-sno');
  if (c && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const x = c.getContext('2d'); let w = 0, h = 0, f = [], synlig = true;
    const str = () => {
      if (c.clientWidth === w && c.clientHeight === h) return;
      const nyBredde = c.clientWidth !== w, d = Math.min(devicePixelRatio || 1, 2); w = c.clientWidth; h = c.clientHeight;
      c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0);
      if (nyBredde || !f.length) f = Array.from({ length: Math.round(w * h / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.7 + .5, v: Math.random() * .45 + .2, s: Math.random() * 6.28 }));
    };
    str(); addEventListener('resize', str);
    new IntersectionObserver(e => { synlig = e[0].isIntersecting; }).observe(c);
    // Musa blåser litt på fnuggene: de nærmeste får et lite dytt i musas retning og bort fra pekeren, som dør ut.
    const mus = { x: -999, y: -999, vx: 0, vy: 0 };
    c.parentNode.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = c.getBoundingClientRect(), nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (mus.x > -999) { mus.vx = mus.vx * .5 + (nx - mus.x) * .5; mus.vy = mus.vy * .5 + (ny - mus.y) * .5; }
      mus.x = nx; mus.y = ny;
    });
    c.parentNode.addEventListener('pointerleave', () => { mus.x = mus.y = -999; mus.vx = mus.vy = 0; });
    const R = 130;
    const tegn = () => {
      if (synlig && !document.hidden) {
        x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath();
        for (const p of f) {
          const fart = Math.abs(mus.vx) + Math.abs(mus.vy);
          if (fart > .5) {
            const dx = p.x - mus.x, dy = p.y - mus.y, d = Math.hypot(dx, dy);
            if (d < R && d > 0) {
              const k = (1 - d / R) * Math.min(fart, 40) / 40;
              p.dx = (p.dx || 0) + (mus.vx * .02 + dx / d * .35) * k;
              p.dy = (p.dy || 0) + (mus.vy * .02 + dy / d * .35) * k;
            }
          }
          p.dx = (p.dx || 0) * .95; p.dy = (p.dy || 0) * .95;
          p.y += p.v + p.dy; p.s += .012; p.x += Math.sin(p.s) * .25 + p.dx;
          if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; p.dx = p.dy = 0; }
          if (p.x < -6) p.x = w + 6; else if (p.x > w + 6) p.x = -6;
          x.moveTo(p.x + p.r, p.y); x.arc(p.x, p.y, p.r, 0, 6.283);
        }
        x.fill();
        mus.vx *= .85; mus.vy *= .85;
      }
      requestAnimationFrame(tegn);
    };
    tegn();
  }

})();
</script>
"""
bytt("</body>", JS + "</body>")

# --- Kartet i vinterfarger: snøhvit bunn, snødekket skog i blågrått, isblått vann, veier i dempet marineblått ---
bytt("""const HOST = {
  bunn: '#21160f', bolig: '#2b1d14', bygg: '#3a291e', vann: '#123048', elv: '#1b4766', park: '#c9971a', gress: '#8f7a22', eng: '#b98a1c',
  skog: ['#b3261e', '#d9541e', '#e8891c', '#c4410f', '#a8681a'], vatmark: '#4f5a2a', sand: '#6e5634', kirkegard: '#5b3a2a', bane: '#6f7f25',
  motorvei: '#b9874f', hoved: '#9c7a5a', sekundar: '#836a52', liten: '#5c4838', sti: '#4f3d2f', kant: '#140d08', jernbane: '#5f4838',
  tekst: '#f6e7d2', halo: '#1a110b',
};""", """const HOST = {
  bunn: '#f6f9fc', bolig: '#edf2f8', bygg: '#d6e0ec', vann: '#a9cbe9', elv: '#93bde3', park: '#e4ecf4', gress: '#eaf0f6', eng: '#f0f4f9',
  skog: ['#b9cadb', '#c7d5e3', '#aebfd2', '#d0dce8', '#bccbdb'], vatmark: '#d3dee9', sand: '#eef0f3', kirkegard: '#dbe3ec', bane: '#e2e9f1',
  motorvei: '#5f7aa0', hoved: '#7f95b5', sekundar: '#9cadc6', liten: '#bac7d8', sti: '#c9d3e0', kant: '#c3cfdd', jernbane: '#94a4bb',
  tekst: '#00205B', halo: '#ffffff',
};""")
bytt("else if (l.type === 'line' && /boundary/.test(id)) p['line-color'] = 'rgba(246,231,210,.25)';",
     "else if (l.type === 'line' && /boundary/.test(id)) p['line-color'] = 'rgba(0,32,91,.25)';")
# Sporet: rødt i stedet for gult og oransje, så det synes mot snøen
bytt("paint: { 'line-color': '#FF6A3D', 'line-width': 16, 'line-blur': 10, 'line-opacity': .45 }",
     "paint: { 'line-color': '#BA0C2F', 'line-width': 16, 'line-blur': 10, 'line-opacity': .22 }")
bytt("paint: { 'line-color': '#FFD23F', 'line-width': 6, 'line-blur': 1, 'line-opacity': .75 }",
     "paint: { 'line-color': '#BA0C2F', 'line-width': 5, 'line-blur': 1, 'line-opacity': .8 }")
bytt("paint: { 'line-color': '#fff7c2', 'line-width': 3.5, 'line-dasharray': [0, 4, 3] }",
     "paint: { 'line-color': '#ffffff', 'line-width': 3.5, 'line-dasharray': [0, 4, 3] }")

ut = HER / "sherpa" / "index.html"
ut.parent.mkdir(exist_ok=True)
ut.write_text(s, encoding="utf-8")
print(f"Skrev {ut.relative_to(HER)} ({len(s) // 1024} kB)")
