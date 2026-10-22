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
  <div class="venstre">
  <section class="sted gl" aria-live="polite">
    <span class="mono s-t"><i class="s-dot"></i><span class="s-live">Live</span></span>
    <b class="s-navn">Henter posisjonen …</b>
    <span class="s-sub">&nbsp;</span>
    <div class="kast"><button type="button" class="k-le" aria-label="Le av Tidemann">😂 <span>Le</span> <b>0</b></button><button type="button" class="k-tomat" aria-label="Kast en tomat på Tidemann">🍅 <span>Kast tomat</span> <b>0</b></button></div>
  </section>
  <section class="gjor gl" hidden aria-live="polite">
    <span class="mono s-t">Holder på med</span>
    <b class="g-navn">–</b>
  </section>
  </div>
  <div class="hoyre">
  <section class="sens gl" aria-label="Alt telefonen og klokka måler">
    <!--PULS-->
    <div class="sv" data-k="ibat"><span class="sl">iPhone</span><b>–</b><i class="bar"><i></i></i></div>
    <div class="sv" data-k="wbat"><span class="sl">Klokka</span><b>–</b><i class="bar"><i></i></i></div>
    <div class="sv" data-k="skritt"><span class="sl">Skritt i dag</span><b>–</b></div>
    <div class="sv" data-k="gatt"><span class="sl">Gått i dag</span><b>–</b></div>
    <div class="sv" data-k="lyd"><span class="sl">I ørene</span><b>–</b></div>
    <div class="sv" data-k="volum"><span class="sl">Volum</span><b>–</b><i class="bar"><i></i></i></div>
    <div class="sv" data-k="nett"><span class="sl">Nett</span><b>–</b></div>
  </section>
  <section class="akse gl" aria-label="Akselerometeret i klokka og telefonen, live">
    <div class="ak"><div class="ak-h"><span class="sl">Klokka · akselerometer</span><span class="ak-m">20 Hz · g</span></div><canvas class="ak-c" data-k="watch"></canvas></div>
    <div class="ak"><div class="ak-h"><span class="sl">iPhone · akselerometer</span><span class="ak-m"><i class="kx">x</i> <i class="ky">y</i> <i class="kz">z</i></span></div><canvas class="ak-c" data-k="iphone"></canvas></div>
  </section>
  </div>
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
  /* Le og kast tomat: felles tellere for alle som ser på. Tomaten flyr i en bue og splatter på kortet. */
  .paneler .gl{position:relative}
  .kast{display:flex;gap:8px;margin-top:8px}
  .kast button{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,32,91,.18);background:rgba(255,255,255,.55);color:var(--ink);border-radius:999px;padding:7px 12px 7px 10px;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;transition:transform .15s,background .2s}
  .kast button:hover{background:#fff;transform:translateY(-1px)}
  .kast button:active{transform:scale(.94)}
  .kast b{font-variant-numeric:tabular-nums;opacity:.6;font-weight:700}
  .kast button.puff{animation:puff .35s ease}
  @keyframes puff{50%{transform:scale(1.12)}}
  .flyr{position:fixed;z-index:3000;left:0;top:0;font-size:34px;line-height:1;pointer-events:none;will-change:transform}
  .le-fx{position:fixed;z-index:3000;pointer-events:none;font-size:26px;line-height:1;animation:leOpp 1.6s cubic-bezier(.2,.7,.3,1) forwards}
  @keyframes leOpp{0%{opacity:0;transform:translate(0,0) scale(.4)}15%{opacity:1;transform:translate(calc(var(--dx)*.2),-20px) scale(1.1)}100%{opacity:0;transform:translate(var(--dx),-150px) scale(.9) rotate(var(--rot))}}
  .splat{position:absolute;z-index:5;pointer-events:none;width:150px;height:150px;margin:-75px 0 0 -75px;transform-origin:50% 50%;animation:splatInn .22s cubic-bezier(.2,1.6,.4,1) forwards, splatUt .9s ease 3.6s forwards}
  @keyframes splatInn{from{transform:scale(.2) rotate(var(--rot))}to{transform:scale(1) rotate(var(--rot))}}
  @keyframes splatUt{to{opacity:0}}
  .splat .dr{animation:drypp 3.2s cubic-bezier(.5,0,.8,.6) .25s forwards}
  @keyframes drypp{to{transform:translateY(46px) scaleY(1.6)}}
  .taper{position:absolute;z-index:6;pointer-events:none;transform:translate(-50%,-50%) rotate(var(--rot));white-space:nowrap;font:italic 800 clamp(22px,2.4vw,32px)/1 var(--serif);letter-spacing:-.02em;color:#fff;-webkit-text-stroke:1.5px #b0140c;text-shadow:0 3px 0 #b0140c,0 6px 18px rgba(120,0,0,.45);animation:taperInn .5s cubic-bezier(.2,1.8,.4,1) both,taperUt .5s ease 2.4s forwards}
  @keyframes taperInn{from{opacity:0;transform:translate(-50%,-50%) rotate(var(--rot)) scale(.2)}to{opacity:1;transform:translate(-50%,-50%) rotate(var(--rot)) scale(1)}}
  @keyframes taperUt{to{opacity:0;transform:translate(-50%,-90%) rotate(var(--rot)) scale(1.1)}}
  .paneler .gl{overflow:visible}
  .paneler .gl.truffet{animation:truffet .4s cubic-bezier(.36,.07,.19,.97)}
  @keyframes truffet{20%{transform:translate(-5px,3px) rotate(-1.2deg)}45%{transform:translate(5px,-2px) rotate(1deg)}70%{transform:translate(-2px,1px)}}
  .gjor{display:flex;flex-direction:column;gap:6px;padding:14px 20px 15px}
  .gjor[hidden]{display:none}
  .g-navn{font:italic 500 clamp(24px,2.6vw,36px)/1.05 var(--serif);letter-spacing:-.015em;color:var(--ink)}
  .s-navn.kjent{font-size:clamp(20px,2vw,28px);line-height:1.15}
  .sens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 20px;padding:16px 20px 16px;width:min(470px,100%);margin-left:auto}
  .sv{min-width:0}
  .sl{display:block;font:600 9.5px/1.3 "SF Mono",Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,32,91,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sv b{display:block;margin-top:3px;font:640 clamp(17px,1.5vw,21px)/1.15 var(--serif);letter-spacing:-.01em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sv .bar{display:block;margin-top:5px;height:4px;border-radius:2px;background:rgba(0,32,91,.12);overflow:hidden}
  .sv .bar i{display:block;height:100%;width:0;border-radius:2px;background:#16a34a;transition:width .8s ease}
  .sv.lav .bar i{background:#e0233c}.sv.lader .bar i{background:linear-gradient(90deg,#16a34a,#FFD23F)}
  .sv.ny b{animation:svNy 1.2s ease}
  .sv{position:relative}
  .sv .fon,.sv .pil{position:absolute;right:0;top:0;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
  .sv .fon{width:12px;height:20px;border:2px solid var(--ink);border-radius:3px;opacity:.75;transform-origin:50% 50%}
  .sv .fon::after{content:"";position:absolute;left:50%;bottom:1px;width:3px;height:1.5px;margin-left:-1.5px;background:var(--ink)}
  .sv .pil{font-size:15px;line-height:1;color:#e0233c;transform-origin:50% 50%}
  .sv:has(.fon) b,.sv:has(.pil) b{padding-right:20px}
  .enhet{grid-column:1/-1;margin:2px 0 0;padding-top:10px;border-top:1px solid rgba(0,32,91,.12);font:600 9.5px/1.3 "SF Mono",Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,32,91,.55)}
  .enhet:empty{display:none}
  @media (min-width:1100px){.sens{grid-template-columns:repeat(4,minmax(0,1fr));width:min(620px,100%)}}
  .venstre{display:flex;flex-direction:column;gap:14px;width:min(360px,100%)}
  .hoyre{display:flex;flex-direction:column;gap:14px;margin-left:auto;width:min(400px,100%)}
  @media (min-width:1100px){.hoyre{width:min(440px,100%)}.hoyre .sens{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .hoyre .sens{width:100%;margin-left:0}
  /* Akselerometrene: tre kurver (x, y, z) i g, rullende 10 s, som et oscilloskop. */
  .akse{display:flex;flex-direction:column;gap:10px;padding:14px 18px 14px}
  .ak-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
  .ak-m{font:600 9.5px/1 "SF Mono",Menlo,monospace;letter-spacing:.1em;color:rgba(0,32,91,.5)}
  .ak-m i{font-style:normal;font-weight:800}.kx{color:#e0233c}.ky{color:#d68a00}.kz{color:#2563eb}
  .ak-c{display:block;width:100%;height:64px;min-height:0;margin:6px 0 0}
  .venstre .sted{max-width:none}
  /* Pulsen øverst i panelet til høyre, over hele bredden. */
  .sens .hp{grid-column:1/-1;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid rgba(0,32,91,.12)}
  .sens .hp .st-v{font:640 clamp(26px,2.4vw,34px)/1 var(--serif);letter-spacing:-.02em;gap:10px;color:var(--ink)}
  .sens .hp .g{display:none}
  .sens .hp{flex-wrap:wrap}
  .sens .hp .hp-o{flex:1 1 100%;min-width:0}
  .sens .hp .st-l{flex-basis:100%}
  .sens .hp .st-v{width:100%}
  .hk{flex:1 1 220px;min-width:180px;height:40px;overflow:visible}
  .hk-l{fill:none;stroke:#e0233c;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
  .hk-p{fill:#e0233c;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke}
  .hk-x{display:none}
  .sens .hp .st-l{font:600 9.5px/1.3 "SF Mono",Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,32,91,.6)}

  @keyframes svNy{0%{color:#e0233c}100%{color:var(--ink)}}
  @media (max-width:760px){.venstre,.hoyre{width:100%}.paneler{flex-direction:column;align-items:stretch;justify-content:flex-end}.sens{margin-left:0;width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px;padding:14px 16px}.sted{max-width:none}}
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
  // Bare typen, ikke merkenavnet: earbuds, headset eller ingen.
  sett('lyd', i.lyd == null ? null : /^(høyttaler|telefonen)$/.test(i.lyd) ? 'Ingen' : /pods|buds|pop|ear|fit|dots/i.test(i.lyd) ? 'Earbuds' : 'Headset');
  sett('nett', i.nett === 'Wi-Fi' ? 'Wi-Fi' : i.nett === 'mobil' || i.nett === 'mobilnett' ? 'Mobildata' : i.nett === 'ingen' ? 'Uten nett' : i.nett);
  sett('volum', i.volum != null ? i.volum + ' %' : null, i.volum);
  for (const k of ['iphone', 'watch']) inn(k, tele[k]);
  if (!live) { $('.s-navn').textContent = 'Ingen posisjon ennå'; $('.s-live').textContent = 'Venter'; document.body.classList.add('gammel'); return; }
  const alder = nå - live.ts, gammel = alder > 10 * 60e3;
  document.body.classList.toggle('gammel', gammel);
  $('.s-live').textContent = gammel ? 'Sist sett ' + tid(alder) + ' siden' : 'Live · ' + tid(alder) + ' siden';
  $('.s-navn').classList.toggle('kjent', !!live.kjent);
  $('.s-navn').textContent = live.kjent ? 'Tidemann er ' + live.kjent : st && st.by ? [st.strok, st.by].filter(Boolean).join(', ') + (st.kode && st.kode !== 'NO' ? ', ' + st.land : '') : 'Et sted på jorda';
  const fart = live.spd != null && live.spd >= .8 && !gammel && i.aktivitet !== 'står stille' ? Math.round(live.spd * 3.6) + ' km/t' : null;   // GPS-støy gir litt fart også når han står stille
  $('.s-sub').textContent = fart || '';
  $('.s-sub').hidden = !fart;
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
// Akselerometrene: pakkene (20 målinger i sekundet, hver 5. s) spilles av jevnt, 7 s bak sanntid, så det ser live ut.
const RATE = 50, FORS = 7000, VIN = 10000, AK = {};
function inn(k, t) {
  if (!t || !t.acc || !t.ts) return;
  const a = AK[k] || (AK[k] = { sist: 0, s: [] });
  if (t.ts <= a.sist) return;
  a.sist = t.ts;
  const rader = t.acc.split(';').map(r => r.split(',').map(n => +n / 100));
  rader.forEach((r, n) => a.s.push([t.ts - (rader.length - 1 - n) * RATE, r[0], r[1], r[2]]));
  a.s = a.s.filter(p => p[0] > t.ts - 30000);
}
function oskilloskop() {
  requestAnimationFrame(oskilloskop);
  if (!synlig) return;
  const nå = Date.now() + skew - FORS, d = devicePixelRatio || 1;
  for (const c of document.querySelectorAll('.ak-c')) {
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W * d) { c.width = W * d; c.height = H * d; }
    const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, W, H);
    const Y = g => H / 2 - g / 2 * (H / 2 - 3);   // ±2 g
    x.strokeStyle = 'rgba(0,32,91,.12)'; x.lineWidth = 1; x.setLineDash([2, 3]);
    for (const g of [-1, 1]) { x.beginPath(); x.moveTo(0, Y(g)); x.lineTo(W, Y(g)); x.stroke(); }
    x.setLineDash([]); x.strokeStyle = 'rgba(0,32,91,.25)'; x.beginPath(); x.moveTo(0, Y(0)); x.lineTo(W, Y(0)); x.stroke();
    x.fillStyle = 'rgba(0,32,91,.4)'; x.font = '600 8px "SF Mono",Menlo,monospace'; x.fillText('+1', 2, Y(1) - 2); x.fillText('−1', 2, Y(-1) - 2);
    const a = AK[c.dataset.k]; if (!a) continue;
    const pts = a.s.filter(p => p[0] > nå - VIN && p[0] <= nå);
    if (pts.length < 2) continue;
    [['#e0233c', 1], ['#d68a00', 2], ['#2563eb', 3]].forEach(([farge, i]) => {
      x.strokeStyle = farge; x.lineWidth = 1.6; x.lineJoin = 'round'; x.beginPath();
      pts.forEach((p, n) => { const px = W - (nå - p[0]) / VIN * W, py = Y(Math.max(-2, Math.min(2, p[i]))); n ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.stroke();
    });
  }
}
requestAnimationFrame(oskilloskop);
// Pulsen siste 5 minutter: hver måling er et punkt, siste punkt er nå. Skalaen følger tallene (minst 20 slag høy).
let puls = [];
function tegnPuls() {
  const l = document.querySelector('.hk-l'), p = document.querySelector('.hk-p'); if (!l) return;
  const nå = Date.now() + skew, fra = nå - 5 * 60e3, pts = puls.filter(q => q[0] > fra);
  if (pts.length < 2) { l.setAttribute('d', ''); p.setAttribute('cx', -9); return; }
  let lo = Math.min(...pts.map(q => q[1])), hi = Math.max(...pts.map(q => q[1]));
  const midt = (lo + hi) / 2, h = Math.max(20, hi - lo + 6); lo = midt - h / 2; hi = midt + h / 2;
  const X = t => (t - fra) / (5 * 60e3) * 200, Y = b => 38 - (b - lo) / (hi - lo) * 36;
  let d = '', forr = 0;
  for (const [t, b] of pts) { d += (d && t - forr < 30e3 ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(b).toFixed(1); forr = t; }
  l.setAttribute('d', d);
  const s = pts[pts.length - 1]; p.setAttribute('cx', X(s[0]).toFixed(1)); p.setAttribute('cy', Y(s[1]).toFixed(1));
}
setInterval(tegnPuls, 1000);
// Le og kast tomat. Egne trykk vises med en gang; andres ser du når tellerne øker (høyst 4 av gangen).
let kast = null, egne = { le: 0, tomat: 0 };
const knapp = k => document.querySelector(k === 'le' ? '.k-le' : '.k-tomat');
// Ordet som spretter opp der tomaten treffer.
const TAPER = ['TAPER!', 'Taper.', 'Tapern!', 'Taperen!', 'TAAAAPER', 'Din taper', 'For en taper', 'Supertaper', 'Megataper', 'Ultrataper',
  'Tapersjef', 'Taperkonge', 'Årets taper', 'Taper (igjen)', 'Taper-Tidemann', 'Taper, taper, taper', 'Taperen fra Frogn', 'TAPER™', 'Verdens største taper', 'Liten taper'];
function visKast(k, fraX) {
  const b = knapp(k); b.classList.remove('puff'); void b.offsetWidth; b.classList.add('puff');
  const r = b.getBoundingClientRect();
  if (k === 'le') {
    for (let n = 0; n < 7; n++) {
      const e = document.createElement('span'); e.className = 'le-fx'; e.textContent = ['😂', '🤣', '😆'][n % 3];
      e.style.left = r.left + r.width * .25 + Math.random() * 20 + 'px'; e.style.top = r.top - 6 + 'px';
      e.style.setProperty('--dx', (Math.random() - .5) * 120 + 'px'); e.style.setProperty('--rot', (Math.random() - .5) * 60 + 'deg');
      e.style.animationDelay = n * 70 + 'ms'; document.body.append(e); setTimeout(() => e.remove(), 2400);
    }
    return;
  }
  // Tomaten treffer et tilfeldig panel (stedet, holder på med, målingene, akselerometrene; ikke språkvalget), et tilfeldig sted på det.
  const mål = [...document.querySelectorAll('.paneler .gl')].filter(e => !e.hidden && e.offsetWidth);
  const kort = mål[Math.floor(Math.random() * mål.length)] || $('.sted'), kr = kort.getBoundingClientRect();
  const mx = kr.width * (.2 + Math.random() * .6), my = kr.height * (.15 + Math.random() * .45);
  // Kastet kommer fra den som ser på: stor nedenfra, under der man klikket (andres kast fra et tilfeldig sted),
  // og blir mindre mens den flyr inn i skjermen mot kortet.
  const x0 = fraX ?? innerWidth * (.15 + Math.random() * .7), y0 = innerHeight + 60, x1 = kr.left + mx, y1 = kr.top + my;
  const t = document.createElement('span'); t.className = 'flyr'; t.textContent = '🍅'; document.body.append(t);
  const steg = [], N = 18, spinn = (Math.random() < .5 ? -1 : 1) * (360 + Math.random() * 360);
  for (let n = 0; n <= N; n++) {
    const f = n / N, e = 1 - Math.pow(1 - f, 2), x = x0 + (x1 - x0) * e - 17, y = y0 + (y1 - y0) * e - Math.min(220, innerHeight * .3) * 4 * f * (1 - f) - 17;
    steg.push({ transform: `translate(${x}px,${y}px) rotate(${f * spinn}deg) scale(${(6.5 - 5.6 * e).toFixed(2)})`, filter: `blur(${((1 - f) * 3).toFixed(1)}px)` });
  }
  t.animate(steg, { duration: still ? 1 : 640, easing: 'linear' }).onfinish = () => {
    t.remove();
    kort.classList.remove('truffet'); void kort.offsetWidth; kort.classList.add('truffet');
    const sp = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sp.setAttribute('class', 'splat'); sp.setAttribute('viewBox', '-75 -75 150 150');
    sp.style.left = mx + 'px'; sp.style.top = my + 'px'; sp.style.setProperty('--rot', Math.random() * 360 + 'deg');
    // En klatt med ujevn kant, sprut rundt og noen dråper som renner nedover.
    let d = ''; const K = 16; for (let n = 0; n <= K; n++) { const a = n / K * Math.PI * 2, rr = 26 + (n % 2 ? 10 : 0) + Math.random() * 12; d += (n ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(1) + ' ' + (Math.sin(a) * rr).toFixed(1); }
    let html = `<path d="${d}Z" fill="#d9261c"/><circle r="15" cx="-6" cy="-6" fill="#f0473a" opacity=".8"/><circle r="5" cx="-10" cy="-12" fill="#ffd2c8" opacity=".9"/>`;
    for (let n = 0; n < 9; n++) { const a = Math.random() * Math.PI * 2, rr = 46 + Math.random() * 22; html += `<circle cx="${(Math.cos(a) * rr).toFixed(1)}" cy="${(Math.sin(a) * rr).toFixed(1)}" r="${(2 + Math.random() * 5).toFixed(1)}" fill="#d9261c"/>`; }
    for (let n = 0; n < 3; n++) { const x = -16 + n * 15 + Math.random() * 6; html += `<g class="dr" style="animation-delay:${.2 + n * .3}s"><rect x="${x - 3}" y="22" width="6" height="${16 + Math.random() * 12}" rx="3" fill="#c81f17"/><circle cx="${x}" cy="${40 + Math.random() * 8}" r="4.5" fill="#c81f17"/></g>`; }
    html += `<circle r="9" cx="22" cy="-26" fill="#3a7d2c"/><path d="M22 -34 l3 -8" stroke="#3a7d2c" stroke-width="3" stroke-linecap="round"/>`;
    sp.innerHTML = html; kort.append(sp); setTimeout(() => sp.remove(), 4600);
    const o = document.createElement('span'); o.className = 'taper'; o.textContent = TAPER[Math.floor(Math.random() * TAPER.length)];
    o.style.left = mx + 'px'; o.style.top = my - 46 + 'px'; o.style.setProperty('--rot', (Math.random() * 24 - 12).toFixed(1) + 'deg');
    kort.append(o); setTimeout(() => o.remove(), 3000);
  };
}
async function klikk(k, x) {
  egne[k]++; visKast(k, x);
  const b = knapp(k).querySelector('b'); b.textContent = tall((kast ? kast[k] : 0) + egne[k]);
  try { const r = await fetch('/chat/kast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k }) }); if (r.ok) { kast = await r.json(); egne[k] = 0; } } catch {}
}
document.querySelector('.k-le').addEventListener('click', () => klikk('le'));
document.querySelector('.k-tomat').addEventListener('click', e => klikk('tomat', e.clientX || undefined));
function nyeKast(ny) {
  if (kast) for (const k of ['le', 'tomat']) { const n = Math.min(4, ny[k] - kast[k]); for (let i = 0; i < n; i++) setTimeout(() => visKast(k), i * 450); }
  kast = ny;
  knapp('le').querySelector('b').textContent = tall(ny.le); knapp('tomat').querySelector('b').textContent = tall(ny.tomat);
}
// Hva han holder på med, satt i appen: Jobber, Trener, Sover. Kortet er skjult når ingenting er valgt.
const GJOR = { jobber: 'Jobber', trener: 'Trener', sover: 'Sover' };
function gjor(v) { const e = $('.gjor'); e.hidden = !GJOR[v]; if (GJOR[v]) $('.g-navn').textContent = GJOR[v]; }
async function hent() {
  try { const j = await (await fetch('/chat/spor', { cache: 'no-store' })).json(); skew = j.now - Date.now(); live = j.live; trail = j.trail || []; tele = j.tele || {}; if (j.puls) puls = j.puls; tegnPuls(); if (j.kast) nyeKast(j.kast); gjor(j.gjor); } catch {}
  tegn();
}
hent(); setInterval(() => { if (!document.hidden) hent(); }, 2500);
setInterval(tegn, 1000);
})();
</script>
'''
rep('\n</body>', '\n' + JS + '</body>')
m = re.search(r'<div class="st-i hp" hidden>.*?</span></span></div>', s, flags=re.S)
assert m, 'fant ikke pulsen'
# Kortsiktig pulsgraf (siste 5 min) i stedet for hele dagen.
puls = m.group(0).replace('<svg class="g" viewBox="0 0 120 30" aria-hidden="true"></svg>', '<svg class="g" viewBox="0 0 120 30" aria-hidden="true"></svg><svg class="hk" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path class="hk-l" d=""/><circle class="hk-p" r="3" cx="-9" cy="-9"/></svg>', 1)
assert puls != m.group(0), 'fant ikke pulsgrafen'
s = s.replace(m.group(0), '', 1).replace('<!--PULS-->', puls + '<span class="hk-x" aria-hidden="true"><span>5 min</span><span>nå</span></span>', 1)
pathlib.Path('new2').mkdir(exist_ok=True)
pathlib.Path('new2/index.html').write_text(s)
print('new2/index.html skrevet', len(s))
