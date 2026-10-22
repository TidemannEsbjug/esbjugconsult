# Lager /new2/ fra forsiden (index.html): samme side, men heroen er kartet over hvor Tidemann er, live, med sporet
# hans i dag og alt telefonen og klokka måler. Kjør på nytt etter endringer i index.html: python3 new2-bygg.py
import re, pathlib

s = pathlib.Path('index.html').read_text()

def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)

rep('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n<meta name="theme-color"')
s = re.sub(r'<video class="hero-v".*?</video>', '<div id="kart" aria-label="Kart: hvor Tidemann er nå"></div>\n  <canvas id="gnist" aria-hidden="true"></canvas>', s, 1, flags=re.S)
s = re.sub(r'  <div class="scene">.*?\n  </div>\n', '''  <div class="paneler">
  <section class="sted gl" aria-live="polite">
    <span class="mono s-t"><i class="s-dot"></i><span class="s-live">Live</span></span>
    <b class="s-navn">Henter posisjonen …</b>
    <span class="s-sub">&nbsp;</span>
  </section>
  <section class="sens gl" aria-label="Alt telefonen og klokka måler">
    <div class="sv" data-k="ibat"><span class="sl">iPhone</span><b>–</b><i class="bar"><i></i></i></div>
    <div class="sv" data-k="wbat"><span class="sl">Klokka</span><b>–</b><i class="bar"><i></i></i></div>
    <div class="sv" data-k="skritt"><span class="sl">Skritt i dag</span><b>–</b></div>
    <div class="sv" data-k="gatt"><span class="sl">Gått i dag</span><b>–</b></div>
    <div class="sv" data-k="etasjer"><span class="sl">Etasjer opp</span><b>–</b></div>
    <div class="sv" data-k="trykk"><span class="sl">Lufttrykk</span><b>–</b></div>
    <div class="sv" data-k="moh"><span class="sl">Høyde</span><b>–</b></div>
    <div class="sv" data-k="haand"><span class="sl">Hånda</span><b>–</b></div>
    <div class="sv" data-k="lyd"><span class="sl">Lyden går til</span><b>–</b></div>
    <div class="sv" data-k="nett"><span class="sl">Nett</span><b>–</b></div>
    <div class="sv" data-k="varme"><span class="sl">Telefonen er</span><b>–</b></div>
    <div class="sv" data-k="volum"><span class="sl">Volum</span><b>–</b></div>
  </section>
  </div>
''', s, 1, flags=re.S)

CSS = r'''  /* /new2: kartet er heroen. Leaflet med OpenStreetMap, gjort mørkt med et filter, så sporet lyser. */
  .hero{background:#05081a}
  #kart{position:absolute;inset:0;z-index:0;background:#05081a}
  #kart .leaflet-tile-pane{filter:invert(1) hue-rotate(195deg) brightness(.78) contrast(1.05) saturate(.55)}
  #kart.leaflet-container{font-family:inherit}
  #kart .leaflet-control-attribution{background:rgba(5,8,26,.6);color:rgba(255,255,255,.45);font-size:10px}
  #kart .leaflet-control-attribution a{color:rgba(255,255,255,.6)}
  #kart .leaflet-control-zoom a{background:rgba(5,8,26,.75);color:#fff;border-color:rgba(255,255,255,.15)}
  #kart .leaflet-bottom.leaflet-left{bottom:8px}
  canvas#gnist{position:absolute;inset:0;z-index:1;width:100%;height:100%;min-height:0;margin:0;pointer-events:none}
  .hero-i{z-index:2;pointer-events:none}
  .hero-i .flyt,.hero-i .gl{pointer-events:auto}
  .spor-glod{filter:blur(6px)}
  .spor-strom{stroke-dasharray:2 18;animation:strom 1.6s linear infinite}
  @keyframes strom{to{stroke-dashoffset:-20}}
  .meg{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#FFD23F 45%,#FF6A3D);box-shadow:0 0 18px 6px rgba(255,210,63,.65),0 0 60px 20px rgba(255,106,61,.35)}
  .meg::before,.meg::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(255,210,63,.7);animation:megRing 2.4s ease-out infinite}
  .meg::after{animation-delay:1.2s}
  @keyframes megRing{from{transform:scale(1);opacity:1}to{transform:scale(3.4);opacity:0}}
  .gammel .meg{filter:grayscale(.6) brightness(.8)}.gammel .meg::before,.gammel .meg::after{animation:none;opacity:0}
  /* Panelene: stedet under toppmodulen, sensorene oppe til høyre. Samme glass som toppmodulen. */
  .paneler{flex:1;width:100%;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-top:14px}
  .sted{display:flex;flex-direction:column;gap:6px;padding:14px 20px 15px;max-width:min(420px,100%)}
  .s-t{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.14em;color:rgba(0,32,91,.7)}
  .s-dot{width:8px;height:8px;border-radius:50%;background:#e0233c;animation:sDot 1.8s ease-out infinite}
  @keyframes sDot{0%{box-shadow:0 0 0 0 rgba(224,35,60,.55)}70%,100%{box-shadow:0 0 0 8px rgba(224,35,60,0)}}
  .gammel .s-dot{background:#8a8fa3;animation:none}
  .s-navn{font:italic 500 clamp(24px,2.6vw,36px)/1.05 var(--serif);letter-spacing:-.015em;color:var(--ink)}
  .s-sub{font-size:14px;font-weight:500;color:rgba(0,32,91,.75)}
  .sens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 20px;padding:16px 20px 16px;width:min(470px,100%);margin-left:auto}
  .sv{min-width:0}
  .sl{display:block;font:600 9.5px/1.3 "SF Mono",Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,32,91,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sv b{display:block;margin-top:3px;font:640 clamp(17px,1.5vw,21px)/1.15 var(--serif);letter-spacing:-.01em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sv .bar{display:block;margin-top:5px;height:4px;border-radius:2px;background:rgba(0,32,91,.12);overflow:hidden}
  .sv .bar i{display:block;height:100%;width:0;border-radius:2px;background:#16a34a;transition:width .8s ease}
  .sv.lav .bar i{background:#e0233c}.sv.lader .bar i{background:linear-gradient(90deg,#16a34a,#FFD23F)}
  .sv.ny b{animation:svNy 1.2s ease}
  @keyframes svNy{0%{color:#e0233c}100%{color:var(--ink)}}
  @media (max-width:760px){.paneler{flex-direction:column;align-items:stretch;justify-content:flex-end}.sens{margin-left:0;width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px;padding:14px 16px}.sted{max-width:none}}
  @media (prefers-reduced-motion:reduce){.spor-strom,.meg::before,.meg::after,.s-dot{animation:none}}
</style>'''
rep('</style>\n</head>', CSS + '\n</head>')

JS = r'''<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
// Kartet i heroen: hvor Tidemann er, live fra iPhonen (GET /chat/spor hvert 5. s), dagens spor som en lysende sti med
// gnister, stedsnavnet, og alt telefonen og klokka måler i panelet. Rulling over kartet ruller siden; dra flytter kartet (ikke på mobil).
(() => {
const mobil = matchMedia('(pointer:coarse)').matches, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const kart = L.map('kart', { zoomControl: false, scrollWheelZoom: false, dragging: !mobil, tap: false, attributionControl: true }).setView([59.9139, 10.7522], 13);
L.control.zoom({ position: 'bottomleft' }).addTo(kart);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(kart);
const $ = q => document.querySelector(q);
const meg = L.marker([0, 0], { icon: L.divIcon({ className: '', html: '<div class="meg"></div>', iconSize: [22, 22] }), interactive: false, keyboard: false });
const lag = [
  L.polyline([], { color: '#FF6A3D', weight: 16, opacity: .35, className: 'spor-glod', interactive: false }),
  L.polyline([], { color: '#FFD23F', weight: 6, opacity: .75, interactive: false }),
  L.polyline([], { color: '#fff', weight: 2, opacity: .9, interactive: false }),
  L.polyline([], { color: '#fff7c2', weight: 3.5, opacity: 1, className: 'spor-strom', lineCap: 'round', interactive: false }),
];
lag.forEach(l => l.addTo(kart));
let live = null, trail = [], tele = {}, forste = true, skew = 0, stier = [], forrige = {};
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111.2e3, (a[1] - b[1]) * 111.2e3 * Math.cos(a[0] * Math.PI / 180));
const km = pts => { let d = 0; for (let i = 1; i < pts.length; i++) if (pts[i] && pts[i - 1]) d += dist(pts[i - 1], pts[i]); return d; };
const linjer = pts => { const ut = [[]]; for (const p of pts) { if (!p) { if (ut[ut.length - 1].length) ut.push([]); } else ut[ut.length - 1].push([p[0], p[1]]); } return ut.filter(l => l.length); };
const tid = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' t ' + Math.round(s % 3600 / 60) + ' min'; };
const tall = n => Math.round(n).toLocaleString('nb-NO');
const sett = (k, v, pct, kl) => {
  const e = document.querySelector('.sv[data-k="' + k + '"]'); if (!e) return;
  const b = e.querySelector('b'), ny = v == null ? '–' : String(v);
  if (b.textContent !== ny) { b.textContent = ny; if (forrige[k] !== undefined) { e.classList.remove('ny'); void e.offsetWidth; e.classList.add('ny'); } forrige[k] = ny; }
  const bar = e.querySelector('.bar i'); if (bar) bar.style.width = (pct ?? 0) + '%';
  e.classList.toggle('lav', pct != null && pct <= 20); e.classList.toggle('lader', !!kl);
};
function tegn() {
  const nå = Date.now() + skew;
  const i = tele.iphone || {}, w = tele.watch || {}, st = tele.sted;
  sett('ibat', i.bat != null ? i.bat + ' %' + (i.lader ? ' ⚡' : '') : null, i.bat, i.lader);
  sett('wbat', w.bat != null ? w.bat + ' %' + (w.lader ? ' ⚡' : '') : null, w.bat, w.lader);
  sett('skritt', i.skritt != null ? tall(i.skritt) : null);
  sett('gatt', i.meter != null ? (i.meter / 1000).toFixed(1).replace('.', ',') + ' km' : trail.length ? (km(trail) / 1000).toFixed(1).replace('.', ',') + ' km' : null);
  sett('etasjer', i.etasjer);
  sett('trykk', i.trykk != null ? String(i.trykk).replace('.', ',') + ' hPa' : null);
  sett('moh', i.moh != null ? i.moh + ' moh' : live && live.alt != null ? Math.round(live.alt) + ' moh' : null);
  sett('haand', w.haand != null ? (w.haand < .02 ? 'i ro' : w.haand < .08 ? 'litt i bevegelse' : 'i full fart') : null);
  sett('lyd', i.lyd);
  sett('nett', i.nett);
  sett('varme', i.varme);
  sett('volum', i.volum != null ? i.volum + ' %' : null);
  if (!live) { $('.s-navn').textContent = 'Ingen posisjon ennå'; $('.s-live').textContent = 'Venter'; document.body.classList.add('gammel'); return; }
  const alder = nå - live.ts, gammel = alder > 10 * 60e3;
  document.body.classList.toggle('gammel', gammel);
  $('.s-live').textContent = gammel ? 'Sist sett ' + tid(alder) + ' siden' : 'Live · ' + tid(alder) + ' siden';
  $('.s-navn').textContent = st && st.by ? [st.strok, st.by].filter(Boolean).join(', ') + (st.kode && st.kode !== 'NO' ? ', ' + st.land : '') : 'Et sted på jorda';
  const fart = live.spd != null && live.spd >= .8 && !gammel && i.aktivitet !== 'står stille' ? Math.round(live.spd * 3.6) + ' km/t' : null;   // GPS-støy gir litt fart også når han står stille
  $('.s-sub').textContent = [i.aktivitet && i.aktivitet[0].toUpperCase() + i.aktivitet.slice(1), fart].filter(Boolean).join(' · ') || ' ';
  const pos = [live.lat, live.lon];
  let spor = linjer(trail); if (spor.length) spor[spor.length - 1].push(pos); else spor = [[pos]];
  lag.forEach(l => l.setLatLngs(spor)); stier = spor;
  meg.setLatLng(pos); if (!kart.hasLayer(meg)) meg.addTo(kart);
  if (forste) { forste = false; kart.setView(pos, 15, { animate: false }); }
  else if (!kart.getBounds().pad(-.2).contains(pos)) kart.panTo(pos);
}
// Gnister langs sporet, flest der han er nå.
const cv = $('#gnist'), cx = cv.getContext('2d'), hero = $('.hero');
let gnister = [];
const storr = () => { const d = devicePixelRatio || 1, r = hero.getBoundingClientRect(); cv.width = r.width * d; cv.height = r.height * d; cx.setTransform(d, 0, 0, d, 0, 0); };
addEventListener('resize', storr); storr();
let synlig = true; new IntersectionObserver(e => { synlig = e[0].isIntersecting; }).observe(hero);
function gnistFrame() {
  requestAnimationFrame(gnistFrame);
  if (!synlig || still) return;
  const W = cv.width / (devicePixelRatio || 1), H = cv.height / (devicePixelRatio || 1);
  cx.clearRect(0, 0, W, H);
  const pts = stier.flat(); if (pts.length < 2) return;
  for (let i = 0; i < 3; i++) {
    const k = Math.min(pts.length - 1, Math.floor(pts.length * Math.pow(Math.random(), .45)));
    const p = kart.latLngToContainerPoint(pts[k]);
    gnister.push({ x: p.x + (Math.random() - .5) * 8, y: p.y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * .5, vy: -Math.random() * .7 - .1, l: 1, r: Math.random() * 2 + .8 });
  }
  gnister = gnister.filter(g => (g.l -= .014) > 0).slice(-260);
  for (const g of gnister) { g.x += g.vx; g.y += g.vy; cx.globalAlpha = g.l; cx.fillStyle = g.l > .6 ? '#fff7c2' : '#FFD23F'; cx.shadowColor = '#FFD23F'; cx.shadowBlur = 8; cx.beginPath(); cx.arc(g.x, g.y, g.r * g.l, 0, 7); cx.fill(); }
  cx.globalAlpha = 1; cx.shadowBlur = 0;
}
kart.on('movestart zoomstart', () => { gnister = []; });
requestAnimationFrame(gnistFrame);
async function hent() {
  try { const j = await (await fetch('/chat/spor', { cache: 'no-store' })).json(); skew = j.now - Date.now(); live = j.live; trail = j.trail || []; tele = j.tele || {}; } catch {}
  tegn();
}
hent(); setInterval(() => { if (!document.hidden) hent(); }, 5000);
setInterval(tegn, 1000);
})();
</script>
'''
rep('\n</body>', '\n' + JS + '</body>')
pathlib.Path('new2').mkdir(exist_ok=True)
pathlib.Path('new2/index.html').write_text(s)
print('new2/index.html skrevet', len(s))
