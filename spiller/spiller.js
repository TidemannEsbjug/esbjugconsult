// Videospiller for forklaringsvideoene (eieren 25.11.2026): en ramme rundt filmen og én stor play-knapp i midten. Over
// rammen står logoen og navnet som overskrift (data-merke, data-ikon); overskriften og knappen forsvinner når filmen spilles.
// Ingen kontrollrad og ingen nettleserkontroller: klikk på filmen setter den på pause, og da kommer knappen tilbake. Når
// filmen er ferdig, står startbildet (plakaten) igjen med knappen og lenken videre (data-videre, data-videre-tekst). Et element med
// klassen spl-inni i .spl (språkvalget på forsiden) flyttes inn i rammen og står der alene til et språk er valgt. Stil: spiller.css.
// window.Spiller.oppdater(el) leser attributtene på nytt etter språkbytte.
(function () {
  var T = { no: ["Spill av", "Pause"], en: ["Play", "Pause"], de: ["Abspielen", "Pause"], fr: ["Lecture", "Pause"], es: ["Reproducir", "Pausa"],
            it: ["Riproduci", "Pausa"], nl: ["Afspelen", "Pauze"], pl: ["Odtwórz", "Pauza"] };
  T.nb = T.nn = T.no;
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function trekant() {
    var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(NS, "path"); p.setAttribute("d", "M7.6 5.3v13.4a1 1 0 0 0 1.5.86l9.4-6.7a1 1 0 0 0 0-1.72l-9.4-6.7a1 1 0 0 0-1.5.86z");
    s.appendChild(p); return s;
  }

  function lag(w) {
    if (w.__spl) return w.__spl;
    var v = w.querySelector("video");
    if (!v) return null;
    var t = T[(document.documentElement.lang || "en").slice(0, 2).toLowerCase()] || T.en;
    v.removeAttribute("controls");
    v.controls = false;
    v.setAttribute("playsinline", "");
    v.setAttribute("disablepictureinpicture", "");

    var hode = null, navn = null, ikon = null;
    if (w.hasAttribute("data-merke")) {
      hode = el("p", "spl-hode");
      ikon = el("img"); ikon.alt = ""; ikon.setAttribute("aria-hidden", "true"); ikon.width = 256; ikon.height = 256;
      navn = el("span");
      hode.appendChild(ikon); hode.appendChild(navn);
      w.insertBefore(hode, w.firstChild);
    }
    var ramme = el("div", "spl-ramme");
    v.parentNode.insertBefore(ramme, v);
    ramme.appendChild(v);
    var dekke = el("div", "spl-dekke");
    var knapp = el("button", "spl-knapp"); knapp.type = "button"; knapp.setAttribute("aria-label", t[0]); knapp.appendChild(trekant());
    var videre = el("a", "spl-videre"); videre.hidden = true;
    dekke.appendChild(knapp);
    dekke.appendChild(videre);
    var inni = w.querySelector(".spl-inni");
    // Med språkvalg (forsiden) står bare valget der først; play-knappen kommer når et språk er valgt (Spiller.valgt).
    if (inni) { dekke.appendChild(inni); w.classList.add("spl-velg"); }
    ramme.appendChild(dekke);
    w.classList.add("spl-klar");

    function les() {
      if (hode) {
        navn.textContent = w.getAttribute("data-merke") || "";
        var src = w.getAttribute("data-ikon") || "/klart/assets/klart-ikon.png";
        if (ikon.getAttribute("src") !== src) ikon.setAttribute("src", src);
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

    var slutt = false;
    knapp.addEventListener("click", spill);
    v.addEventListener("click", function () { if (!v.paused) v.pause(); else spill(); });
    v.addEventListener("play", function () { w.classList.remove("spl-ferdig"); w.classList.add("spl-spiller"); videre.hidden = true; knapp.setAttribute("aria-label", t[1]); });
    v.addEventListener("pause", function () { w.classList.remove("spl-spiller"); knapp.setAttribute("aria-label", t[0]); });
    v.addEventListener("ended", function () {
      w.classList.remove("spl-spiller");
      w.classList.add("spl-ferdig");
      // tilbake til startbildet (plakaten); load() gir «emptied», som ikke skal ta bort slutten
      slutt = true;
      v.load();
      les();
    });
    v.addEventListener("emptied", function () { if (slutt) { slutt = false; return; } w.classList.remove("spl-spiller", "spl-ferdig"); les(); });

    les();
    w.__spl = { les: les, video: v };
    return w.__spl;
  }

  var alle = document.querySelectorAll(".spl");
  for (var i = 0; i < alle.length; i++) lag(alle[i]);
  window.Spiller = { lag: lag, oppdater: function (w) { var s = lag(w); if (s) s.les(); },
    valgt: function (w) { w.classList.remove("spl-velg"); } };
})();
