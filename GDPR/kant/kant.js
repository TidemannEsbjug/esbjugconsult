// Prøvebenken for rammen rundt feltet. Hver variant får ett kall per tegn; pilene bytter variant og beholder fokus i feltet.
(function () {
  var skjema = document.querySelector("[data-kant]");
  var input = document.getElementById("kant-felt");
  var lys = document.querySelector(".kant-lys");
  var UTEN_BEVEGELSE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HVILE = 900; // ms uten tastetrykk før lyset slipper

  var hvile = null;
  var maaler = document.createElement("canvas").getContext("2d");

  function etterHvile() {
    clearTimeout(hvile);
    hvile = setTimeout(function () {
      lys.style.opacity = 0;
    }, HVILE);
  }

  // 2: et lite, jevnt hakk, så lyset vandrer rundt i takt med teksten.
  var vinkel = 0;
  // 5: energi som tastene fyller på og tiden tapper.
  var energi = 0;
  var gaar = false;

  function tempoSteg() {
    energi = Math.max(0, energi - 0.006);
    lys.style.opacity = energi;
    if (energi > 0) requestAnimationFrame(tempoSteg);
    else gaar = false;
  }

  /** Hvor langt ringen er tegnet: ni sifre er hele veien, og et navn nærmer seg uten å komme fram. */
  function fylling(v) {
    var d = v.replace(/\D/g, "");
    if (/^[\d\s]*$/.test(v)) return d.length / 9;
    return 0.9 * (1 - Math.exp(-v.trim().length / 12));
  }

  /** Skrivemerkets plass i feltet, i piksler fra venstre kant av ringen. */
  function merkeX() {
    var s = getComputedStyle(input);
    maaler.font = s.font;
    var bredde = maaler.measureText(input.value.slice(0, input.selectionStart)).width;
    return Math.min(input.offsetWidth, parseFloat(s.paddingLeft) + bredde - input.scrollLeft + 3);
  }

  var VARIANTER = [
    {
      navn: "Som nå",
      om: "Rammen slik den er i dag. Ingenting skjer når man skriver.",
    },
    {
      navn: "Pust",
      om: "Hele rammen blir et hint sterkere for hvert tegn og slipper igjen.",
      tegn: function () {
        if (UTEN_BEVEGELSE) return;
        lys.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 460, easing: "ease-out" });
      },
    },
    {
      navn: "Hakket",
      om: "Et lite lys på rammen flytter seg ett hakk per tegn og tones bort når du stopper.",
      tegn: function () {
        vinkel += 14;
        lys.style.setProperty("--kant-v", vinkel + "deg");
        lys.style.opacity = 1;
        etterHvile();
      },
    },
    {
      navn: "Fyllingen",
      om: "Rammen tegnes rundt mens du skriver. Ni sifre lukker den akkurat, så du ser at nummeret er helt.",
      tegn: function () {
        lys.style.setProperty("--kant-a", fylling(input.value) * 360 + "deg");
        lys.style.opacity = input.value ? 1 : 0;
      },
    },
    {
      navn: "Under bokstaven",
      om: "Et mykt lys på kanten følger skrivemerket, rett under bokstaven du nettopp skrev.",
      tegn: function () {
        lys.style.setProperty("--kant-x", merkeX() + "px");
        lys.style.opacity = 1;
        etterHvile();
      },
    },
    {
      navn: "Tempoet",
      om: "Rammen følger rytmen din: den stiger når du skriver jevnt og puster ut når du stopper.",
      tegn: function () {
        energi = Math.min(0.55, energi + 0.1);
        if (gaar) return;
        gaar = true;
        requestAnimationFrame(tempoSteg);
      },
    },
  ];

  var valgt = 0;

  function velg(n) {
    valgt = (n + VARIANTER.length) % VARIANTER.length;
    var v = VARIANTER[valgt];
    clearTimeout(hvile);
    energi = 0;
    lys.style.opacity = 0;
    skjema.setAttribute("data-kant", valgt);
    document.getElementById("kant-nr").textContent = valgt + 1 + " AV " + VARIANTER.length;
    document.getElementById("kant-navn").textContent = v.navn;
    document.getElementById("kant-om").textContent = v.om;
    history.replaceState(null, "", "#" + valgt);
    // Fyllingen viser hva som alt står i feltet, de andre venter på neste tegn.
    if (valgt === 3 && v.tegn) v.tegn();
  }

  input.addEventListener("input", function () {
    var v = VARIANTER[valgt];
    if (v.tegn) v.tegn();
  });

  input.addEventListener("blur", function () {
    if (valgt !== 5) lys.style.opacity = 0;
  });

  input.addEventListener("focus", function () {
    if (valgt === 3) VARIANTER[3].tegn();
  });

  // Oppslaget hører ikke hjemme her: felt med forslag, men ingen steder å gå.
  KlartOrgfelt(input, skjema.querySelector(".orgforslag"), function () {});
  skjema.addEventListener("submit", function (e) {
    e.preventDefault();
  });

  [["kant-forrige", -1], ["kant-neste", 1]].forEach(function (p) {
    var b = document.getElementById(p[0]);
    // mousedown, så feltet beholder fokus og rammen står mens man bytter.
    b.addEventListener("mousedown", function (e) {
      e.preventDefault();
    });
    b.addEventListener("click", function () {
      velg(valgt + p[1]);
    });
  });

  velg(parseInt(location.hash.slice(1), 10) || 0);
  input.focus();
})();
