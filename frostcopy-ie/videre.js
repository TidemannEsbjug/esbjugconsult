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
  var ORD = { ja: "Yes", usikkert: "Unsure", nei: "No" };
  // The lookup (/klart/api/maskin) is shared with the Norwegian site and answers in Norwegian. The answers are a
  // small fixed set, so they are matched here and shown in English: [pattern, answer to show instead (or null),
  // English text]. A sentence that is not in the list is left out, never shown in Norwegian. The Norwegian list
  // speaks of a Linux on ARM download, which this edition does not have yet.
  var SLAG = { "Bærbar": "Laptop", "Stasjonær": "Desktop", "Nettbrett": "Tablet", "Telefon": "Phone" };
  var TEKST = [
    [/^Alle Mac-er med Apple-prosessor/, null, "Every Mac with an Apple processor runs FrostCopy."],
    [/^Med macOS (\d+) eller nyere/, null, "With macOS $1 or later."],
    [/^Den kan ikke få macOS (\d+)/, null, "It cannot get macOS $1, which FrostCopy needs."],
    [/^Med Windows 10 eller 11\. Vi anbefaler (\d+) GB/, null, "With Windows 10 or 11. We recommend $1 GB of memory."],
    [/^Med en nyere Linux\. Vi anbefaler (\d+) GB/, null, "With a recent Linux. We recommend $1 GB of memory."],
    [/^Den har ARM-prosessor\. Klart er laget for Intel og AMD/, null, "It has an ARM processor. FrostCopy for Windows is made for Intel and AMD, and has not been tried on this one."],
    [/^Den har ARM-prosessor\. Klart for Linux/, "usikkert", "It has an ARM processor. FrostCopy for Linux on ARM (arm64) has not been tried on this model."],
    [/^Klart trenger Windows/, null, "FrostCopy needs Windows 10 or 11."],
    [/Chromebook/, null, "FrostCopy does not run on Chromebooks."],
    [/^Klart er et program for Mac, Windows og Linux/, null, "FrostCopy is a program for Mac, Windows and Linux."],
  ];
  function engelsk(m) {
    for (var i = 0; i < TEKST.length; i++) {
      var t = TEKST[i], treff = t[0].exec(m.tekst || "");
      if (treff) return { svar: t[1] || m.svar, tekst: t[2].replace("$1", treff[1] || "") };
    }
    return { svar: m.svar, tekst: "" };
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
      return si(svar.generelt ? "We did not find that computer. Try make and model, for example ThinkPad T14." : "");
    }
    if (svar.generelt && svar.merke) si("We did not find that exact model. For a computer from " + svar.merke + ", this applies:");
    else if (svar.generelt) si("We did not find that exact model. This applies to computers of that kind:");
    else if (svar.naer) si("We did not find that exact model. These are the closest:");
    else if (svar.flere) si("Showing " + svar.treff.length + " of " + (svar.treff.length + svar.flere) + ". Type a little more to find yours.");
    else si("");
    svar.treff.forEach(function (m) {
      var li = el("li");
      var e = engelsk(m);
      li.appendChild(el("span", "v-svar " + (ORD[e.svar] ? e.svar : "usikkert"), ORD[e.svar] || ORD.usikkert));
      var navn = el("span", "v-sjekk-navn", m.navn);
      navn.appendChild(el("small", "", [m.merke, SLAG[m.slag] || ""].filter(Boolean).join(" · ")));
      li.appendChild(navn);
      li.appendChild(el("span", "v-sjekk-hvorfor", e.tekst));
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
        si("We could not look that up right now. Try again in a moment.");
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
