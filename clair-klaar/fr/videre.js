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
  var ORD = { ja: "Oui", usikkert: "Incertain", nei: "Non" };
  // Kontrollen (/klart/api/maskin) deles med den norske siden og svarer på norsk. Svarene er et lite, fast sett,
  // så de kjennes igjen her og vises på fransk: [mønster, svar som vises i stedet (eller null), fransk tekst].
  // En setning som ikke står i listen, utelates; den vises aldri på norsk. Windows og Linux finnes fra 24.11.2026,
  // så svarene vises som kontrollen gir dem.
  var SLAG = { "Bærbar": "Portable", "Stasjonær": "Fixe", "Nettbrett": "Tablette", "Telefon": "Téléphone" };
  var TEKST = [
    [/^Alle Mac-er med Apple-prosessor/, null, "Tous les Mac à processeur Apple font fonctionner Clair & Klaar."],
    [/^Med macOS (\d+) eller nyere/, null, "Avec macOS $1 ou une version plus récente."],
    [/^Den kan ikke få macOS (\d+)/, null, "Il ne peut pas recevoir macOS $1, dont Clair & Klaar a besoin."],
    [/^Med Windows (\d+) eller (\d+)/, null, "Avec Windows $1 ou $2. Nous recommandons 8 Go de mémoire vive."],
    [/^Med en nyere Linux/, null, "Avec une version récente de Linux. Nous recommandons 8 Go de mémoire vive."],
    [/^Den har ARM-prosessor\. Klart er laget for Intel og AMD/, null, "Il a un processeur ARM. Clair & Klaar est conçu pour Intel et AMD et n’a pas été essayé sur cet appareil."],
    [/^Den har ARM-prosessor\. Klart for Linux/, null, "Il a un processeur ARM. Clair & Klaar pour Linux est conçu pour Intel et AMD."],
    [/^Klart trenger Windows/, null, "Clair & Klaar a besoin de Windows 10 ou 11."],
    [/Chromebook/, null, "Clair & Klaar ne fonctionne pas sur Chromebook."],
    [/^Klart er et program for Mac, Windows og Linux/, null, "Clair & Klaar est un logiciel pour Mac, Windows et Linux."],
  ];
  function fransk(m) {
    for (var i = 0; i < TEKST.length; i++) {
      var t = TEKST[i], treff = t[0].exec(m.tekst || "");
      if (treff) return { svar: t[1] || m.svar, tekst: t[2].replace("$1", treff[1] || "").replace("$2", treff[2] || "") };
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
      return si(svar.generelt ? "Nous n’avons pas trouvé cet ordinateur. Essayez la marque et le modèle, par exemple MacBook Air M2." : "");
    }
    if (svar.generelt && svar.merke) si("Nous n’avons pas trouvé ce modèle précis. Pour un appareil " + svar.merke + ", voici ce qui s’applique :");
    else if (svar.generelt) si("Nous n’avons pas trouvé ce modèle précis. Pour ce type d’appareil, voici ce qui s’applique :");
    else if (svar.naer) si("Nous n’avons pas trouvé ce modèle précis. Voici les plus proches :");
    else if (svar.flere) si(svar.treff.length + " résultats affichés sur " + (svar.treff.length + svar.flere) + ". Précisez votre saisie pour trouver votre appareil.");
    else si("");
    svar.treff.forEach(function (m) {
      var li = el("li");
      var f = fransk(m);
      li.appendChild(el("span", "v-svar " + (ORD[f.svar] ? f.svar : "usikkert"), ORD[f.svar] || ORD.usikkert));
      var navn = el("span", "v-sjekk-navn", m.navn);
      navn.appendChild(el("small", "", [m.merke, SLAG[m.slag] || ""].filter(Boolean).join(" · ")));
      li.appendChild(navn);
      li.appendChild(el("span", "v-sjekk-hvorfor", f.tekst));
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
        si("La recherche n’a pas fonctionné. Réessayez dans un instant.");
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
