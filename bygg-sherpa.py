#!/usr/bin/env python3
"""Lager /sherpa/ (sherpa/index.html) fra forsiden (index.html).

Øverst kommer en ny hero (AI-sherpaen, vinterbildet fra Midjourney i media/sherpa.*), ruten i fire leirer
med avstemningen (/chat/poll i .worker/chat.js) og utstyret (AI-abonnementene, flyttet ut av kartpanelet).
Rett under ligger kartdelen og resten av forsiden uendret. Siden har noindex mens den er et forsøk.
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

# --- AI-abonnementene flyttes fra kartpanelet til «Utstyret i sekken» ---
m = re.search(r'  <!-- Aktive AI-abonnementer[^\n]*\n  <section class="abo gl".*?</section>\n', s, re.S)
if not m:
    raise SystemExit("bygg-sherpa: fant ikke abonnementspanelet (.abo) i index.html")
abo = m.group(0)
s = s.replace(abo, "")
abo = re.sub(r'  <!--[^\n]*-->\n', "", abo).replace('class="abo gl"', 'class="abo"').strip()

CSS = """
  /* ===== /sherpa/: AI-sherpaen (bygges av bygg-sherpa.py) ===== */
  .sh-hero,.sh-rute{width:100%;flex:none}
  .natt-lag{display:none}
  .focus .sh-hero,.focus .sh-rute{opacity:0;filter:blur(8px);pointer-events:none}
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

  .sh-rute{background:#fff;color:#00205B;padding:clamp(56px,8vw,112px) var(--g) clamp(40px,5vw,64px)}
  .sh-w{max-width:1180px;margin:0 auto}
  .sh-k{margin:0 0 14px;font:600 12px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,32,91,.6);display:flex;align-items:center;gap:9px}
  .sh-rute h2{margin:0 0 clamp(28px,4vw,48px);font:500 clamp(32px,4vw,56px)/1.05 var(--serif);letter-spacing:-.02em;max-width:16em}
  .sh-rute h2 i{font-weight:400}
  .sh-profil{position:relative;height:130px;margin-bottom:22px}
  .sh-profil svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .sh-fjell{fill:#eef3fb}
  .sh-sti{fill:none;stroke:#00205B;stroke-width:2;stroke-dasharray:2 7;stroke-linecap:round;opacity:.55}
  .sh-pk{position:absolute;width:16px;height:16px;margin-top:-8px;border-radius:50%;background:#fff;border:2.5px solid #00205B;box-sizing:border-box;transition:background .3s,transform .3s}
  .sh-pk:nth-of-type(1){left:0;top:88.5%}.sh-pk:nth-of-type(2){left:26%;top:65.4%}.sh-pk:nth-of-type(3){left:52%;top:42.3%}.sh-pk:nth-of-type(4){left:78%;top:16.9%;background:#BA0C2F;border-color:#BA0C2F}
  .sh-pk.her{background:#BA0C2F;border-color:#BA0C2F;transform:scale(1.25);box-shadow:0 0 0 0 rgba(186,12,47,.45);animation:shPuls 2s ease-out infinite}
  .sh-leirer{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);column-gap:4%}
  .sh-leirer li{position:relative}
  .sh-nr{display:block;font:600 12px/1 "SF Mono",Menlo,monospace;color:rgba(0,32,91,.5);margin-bottom:10px}
  .sh-leirer h3{margin:0 0 8px;font:500 24px/1.15 var(--serif);letter-spacing:-.01em}
  .sh-leirer p{margin:0;font:400 16px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:rgba(0,32,91,.82)}
  .sh-her{display:none;margin-top:12px;font:600 12px/1 "SF Mono",Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#BA0C2F}
  .sh-leirer li.her .sh-her{display:inline-block}
  @media (max-width:760px){
    .sh-profil{display:none}
    .sh-leirer{grid-template-columns:1fr;row-gap:26px;padding-left:28px;border-left:2px dashed rgba(0,32,91,.25);margin-left:7px}
    .sh-leirer li::before{content:"";position:absolute;left:-38px;top:-2px;width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid #00205B;box-sizing:border-box}
    .sh-leirer li:last-child::before,.sh-leirer li.her::before{background:#BA0C2F;border-color:#BA0C2F}
  }

  .sh-to{display:grid;grid-template-columns:1.25fr 1fr;gap:clamp(20px,3vw,36px);margin-top:clamp(48px,6vw,84px);align-items:start}
  .sh-kort{border-radius:22px;padding:clamp(22px,3vw,34px)}
  .sh-poll{background:#eef3fb}
  .sh-kort h3{margin:0 0 6px;font:500 clamp(24px,2.4vw,32px)/1.15 var(--serif);letter-spacing:-.01em}
  .sh-kort>p{margin:0 0 20px;font:400 16px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:rgba(0,32,91,.75)}
  .sh-valg{display:grid;gap:10px}
  .sh-valg button{--p:0%;position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:16px 18px;border:1.5px solid rgba(0,32,91,.14);border-radius:14px;background:#fff;color:#00205B;font:500 16px/1.3 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;text-align:left;cursor:pointer;overflow:hidden;isolation:isolate;transition:border-color .2s}
  .sh-valg button:hover{border-color:rgba(0,32,91,.45)}
  .sh-valg button::before{content:"";position:absolute;inset:0;width:var(--p);background:rgba(116,168,212,.28);z-index:-1;transition:width .6s cubic-bezier(.3,.8,.3,1)}
  .sh-valg button[aria-pressed="true"]{border-color:#BA0C2F}
  .sh-valg button[aria-pressed="true"]::before{background:rgba(186,12,47,.13)}
  .sh-v-n{font:600 11px/1 "SF Mono",Menlo,monospace;color:rgba(0,32,91,.45);margin-right:12px}
  .sh-v-t{flex:1}
  .sh-v-p{font:600 14px/1 "SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums}
  .sh-valg button[aria-pressed="true"] .sh-v-p::after{content:" ✓";color:#BA0C2F}
  .sh-poll-s{margin:16px 0 0;font:400 14px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:rgba(0,32,91,.7);min-height:1.5em}
  .sh-poll-s a{color:#BA0C2F;font-weight:600}
  .sh-poll:not(.svart) .sh-etter{display:none}
  .sh-utstyr{border:1.5px solid rgba(0,32,91,.12)}
  .sh-utstyr .abo{display:block;padding:0;cursor:default}
  .sh-utstyr .abo>.s-t,.sh-utstyr .abo-ant{display:none}
  .sh-utstyr .abo .abo-l{max-height:none!important;opacity:1!important;margin-top:0!important;gap:14px 18px}
  .sh-utstyr .abo-l li{font-size:17px}
  .sh-utstyr .abo-i{width:30px;height:30px;padding:6px;border-radius:9px}
  .sh-bro{margin-top:clamp(56px,7vw,96px);display:flex;align-items:end;justify-content:space-between;gap:12px 32px;flex-wrap:wrap}
  .sh-bro h2{margin:0}
  .sh-bro p{margin:0;max-width:26em;font:400 16px/1.5 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:rgba(0,32,91,.75)}
  @media (max-width:860px){.sh-to{grid-template-columns:1fr}}
"""
bytt("</style>\n</head>", CSS + "</style>\n</head>")

LOGO = ('<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" fill="#00205B"/>'
        '<circle cx="16" cy="16" r="9" fill="#BA0C2F" stroke="#fff" stroke-width="3"/></svg>')
PIL = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
       'stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>')

LEIRER = [
    ("Baseleiren", "Jeg ser på hvordan du jobber i dag, hvilke systemer du har og hvor det stopper opp."),
    ("Leir 1", "Vi legger grunnmuren: kontoer, tilganger, data og sikkerhet satt opp riktig fra start."),
    ("Leir 2", "Jeg bygger og kobler sammen det som mangler, som nettside, app eller interne verktøy, så arbeidet flyter."),
    ("Toppen", "Systemene står, og du bruker AI i hverdagen. Nå kan du nyte utsikten."),
]
SVAR = ["Vet ikke hvor vi skal begynne", "Vet hva vi trenger, mangler oppsettet", "Har noe på plass, men det henger ikke sammen", "Systemene står, vil bruke AI mer"]

leirer = "\n".join(
    f'      <li><span class="sh-nr">0{i + 1}</span><h3>{n}</h3><p>{t}</p><b class="sh-her">Du er her</b></li>'
    for i, (n, t) in enumerate(LEIRER))
svar = "\n".join(
    f'        <button type="button" aria-pressed="false"><span class="sh-v-t"><span class="sh-v-n">0{i + 1}</span>{t}</span><span class="sh-v-p"></span></button>'
    for i, t in enumerate(SVAR))

HTML = f"""<section class="sh-hero" aria-label="AI-sherpaen">
  <picture class="sh-bilde"><source type="image/webp" media="(max-width:760px)" srcset="/media/sherpa-900.webp"><source type="image/webp" srcset="/media/sherpa.webp"><img src="/media/sherpa.jpg" alt="Tegning av et taulag på vei opp en snødekt fjellrygg i Norge, med en rød hytte nede i dalen" width="1680" height="720" fetchpriority="high"></picture>
  <canvas class="sh-sno" aria-hidden="true"></canvas>
  <nav class="sh-nav"><a class="sh-merke" href="/sherpa/">{LOGO}Esbjug Consult <span>· AI-sherpaen</span></a><div class="sh-lenker"><a href="#ruten">Ruten</a><a href="#live">Live</a><a class="sh-kontakt" href="mailto:tidemann@esbjugconsult.com">Kontakt</a></div></nav>
  <div class="sh-i">
    <p class="sh-ey">AI-sherpaen Tidemann Esbjug</p>
    <h1>Du velger toppen. <i>Jeg bærer utstyret opp.</i></h1>
    <p class="sh-ingress">Du vil være helt i front med AI, men å få systemene på plass kan være tungt. Det er der jeg kommer inn.</p>
    <div class="sh-cta"><a class="sh-knapp sh-p" href="mailto:tidemann@esbjugconsult.com">Snakk med meg</a><a class="sh-knapp sh-s" href="#live">Se hvor jeg er nå {PIL}</a></div>
    <p class="sh-live" hidden><i class="sh-prikk"></i><span>Live:</span> <span class="sh-sted">Henter posisjonen …</span></p>
  </div>
</section>
<section class="sh-rute" id="ruten" aria-label="Ruten">
  <div class="sh-w">
    <p class="sh-k">&gt; Ruten</p>
    <h2>Fire leirer, fra der du står til <i>toppen</i>.</h2>
    <div class="sh-profil" aria-hidden="true">
      <svg viewBox="0 0 1000 130" preserveAspectRatio="none"><path class="sh-fjell" d="M0 130V117C4 116 6 115 8 115C90 108 180 96 268 85C360 74 440 66 528 55C620 44 700 30 788 22C860 16 930 12 1000 8V130Z"/><path class="sh-sti" vector-effect="non-scaling-stroke" d="M0 117C4 116 6 115 8 115C90 108 180 96 268 85C360 74 440 66 528 55C620 44 700 30 788 22C860 16 930 12 1000 8"/></svg>
      <i class="sh-pk"></i><i class="sh-pk"></i><i class="sh-pk"></i><i class="sh-pk"></i>
    </div>
    <ol class="sh-leirer">
{leirer}
    </ol>
    <div class="sh-to">
      <div class="sh-kort sh-poll">
        <h3>Hvor står bedriften din i dag?</h3>
        <p>Velg leiren som passer. Du ser svarene til alle med en gang.</p>
        <div class="sh-valg" role="group" aria-label="Hvor står bedriften din i dag?">
{svar}
        </div>
        <p class="sh-poll-s" aria-live="polite"><span class="sh-etter"><span class="sh-sum"></span> · Ruten starter der du står i dag. <a href="mailto:tidemann@esbjugconsult.com">Snakk med meg</a></span></p>
      </div>
      <div class="sh-kort sh-utstyr">
        <h3>Utstyret i sekken</h3>
        <p>AI-abonnementene jeg betaler for selv, dyrest først.</p>
        {abo}
      </div>
    </div>
    <div class="sh-bro">
      <div><p class="sh-k"><i class="sh-prikk"></i> Live</p><h2>Hvor jeg er nå</h2></div>
      <p>Kartet, pulsen og maskinene oppdateres mens du ser på.</p>
    </div>
  </div>
</section>
"""
bytt('<header class="hero">', HTML + '<header class="hero" id="live">')

JS = """<script>
// /sherpa/: snø over bildet, stedet fra kartpanelet i heroen, og avstemningen (GET/POST /chat/poll).
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
    const tegn = () => {
      if (synlig && !document.hidden) {
        x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath();
        for (const p of f) {
          p.y += p.v; p.s += .012; p.x += Math.sin(p.s) * .25;
          if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
          x.moveTo(p.x + p.r, p.y); x.arc(p.x, p.y, p.r, 0, 6.283);
        }
        x.fill();
      }
      requestAnimationFrame(tegn);
    };
    tegn();
  }

  const poll = $('.sh-poll'); if (!poll) return;
  const knapper = [...poll.querySelectorAll('.sh-valg button')];
  const merk = [...document.querySelectorAll('.sh-leirer li'), ...document.querySelectorAll('.sh-pk')];
  let mitt = null, vid = null, siste = null, nr = 0, vist = 0;
  try { const v = localStorage.getItem('sherpa_valg'); mitt = v == null ? null : Number(v); vid = localStorage.getItem('sherpa_vid'); } catch {}
  if (!(mitt >= 0 && mitt < knapper.length)) mitt = null;
  if (!vid) { vid = crypto.randomUUID ? crypto.randomUUID() : 'v' + String(Math.random()).slice(2) + Date.now(); try { localStorage.setItem('sherpa_vid', vid); } catch {} }
  const vis = () => {
    const sum = siste ? siste.reduce((a, b) => a + b, 0) : 0, svart = mitt != null && sum > 0;
    poll.classList.toggle('svart', svart);
    // Hele prosent som alltid blir 100 til sammen (største rest får resten).
    const pr = svart ? siste.map(t => t / sum * 100) : knapper.map(() => 0), hel = pr.map(Math.floor);
    if (svart) pr.map((p, i) => [p - hel[i], i]).sort((a, b) => b[0] - a[0]).slice(0, 100 - hel.reduce((a, b) => a + b, 0)).forEach(([, i]) => hel[i]++);
    knapper.forEach((k, i) => {
      const p = hel[i];
      k.setAttribute('aria-pressed', String(i === mitt));
      k.style.setProperty('--p', p + '%');
      k.querySelector('.sh-v-p').textContent = svart ? p + ' %' : '';
    });
    merk.forEach(el => el.classList.toggle('her', mitt != null && [...el.parentNode.children].filter(n => n.tagName === el.tagName).indexOf(el) === mitt));
    poll.querySelector('.sh-sum').textContent = sum === 1 ? '1 svar' : sum.toLocaleString('nb-NO') + ' svar';
  };
  // Hvert svar har et nummer; et svar som er eldre enn det som vises, kastes.
  const ta = (n, j) => { if (n >= vist && j && Array.isArray(j.tall)) { vist = n; siste = j.tall; vis(); } };
  const hent = () => { const n = ++nr; return fetch('/chat/poll?id=sherpa', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => ta(n, j)).catch(() => {}); };
  knapper.forEach((k, i) => k.addEventListener('click', () => {
    if (i === mitt) return;
    const forrige = mitt, for_ = siste, n = ++nr; mitt = i; vist = n;
    siste = siste ? siste.slice() : knapper.map(() => 0);
    if (forrige != null && siste[forrige] > 0) siste[forrige]--;
    siste[i]++; vis();
    const angre = () => { if (mitt === i) { mitt = forrige; siste = for_; vis(); } };
    fetch('/chat/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'sherpa', valg: i, vid }) })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j) return angre();
        try { localStorage.setItem('sherpa_valg', String(i)); } catch {}
        ta(n, j);
      }).catch(angre);
  }));
  vis(); hent();
  setInterval(() => { if (!document.hidden) hent(); }, 20000);
})();
</script>
"""
bytt("</body>", JS + "</body>")

ut = HER / "sherpa" / "index.html"
ut.parent.mkdir(exist_ok=True)
ut.write_text(s, encoding="utf-8")
print(f"Skrev {ut.relative_to(HER)} ({len(s) // 1024} kB)")
