// Moro i chatten, felles for alle sidene med chat (/, /en/, /new/, /newuc/, /christian/):
// GIF-er fra Giphy for besøkende, reaksjoner på meldinger og skjermeffekter når noen skriver et bestemt ord.
// Sidens eget chatskript kaller chatMoro.init({send, vid}) når socketen er satt opp, chatMoro.msg(p, m, live) for hver
// melding og chatMoro.ws(m) for hendelser det ikke kjenner selv. Fargene arves fra chatpanelet, så det passer på alle sidene.
(() => {
const en = !/^(nb|no|nn)/.test(document.documentElement.lang || '');
const T = en
  ? { gif: 'GIF', search: 'Search GIFs', sending: 'Sending GIF …', many: 'That is a lot of GIFs. Wait a little.', fail: 'Could not send the GIF.', none: 'No GIFs found', react: 'React', close: 'Close', slett: 'Delete' }
  : { gif: 'GIF', search: 'Søk etter GIF', sending: 'Sender GIF …', many: 'Det var mange GIF-er. Vent litt.', fail: 'Fikk ikke sendt GIF-en.', none: 'Fant ingen GIF-er', react: 'Reager', close: 'Lukk', slett: 'Slett' };
const EMO = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const still = matchMedia('(prefers-reduced-motion: reduce)');
let api = null, bar = null;

const css = document.createElement('style');
css.textContent = `
#chat .ch-m p{position:relative}
#chat .ch-m p.cm-har{margin-bottom:12px}
.cm-r{position:absolute;bottom:-12px;display:flex;gap:1px;padding:2px 5px;border-radius:999px;background:#fff;color:#000;font-size:13px;line-height:1.1;box-shadow:0 1px 5px rgba(0,0,0,.22);pointer-events:none;white-space:nowrap}
.him>.cm-r{right:6px}.me>.cm-r{left:6px}
.cm-bar{position:absolute;bottom:calc(100% + 6px);z-index:3;display:flex;flex-wrap:nowrap;width:max-content;white-space:nowrap;gap:2px;padding:4px;border-radius:999px;background:#fff;box-shadow:0 6px 22px rgba(0,0,0,.25);animation:cmInn .18s ease-out}
.cm-bar.ned{bottom:auto;top:calc(100% + 6px)}
.him>.cm-bar{left:0}.me>.cm-bar{right:0}
.cm-bar button{border:0;background:none;font-size:22px;line-height:1;width:36px;height:36px;border-radius:50%;cursor:pointer;padding:0;transition:transform .15s,background .15s}
.cm-bar button:hover{transform:scale(1.18)}
.cm-bar button[aria-pressed="true"]{background:rgba(0,0,0,.1)}
.cm-bar .cm-slett{flex:none;white-space:nowrap;width:auto;height:36px;border-radius:999px;padding:0 12px;margin-left:2px;border-left:1px solid rgba(0,0,0,.1);font:600 13px/1 -apple-system,"SF Pro Text",Arial,sans-serif;color:#c0262d}
.cm-bar .cm-slett:hover{transform:none;background:rgba(192,38,45,.08)}
@keyframes cmInn{from{opacity:0;transform:translateY(4px) scale(.94)}}
#chat .ch-f .cm-gb{font:800 12px/1 -apple-system,"SF Pro Text",Arial,sans-serif;letter-spacing:.04em}
.cm-g{position:absolute;left:0;right:0;bottom:var(--cm-b,68px);height:min(60%,380px);z-index:4;display:flex;flex-direction:column;background:inherit;color:inherit;border-top:1px solid rgba(127,127,127,.3);box-shadow:0 -10px 30px rgba(0,0,0,.12)}
.cm-g[hidden]{display:none}
.cm-gh{display:flex;gap:8px;padding:10px 12px}
.cm-gh input{flex:1;min-width:0;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:rgba(127,127,127,.12);color:inherit;font:inherit;font-size:16px;padding:8px 11px;outline:none;-webkit-user-select:text;user-select:text}
.cm-gh button{border:0;background:none;color:inherit;font-size:24px;line-height:1;cursor:pointer;padding:0 4px;opacity:.7}
.cm-gl{flex:1;overflow-y:auto;overscroll-behavior:contain;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:104px;gap:6px;padding:0 12px 8px}
.cm-gl button{border:0;padding:0;border-radius:8px;overflow:hidden;cursor:pointer;background:rgba(127,127,127,.18)}
.cm-gl img{width:100%;height:100%;object-fit:cover;display:block}
.cm-gl p{grid-column:1/-1;text-align:center;opacity:.6;font-size:14px}
.cm-gf{padding:4px 12px 8px;font-size:10px;letter-spacing:.12em;opacity:.55;text-align:right}
.cm-fx{position:fixed;inset:0;z-index:2000;pointer-events:none;width:100vw;height:100vh}
.cm-rist{animation:cmRist .7s cubic-bezier(.36,.07,.19,.97)}
@keyframes cmRist{10%,90%{translate:-2px 0}20%,80%{translate:4px 0}30%,50%,70%{translate:-8px 0}40%,60%{translate:8px 0}}
`;
document.head.append(css);

// ---------- reaksjoner ----------
const badge = (p, m) => {
  p.querySelector('.cm-r')?.remove();
  const e = [...new Set([m.ro, m.rv].filter(Boolean))];
  p.classList.toggle('cm-har', e.length > 0);
  p.dataset.rv = m.rv || '';
  if (!e.length) return;
  const b = document.createElement('span');
  b.className = 'cm-r'; b.setAttribute('aria-label', e.join(' ')); b.textContent = e.join('');
  p.append(b);
};
const react = (p, e) => {
  if (!api) return;
  const ny = p.dataset.rv === e ? '' : e;
  api.send({ t: 'react', id: +p.dataset.id, e: ny });
};
const closeBar = () => { bar?.remove(); bar = null; };
const openBar = p => {
  closeBar();
  bar = document.createElement('span');
  bar.className = 'cm-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', T.react);
  for (const e of EMO) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e; b.setAttribute('aria-pressed', p.dataset.rv === e);
    b.onclick = ev => { ev.stopPropagation(); react(p, e); closeBar(); };
    bar.append(b);
  }
  // Egne meldinger kan slettes: ett trykk, så er den borte hos begge.
  if (p.classList.contains('me') && !p.classList.contains('up') && p.dataset.id) {
    const d = document.createElement('button');
    d.type = 'button'; d.className = 'cm-slett'; d.textContent = T.slett;
    d.onclick = ev => { ev.stopPropagation(); api?.send({ t: 'slettmelding', id: +p.dataset.id }); closeBar(); };
    bar.append(d);
  }
  p.append(bar);
  const box = p.closest('.ch-m');
  if (box && p.getBoundingClientRect().top - box.getBoundingClientRect().top < 52) bar.classList.add('ned');
};
document.addEventListener('click', e => { if (bar && !bar.parentNode.contains(e.target)) closeBar(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBar(); });

// ---------- GIF-er ----------
let gp = null, gq = '', gnext = 0, gload = false, gend = false, gt = 0;
const gifPanel = () => {
  if (gp) return gp;
  const pan = document.querySelector('#chat .ch-p'), form = pan.querySelector('.ch-f');
  gp = document.createElement('div');
  gp.className = 'cm-g'; gp.hidden = true;
  gp.innerHTML = `<div class="cm-gh"><input type="search" enterkeyhint="search" aria-label="${T.search}" placeholder="${T.search}"><button type="button" aria-label="${T.close}">×</button></div><div class="cm-gl"></div><div class="cm-gf">POWERED BY GIPHY</div>`;
  pan.append(gp);
  const inp = gp.querySelector('input'), list = gp.querySelector('.cm-gl');
  gp.querySelector('.cm-gh button').onclick = () => { gp.hidden = true; };
  inp.addEventListener('input', () => { clearTimeout(gt); gt = setTimeout(() => search(inp.value.trim()), 350); });
  list.addEventListener('scroll', () => { if (list.scrollTop + list.clientHeight > list.scrollHeight - 200) more(); }, { passive: true });
  const place = () => gp.style.setProperty('--cm-b', form.offsetHeight + 'px');
  new ResizeObserver(place).observe(form); place();
  return gp;
};
const search = q => { gq = q; gnext = 0; gend = false; gp.querySelector('.cm-gl').textContent = ''; more(); };
const more = async () => {
  if (gload || gend) return;
  gload = true;
  const list = gp.querySelector('.cm-gl'), q = gq;
  try {
    const r = await fetch('/chat/gifs?q=' + encodeURIComponent(q) + '&offset=' + gnext);
    const j = await r.json();
    if (q !== gq) return;
    gnext = j.next; gend = !j.gifs.length || j.next >= j.total;
    if (!j.gifs.length && !list.children.length) { const p = document.createElement('p'); p.textContent = T.none; list.append(p); }
    for (const g of j.gifs) {
      const b = document.createElement('button'), i = document.createElement('img');
      b.type = 'button'; b.setAttribute('aria-label', g.title || 'GIF');
      i.src = g.preview; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
      b.append(i); b.onclick = () => sendGif(g.id);
      list.append(b);
    }
  } catch { gend = true; }
  finally { gload = false; }
};
const note = (txt, err) => {
  const box = document.querySelector('#chat .ch-m'), p = document.createElement('p');
  p.className = 'me up' + (err ? ' err' : ''); p.textContent = txt; box.append(p); box.scrollTop = box.scrollHeight;
  return p;
};
const sendGif = async id => {
  gp.hidden = true;
  const tmp = note(T.sending);
  try {
    const r = await fetch('/chat/gif', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vid: api.vid, id }) });
    if (!r.ok) throw new Error(r.status === 429 ? T.many : T.fail + ' (' + r.status + ')');
    tmp.remove();
  } catch (e) { tmp.textContent = e.message && e.message !== 'Failed to fetch' && e.message !== 'Load failed' ? e.message : T.fail + ' (nett)'; tmp.classList.remove('up'); tmp.classList.add('err'); }
};
const gifButton = () => {
  const form = document.querySelector('#chat .ch-f'), ta = form?.querySelector('textarea');
  if (!ta || form.querySelector('.cm-gb')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cm-gb'; b.textContent = T.gif; b.setAttribute('aria-label', en ? 'Send a GIF' : 'Send en GIF');
  b.onclick = () => { const g = gifPanel(); g.hidden = !g.hidden; if (!g.hidden) { if (!g.querySelector('.cm-gl').children.length) search(''); g.querySelector('input').focus({ preventScroll: true }); } };
  form.insertBefore(b, ta);
};

// ---------- skjermeffekter ----------
// Skriver noen et av ordene (eller emojien), skjer det noe på skjermen til den besøkende. Både egne meldinger og Tidemanns.
const FX = [
  [/🎉|🥳|🎊|gratulerer|grattis|gratulasjon|congrat|hurra|hooray|party|fest\b|feire|celebrat/i, 'konfetti'],
  [/❤️|❤|♥|💕|💖|😍|\blove\b|i love|elsker|glad i deg|kjærlighet/i, 'hjerter'],
  [/❄️|☃️|⛄|\bsnow|\bsnø\b|snøen|jul\b|christmas|merry/i, 'sno'],
  [/\bamen\b|hall?el[uj]+ah?|praise|lovet være|takk gud|thank god|glory|🙏/i, 'lys'],
  [/^\s*(wow+|omg|wtf|jøss+|oi+|whoa+)[!?.\s]*$/i, 'rist'],
  [/🎆|🎇|fireworks?|fyrverkeri|raketter/i, 'fyrverkeri'],
  [/🌧️|☔|\brain\b|\bregn\b|regner/i, 'regn'],
];
let cv = null, cx = null, parts = [], raf = 0, mode = '', t0 = 0, glow = 0;
const canvas = () => {
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'cm-fx'; cv.setAttribute('aria-hidden', 'true'); cx = cv.getContext('2d'); }
  if (!cv.isConnected) document.body.append(cv);
  const d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; cx.setTransform(d, 0, 0, d, 0, 0);
};
const R = (a, b) => a + Math.random() * (b - a);
const KF = ['#FFD23F', '#FF6A3D', '#FF2E7E', '#2fd1ff', '#7a5cff', '#3ddc84', '#ffffff'];
const start = (m) => {
  if (m === 'rist') { const r = document.documentElement; r.classList.remove('cm-rist'); void r.offsetWidth; r.classList.add('cm-rist'); setTimeout(() => r.classList.remove('cm-rist'), 800); return; }
  if (still.matches && m !== 'lys') return;
  canvas(); mode = m; t0 = performance.now(); parts = []; glow = 0;
  const W = innerWidth, H = innerHeight;
  if (m === 'konfetti') for (let i = 0; i < 170; i++) parts.push({ x: R(0, W), y: R(-H * .6, -10), vx: R(-1.2, 1.2), vy: R(2, 5), r: R(0, 6), vr: R(-.2, .2), w: R(6, 11), h: R(8, 16), c: KF[i % KF.length] });
  if (m === 'hjerter') for (let i = 0; i < 46; i++) parts.push({ x: R(0, W), y: H + R(10, H * .7), vx: R(-.5, .5), vy: R(-3.2, -1.6), s: R(18, 42), ph: R(0, 6), c: ['#ff2e5b', '#ff6f91', '#e0233c', '#ff9ab0'][i % 4] });
  if (m === 'sno') for (let i = 0; i < 150; i++) parts.push({ x: R(0, W), y: R(-H, 0), vy: R(.8, 2.4), r: R(1.5, 4.5), ph: R(0, 6) });
  if (m === 'regn') for (let i = 0; i < 220; i++) parts.push({ x: R(0, W * 1.2), y: R(-H, 0), vy: R(12, 20), l: R(10, 24) });
  if (m === 'fyrverkeri') for (let k = 0; k < 6; k++) { const x = R(W * .15, W * .85), y = R(H * .15, H * .5), c = KF[k % 6], d = k * 380; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, v = R(2, 5.5); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c, d, life: 1 }); } }
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
};
const heart = (x, y, s) => { cx.beginPath(); cx.moveTo(x, y + s * .3); cx.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3); cx.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .78, x, y + s); cx.bezierCurveTo(x, y + s * .78, x + s * .5, y + s * .6, x + s * .5, y + s * .3); cx.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3); cx.fill(); };
const LEN = { konfetti: 5200, hjerter: 5200, sno: 7500, regn: 4500, fyrverkeri: 4600, lys: 4200 };
const frame = now => {
  const W = innerWidth, H = innerHeight, t = now - t0, L = LEN[mode] || 5000;
  cx.clearRect(0, 0, W, H);
  const ut = Math.min(1, Math.max(0, (L - t) / 900));   // tones out the last 0.9 s
  cx.globalAlpha = ut;
  if (mode === 'konfetti') for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += .03; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.scale(1, Math.cos(p.r * 3)); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); }
  if (mode === 'hjerter') for (const p of parts) { p.y += p.vy; p.x += p.vx + Math.sin(t / 500 + p.ph) * .6; cx.fillStyle = p.c; heart(p.x, p.y, p.s); }
  if (mode === 'sno') { cx.fillStyle = '#fff'; cx.shadowColor = 'rgba(0,30,80,.35)'; cx.shadowBlur = 4; for (const p of parts) { p.y += p.vy; p.x += Math.sin(t / 900 + p.ph) * .5; if (p.y > H + 5 && t < L - 2500) p.y = -5; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); } cx.shadowBlur = 0; }
  if (mode === 'regn') { cx.strokeStyle = 'rgba(150,180,220,.75)'; cx.lineWidth = 1.4; cx.beginPath(); for (const p of parts) { p.y += p.vy; p.x -= p.vy * .18; if (p.y > H && t < L - 1200) { p.y = R(-60, 0); p.x = R(0, W * 1.2); } cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.l * .18, p.y + p.l); } cx.stroke(); }
  if (mode === 'fyrverkeri') for (const p of parts) { if (t < p.d) continue; p.x += p.vx; p.y += p.vy; p.vy += .05; p.vx *= .985; p.life -= .011; if (p.life <= 0) continue; cx.globalAlpha = ut * p.life; cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, 2.4, 0, 7); cx.fill(); }
  if (mode === 'lys') {
    // Varmt lys ovenfra med stråler som dreier sakte.
    const inn = Math.min(1, t / 900); cx.globalAlpha = inn * ut;
    const g = cx.createRadialGradient(W / 2, -H * .1, 0, W / 2, -H * .1, H * 1.1);
    g.addColorStop(0, 'rgba(255,236,170,.85)'); g.addColorStop(.45, 'rgba(255,214,120,.28)'); g.addColorStop(1, 'rgba(255,214,120,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.save(); cx.translate(W / 2, -H * .1); cx.rotate(still.matches ? 0 : t / 9000);
    for (let i = 0; i < 14; i++) { cx.rotate(Math.PI * 2 / 14); cx.fillStyle = 'rgba(255,240,190,.13)'; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-H * .09, H * 1.5); cx.lineTo(H * .09, H * 1.5); cx.fill(); }
    cx.restore();
  }
  cx.globalAlpha = 1;
  if (t < L) raf = requestAnimationFrame(frame); else { cx.clearRect(0, 0, W, H); cv.remove(); }
};
// «benkpress» på forsiden: spillet på /benkpress/ åpnes i fullskjerm over siden. × eller Esc lukker, det samme gjør lenken
// tilbake til forsiden inne i spillet.
const BENK = /benkpress|bench ?press/i;
const benk = () => {
  if (!/^\/(sherpa\/)?$/.test(location.pathname) || document.querySelector('.cm-benk')) return;
  const o = document.createElement('div'), f = document.createElement('iframe'), x = document.createElement('button');
  o.className = 'cm-benk'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Tidemann Løfter AI-Norge');
  f.src = '/benkpress/'; f.title = 'Tidemann Løfter AI-Norge'; f.allow = 'fullscreen; autoplay';
  x.type = 'button'; x.className = 'cm-benk-x'; x.setAttribute('aria-label', en ? 'Close' : 'Lukk'); x.textContent = '×';
  const lukk = () => { o.classList.add('ut'); removeEventListener('keydown', esc); document.documentElement.classList.remove('cm-benk-paa'); setTimeout(() => o.remove(), 300); };
  const esc = e => { if (e.key === 'Escape') lukk(); };
  x.onclick = lukk; addEventListener('keydown', esc);
  f.onload = () => { try { const d = f.contentDocument; d.addEventListener('keydown', esc); d.querySelectorAll('a[href="/"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); lukk(); })); f.contentWindow.focus(); } catch {} };
  o.append(f, x); document.body.append(o); document.documentElement.classList.add('cm-benk-paa');
};
css.textContent += `.cm-benk{position:fixed;inset:0;z-index:2500;background:#00205B;animation:cmBenk .45s cubic-bezier(.2,.8,.2,1)}
.cm-benk.ut{transition:opacity .28s,transform .28s;opacity:0;transform:scale(.97)}
.cm-benk iframe{display:block;width:100%;height:100%;border:0}
.cm-benk-x{position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:50%;border:1.5px solid rgba(255,255,255,.5);background:rgba(0,32,91,.55);color:#fff;font:300 30px/1 -apple-system,Arial,sans-serif;cursor:pointer;display:grid;place-items:center;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.cm-benk-x:hover{background:rgba(0,32,91,.8)}
html.cm-benk-paa,html.cm-benk-paa body{overflow:hidden}
@keyframes cmBenk{from{opacity:0;transform:scale(.96)}}`;
const fx = text => { if (!text) return; if (BENK.test(text)) { benk(); return; } for (const [re, m] of FX) if (re.test(text)) { start(m); return; } };

// ---------- speilet i Esbjug Chat-appen ----------
// Appen viser siden den besøkende er på (?speil=1) og sender inn chatten slik den er hos dem: åpen eller lukket, fokus og
// samtalen. Nye meldinger gir de samme effektene som hos den besøkende (regn, konfetti, hehe, risting), så du ser alt de ser.
let sSett = null;
const sMelding = m => {
  const p = document.createElement('p');
  p.className = m.owner ? 'him' : 'me'; p.dataset.id = m.id;
  if (m.kind === 'file' && m.file) {
    p.classList.add('file');
    const src = 'https://esbjugconsult.com/chat/file/' + m.file;
    if (m.gif) { const v = document.createElement('video'); v.className = 'gif'; v.muted = v.loop = v.autoplay = v.playsInline = true; v.src = src; p.append(v); }
    else if ((m.mime || '').startsWith('image/')) { const i = document.createElement('img'); i.src = src; p.append(i); }
    else { const a = document.createElement('a'); a.textContent = (m.mime || '').startsWith('audio/') ? (en ? '🎤 Voice message' : '🎤 Lydmelding') : '📎 ' + (m.name || 'Fil'); p.append(a); }
  } else p.textContent = m.text;
  badge(p, m);
  return p;
};
const hehe = () => {
  const o = document.createElement('div'); o.className = 'hh'; o.setAttribute('aria-hidden', 'true');
  [...'hehe'].forEach((c, i) => { const sp = document.createElement('span'); sp.textContent = c; sp.style.animationDelay = i * 70 + 'ms'; o.append(sp); });
  document.body.append(o); setTimeout(() => o.remove(), 3200);
};
window.__speil = s => {
  if (!document.documentElement.classList.contains('speil')) return;
  const root = document.documentElement, chat = document.getElementById('chat');
  if (!chat) return;
  root.classList.add('speil-chat');
  const pan = chat.querySelector('.ch-p'), btn = chat.querySelector('.ch-b'), box = chat.querySelector('.ch-m');
  pan.hidden = !s.chat; btn.hidden = !!s.chat;
  root.classList.toggle('focus', !!s.f);
  const msgs = s.msgs || [];
  const nye = sSett ? msgs.filter(m => !sSett.has(m.id)) : [];
  box.textContent = '';
  for (const m of msgs) box.append(sMelding(m));
  box.scrollTop = box.scrollHeight;
  sSett = new Set(msgs.map(m => m.id));
  for (const m of nye) {
    if (m.kind === 'file') continue;
    if (m.owner && /^\s*hehe[!.\s]*$/i.test(m.text)) hehe(); else fx(m.text);
  }
};
css.textContent += `html.speil.speil-chat #chat{display:block!important}html.speil-chat .ch-p{transition:none}`;

// ---------- koblingen til sidens chat ----------
window.chatMoro = {
  init(a) { api = a; gifButton(); },
  msg(p, m, live) {
    if (!p.dataset.id) p.dataset.id = m.id;
    badge(p, m);
    p.addEventListener('click', e => { if (e.target.closest('a,audio,img,video:not(.gif),.cm-bar')) return; if (bar && bar.parentNode === p) closeBar(); else openBar(p); });
    p.addEventListener('dblclick', e => { e.preventDefault(); closeBar(); react(p, '❤️'); });
    if (live && m.kind !== 'file') fx(m.text);
  },
  ws(m) {
    if (m.t === 'slettet') { document.querySelector(`#chat .ch-m p[data-id="${m.id}"]`)?.remove(); return; }
    if (m.t !== 'react') return;
    const p = document.querySelector(`#chat .ch-m p[data-id="${m.id}"]`);
    if (p) badge(p, m);
  },
  fx: start,
};
})();
