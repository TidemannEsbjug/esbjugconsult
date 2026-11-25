// Egen videospiller for forklaringsvideoene (eieren 25.11.2026). Gjør hver .spl med en <video> om til spilleren:
// glassknapp før start, kontrollene i rammen under bildet, fremdriften som ett segment per scene (data-kapitler: sekundene
// der scenene skifter), lyst slør med lenken videre (data-videre, data-videre-tekst) og «spill igjen» når filmen er ferdig.
// Ingen nettleserkontroller. Stil: spiller.css. window.Spiller.oppdater(el) tegner segmentene på nytt etter språkbytte.
(function () {
  var T = {
    no: ["Se filmen", "Spill av", "Pause", "Lyd av", "Lyd på", "Fullskjerm", "Spill igjen"],
    nb: 0, nn: 0,
    en: ["Watch the film", "Play", "Pause", "Mute", "Unmute", "Full screen", "Play again"],
    de: ["Film ansehen", "Abspielen", "Pause", "Ton aus", "Ton an", "Vollbild", "Nochmal ansehen"],
    fr: ["Voir le film", "Lecture", "Pause", "Couper le son", "Activer le son", "Plein écran", "Revoir"],
    es: ["Ver el vídeo", "Reproducir", "Pausa", "Silenciar", "Activar sonido", "Pantalla completa", "Ver de nuevo"],
    it: ["Guarda il video", "Riproduci", "Pausa", "Disattiva audio", "Attiva audio", "Schermo intero", "Guarda di nuovo"],
    nl: ["Bekijk de film", "Afspelen", "Pauze", "Geluid uit", "Geluid aan", "Volledig scherm", "Opnieuw bekijken"],
    pl: ["Obejrzyj film", "Odtwórz", "Pauza", "Wycisz", "Włącz dźwięk", "Pełny ekran", "Obejrzyj ponownie"]
  };
  T.nb = T.nn = T.no;
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.4"/><rect x="14" y="4" width="4.5" height="16" rx="1.4"/></svg>';
  var LYD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var STUM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  var FULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var IGJEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>';

  function tid(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function tekster() { var l = (document.documentElement.lang || "en").slice(0, 2).toLowerCase(); return T[l] || T.en; }

  function lag(w) {
    if (w.__spl) return w.__spl;
    var v = w.querySelector("video");
    if (!v) return null;
    var t = tekster();
    v.removeAttribute("controls");
    v.controls = false;
    v.setAttribute("playsinline", "");
    v.setAttribute("disablepictureinpicture", "");
    v.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");

    var bilde = document.createElement("div");
    bilde.className = "spl-bilde";
    v.parentNode.insertBefore(bilde, v);
    bilde.appendChild(v);
    bilde.insertAdjacentHTML("beforeend",
      '<button type="button" class="spl-start" aria-label="' + t[1] + '"><span class="spl-start-knapp">' + PLAY + '</span><span class="spl-start-tekst"></span></button>' +
      '<div class="spl-slutt"><a class="spl-videre" hidden></a><button type="button" class="spl-igjen">' + IGJEN + '<span>' + t[6] + '</span></button></div>');
    w.insertAdjacentHTML("beforeend",
      '<div class="spl-rad">' +
        '<button type="button" class="spl-pp" aria-label="' + t[1] + '"><span class="spl-i-play">' + PLAY + '</span><span class="spl-i-pause">' + PAUSE + '</span></button>' +
        '<div class="spl-spor" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>' +
        '<span class="spl-tid"><span class="spl-naa">0:00</span><span class="spl-tot"></span></span>' +
        '<button type="button" class="spl-ikon spl-lyd" aria-label="' + t[3] + '"><span class="spl-i-paa">' + LYD + '</span><span class="spl-i-av">' + STUM + '</span></button>' +
        '<button type="button" class="spl-ikon spl-full" aria-label="' + t[5] + '">' + FULL + '</button>' +
      '</div>');
    w.classList.add("spl-ny");

    var start = bilde.querySelector(".spl-start"), startTekst = bilde.querySelector(".spl-start-tekst"), videre = bilde.querySelector(".spl-videre"),
        pp = w.querySelector(".spl-pp"), spor = w.querySelector(".spl-spor"), naa = w.querySelector(".spl-naa"), tot = w.querySelector(".spl-tot"),
        segs = [], grenser = [];

    function lengde() { return isFinite(v.duration) && v.duration > 0 ? v.duration : +(w.getAttribute("data-lengde") || 0); }
    function tegnSpor() {
      var d = lengde(), k = (w.getAttribute("data-kapitler") || "").split(",").map(Number).filter(function (x) { return x > 0 && (!d || x < d - 0.5); });
      grenser = [0].concat(k, [d || 1]);
      spor.innerHTML = "";
      segs = [];
      for (var i = 0; i < grenser.length - 1; i++) {
        var s = document.createElement("span");
        s.className = "spl-seg";
        s.style.flex = String(Math.max(0.2, grenser[i + 1] - grenser[i]));
        s.innerHTML = "<i></i>";
        spor.appendChild(s);
        segs.push(s.firstChild);
      }
      startTekst.textContent = t[0] + (d ? " · " + tid(d) : "");
      tot.textContent = d ? " / " + tid(d) : "";
      fram();
    }
    function fram() {
      var c = v.currentTime || 0, d = lengde();
      for (var i = 0; i < segs.length; i++) {
        var a = grenser[i], b = grenser[i + 1];
        segs[i].style.transform = "scaleX(" + Math.min(1, Math.max(0, (c - a) / (b - a))) + ")";
      }
      naa.textContent = tid(c);
      spor.setAttribute("aria-valuenow", d ? String(Math.round(100 * c / d)) : "0");
    }
    function spill() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    function veksle() { if (v.paused || v.ended) spill(); else v.pause(); }

    start.addEventListener("click", function (e) { e.stopPropagation(); spill(); });
    bilde.addEventListener("click", function (e) { if (e.target === v) veksle(); });
    pp.addEventListener("click", veksle);
    bilde.querySelector(".spl-igjen").addEventListener("click", function (e) { e.stopPropagation(); v.currentTime = 0; spill(); });
    w.querySelector(".spl-lyd").addEventListener("click", function () { v.muted = !v.muted; });
    w.querySelector(".spl-full").addEventListener("click", function () {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      if (w.requestFullscreen) w.requestFullscreen().catch(function () {});
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });

    function hopp(e) {
      var r = spor.getBoundingClientRect(), d = lengde();
      if (!d || !r.width) return;
      var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      // segmentene har mellomrom, så posisjonen regnes per segment
      var kids = spor.children, tSek = x * d;
      for (var i = 0; i < kids.length; i++) {
        var kr = kids[i].getBoundingClientRect();
        if (e.clientX <= kr.right + 2) { tSek = grenser[i] + Math.min(1, Math.max(0, (e.clientX - kr.left) / kr.width)) * (grenser[i + 1] - grenser[i]); break; }
      }
      v.currentTime = Math.min(d - 0.1, tSek);
      fram();
    }
    var drar = false;
    spor.addEventListener("pointerdown", function (e) { drar = true; spor.setPointerCapture(e.pointerId); hopp(e); });
    spor.addEventListener("pointermove", function (e) { if (drar) hopp(e); });
    spor.addEventListener("pointerup", function () { drar = false; });
    spor.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { v.currentTime = Math.min(lengde(), v.currentTime + 5); e.preventDefault(); }
      if (e.key === "ArrowLeft") { v.currentTime = Math.max(0, v.currentTime - 5); e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { veksle(); e.preventDefault(); }
    });

    v.addEventListener("loadedmetadata", tegnSpor);
    v.addEventListener("timeupdate", fram);
    v.addEventListener("seeked", fram);
    v.addEventListener("play", function () { w.classList.remove("spl-ny", "spl-ferdig"); w.classList.add("spl-spiller"); pp.setAttribute("aria-label", t[2]); });
    v.addEventListener("pause", function () { w.classList.remove("spl-spiller"); pp.setAttribute("aria-label", t[1]); });
    v.addEventListener("ended", function () {
      w.classList.remove("spl-spiller");
      var h = w.getAttribute("data-videre");
      videre.hidden = !h;
      if (h) { videre.href = h; videre.innerHTML = (w.getAttribute("data-videre-tekst") || "") + ' <span aria-hidden="true">→</span>'; }
      w.classList.add("spl-ferdig");
    });
    v.addEventListener("emptied", function () { w.classList.remove("spl-spiller", "spl-ferdig"); w.classList.add("spl-ny"); tegnSpor(); });
    v.addEventListener("volumechange", function () { w.classList.toggle("spl-stum", v.muted); w.querySelector(".spl-lyd").setAttribute("aria-label", v.muted ? t[4] : t[3]); });

    tegnSpor();
    w.__spl = { tegn: tegnSpor, video: v };
    return w.__spl;
  }

  var alle = document.querySelectorAll(".spl");
  for (var i = 0; i < alle.length; i++) lag(alle[i]);
  window.Spiller = { lag: lag, oppdater: function (w) { var s = lag(w); if (s) s.tegn(); } };
})();
