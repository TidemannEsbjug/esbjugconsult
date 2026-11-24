// Resten av siden, under filtypene (videre.css). Det eneste som trenger skript,
// er de to arkene under «Navn blir koder»: de bytter mellom originalen og kopien.
//
// Arkene bytter av seg selv mens de er på skjermen, så den som bare ruller forbi,
// ser navnene bli til koder. Tar noen i bryteren, er det de som bestemmer, og
// byttingen stopper. Har maskinen bedt om mindre bevegelse, står arkene stille
// som kopi til noen trykker.
(function () {
  var scene = document.querySelector("[data-v-bytt]");
  if (!scene) return;

  var knapper = scene.querySelectorAll("[data-v-vis]");
  var rolig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var synlig = false;
  var styrtSelv = false;
  var klokke = null;

  function vis(hva) {
    scene.setAttribute("data-vis", hva);
    knapper.forEach(function (k) {
      k.setAttribute("aria-pressed", k.getAttribute("data-v-vis") === hva ? "true" : "false");
    });
  }

  function stopp() {
    if (klokke) clearInterval(klokke);
    klokke = null;
  }

  function start() {
    stopp();
    if (rolig || styrtSelv || !synlig) return;
    // Begynn med originalen, så det første man ser, er at navnene blir borte.
    vis("original");
    klokke = setInterval(function () {
      vis(scene.getAttribute("data-vis") === "kopi" ? "original" : "kopi");
    }, 2600);
  }

  knapper.forEach(function (k) {
    k.addEventListener("click", function () {
      styrtSelv = true;
      stopp();
      vis(k.getAttribute("data-v-vis"));
    });
  });

  if (!("IntersectionObserver" in window)) return;
  new IntersectionObserver(
    function (treff) {
      synlig = treff[0].isIntersecting;
      if (synlig) start();
      else stopp();
    },
    { threshold: 0.35 }
  ).observe(scene);

  // Fanen i bakgrunnen: ikke la klokka gå.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopp();
    else start();
  });
})();

// «Går Klart på maskinen din?» Feltet spør GET /klart/api/maskin?q=… mens man skriver, og
// viser de maskinene som passer, med svaret ved siden av. Svaret kommer fra listen hos oss
// (.worker/klart-maskin.js). Alt bygges med createElement og textContent: siden tillater ikke
// innerHTML (CSP), og navnene skal uansett aldri tolkes som noe annet enn tekst.
(function () {
  var boks = document.querySelector("[data-v-maskin]");
  if (!boks) return;

  var felt = boks.querySelector("input");
  var liste = boks.querySelector("[data-v-svar]");
  var melding = boks.querySelector("[data-v-melding]");
  var ORD = { ja: "Sí", usikkert: "Quizá", nei: "No" };
  var SLAG = { "Bærbar": "Portátil", "Stasjonær": "Sobremesa", "Nettbrett": "Tableta", "Telefon": "Teléfono" };
  // Svarene fra /klart/api/maskin er norske og gjelder Klart på Mac, Windows og Linux, som Clarísimo.
  // Her oversettes de til spansk. ARM-Linux får «Quizá»: det finnes en arm64-pakke, men den er ikke prøvd på modellen.
  function spansk(m) {
    var t = m.tekst || "";
    var v;
    if (/^Alle Mac-er/.test(t)) return ["ja", "Todos los Mac con procesador Apple ejecutan Clarísimo."];
    if ((v = /^Med macOS (\S+) eller nyere/.exec(t))) return ["ja", "Con macOS " + v[1] + " o posterior."];
    if ((v = /^Den kan ikke få macOS (\S+)/.exec(t))) return ["nei", "No puede tener macOS " + v[1] + ", que Clarísimo necesita."];
    if ((v = /^Med Windows 10 eller 11\. Vi anbefaler (\d+) GB/.exec(t))) return ["ja", "Con Windows 10 u 11. Recomendamos " + v[1] + " GB de memoria."];
    if ((v = /^Med en nyere Linux\. Vi anbefaler (\d+) GB/.exec(t))) return ["ja", "Con un Linux reciente. Recomendamos " + v[1] + " GB de memoria."];
    if (/^Den har ARM-prosessor\. Klart for Linux/.test(t)) return ["usikkert", "Tiene procesador ARM. Clarísimo tiene una descarga para Linux en ARM (arm64), pero no se ha probado en este modelo."];
    if (/^Den har ARM-prosessor/.test(t)) return ["usikkert", "Tiene procesador ARM. Clarísimo para Windows está hecho para Intel y AMD, y no se ha probado en este equipo."];
    if (/^Klart trenger Windows/.test(t)) return ["nei", "Clarísimo necesita Windows 10 u 11."];
    if (/Chromebook/.test(t)) return ["nei", "Clarísimo no funciona en Chromebook."];
    return ["nei", "Clarísimo es un programa para Mac, Windows y Linux."];
  }
  var venter = null;
  var runde = 0;

  function si(tekst) {
    melding.textContent = tekst || "";
    melding.hidden = !tekst;
  }

  function tom() {
    while (liste.firstChild) liste.removeChild(liste.firstChild);
  }

  function el(navn, klasse, tekst) {
    var e = document.createElement(navn);
    if (klasse) e.className = klasse;
    if (tekst) e.textContent = tekst;
    return e;
  }

  function vis(svar) {
    tom();
    if (!svar || !svar.treff) return si("");
    if (!svar.treff.length) {
      // Verken modellen, merket eller systemet er kjent: be om det, i stedet for å gjette.
      return si(svar.generelt ? "No hemos encontrado este equipo. Pruebe con la marca y el modelo, por ejemplo ThinkPad T14." : "");
    }
    if (svar.generelt && svar.merke) si("No hemos encontrado exactamente este modelo. Para un equipo de " + svar.merke + " vale lo siguiente:");
    else if (svar.generelt) si("No hemos encontrado exactamente este modelo. Para equipos así vale lo siguiente:");
    else if (svar.naer) si("No hemos encontrado exactamente este modelo. Estos son los más parecidos:");
    else if (svar.flere) si("Se muestran " + svar.treff.length + " de " + (svar.treff.length + svar.flere) + ". Escriba un poco más para encontrar su equipo.");
    else si("");
    svar.treff.forEach(function (m) {
      var li = el("li");
      var es = spansk(m);
      li.appendChild(el("span", "v-svar " + es[0], ORD[es[0]]));
      var navn = el("span", "v-sjekk-navn", m.navn);
      navn.appendChild(el("small", "", [m.merke, SLAG[m.slag] || m.slag].filter(Boolean).join(" · ")));
      li.appendChild(navn);
      li.appendChild(el("span", "v-sjekk-hvorfor", es[1]));
      liste.appendChild(li);
    });
  }

  function sok() {
    var q = felt.value.trim();
    var min = ++runde;
    if (q.length < 2) {
      tom();
      return si("");
    }
    fetch("/klart/api/maskin?q=" + encodeURIComponent(q))
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (svar) {
        // Et eldre svar skal ikke skrive over et nyere.
        if (min === runde) vis(svar);
      })
      .catch(function () {
        if (min !== runde) return;
        tom();
        si("La búsqueda no ha funcionado ahora mismo. Inténtelo de nuevo dentro de un momento.");
      });
  }

  felt.addEventListener("input", function () {
    clearTimeout(venter);
    venter = setTimeout(sok, 180);
  });
  felt.form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(venter);
    sok();
  });
  boks.querySelectorAll("[data-v-prov]").forEach(function (k) {
    k.addEventListener("click", function () {
      felt.value = k.getAttribute("data-v-prov");
      felt.focus({ preventScroll: true });
      sok();
    });
  });
})();
