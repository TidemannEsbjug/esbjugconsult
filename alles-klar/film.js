// Filmen i heroen, strømmet i biter på to sekunder med MediaSource. Bare det neste som trengs hentes: den som går
// videre etter noen sekunder, laster ikke ned resten. Nettlesere uten MediaSource (som iPhone) får samme film som en vanlig
// fil, og det gjør også alle andre hvis noe går galt underveis. På datasparing eller svært tregt nett vises bare sluttbildet.
(function () {
  var film = document.querySelector(".scene-film");
  var scene = document.querySelector(".scene");
  if (!film || !scene) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // forside.js viser sluttbildet

  var nett = navigator.connection;
  if (nett && (nett.saveData || /2g/.test(nett.effectiveType || ""))) {
    scene.classList.add("stille");
    return;
  }

  var ROT = film.getAttribute("data-rot");
  var BITER = Number(film.getAttribute("data-biter"));
  var TYPE = 'video/mp4; codecs="' + film.getAttribute("data-kodek") + '"';
  var FORAN = 6; // sekunder som hentes i forkant
  var strommer = false;

  function vanligFil(fra) {
    strommer = false;
    if (fra) {
      film.addEventListener("loadedmetadata", function () {
        film.currentTime = fra;
      }, { once: true });
    }
    film.src = ROT + "hel.mp4";
    film.load();
    spill();
  }

  function spill() {
    var p = film.play();
    if (p) p.catch(function () {}); // Blokkert autoavspilling: startbildet blir stående.
  }

  // Feil: fra strømming til vanlig fil. Feiler også den, vises sluttbildet.
  film.addEventListener("error", function () {
    if (strommer) vanligFil(film.currentTime);
    else scene.classList.add("stille");
  });

  // Ute av syne står filmen stille, og da hentes heller ikke mer.
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) {
        if (film.paused && !film.ended && film.src) spill();
      } else {
        film.pause();
      }
    }).observe(film);
  }

  if (!window.MediaSource || !MediaSource.isTypeSupported(TYPE)) return vanligFil(0);

  function hent(navn, forsok) {
    var stopp = new AbortController();
    var tid = setTimeout(function () {
      stopp.abort();
    }, 10000);
    return fetch(ROT + navn, { signal: stopp.signal })
      .then(function (r) {
        if (!r.ok) throw new Error(navn + ": " + r.status);
        return r.arrayBuffer();
      })
      .catch(function (err) {
        if (forsok > 0) return hent(navn, forsok - 1);
        throw err;
      })
      .finally(function () {
        clearTimeout(tid);
      });
  }

  strommer = true;
  var kilde = new MediaSource();
  film.src = URL.createObjectURL(kilde);

  kilde.addEventListener("sourceopen", function () {
    URL.revokeObjectURL(film.src);
    var buffer;
    var neste = 0;
    var henter = false;
    var startet = false;

    function gaaOver(err) {
      if (!strommer) return;
      if (window.console) console.warn("Filmen byttet til vanlig fil:", err);
      vanligFil(film.currentTime);
    }

    function foran() {
      var b = film.buffered;
      return b.length ? b.end(b.length - 1) - film.currentTime : 0;
    }

    function fyll() {
      if (!strommer || henter || buffer.updating || kilde.readyState !== "open") return;
      if (neste >= BITER) {
        kilde.endOfStream();
        return;
      }
      if (foran() >= FORAN) return;
      henter = true;
      hent("b" + String(neste).padStart(3, "0") + ".m4s", 2)
        .then(function (data) {
          if (!strommer) return;
          buffer.appendBuffer(data);
          neste++;
          henter = false;
        })
        .catch(gaaOver);
    }

    try {
      buffer = kilde.addSourceBuffer(TYPE);
    } catch (err) {
      return gaaOver(err);
    }
    buffer.addEventListener("updateend", function () {
      if (!startet && neste > 0) {
        startet = true;
        spill();
      }
      fyll();
    });
    buffer.addEventListener("error", gaaOver);
    film.addEventListener("timeupdate", fyll);

    hent("start.mp4", 2)
      .then(function (data) {
        buffer.appendBuffer(data);
      })
      .catch(gaaOver);
  });
})();
