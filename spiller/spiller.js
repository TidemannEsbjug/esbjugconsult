// Videospiller for forklaringsvideoene (eieren 25.–26.11.2026): en ramme rundt filmen og én stor play-knapp i midten. Over
// rammen står logoen og navnet som overskrift (data-merke, data-ikon). Når filmen startes, forsvinner overskriften og spilleren
// vokser inn i plassen (klassen spl-i-gang; størrelsen styres av siden, se film.css og forsidens .fv-in). Den står slik til filmen
// er ferdig, også på pause. Mens filmen er i gang, viser hover (eller trykk) en tidslinje og en fullskjermknapp nederst; ingen
// nettleserkontroller. Klikk på filmen setter den på pause. Når filmen er ferdig, står startbildet (plakaten) igjen med knappen og
// lenken videre (data-videre, data-videre-tekst). Et element med klassen spl-inni i .spl (språkvalget på forsiden) flyttes inn i
// rammen og står der alene til et språk er valgt. Med klassen spl-modul står logoen og navnet inni rammen på en blå flate i
// stedet for plakaten, og spilleren vokser ikke. Stil: spiller.css. window.Spiller.oppdater(el) leser attributtene på nytt.
(function () {
  // spill av, pause, fullskjerm, lukk fullskjerm, tidslinje
  var T = {
    no: ["Spill av", "Pause", "Fullskjerm", "Lukk fullskjerm", "Tidslinje"],
    en: ["Play", "Pause", "Full screen", "Exit full screen", "Seek"],
    de: ["Abspielen", "Pause", "Vollbild", "Vollbild beenden", "Zeitleiste"],
    fr: ["Lecture", "Pause", "Plein écran", "Quitter le plein écran", "Progression"],
    es: ["Reproducir", "Pausa", "Pantalla completa", "Salir de pantalla completa", "Progreso"],
    it: ["Riproduci", "Pausa", "Schermo intero", "Esci da schermo intero", "Avanzamento"],
    nl: ["Afspelen", "Pauze", "Volledig scherm", "Volledig scherm sluiten", "Tijdlijn"],
    pl: ["Odtwórz", "Pauza", "Pełny ekran", "Zamknij pełny ekran", "Postęp"]
  };
  T.nb = T.nn = T.no;
  var NS = "http://www.w3.org/2000/svg";
  var STILLE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function ikon(d, strek) {
    var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(NS, "path"); p.setAttribute("d", d);
    if (strek) { p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round"); }
    s.appendChild(p); return s;
  }
  var TREKANT = "M7.6 5.3v13.4a1 1 0 0 0 1.5.86l9.4-6.7a1 1 0 0 0 0-1.72l-9.4-6.7a1 1 0 0 0-1.5.86z";
  var UT = "M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15";
  var INN = "M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20";

  function lag(w) {
    if (w.__spl) return w.__spl;
    var v = w.querySelector("video");
    if (!v) return null;
    var t = T[(document.documentElement.lang || "en").slice(0, 2).toLowerCase()] || T.en;
    v.removeAttribute("controls");
    v.controls = false;
    v.setAttribute("playsinline", "");
    v.setAttribute("disablepictureinpicture", "");

    var hode = null, navn = null, logo = null;
    if (w.hasAttribute("data-merke")) {
      hode = el("p", "spl-hode");
      logo = el("img"); logo.alt = ""; logo.setAttribute("aria-hidden", "true"); logo.width = 256; logo.height = 256;
      navn = el("span");
      hode.appendChild(logo); hode.appendChild(navn);
      w.insertBefore(hode, w.firstChild);
    }
    var ramme = el("div", "spl-ramme");
    v.parentNode.insertBefore(ramme, v);
    ramme.appendChild(v);

    var dekke = el("div", "spl-dekke");
    var knapp = el("button", "spl-knapp"); knapp.type = "button"; knapp.setAttribute("aria-label", t[0]); knapp.appendChild(ikon(TREKANT));
    var videre = el("a", "spl-videre"); videre.hidden = true;
    dekke.appendChild(knapp);
    dekke.appendChild(videre);
    // Modul (forsiden): ingen plakat, men en blå flate med logoen og navnet inni rammen, over knappen og språkvalget
    if (w.classList.contains("spl-modul")) {
      ramme.insertBefore(el("div", "spl-flate"), v.nextSibling);
      if (hode) dekke.insertBefore(hode, dekke.firstChild);
    }
    var inni = w.querySelector(".spl-inni");
    // Med språkvalg (forsiden) står bare valget der først; play-knappen kommer når et språk er valgt (Spiller.valgt).
    if (inni) { dekke.appendChild(inni); w.classList.add("spl-velg"); }
    ramme.appendChild(dekke);

    // Nederst: tidslinjen og fullskjermknappen
    var kontroll = el("div", "spl-kontroll");
    var spor = el("div", "spl-spor");
    spor.tabIndex = 0;
    spor.setAttribute("role", "slider");
    spor.setAttribute("aria-label", t[4]);
    spor.setAttribute("aria-valuemin", "0");
    var linje = el("div", "spl-linje"), fylt = el("div", "spl-fylt"), punkt = el("div", "spl-punkt");
    linje.appendChild(fylt); spor.appendChild(linje); spor.appendChild(punkt);
    var full = el("button", "spl-full"); full.type = "button"; full.setAttribute("aria-label", t[2]);
    var fullUt = ikon(UT, true), fullInn = ikon(INN, true); fullInn.style.display = "none";
    full.appendChild(fullUt); full.appendChild(fullInn);
    kontroll.appendChild(spor); kontroll.appendChild(full);
    ramme.appendChild(kontroll);
    w.classList.add("spl-klar");

    function les() {
      if (hode) {
        navn.textContent = w.getAttribute("data-merke") || "";
        var src = w.getAttribute("data-ikon") || "/klart/assets/klart-ikon.png";
        if (logo.getAttribute("src") !== src) logo.setAttribute("src", src);
      }
      var h = w.getAttribute("data-videre");
      if (h) {
        videre.href = h;
        videre.textContent = (w.getAttribute("data-videre-tekst") || "") + " ";
        var pil = el("span"); pil.setAttribute("aria-hidden", "true"); pil.textContent = "→"; videre.appendChild(pil);
      }
      videre.hidden = !(h && w.classList.contains("spl-ferdig"));
    }
    function spill() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

    // Tidslinjen
    var drar = false;
    function tegn() {
      var d = v.duration, p = d && isFinite(d) ? Math.min(1, Math.max(0, v.currentTime / d)) : 0;
      fylt.style.transform = "scaleX(" + p + ")";
      punkt.style.left = (p * 100) + "%";
      if (d && isFinite(d)) { spor.setAttribute("aria-valuemax", String(Math.round(d))); spor.setAttribute("aria-valuenow", String(Math.round(v.currentTime))); }
    }
    var ramm = 0;
    function lop() { tegn(); if (!v.paused) ramm = requestAnimationFrame(lop); }
    function hopp(e) {
      var r = spor.getBoundingClientRect(), d = v.duration;
      if (!d || !isFinite(d) || !r.width) return;
      v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * d;
      tegn();
    }
    spor.addEventListener("pointerdown", function (e) { drar = true; w.classList.add("spl-drar"); spor.setPointerCapture(e.pointerId); hopp(e); e.preventDefault(); });
    spor.addEventListener("pointermove", function (e) { if (drar) hopp(e); });
    function slipp() { drar = false; w.classList.remove("spl-drar"); }
    spor.addEventListener("pointerup", slipp);
    spor.addEventListener("pointercancel", slipp);
    spor.addEventListener("keydown", function (e) {
      var d = v.duration; if (!d || !isFinite(d)) return;
      var n = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
      if (n) v.currentTime = Math.min(d, Math.max(0, v.currentTime + n));
      else if (e.key === "Home") v.currentTime = 0;
      else if (e.key === "End") v.currentTime = d - 0.1;
      else return;
      e.preventDefault(); tegn(); vis();
    });

    // Fullskjerm: hele rammen, så tidslinjen følger med; iPhone kan bare gi selve videoen fullskjerm
    function iFull() { return (document.fullscreenElement || document.webkitFullscreenElement) === ramme; }
    function lukkFull() { var f = document.exitFullscreen || document.webkitExitFullscreen; if (f) { var p = f.call(document); if (p && p.catch) p.catch(function () {}); } }
    full.addEventListener("click", function () {
      if (iFull()) { lukkFull(); return; }
      if (ramme.requestFullscreen) ramme.requestFullscreen().catch(function () {});
      else if (ramme.webkitRequestFullscreen) ramme.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });
    function fullByttet() {
      var f = iFull();
      w.classList.toggle("spl-fullskjerm", f);
      fullUt.style.display = f ? "none" : ""; fullInn.style.display = f ? "" : "none";
      full.setAttribute("aria-label", t[f ? 3 : 2]);
    }
    document.addEventListener("fullscreenchange", fullByttet);
    document.addEventListener("webkitfullscreenchange", fullByttet);

    // Kontrollene vises ved hover/trykk og forsvinner når musa står stille
    var skjul = 0;
    function vis() {
      w.classList.add("spl-vis");
      clearTimeout(skjul);
      skjul = setTimeout(function () { if (!drar && !kontroll.matches(":hover")) w.classList.remove("spl-vis"); }, 2200);
    }
    ramme.addEventListener("pointermove", vis);
    ramme.addEventListener("pointerdown", vis);
    ramme.addEventListener("pointerleave", function () { if (!drar) { clearTimeout(skjul); w.classList.remove("spl-vis"); } });

    // Når filmen startes, vokser spilleren inn i plassen etter overskriften; deretter midtstilles den i vinduet
    function igang() {
      if (w.classList.contains("spl-i-gang")) return;
      w.classList.add("spl-i-gang");
      setTimeout(function () {
        if (!w.classList.contains("spl-i-gang") || iFull()) return;
        var r = ramme.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight || Math.abs((r.top + r.bottom) / 2 - innerHeight / 2) > 24)
          ramme.scrollIntoView({ behavior: STILLE ? "auto" : "smooth", block: "center" });
      }, STILLE ? 0 : 620);
    }
    function ferdigMed() { w.classList.remove("spl-i-gang", "spl-vis"); }

    var slutt = false;
    knapp.addEventListener("click", spill);
    v.addEventListener("click", function () { if (!v.paused) v.pause(); else spill(); });
    v.addEventListener("play", function () {
      w.classList.remove("spl-ferdig"); w.classList.add("spl-spiller"); igang();
      videre.hidden = true; knapp.setAttribute("aria-label", t[1]);
      cancelAnimationFrame(ramm); ramm = requestAnimationFrame(lop);
    });
    v.addEventListener("pause", function () { w.classList.remove("spl-spiller"); knapp.setAttribute("aria-label", t[0]); tegn(); });
    v.addEventListener("timeupdate", function () { if (v.paused) tegn(); });
    v.addEventListener("loadedmetadata", tegn);
    v.addEventListener("ended", function () {
      w.classList.remove("spl-spiller");
      w.classList.add("spl-ferdig");
      ferdigMed();
      if (iFull()) lukkFull();
      // tilbake til startbildet (plakaten); load() gir «emptied», som ikke skal ta bort slutten
      slutt = true;
      v.load();
      les();
    });
    v.addEventListener("emptied", function () {
      if (slutt) { slutt = false; tegn(); return; }
      w.classList.remove("spl-spiller", "spl-ferdig"); ferdigMed(); tegn(); les();
    });

    les();
    tegn();
    w.__spl = { les: les, video: v };
    return w.__spl;
  }

  var alle = document.querySelectorAll(".spl");
  for (var i = 0; i < alle.length; i++) lag(alle[i]);
  window.Spiller = { lag: lag, oppdater: function (w) { var s = lag(w); if (s) s.les(); },
    valgt: function (w) { w.classList.remove("spl-velg"); } };
})();
