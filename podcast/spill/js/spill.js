/* Spillet mens du lytter: elveverdenen og spillet i den (js/world/), uten lyd og tekst. Siden ligger i en iframe i
   podcastspilleren (podcast/index.html), som eier lyden. Spillet går når episoden spiller og står når den er på pause.
   Klokka er spillets egen: den går rundt reisen (D.duration) så lenge episoden spiller. */
import { makeWorld } from "./world/world.js";

const HR = window.HR, D = HR.D;
const P = HR.pointer;
const $ = (id) => document.getElementById(id);
const pod = () => { try { return parent !== window ? parent.podcastSpill : null; } catch (e) { return null; } };

// ---------- pekeren (som på originalen, uten den tegnede markøren) ----------
P.fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
let touchTimer = 0;
function move(e) {
  const now = performance.now();
  const dt = Math.max(1, now - (P.last || now - 16)) / 1000;
  const vx = (e.clientX - P.x) / dt, vy = (e.clientY - P.y) / dt;
  P.vx += (vx - P.vx) * 0.35; P.vy += (vy - P.vy) * 0.35;
  P.speed = Math.hypot(P.vx, P.vy);
  P.x = e.clientX; P.y = e.clientY; P.last = now;
  P.active = true;
  if (e.pointerType === "touch") { clearTimeout(touchTimer); touchTimer = setTimeout(() => (P.active = false), 900); }
}
addEventListener("pointermove", move, { passive: true });
addEventListener("pointerdown", move, { passive: true });
document.documentElement.addEventListener("pointerleave", () => (P.active = false));
addEventListener("blur", () => (P.active = false));

// ---------- verdenen ----------
let world = null;
try { world = makeWorld($("world"), HR); }
catch (e) { console.error("Verdenen startet ikke:", e); }
const game = () => (world ? world.game : null);

// ---------- tilstand: styres av podcastspilleren ----------
// Alene (uten podcastspilleren rundt) er spillet åpent med en gang; i iframen sier spilleren fra.
let playing = false, open = !pod(), t = 0, raf = 0, last = performance.now();
function sett(s) {
  if ("open" in s) { open = s.open; if (open) start(); }
  if ("playing" in s && s.playing !== playing) {
    playing = s.playing;
    document.body.classList.toggle("pause", !playing);
    if (playing) skjulPoeng(); else visPause();
    if (playing) visHint();
  }
}
window.spillTilstand = sett;
const veksle = () => { const p = pod(); if (p) p.veksle(); };
const spill = () => { const p = pod(); if (p) p.spill(); };

// ---------- poeng: et øyeblikk når du faller, og mens det er pause ----------
const poengEl = $("poeng");
let poengTid = 0;
function visFall(n) {
  poengEl.classList.remove("pause");
  poengEl.textContent = String(n);
  poengEl.classList.add("vis");
  clearTimeout(poengTid);
  poengTid = setTimeout(() => { if (playing) poengEl.classList.remove("vis"); }, 1300);
}
function visPause() {
  const g = game();
  if (!g) return;
  clearTimeout(poengTid);
  poengEl.innerHTML = `${g.score}<small>rekord ${g.best}</small>`;
  poengEl.classList.add("vis", "pause");
}
function skjulPoeng() { clearTimeout(poengTid); poengEl.classList.remove("vis", "pause"); }

// Styringen vises de første sekundene, én gang per besøk.
let hintVist = false;
function visHint() {
  if (hintVist) return;
  hintVist = true;
  $("hint").classList.add("vis");
  setTimeout(() => $("hint").classList.remove("vis"), 6000);
}

// ---------- hånden: som på originalen ----------
// piler eller sveip flytter kula, mellomrom eller sveip opp hopper (to ganger for vinger), sveip ned dykker,
// et trykk er pause og spill, et langt trykk får en rose til å blomstre, et drag rører i lys og farger
let press = null;
addEventListener("pointerdown", (e) => {
  if (e.button === 2) { if (world) world.bloomAt(e.clientX, e.clientY); return; }
  if (e.button !== 0) return;
  if (e.pointerType === "mouse") {
    if (!playing) { spill(); return; }
    if (world) world.bloomAt(e.clientX, e.clientY);
    return;
  }
  press = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, held: false, swiped: false, id: e.pointerId, timer: 0 };
  if (game() && game().flying) { game().hold(true); press.swiped = true; }
  press.timer = setTimeout(() => { if (press && !press.moved && !(game() && game().flying)) { press.held = true; if (world) world.bloomAt(press.x, press.y); } }, 330);
});
addEventListener("pointermove", (e) => {
  if (!press || e.pointerId !== press.id) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) > 9) { press.moved = true; clearTimeout(press.timer); }
  if (!press.swiped && game()) {
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.2) { game().move(dx > 0 ? 1 : -1); press.swiped = true; }
    else if (dy < -26 && Math.abs(dy) > Math.abs(dx) * 1.2) { game().jump(); press.swiped = true; }
    else if (dy > 26 && Math.abs(dy) > Math.abs(dx) * 1.2) { game().dive(); press.swiped = true; }
  }
  if (press.moved && world) world.stir(e.clientX, e.clientY, P.vx, P.vy);
}, { passive: true });
addEventListener("pointerup", (e) => {
  if (game() && e.pointerType !== "mouse") game().hold(false);
  if (!press || e.pointerId !== press.id) return;
  clearTimeout(press.timer);
  const quick = performance.now() - press.t < 330;
  if (!press.moved && !press.held && quick) veksle();
  press = null;
});
addEventListener("pointercancel", () => { if (press) clearTimeout(press.timer); press = null; if (game()) game().hold(false); });
addEventListener("contextmenu", (e) => e.preventDefault());

addEventListener("keydown", (e) => {
  const g = game();
  if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); if (playing && g) { if (e.repeat) g.hold(true); else g.jump(); } else if (!e.repeat) spill(); }
  else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); if (g) g.move(-1); }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); if (g) g.move(1); }
  else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); if (g) g.dive(); }
  else if (e.key === "k" || e.key === "K" || e.key === "p" || e.key === "P") { e.preventDefault(); veksle(); }
  else if (e.key === "Escape") { e.preventDefault(); const p = pod(); if (p) p.lukk(); }
});
addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") { const g = game(); if (g) g.hold(false); }
});

// ---------- bilde for bilde, bare mens spillet er åpent og synlig ----------
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing) t = (t + dt) % D.duration;
  if (world) {
    world.update({ t, dt, beat: HR.beatAt(t), energy: HR.energy(t), playing, state: playing ? "playing" : "paused" });
    const ev = world.gameEvent;
    if (playing && ev && ev.fell) visFall(ev.score);
  }
  if (open && !document.hidden) raf = requestAnimationFrame(frame);
}
function start() {
  if (raf || !open || document.hidden) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", start);

// Si fra til podcastspilleren at spillet er klart, og hent tilstanden derfra.
const p = pod();
if (p) p.klar();
start();
