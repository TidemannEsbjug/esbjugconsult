// Hei, du som leser dette. Se kommentaren øverst i kildekoden til siden.
console.info(
  "Hei, du som sjekker. Bra.\nProgrammet: /klart/til-it\nFant du noe? tidemann@esbjugconsult.com (/.well-known/security.txt)"
);

// Menyen kommer først når man har scrollet forbi toppen av bildet.
(function () {
  var topp = document.querySelector(".topbar");
  if (!topp) return;
  function sjekk() {
    topp.classList.toggle("synlig", window.scrollY > 120);
  }
  window.addEventListener("scroll", sjekk, { passive: true });
  sjekk();
})();

// Nedlasting: virksomheten først. Små og store får «godkjent», at prøven er gratis og hele programmet,
// hva lisensen koster for dem hvis de kjøper etterpå (GET /klart/api/sjekk gir prisen), og knappene;
// de store får også høre om skreddersydd oppsett. Begge feltene på siden viser samme svar.
(function () {
  var skjemaer = document.querySelectorAll("[data-orgport]");

  // I heroen: når de begynner å skrive, vet vi hva de vil. Overskriften viker, og feltet glir opp
  // (CSS: .scene-tekst.skriver).
  var tekst = document.querySelector(".hero .scene-tekst");
  var toppskjema = tekst && tekst.querySelector("[data-orgport]");
  // Virksomheten i adressen: de kommer tilbake fra prissiden, og kortet deres skal stå der.
  var fraAdressen = String(new URLSearchParams(location.search).get("orgnr") || "").replace(/\D/g, "");
  if (!KlartOrgfelt.gyldig(fraAdressen)) fraAdressen = null;
  // På desktop står markøren i feltet med en gang, så det er tydelig hvor man skal skrive.
  if (toppskjema && !fraAdressen && window.matchMedia("(pointer: fine)").matches) {
    toppskjema.querySelector("input").focus({ preventScroll: true });
  }
  var harSvar = false;

  // Overgangen skal være én bevegelse. Radene i rutenettet går fra «auto» til
  // «fr», og det kan ikke nettleseren animere: kortet hoppet. Derfor leses
  // radhøydene i piksler før og etter byttet, og radene glir mellom dem.
  // Sentreringen holdes fast underveis, ellers hopper kortet til toppen først.
  var stille = window.matchMedia("(prefers-reduced-motion: reduce)");

  function rensRader() {
    if (!tekst) return;
    tekst.style.removeProperty("grid-template-rows");
    tekst.style.removeProperty("align-content");
  }

  function skriver(ja) {
    if (!tekst || tekst.classList.contains("skriver") === ja) return;
    if (stille.matches || tekst.classList.contains("har-svar")) {
      rensRader();
      tekst.classList.toggle("skriver", ja);
      return;
    }
    var fra = getComputedStyle(tekst).gridTemplateRows;
    // Sluttpunktet måles uten overgang; ellers svarer nettleseren med
    // startverdien til en overgang den ikke kan animere.
    tekst.style.transition = "none";
    rensRader();
    tekst.classList.toggle("skriver", ja);
    var til = getComputedStyle(tekst).gridTemplateRows;
    tekst.style.alignContent = "center";
    tekst.style.gridTemplateRows = fra;
    void tekst.offsetHeight;
    tekst.style.removeProperty("transition");
    tekst.style.gridTemplateRows = til;
  }

  if (tekst) {
    tekst.addEventListener("transitionend", function (e) {
      if (e.target === tekst && e.propertyName === "grid-template-rows") rensRader();
    });
  }

  // Navnet er det de har ventet på: bokstavene spretter inn én og én, hele ord holdes samlet.
  function spreNavn(el, navn) {
    el.textContent = "";
    el.setAttribute("aria-label", navn);
    var i = 0;
    navn.split(" ").forEach(function (ord, n) {
      if (n) el.appendChild(document.createTextNode(" "));
      var o = document.createElement("span");
      o.className = "orgport-ord";
      o.setAttribute("aria-hidden", "true");
      Array.from(ord).forEach(function (tegn) {
        var b = document.createElement("span");
        b.className = "orgport-bokstav";
        b.style.setProperty("--i", Math.min(i++, 28));
        b.textContent = tegn;
        o.appendChild(b);
      });
      el.appendChild(o);
    });
  }

  function visSvar(svar) {
    harSvar = true;
    history.replaceState(null, "", location.pathname + "?orgnr=" + svar.orgnr);
    // Svaret tar hele plassen: overskriften og boksen viker, og kortet står alene midt i bildet.
    if (tekst) {
      rensRader();
      tekst.classList.remove("skriver");
      tekst.classList.add("har-svar");
    }
    skjemaer.forEach(function (s) {
      s.classList.add("svar");
      // De store er selvsagt godkjent. De får et bredere felt med skreddersydd oppsett ved siden av.
      s.classList.toggle("stor", Boolean(svar.stor));
      s.querySelector("[data-orgport-sok]").hidden = true;
      var boks = s.querySelector("[data-orgport-svar]");
      boks.querySelectorAll("[data-navn]").forEach(function (el) {
        if (el.classList.contains("orgport-firmanavn")) spreNavn(el, svar.navn);
        else el.textContent = svar.navn;
      });
      boks.querySelector("[data-orgnr]").textContent = KlartOrgfelt.tekst(svar.orgnr);
      boks.querySelectorAll("[data-godkjent]").forEach(function (el) {
        // Kommuner og stat får ikke «Godkjent»-merket (eieren 11.11.2026), og de store har sitt eget kort.
        el.hidden = Boolean(svar.stor || svar.offentlig);
      });
      boks.querySelector("[data-stor]").hidden = !svar.stor;
      if (svar.stor) new Image().src = "assets/klart-maskin-sno.jpg"; // Klart når de trykker «Les om skreddersydd oppsett».
      boks.querySelector("[data-oppsett]").href = "pris/?orgnr=" + svar.orgnr + "&vis=oppsett&fra=forside";
      var pris = boks.querySelector("[data-pris]");
      pris.hidden = !svar.pris;
      if (svar.pris) {
        boks.querySelector("[data-prisbelop]").textContent =
          new Intl.NumberFormat("nb-NO").format(svar.pris) + " kr";
        boks.querySelector("[data-prishvem]").textContent = svar.konsern ? svar.navn + " og hele konsernet" : svar.navn;
        // Alle ser prisen per år, også kommuner og stat (eieren 11.11.2026).
        boks.querySelector("[data-prisnaar]").textContent = "Per år";
        // Kommuner og stat: det står at det ikke er noen binding (eieren 11.11.2026).
        boks.querySelector("[data-binding]").hidden = !svar.offentlig;
        boks.querySelector("[data-prislenke]").href = "pris/?orgnr=" + svar.orgnr + "&fra=forside";
      }
      boks.hidden = false;
    });
  }

  function nullstill() {
    harSvar = false;
    history.replaceState(null, "", location.pathname);
    document.documentElement.classList.remove("uten-feiring");
    skjemaer.forEach(function (s) {
      s.classList.remove("stor", "svar");
      s.querySelector("[data-orgport-svar]").hidden = true;
      s.querySelector("[data-orgport-sok]").hidden = false;
    });
    if (tekst) tekst.classList.remove("har-svar");
    skriver(false);
  }

  skjemaer.forEach(function (skjema) {
    var input = skjema.querySelector("input");
    var knapp = skjema.querySelector("button[type=submit]");
    var feilEl = skjema.querySelector(".orgport-feil");
    var felt = KlartOrgfelt(input, skjema.querySelector(".orgforslag"), sjekk);

    if (skjema === toppskjema) {
      input.addEventListener("input", function () {
        skriver(Boolean(input.value.trim()));
      });
      // Tømmer de feltet og går videre uten å ha valgt noe, kommer boksen tilbake.
      input.addEventListener("blur", function () {
        setTimeout(function () {
          if (!input.value.trim() && !harSvar && document.activeElement !== input) skriver(false);
        }, 150);
      });
    }

    function feil(melding) {
      feilEl.textContent = melding || "";
      feilEl.hidden = !melding;
    }

    function sjekk(o) {
      feil("");
      knapp.disabled = true;
      return fetch("/klart/api/sjekk?orgnr=" + o)
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error(j.feil || "Noe gikk galt. Prøv igjen om litt.");
            return j;
          });
        })
        .then(function (svar) {
          // En underenhet laster ned på vegne av hovedenheten.
          if (svar.underenhet) return sjekk(svar.overordnet.orgnr);
          visSvar(svar);
        })
        .catch(function (err) {
          feil(err.message);
        })
        .finally(function () {
          knapp.disabled = false;
        });
    }

    skjema.addEventListener("submit", function (e) {
      e.preventDefault();
      var o = felt.orgnr() || (!felt.sifre() && felt.forste());
      if (!o) {
        feil(
          felt.sifre()
            ? "Organisasjonsnummeret stemmer ikke. Sjekk at alle ni sifrene er riktige."
            : "Fant ingen virksomhet med det navnet. Prøv organisasjonsnummeret."
        );
        return;
      }
      sjekk(o);
    });

    // «Gratis prøve»: hele boksen peker på nedlastingsknappene.
    skjema.querySelector("[data-til-knapper]").addEventListener("click", function (e) {
      e.preventDefault();
      var get = skjema.querySelector(".get");
      get.scrollIntoView({ block: "nearest", behavior: "smooth" });
      get.classList.remove("pek");
      void get.offsetWidth;
      get.classList.add("pek");
      get.querySelector("a").focus({ preventScroll: true });
    });

    skjema.querySelector("[data-endre]").addEventListener("click", function () {
      nullstill();
      felt.tom();
      input.focus();
    });

    if (skjema === toppskjema && fraAdressen) {
      input.value = KlartOrgfelt.tekst(fraAdressen);
      sjekk(fraAdressen).finally(function () {
        document.documentElement.classList.remove("kommer-tilbake");
      });
    }
  });
})();

(function () {
  var reveal = document.querySelectorAll(".rise");
  if (!("IntersectionObserver" in window)) {
    reveal.forEach(function (el) {
      el.classList.add("in");
    });
    return;
  }
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
  );
  reveal.forEach(function (el) {
    io.observe(el);
  });
  // Sikkerhetsnett. Kommer det ingen beskjed fra IntersectionObserver, står
  // siden helt tom - alt innhold ligger på opacity: 0 og venter. Det skjer i
  // innebygde nettlesere (WKWebView) og når vinduet ennå ikke har fått
  // størrelse når siden lastes. Etter et øyeblikk viser vi derfor alt som
  // faktisk er innenfor skjermen, og lar resten bli som før på rulling.
  setTimeout(function () {
    reveal.forEach(function (el) {
      if (el.classList.contains("in")) return;
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0 && r.width > 0) {
        el.classList.add("in");
        io.unobserve(el);
      }
    });
  }, 900);
})();

// macOS-knappen i heroen er glass når man holder over. Musa er lyskilden:
// lyset innenfra står der den er (--mx, --my), og lyset på kanten ligger på
// siden mot den og på motsatt side (--vinkel, retningen fra midten).
// Gjelder begge Mac-knappene i heroen (i kortet og i svaret etter oppslaget) og
// den nederst på siden.
document.querySelectorAll(".hero .os-mac, .v-hent .os-mac").forEach(function (mac) {
  mac.addEventListener("pointermove", function (e) {
    var r = mac.getBoundingClientRect();
    var x = e.clientX - r.left;
    var y = e.clientY - r.top;
    var vinkel = (Math.atan2(x - r.width / 2, -(y - r.height / 2)) * 180) / Math.PI;
    mac.style.setProperty("--mx", (x / r.width) * 100 + "%");
    mac.style.setProperty("--my", (y / r.height) * 100 + "%");
    mac.style.setProperty("--vinkel", vinkel + "deg");
  });
  mac.addEventListener("pointerleave", function () {
    ["--mx", "--my", "--vinkel"].forEach(function (v) {
      mac.style.removeProperty(v);
    });
  });
});

// Terminalen i kortet når man holder over Linux: linjene renner nedover bak
// innholdet og ligger delvis bak knappene og feltet. Klart installeres med apt
// (på norsk, slik det står i en norsk terminal), sladder et dokument, og har
// et lite Star Wars-nikk: Jedi-trikset og «May the source be with you».
// Kommandoene skrives i tastefart, utdata kommer linje for linje
// (CSS: .kort-terminal). Starter på nytt hver gang, fordi laget vises på nytt.
(function () {
  var tekst = document.querySelector(".hero .scene-tekst");
  if (!tekst || !window.matchMedia("(hover: hover)").matches) return;
  // Skriften lastes med en gang; ellers bytter den mens første linje skrives,
  // og teksten hopper.
  if (document.fonts && document.fonts.load) document.fonts.load('500 12.5px "JetBrains Mono"');
  var linjer = [
    ["$ sudo apt install klart", "kommando"],
    ["Leser pakkelister... Ferdig"],
    ["Bygger avhengighetstre... Ferdig"],
    ["Leser tilstandsinformasjon... Ferdig"],
    ["Følgende NYE pakker vil bli installert:"],
    ["  klart"],
    ["0 oppgraderte, 1 nylig installerte, 0 å fjerne og 0 ikke oppgradert."],
    ["Setter opp klart (1.0) ..."],
    ["$ klart --jedi", "kommando"],
    ["Dette er ikke personopplysningene du leter etter."],
    ["$ klart sladd ~/Dokumenter/rapport.docx", "kommando"],
    ["Leser rapport.docx ... 14 personopplysninger funnet"],
    ["Sladdet: 6 navn, 4 fødselsnumre, 3 adresser, 1 telefonnummer"],
    ['$ echo "May the source be with you."', "kommando"],
    ["May the source be with you."],
    ["$ ", "kommando markor"],
  ];
  var term = document.createElement("div");
  term.className = "kort-terminal";
  term.setAttribute("aria-hidden", "true");
  var tid = 150;
  linjer.forEach(function (l) {
    var el = document.createElement("span");
    el.textContent = l[0];
    if (l[1]) el.className = l[1];
    var n = Math.max(l[0].length, 1);
    var kommando = l[1] && l[1].indexOf("kommando") > -1;
    el.style.setProperty("--n", n);
    el.style.setProperty("--f", tid + "ms");
    // Kommandoer skrives i tastefart med en liten pause etter; utdata kommer linje for linje.
    tid += kommando ? n * 24 + 300 : 120;
    term.appendChild(el);
  });
  // Foran innholdet i rekkefølgen, så knappene og feltet tegnes oppå den.
  tekst.insertBefore(term, tekst.querySelector(".privat"));
})();

// Snøen i heroen, fra forsiden på esbjugconsult.com: hvert fnugg har en avstand
// z (0 langt borte, 1 nærmest). Nære fnugg er større og faller fortere. Musa
// blåser litt på fnuggene: de nærmeste får et lite dytt i musas retning og bort
// fra pekeren, som dør ut.
//
// Den starter svært rolig og minimalistisk og tiltar jo lenger man blir på
// heroen: kurven stiger sakte først og raskere mot slutten, og etter rundt fem
// minutter snør det tett, med større og hvitere fnugg. Bare de som blir, ser
// den slik. Klokka står når heroen ikke er synlig eller fanen er i bakgrunnen.
// All snø kommer ovenfra: hvert fnugg starter over toppen og må falle inn i
// bildet, også de første og de som kommer til når det tiltar.
//
// Tre lag:
// - bak (.scene-sno): de fleste fnuggene, bak «Klart» og kortet;
// - midt (.scene-sno-midt): en firedel av fnuggene faller over kortets glass,
//   men bak overskriften, knappene og feltet i kortet;
// - foran (.scene-sno-lag): snøen som har lagt seg.
//
// Snøen legger seg der et fnugg treffer en overflate ovenfra: toppen av kortet
// (også ned over de runde hjørnene, tynnere jo brattere det er), bokstavene i
// «Klart», og for fnuggene i midtlaget også bokstavene i «Gratis for
// privatpersoner.», toppen av nedlastingsknappene og feltet. Formen på
// bokstavene måles (glyfene tegnes på et usynlig lerret og toppen av hver
// kolonne leses av). Kappen jevner seg ut (snøen sklir til den ligger stabilt)
// og har en høyeste høyde. Når kortet eller «Klart» flytter seg (de skriver,
// eller en virksomhet er slått opp), faller snøen av og begynner på nytt.
//
// Ingen snø hvis maskinen har bedt om mindre bevegelse.
(function () {
  var c = document.querySelector(".hero .scene-sno");
  var cm = document.querySelector(".hero .scene-sno-midt");
  var cl = document.querySelector(".hero .scene-sno-lag");
  var tekst = document.querySelector(".hero .scene-tekst");
  var ord = document.querySelector(".hero .logo-ord");
  var privat = tekst && tekst.querySelector(".privat");
  // Full snø (tiltar, legger seg) er av inntil videre (10.11.2026) og jobbes
  // videre med som eget element; ?sno=pa (eller ?sno=fort for full styrke med
  // en gang) slår den på. Uten det snør det bare mens noen laster ned
  // (.scene-tekst.laster): minimalistisk, ovenfra, og ingenting legger seg.
  // Når nedlastingskortet lukkes, kommer det ikke flere fnugg; de som faller,
  // daler ut.
  var FULL = /[?&]sno=(pa|fort)\b/.test(location.search);
  if (!c || !cm || !cl || !tekst || !ord || !privat || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  function aktiv() {
    return FULL || tekst.classList.contains("laster");
  }
  var x = c.getContext("2d");
  var xm = cm.getContext("2d");
  var xl = cl.getContext("2d");
  var w = 0, h = 0, f = [], synlig = true;

  // Tiltak: 0 ved start, 1 etter TID sekunder på heroen. Stiger sakte først.
  var TID = 300, MAKS = 30, tid = 0, sist = performance.now();
  // Til utprøving: ?sno=fort gir full styrke med en gang.
  if (/[?&]sno=fort\b/.test(location.search)) {
    tid = TID;
    window.__sno = function () {
      return { flater: flater, frys: frys, kort: kort };
    };
  }
  function styrke() {
    var t = Math.min(tid / TID, 1);
    return t * t;
  }

  function nytt(y) {
    var z = Math.pow(Math.random(), 1.7);
    return { x: Math.random() * w, y: y, z: z, r: 0.4 + z * 1.4, v: 0.15 + z * 0.5, s: Math.random() * 6.28, dx: 0, dy: 0, foran: Math.random() < 0.25 };
  }
  var grunn = 0, lastSno = 0;
  function str() {
    if (c.clientWidth === w && c.clientHeight === h) return;
    var nyBredde = c.clientWidth !== w;
    var d = Math.min(window.devicePixelRatio || 1, 2);
    w = c.clientWidth;
    h = c.clientHeight;
    [[c, x], [cm, xm], [cl, xl]].forEach(function (par) {
      par[0].width = w * d;
      par[0].height = h * d;
      par[1].setTransform(d, 0, 0, d, 0, 0);
    });
    grunn = Math.max(8, Math.round((w * h) / 40000));
    if (nyBredde || !f.length) {
      // Alle starter over toppen, spredt i høyden, så de faller inn etter tur.
      f = [];
      for (var i = 0; i < grunn * MAKS; i++) {
        var ny = nytt(-6 - Math.random() * h);
        ny.parkert = !FULL;
        f.push(ny);
      }
    }
    flater = null;
    nokkel = "";
  }

  var mus = { x: -999, y: -999, vx: 0, vy: 0 };
  var scene = c.parentNode;
  scene.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var r = c.getBoundingClientRect();
    var nx = e.clientX - r.left, ny = e.clientY - r.top;
    if (mus.x > -999) {
      mus.vx = mus.vx * 0.5 + (nx - mus.x) * 0.5;
      mus.vy = mus.vy * 0.5 + (ny - mus.y) * 0.5;
    }
    mus.x = nx;
    mus.y = ny;
  });
  scene.addEventListener("pointerleave", function () {
    mus.x = mus.y = -999;
    mus.vx = mus.vy = 0;
  });
  var R = 130;

  // Flatene snøen kan legge seg på. Hver flate har en kolonne per KOL px:
  // topp[i] er overflaten (y), hoyde[i] er snøen som ligger der, maks[i] det
  // meste som får plass der. «lag» sier hvilke fnugg som lander her: "bak"
  // (bare de bak kortet; de over glasset faller forbi kanten), "foran" (bare
  // de over glasset) eller "alle".
  var KOL = 2;
  var flater = null, nokkel = "", maaltSist = 0, kort = null, kortFlate = null;

  // En boks med runde hjørner (radius rund): overflaten følger buen i
  // hjørnene, og snøen blir tynnere jo brattere det er.
  function rundFlate(r, r0, rund, maks, lag) {
    var v = r.left - r0.left, topp = r.top - r0.top;
    var n = Math.max(0, Math.floor(r.width / KOL));
    var t = new Float32Array(n), m = new Float32Array(n);
    rund = Math.min(rund, r.width / 2, r.height);
    for (var i = 0; i < n; i++) {
      var px = i * KOL + KOL / 2;
      var inn = Math.min(px, r.width - px);
      var y = 0, bratt = 0;
      if (inn < rund) {
        var dx = rund - inn;
        y = rund - Math.sqrt(Math.max(0, rund * rund - dx * dx));
        bratt = dx / rund;
      }
      t[i] = topp + y;
      // Snøen bøyer seg over hjørnet og et godt stykke ned buen, tynnere jo
      // brattere det er.
      m[i] = bratt > 0.995 ? 0 : maks * Math.max(0.22, 1 - bratt * bratt * 0.8);
    }
    return { venstre: v, topp: t, hoyde: new Float32Array(n), maks: m, lag: lag, brudd: 60, sjanse: 1, vekst: 2.5, kol: KOL };
  }

  // Tekst: tegn hvert tegn der det står, på et usynlig lerret, og les av
  // toppen av hver kolonne.
  function tekstFlate(el, r0, maks, lag) {
    var node = el.firstChild;
    while (node && node.nodeType !== 3) node = node.firstChild;
    if (!node || !node.length) return null;
    var cs = getComputedStyle(node.parentNode);
    var rr = document.createRange();
    rr.selectNodeContents(node);
    var helt = rr.getBoundingClientRect();
    if (!helt.width) return null;
    var marg = 20;
    var bw = Math.ceil(helt.width + marg * 2), bh = Math.ceil(helt.height + marg * 2);
    var lerret = document.createElement("canvas");
    lerret.width = bw;
    lerret.height = bh;
    var g = lerret.getContext("2d", { willReadFrequently: true });
    g.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    g.fillStyle = "#000";
    g.textBaseline = "alphabetic";
    var opp = g.measureText(node.data).fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.9;
    for (var i = 0; i < node.length; i++) {
      if (node.data[i] === " ") continue;
      rr.setStart(node, i);
      rr.setEnd(node, i + 1);
      var b = rr.getBoundingClientRect();
      g.fillText(node.data[i], b.left - helt.left + marg, b.top - helt.top + marg + opp);
    }
    var data = g.getImageData(0, 0, bw, bh).data;
    // Alle oversider i hver kolonne: der blekket begynner etter minst 3 px
    // luft. Den øverste er toppen av bokstaven; de neste er kneet i K-en,
    // foten på l-en, buen nederst i a-en osv. Hver «etasje» blir sin egen flate.
    var kol = 1;
    var n = Math.floor(bw / kol), ETASJER = 4;
    var lag2 = [];
    for (var e = 0; e < ETASJER; e++) lag2.push({ t: new Float32Array(n).fill(NaN), m: new Float32Array(n) });
    for (var k = 0; k < n; k++) {
      var kx = k * kol, luft = 99, nr = 0;
      for (var y = 0; y < bh && nr < ETASJER; y++) {
        var blekk = data[(y * bw + kx) * 4 + 3] > 140;
        if (blekk) {
          if (luft >= 3) {
            lag2[nr].t[k] = y + helt.top - r0.top - marg;
            lag2[nr].m[k] = nr === 0 ? maks : maks * 0.55;
            nr++;
          }
          luft = 0;
        } else luft++;
      }
    }
    // Bare flater som er nokså flate og minst 4 px brede får snø: bratte sider
    // og smale kanter blir bare, og snøen tynnes jo skrånere det er.
    lag2.forEach(function (l2) {
      var t = l2.t, m = l2.m;
      for (var k = 0; k < n; k++) {
        if (isNaN(t[k])) continue;
        var a = k > 0 && !isNaN(t[k - 1]) ? t[k - 1] : t[k];
        var b = k < n - 1 && !isNaN(t[k + 1]) ? t[k + 1] : t[k];
        var skraa = Math.abs(b - a) / 2;
        m[k] = skraa > 1.1 ? 0 : m[k] * (1 - (skraa / 1.1) * 0.7);
      }
      var k2 = 0;
      while (k2 < n) {
        if (m[k2] <= 0 || isNaN(t[k2])) {
          k2++;
          continue;
        }
        var s0 = k2;
        while (k2 < n && m[k2] > 0 && !isNaN(t[k2]) && (k2 === s0 || Math.abs(t[k2] - t[k2 - 1]) <= 2)) k2++;
        if (k2 - s0 < 4) for (var z = s0; z < k2; z++) m[z] = 0;
      }
    });
    return lag2.map(function (l2, e2) {
      return { venstre: helt.left - r0.left - marg, kol: kol, topp: l2.t, hoyde: new Float32Array(n), maks: l2.m, lag: lag, brudd: 2, sjanse: e2 === 0 ? 0.75 : 0.9, vekst: 1, tekst: true };
    });
  }

  function maal(naa) {
    maaltSist = naa;
    var r0 = c.getBoundingClientRect();
    var ro = ord.getBoundingClientRect(), rp = privat.getBoundingClientRect();
    var stille = !tekst.classList.contains("skriver") && !tekst.classList.contains("har-svar");
    var ny = [stille, Math.round(ro.left), Math.round(ro.top), Math.round(ro.width), Math.round(rp.left), Math.round(rp.top), Math.round(rp.width), w, h].join(",");
    if (ny === nokkel && flater) return;
    // Noe har flyttet seg: snøen faller av og begynner på nytt.
    nokkel = ny;
    flater = [];
    kort = null;
    kortFlate = null;
    if (!stille || document.fonts.status !== "loaded") return;
    var orgport = tekst.querySelector(".orgport");
    var rk = { left: rp.left, top: rp.top, width: rp.width, height: orgport.getBoundingClientRect().bottom - rp.top };
    kort = { x: rk.left - r0.left, y: rk.top - r0.top, b: rk.width, h: rk.height, rund: 30 };
    flater.push(rundFlate(rk, r0, 30, 16, "bak"));
    kortFlate = flater[0];
    lagFrost();
    flater.push.apply(flater, tekstFlate(ord, r0, 7, "alle") || []);
    privat.querySelectorAll(".get .btn").forEach(function (k) {
      var r = k.getBoundingClientRect();
      flater.push(rundFlate(r, r0, r.height / 2, 7, "foran"));
    });
    var felt = tekst.querySelector(".orgport input");
    if (felt) {
      var rf = felt.getBoundingClientRect();
      flater.push(rundFlate(rf, r0, rf.height / 2, 7, "foran"));
    }
    flater = flater.filter(Boolean);
  }

  // Et fnugg som lander, legger seg som en liten haug fordelt på nabokolonnene.
  function legg(fl, i, mengde) {
    // Fordelt over omtrent 4 px uansett kolonnebredde (tekst: 1 px, ellers 2).
    var spenn = Math.round(2 / fl.kol);
    var vekter = 0;
    for (var j = -spenn; j <= spenn; j++) vekter += spenn + 1 - Math.abs(j);
    for (var j2 = -spenn; j2 <= spenn; j2++) {
      var k = i + j2;
      if (k < 0 || k >= fl.hoyde.length || isNaN(fl.topp[k]) || fl.maks[k] <= 0) continue;
      fl.hoyde[k] = Math.min(fl.maks[k], fl.hoyde[k] + (mengde * (spenn + 1 - Math.abs(j2))) / vekter);
    }
  }

  // Snøen sklir til den ligger stabilt: for store forskjeller i tykkelse
  // mellom nabokolonner jevnes ut. Det er tykkelsen som sammenlignes, ikke
  // høyden over bakken, så snøen kan ligge på en skrå flate (buen i et hjørne)
  // så lenge den er jevnt tykk.
  function jevn(fl) {
    var hd = fl.hoyde, tp = fl.topp, mk = fl.maks;
    for (var i = 1; i < hd.length; i++) {
      if (isNaN(tp[i]) || isNaN(tp[i - 1]) || Math.abs(tp[i] - tp[i - 1]) > fl.brudd) continue;
      var diff = hd[i - 1] - hd[i];
      if (Math.abs(diff) > 1.2) {
        var flytt = (Math.abs(diff) - 1.2) * 0.25;
        if (diff > 0 && hd[i - 1] > flytt) {
          hd[i - 1] -= flytt;
          hd[i] = Math.min(mk[i], hd[i] + flytt);
        } else if (diff < 0 && hd[i] > flytt) {
          hd[i] -= flytt;
          hd[i - 1] = Math.min(mk[i - 1], hd[i - 1] + flytt);
        }
      }
    }
  }

  function iKort(p) {
    return kort && p.x > kort.x && p.x < kort.x + kort.b && p.y > kort.y && p.y < kort.y + kort.h;
  }

  // Treffer fnugget en flate ovenfra? Da lander det (med en sjanse som øker
  // med styrken), og kappen vokser.
  function lander(p, forrigeY, st) {
    if (!flater) return false;
    for (var n = 0; n < flater.length; n++) {
      var fl = flater[n];
      if (fl.lag === "bak" && p.foran) continue;
      if (fl.lag === "foran" && !(p.foran && iKort(p))) continue;
      var i = Math.floor((p.x - fl.venstre) / fl.kol);
      if (i < 0 || i >= fl.topp.length || isNaN(fl.topp[i]) || fl.maks[i] < 1) continue;
      if ((i > 0 && Math.abs(fl.topp[i] - fl.topp[i - 1]) > fl.brudd) || (i < fl.topp.length - 1 && Math.abs(fl.topp[i] - fl.topp[i + 1]) > fl.brudd)) continue;
      var overflate = fl.topp[i] - fl.hoyde[i];
      // Ikke alle fnugg blir liggende øverst; noen glipper forbi og lander
      // lenger ned (kneet i K-en, foten på l-en).
      if (forrigeY < overflate && p.y >= overflate && Math.random() < (0.4 + st * 0.6) * fl.sjanse) {
        legg(fl, i, (0.7 + p.r * 0.8) * fl.vekst);
        // Innholdet i kortet (knappene, feltet) skal ikke skygge for hverandre:
        // fnugget legger igjen snø og faller videre, så alle får like mye.
        if (fl.lag === "foran") continue;
        return true;
      }
    }
    return false;
  }

  function tegnKapper() {
    xl.clearRect(0, 0, w, h);
    if (!flater) return;
    xl.save();
    xl.fillStyle = "rgba(255, 255, 255, 0.97)";
    xl.shadowColor = "rgba(30, 60, 110, 0.28)";
    xl.shadowBlur = 3;
    xl.shadowOffsetY = 1;
    flater.forEach(function (fl) {
      var tp = fl.topp, hd = fl.hoyde, KOL = fl.kol;
      // Tynnere skygge på bokstavene, så snøen ikke tegner omriss.
      xl.shadowBlur = fl.tekst ? 1.2 : 3;
      xl.shadowOffsetY = fl.tekst ? 0.4 : 1;
      xl.shadowColor = fl.tekst ? "rgba(30, 60, 110, 0.18)" : "rgba(30, 60, 110, 0.28)";
      var i = 0;
      while (i < tp.length) {
        if (isNaN(tp[i]) || hd[i] < 0.6) {
          i++;
          continue;
        }
        // Et sammenhengende stykke med snø, brutt ved bratte kanter i
        // bokstavene (ellers tegnes snøen ned langs kanten som en strek).
        var s0 = i;
        i++;
        while (i < tp.length && !isNaN(tp[i]) && hd[i] >= 0.6 && Math.abs(tp[i] - tp[i - 1]) <= fl.brudd) i++;
        var s1 = i - 1;
        if ((s1 - s0 + 1) * KOL < 4) continue;
        // Snøen står vinkelrett på overflaten, så den bøyer seg jevnt rundt
        // hjørnene i stedet for å stå rett opp. Underkanten følger flaten.
        var ox = [], oy = [];
        for (var k = s0; k <= s1; k++) {
          var a0 = Math.max(s0, k - 1), a1 = Math.min(s1, k + 1);
          var tx = (a1 - a0) * KOL, ty = tp[a1] - tp[a0];
          var l = Math.hypot(tx, ty) || 1;
          var nx = ty / l, ny = -tx / l;
          var bx = fl.venstre + k * KOL + KOL / 2;
          ox.push(bx + nx * hd[k]);
          oy.push(tp[k] + ny * hd[k]);
        }
        var heng = fl.tekst ? 0.5 : 1.5;
        xl.beginPath();
        xl.moveTo(fl.venstre + s0 * KOL - heng, tp[s0] + 0.5);
        for (var q = 0; q < ox.length; q++) xl.lineTo(ox[q], oy[q]);
        xl.lineTo(fl.venstre + (s1 + 1) * KOL + heng, tp[s1] + 0.5);
        for (var k2 = s1; k2 >= s0; k2--) xl.lineTo(fl.venstre + k2 * KOL + KOL / 2, tp[k2] + 0.5);
        xl.closePath();
        xl.fill();
      }
    });
    xl.restore();
  }

  // Frost på kortets glass: jo mer snø som ligger på kortet, jo mer fryser
  // det. Et hvitt slør fra toppkanten, sterkest i hjørnene, og frostbregner
  // (greinete iskrystaller) som vokser inn fra kanten. Tegnes i midtlaget,
  // altså på glasset og bak innholdet.
  var frys = 0, bregner = [];
  function lagFrost() {
    bregner = [];
    if (!kort) return;
    var tilfeldig = (function (fro) {
      return function () {
        fro = (fro * 16807) % 2147483647;
        return fro / 2147483647;
      };
    })(12345 + Math.round(kort.b));
    function grein(x0, y0, vinkel, lengde, dybde, start) {
      var x1 = x0 + Math.cos(vinkel) * lengde, y1 = y0 + Math.sin(vinkel) * lengde;
      bregner.push([x0, y0, x1, y1, start]);
      if (dybde <= 0) return;
      var steg = 3 + Math.floor(tilfeldig() * 2);
      for (var i = 1; i <= steg; i++) {
        var t = i / (steg + 1);
        var gx = x0 + (x1 - x0) * t, gy = y0 + (y1 - y0) * t;
        var side = i % 2 ? 1 : -1;
        grein(gx, gy, vinkel + side * (0.9 + tilfeldig() * 0.3), lengde * (0.35 + tilfeldig() * 0.15) * (1 - t * 0.5), dybde - 1, start + t * 0.5);
      }
    }
    // Langs toppkanten, og tettere ved hjørnene.
    var antall = Math.round(kort.b / 14);
    for (var i = 0; i < antall; i++) {
      var bx = kort.x + kort.rund + tilfeldig() * (kort.b - kort.rund * 2);
      grein(bx, kort.y + 1, Math.PI / 2 + (tilfeldig() - 0.5) * 1.1, 8 + tilfeldig() * 20, 2, tilfeldig() * 0.5);
    }
    [[kort.x, 1], [kort.x + kort.b, -1]].forEach(function (hj) {
      for (var j = 0; j < 12; j++) {
        var v = (j / 11) * (Math.PI / 2);
        var px = hj[0] + hj[1] * (kort.rund - Math.cos(v) * kort.rund);
        var py = kort.y + kort.rund - Math.sin(v) * kort.rund;
        var inn = hj[1] > 0 ? Math.PI / 4 + (tilfeldig() - 0.5) * 0.6 : (3 * Math.PI) / 4 + (tilfeldig() - 0.5) * 0.6;
        grein(px, py, inn, 14 + tilfeldig() * 30, 2, tilfeldig() * 0.4);
      }
    });
  }

  function tegnFrost() {
    if (!kort || frys < 0.01) return;
    var a = frys;
    // Sløret fra toppkanten.
    var g = xm.createLinearGradient(0, kort.y, 0, kort.y + 90);
    g.addColorStop(0, "rgba(235, 245, 255, " + 0.42 * a + ")");
    g.addColorStop(1, "rgba(235, 245, 255, 0)");
    xm.fillStyle = g;
    xm.fillRect(kort.x, kort.y, kort.b, 90);
    // Hjørnene.
    [kort.x, kort.x + kort.b].forEach(function (hx) {
      var r = xm.createRadialGradient(hx, kort.y, 0, hx, kort.y, 170);
      r.addColorStop(0, "rgba(240, 248, 255, " + 0.5 * a + ")");
      r.addColorStop(1, "rgba(240, 248, 255, 0)");
      xm.fillStyle = r;
      xm.fillRect(hx - 170, kort.y, 340, 170);
    });
    // Bregnene vokser etter hvert som det fryser: tynne, hvite og med en svak
    // glød, så de leses som frost og ikke riper.
    xm.save();
    xm.strokeStyle = "rgba(255, 255, 255, " + (0.35 + 0.45 * a) + ")";
    xm.lineWidth = 0.6;
    xm.lineCap = "round";
    xm.shadowColor = "rgba(255, 255, 255, 0.9)";
    xm.shadowBlur = 3;
    xm.beginPath();
    for (var i = 0; i < bregner.length; i++) {
      var b = bregner[i];
      var vekst = (a * 1.2 - b[4]) / 0.5;
      if (vekst <= 0) continue;
      vekst = Math.min(1, vekst);
      xm.moveTo(b[0], b[1]);
      xm.lineTo(b[0] + (b[2] - b[0]) * vekst, b[1] + (b[3] - b[1]) * vekst);
    }
    xm.stroke();
    xm.restore();
    xm.fillStyle = "#fff";
  }

  function prikk(g, p, stor, st) {
    g.globalAlpha = Math.min(1, 0.35 + p.z * 0.45 + st * 0.2);
    g.beginPath();
    g.arc(p.x, p.y, p.r * stor, 0, 6.283);
    g.fill();
  }

  function tegn(naa) {
    var dt = Math.min((naa - sist) / 1000, 0.1);
    sist = naa;
    if (synlig && !document.hidden) {
      if (FULL) tid += dt;
      var st = FULL ? styrke() : 0;
      if (FULL && naa - maaltSist > 500) maal(naa);
      var paa = aktiv();
      x.clearRect(0, 0, w, h);
      xm.clearRect(0, 0, w, h);
      x.fillStyle = xm.fillStyle = "#fff";
      // Mens noen laster ned, tiltar snøen rolig til fem ganger grunnmengden (eieren
      // 11.11.2026: det skal snø litt mer da), og gir seg like rolig etterpå.
      lastSno += ((!FULL && paa ? 1 : 0) - lastSno) * Math.min(1, dt * 0.6);
      var antall = Math.min(f.length, Math.round(grunn * (1 + (MAKS - 1) * st) * (1 + 4 * lastSno)));
      var fart = Math.abs(mus.vx) + Math.abs(mus.vy);
      var stor = 1 + st * 0.9;
      // Midtlaget er klippet til kortet, så fnugg over glasset ikke tegnes
      // utenfor det.
      if (kort) {
        xm.save();
        xm.beginPath();
        if (xm.roundRect) xm.roundRect(kort.x, kort.y, kort.b, kort.h, kort.rund);
        else xm.rect(kort.x, kort.y, kort.b, kort.h);
        xm.clip();
        if (kortFlate) {
          var sum = 0, rom = 0;
          for (var q = 0; q < kortFlate.hoyde.length; q++) {
            sum += kortFlate.hoyde[q];
            rom += kortFlate.maks[q];
          }
          frys += (Math.min(1, (sum / (rom || 1)) * 1.4) - frys) * 0.01;
        }
        tegnFrost();
      } else frys = 0;
      for (var i = 0; i < antall; i++) {
        var p = f[i];
        if (p.parkert) {
          // Venter over toppen til det skal snø; slippes da ovenfra, spredt i
          // høyden så de ikke kommer som en vegg.
          if (!paa) continue;
          Object.assign(p, nytt(-6 - Math.random() * h), { parkert: false });
        }
        if (fart > 0.5) {
          var ax = p.x - mus.x, ay = p.y - mus.y, dist = Math.hypot(ax, ay);
          if (dist < R && dist > 0) {
            var k = ((1 - dist / R) * Math.min(fart, 40)) / 40 * (0.4 + p.z);
            p.dx += (mus.vx * 0.02 + (ax / dist) * 0.35) * k;
            p.dy += (mus.vy * 0.02 + (ay / dist) * 0.35) * k;
          }
        }
        p.dx *= 0.95;
        p.dy *= 0.95;
        var forrigeY = p.y;
        p.y += p.v * (1 + st * 0.3) + p.dy;
        p.s += 0.012;
        p.x += Math.sin(p.s) * (0.12 + p.z * 0.25) + p.dx;
        if (p.y > h + 6 || lander(p, forrigeY, st)) {
          if (!paa) {
            p.parkert = true;
            continue;
          }
          Object.assign(p, nytt(-6 - Math.random() * 40));
        }
        if (p.x < -8) p.x = w + 8;
        else if (p.x > w + 8) p.x = -8;
        prikk(p.foran && iKort(p) ? xm : x, p, stor, st);
      }
      if (kort) xm.restore();
      x.globalAlpha = xm.globalAlpha = 1;
      mus.vx *= 0.85;
      mus.vy *= 0.85;
      if (flater) flater.forEach(jevn);
      tegnKapper();
    }
    requestAnimationFrame(tegn);
  }

  str();
  window.addEventListener("resize", str);
  new IntersectionObserver(function (e) {
    synlig = e[0].isIntersecting;
  }).observe(c);
  requestAnimationFrame(tegn);
})();

// Nedlastingskortet: når de klikker Windows, Mac eller Linux i heroen, blir
// kortet et eget nedlastingskort (CSS: .scene-tekst.laster). Lyset rundt
// kanten (--p) og prosenten følger nedlastingen; ferdig gir en hake og neste
// steg. På nettet hentes filen selv, bytene telles mens de kommer, og når alt
// er kommet, lagres filen (nettleseren får den som en vanlig nedlasting).
// Lokalt (localhost) eller med ?nedlasting=sim måles det bare: bytene kastes,
// og finnes ikke filen, simuleres det.
// Samme kort to steder: i heroen og i kortet nederst på siden (eieren 11.11.2026: nedlastingen
// nederst skal vises der, ikke sende folk til toppen). `tekst` er flata som får .laster/.lastet
// og --p, `kort` er nedlastingsinnholdet i den, `knapper` er lenkene som starter.
function nedlastingskort(tekst, kort, knapper) {
  if (!tekst || !kort) return;
  var SIMULER = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]nedlasting=sim\b/.test(location.search);

  var SYSTEM = {
    windows: { navn: "Windows", fil: "Klart.exe", mb: 168, neste: "Åpne filen for å installere Klart." },
    mac: { navn: "Mac", fil: "Klart.dmg", mb: 212, neste: "Åpne filen og dra Klart over i Programmer." },
    linux: { navn: "Linux", fil: "Klart_0.1.0_amd64.deb", mb: 200, neste: "Åpne filen for å installere Klart." },
  };
  var merke = kort.querySelector("[data-merke]");
  var prosentEl = kort.querySelector("[data-prosent]");
  var statusEl = kort.querySelector("[data-status]");
  var ferdigEl = kort.querySelector("[data-ferdig]");
  var tal = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var hele = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
  var jobb = 0;

  function vis(p) {
    tekst.style.setProperty("--p", p.toFixed(2) + "%");
    prosentEl.textContent = Math.floor(p);
  }

  function start(hva) {
    var sys = SYSTEM[hva];
    if (!sys) return;
    var min = ++jobb;
    kort.querySelector("[data-os]").textContent = sys.navn;
    kort.querySelector("[data-fil]").textContent = sys.fil;
    kort.querySelector("[data-neste]").textContent = sys.neste;
    // Mac har ikke noe merke; Windows fargeringen, Linux pingvinen.
    merke.className = "nedlasting-merke " + hva.slice(0, 3);
    merke.hidden = hva === "mac";
    merke.textContent = "";
    if (hva === "linux") {
      var pingvin = tekst.querySelector(".os-pingvin svg");
      if (pingvin) merke.appendChild(pingvin.cloneNode(true));
    }
    kort.classList.remove("ferdig");
    tekst.classList.remove("lastet");
    ferdigEl.hidden = true;
    statusEl.textContent = "Starter …";
    vis(0);
    kort.hidden = false;
    tekst.classList.add("laster");

    // Ekte fil lokalt: hent den og tell bytene som kommer. Finnes ikke filen
    // (Linux ennå), simuleres det.
    ekte(hva, sys, min).catch(function () {
      if (min !== jobb) return;
      if (SIMULER) return simuler(sys, min);
      // På nettet: går det ikke å telle, får nettleseren lenken som før.
      tilbake();
      location.href = "/klart/last-ned/" + hva;
    });
  }

  // Ekte nedlasting, målt: bytene telles etter hvert som de kommer, og ringen,
  // prosenten, MB, farten og tiden igjen regnes av dem. Bytene kastes etter
  // hvert (testen skal måle, ikke lagre).
  var MB = 1024 * 1024;
  function ekte(hva, sys, min) {
    var adresse = "/klart/last-ned/" + hva + location.search.replace(/^\?/, "?").replace(/^$/, "");
    return fetch(adresse, { cache: "no-store" }).then(function (svar) {
      var total = +svar.headers.get("content-length");
      if (!svar.ok || !svar.body || !total) throw new Error("ingen fil");
      var leser = svar.body.getReader();
      var biter = SIMULER ? null : [];
      var lastet = 0, rolig = 0, igjenRolig = 0, skrevet = 0, startet = performance.now();
      var punkter = [[startet, 0]];
      var vist = 0;
      (function tegnRing() {
        if (min !== jobb) return;
        vist += ((lastet / total) * 100 - vist) * 0.25;
        if (!kort.classList.contains("ferdig")) {
          vis(vist);
          requestAnimationFrame(tegnRing);
        }
      })();
      function les() {
        return leser.read().then(function (r) {
          if (min !== jobb) {
            leser.cancel();
            return;
          }
          var naa = performance.now();
          if (r.done) {
            if (biter) lagre(new Blob(biter, { type: svar.headers.get("content-type") || "application/octet-stream" }), sys.fil);
            vis(100);
            statusEl.textContent = hele.format(Math.round(total / MB)) + " MB på " + ((naa - startet) / 1000).toFixed(1).replace(".", ",") + " s";
            tekst.classList.add("lastet");
            kort.classList.add("ferdig");
            ferdigEl.hidden = false;
            return;
          }
          lastet += r.value.byteLength;
          if (biter) biter.push(r.value);
          // Fart over de siste to sekundene.
          punkter.push([naa, lastet]);
          while (punkter.length > 2 && naa - punkter[0][0] > 2000) punkter.shift();
          var dt = (naa - punkter[0][0]) / 1000;
          var fart = dt > 0.2 ? (lastet - punkter[0][1]) / MB / dt : 0;
          if (fart > 0) {
            rolig = rolig ? rolig + (fart - rolig) * 0.1 : fart;
            var igjen = (total - lastet) / MB / rolig;
            igjenRolig = igjenRolig ? igjenRolig + (igjen - igjenRolig) * 0.1 : igjen;
          }
          if (naa - skrevet > 500) {
            skrevet = naa;
            statusEl.textContent =
              hele.format(Math.floor(lastet / MB)) + " av " + hele.format(Math.round(total / MB)) + " MB · " +
              (rolig ? tal.format(rolig) + " MB/s · " : "") +
              (naa - startet < 1200 || !rolig ? "beregner tid …" : igjenRolig < 5 ? "noen sekunder igjen" : "ca. " + Math.ceil(igjenRolig) + " s igjen");
          }
          return les();
        });
      }
      return les();
    });
  }

  // Den ferdige filen gis til nettleseren som en vanlig nedlasting.
  function lagre(blob, navn) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = navn;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 60000);
  }

  function simuler(sys, min) {
    // Simulert: ca. 12 sekunder, med ujevn fart som en ekte linje. Farten og
    // tiden igjen jevnes ut over noen sekunder, og statuslinja skrives bare to
    // ganger i sekundet, så den står rolig.
    var lastet = 0, vist = 0, fart = (sys.mb / 11) * 0.6, rolig = 0, igjenRolig = 0, skrevet = 0, startet = performance.now(), forrige = startet;
    function steg(naa) {
      if (min !== jobb) return;
      var dt = Math.min((naa - forrige) / 1000, 0.1);
      forrige = naa;
      var maal = sys.mb / 11 * (0.7 + Math.random() * 0.6);
      fart += (maal - fart) * 0.05;
      lastet = Math.min(sys.mb, lastet + fart * dt);
      var p = (lastet / sys.mb) * 100;
      vist += (p - vist) * 0.25;
      vis(vist);
      // Jevnet fart: starter fra første målte fart, så tiden igjen ikke blir
      // urimelig i begynnelsen.
      rolig = rolig ? rolig + (fart - rolig) * Math.min(1, dt * 0.8) : fart;
      var igjen = rolig > 0.5 ? (sys.mb - lastet) / rolig : 0;
      igjenRolig = igjenRolig ? igjenRolig + (igjen - igjenRolig) * Math.min(1, dt * 0.8) : igjen;
      if (naa - skrevet > 500 && rolig > 0.5) {
        skrevet = naa;
        statusEl.textContent =
          hele.format(Math.floor(lastet)) + " av " + sys.mb + " MB · " + tal.format(rolig) + " MB/s · " +
          (naa - startet < 1200 ? "beregner tid …" : igjenRolig < 5 ? "noen sekunder igjen" : "ca. " + Math.ceil(igjenRolig) + " s igjen");
      }
      if (lastet >= sys.mb && vist > 99.6) {
        vis(100);
        tekst.classList.add("lastet");
        kort.classList.add("ferdig");
        ferdigEl.hidden = false;
        return;
      }
      requestAnimationFrame(steg);
    }
    requestAnimationFrame(steg);
  }

  function tilbake() {
    jobb++;
    // Kom de fra kortet for virksomheter, står det kortet der igjen.
    if (fraSvar) tekst.classList.add("har-svar");
    fraSvar = false;
    tekst.classList.remove("laster", "lastet");
    tekst.style.removeProperty("--p");
    kort.hidden = true;
  }

  // Knappene i kortet for virksomheter gir samme nedlastingskort: kortet deres viker
  // (har-svar tas av) mens nedlastingen vises, og kommer tilbake med «Tilbake».
  var fraSvar = false;
  knapper.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (tekst.classList.contains("har-svar")) {
        fraSvar = true;
        tekst.classList.remove("har-svar");
      }
      start(a.getAttribute("href").split("/").pop());
    });
  });
  kort.querySelector("[data-tilbake]").addEventListener("click", tilbake);
}
(function () {
  var hero = document.querySelector(".hero .scene-tekst");
  if (hero) nedlastingskort(hero, hero.querySelector("[data-nedlasting]"), hero.querySelectorAll(".privat .get .btn.os, .orgport-svar .get .btn.os"));
  var bunn = document.querySelector(".v-hent-kort");
  if (bunn) nedlastingskort(bunn, bunn.querySelector("[data-nedlasting]"), bunn.querySelectorAll("[data-v-hent] a"));
})();

// Mobil og nettbrett: det snør lett bak «Klart» og kortet, som på nedtellingssiden, men
// glissent (eieren 11.11.2026). Står stille når heroen ikke vises, og for dem som har bedt
// om mindre bevegelse.
(function () {
  var c = document.querySelector(".hero .scene-sno-mobil");
  if (!c || !c.getContext) return;
  if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var ctx = c.getContext("2d");
  var fnugg = [];
  var b = 0, h = 0, synlig = true, gaar = false;
  function nytt(hvorSomHelst) {
    var r = Math.random();
    var stor = r * r * 2.2 + 0.6;
    return {
      x: Math.random() * b,
      y: hvorSomHelst ? Math.random() * h : -10,
      r: stor,
      fart: 16 + stor * 18 + Math.random() * 12,
      drift: Math.random() * Math.PI * 2,
      svai: 6 + Math.random() * 14,
      lys: 0.5 + Math.random() * 0.4,
    };
  }
  function str() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    b = c.clientWidth;
    h = c.clientHeight;
    c.width = Math.round(b * dpr);
    c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var antall = Math.round(Math.min(70, (b * h) / 9000));
    while (fnugg.length < antall) fnugg.push(nytt(true));
    fnugg.length = antall;
  }
  var forrige = 0;
  function tegn(naa) {
    if (!synlig) {
      gaar = false;
      return;
    }
    var dt = forrige ? Math.min((naa - forrige) / 1000, 0.05) : 0;
    forrige = naa;
    ctx.clearRect(0, 0, b, h);
    for (var i = 0; i < fnugg.length; i++) {
      var f = fnugg[i];
      f.y += f.fart * dt;
      f.drift += dt * 0.8;
      f.x += Math.sin(f.drift) * f.svai * dt;
      if (f.y > h + 10) fnugg[i] = f = nytt(false);
      if (f.x < -10) f.x = b + 10;
      if (f.x > b + 10) f.x = -10;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255," + f.lys + ")";
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tegn);
  }
  function start() {
    if (gaar || !synlig) return;
    gaar = true;
    forrige = 0;
    requestAnimationFrame(tegn);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      synlig = e[0].isIntersecting;
      start();
    }).observe(c);
  }
  window.addEventListener("resize", str);
  str();
  start();
})();

// Fargen øverst på telefonen (theme-color): himmelen fra vinterbildet mens heroen vises,
// sidens lyse farge når man har blat forbi den (eieren 11.11.2026).
(function () {
  var meta = document.querySelector('meta[name="theme-color"]');
  var scene = document.querySelector(".hero .scene");
  if (!meta || !scene) return;
  var HIMMEL = "#7eaee0", LYS = "#eef3fb", naa = "";
  function sett() {
    var farge = window.scrollY < scene.offsetHeight - 80 ? HIMMEL : LYS;
    if (farge === naa) return;
    meta.setAttribute("content", (naa = farge));
    // Safari på iPhone bruker bakgrunnen bak siden, ikke theme-color.
    document.documentElement.style.backgroundColor = farge;
  }
  window.addEventListener("scroll", sett, { passive: true });
  sett();
})();
