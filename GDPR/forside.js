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
        el.hidden = Boolean(svar.stor);
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
        // Kommuner og statlige virksomheter kjøper en lisens for fire år, ikke per år.
        boks.querySelector("[data-prisnaar]").textContent = svar.fireAar ? "For fire år" : "Per år";
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
  // siden helt tom — alt innhold ligger på opacity: 0 og venter. Det skjer i
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

// Nedlastingen er satt på pause (KLART_NEDLASTING i wrangler.jsonc). Knappene
// ser ut som vanlig, men et klikk viser «Kommer snart». Settes til false når
// den nye versjonen er ute.
(function () {
  var PAUSE = true;
  if (!PAUSE) return;
  var lapp;
  document.querySelectorAll('a[href^="/klart/last-ned/"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (!lapp) {
        lapp = document.createElement("div");
        lapp.className = "kommer-lapp";
        lapp.setAttribute("role", "status");
        document.body.appendChild(lapp);
      }
      lapp.textContent = "Kommer snart. Den nye versjonen av Klart er rett rundt hjørnet.";
      lapp.classList.add("synlig");
      clearTimeout(lapp.t);
      lapp.t = setTimeout(function () {
        lapp.classList.remove("synlig");
      }, 3200);
    });
  });
})();

// Programvinduet spiller av flyten i Klart. Går bare når vinduet er på skjermen.
(function () {
  var ka = document.querySelector(".ka");
  if (!ka) return;

  function visStats(byttes) {
    function tall(n) {
      var b = document.createElement("b");
      b.textContent = n;
      return b;
    }
    $("stats").replaceChildren(tall(6), " filer · ", tall(byttes), " av 27 byttes ut");
  }
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;

  function $(key) {
    return ka.querySelector('[data-ka="' + key + '"]');
  }
  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  var peker = ka.querySelector(".ka-peker");
  var sheet = ka.querySelector(".ka-sheet");
  var rader = $("rader").children;
  var adresse = $("adresse");
  // Adressen er av som standard i appen («Adresse og sted»), så den lyser først når den slås på.
  var merker = Array.prototype.filter.call(
    ka.querySelectorAll(".ka-tekst mark"),
    function (m) {
      return m !== adresse;
    }
  );
  var filer = [
    "01-arbeidsavtale-acme.docx",
    "02-vedtak-statsforvalter.pdf",
    "03-epost-trad.eml",
    "07-saksnotat.txt",
    "08-kundeliste.xlsx",
    "09-statusmote.pptx"
  ];
  // Reglene finner det meste i steg 1. Den lokale KI-en finner resten i steg 2.
  var regler = [5, 8, 4, 0, 3, 0];
  var totalt = [7, 11, 5, 0, 3, 1];
  var treff = 0;
  var sekunder = 0;

  function treffTekst(n) {
    return n === 1 ? "1 treff" : n + " treff";
  }
  function varighet(s) {
    if (s < 60) return s + " s";
    var rest = s % 60;
    return Math.floor(s / 60) + " min" + (rest ? " " + rest + " s" : "");
  }
  function scene(navn) {
    ka.setAttribute("data-scene", navn);
  }
  function tekst(key, verdi) {
    $(key).textContent = verdi;
  }
  function rad(i, klasse, verdi) {
    rader[i].className = klasse;
    rader[i].lastChild.textContent = verdi;
  }
  function nå(verdi, dyp) {
    tekst("nå", verdi);
    $("nå").className = "ka-scan-now" + (dyp ? " deep" : "");
  }
  function framdrift(n, s) {
    tekst("ferdige", n + " / 6");
    $("meter").style.width = (n / 6) * 100 + "%";
    sekunder += s;
    tekst("brukt", varighet(sekunder));
  }
  function steg(el, klasse, tall) {
    el.className = klasse;
    el.firstChild.textContent = tall;
  }

  function pek(el) {
    var r = el.getBoundingClientRect();
    var f = ka.getBoundingClientRect();
    if (!r.width) return skjulPeker();
    var x = r.left - f.left + r.width * 0.6;
    var y = r.top - f.top + r.height * 0.55;
    if (!peker.classList.contains("på")) {
      peker.style.transition = "none";
      peker.style.transform =
        "translate(" + (x + 90) + "px," + (y + 110) + "px)";
      peker.offsetWidth;
      peker.style.transition = "";
      peker.classList.add("på");
    }
    peker.style.transform = "translate(" + x + "px," + y + "px)";
  }
  function skjulPeker() {
    peker.classList.remove("på");
  }
  function klikk(el) {
    el.classList.add("trykk");
    peker.classList.remove("klikk");
    peker.offsetWidth;
    peker.classList.add("klikk");
    setTimeout(function () {
      el.classList.remove("trykk");
    }, 180);
  }

  function nullstill() {
    scene("start");
    skjulPeker();
    treff = 0;
    sekunder = 0;
    tekst("motor", "");
    steg($("steg1"), "aktiv", "1");
    steg($("steg2"), "", "2");
    tekst("skanntittel", "Går gjennom mappen");
    tekst(
      "forklaring",
      "Hver fil sjekkes mot norske regler. Etterpå leser den lokale KI-en filene grundig."
    );
    tekst("ferdigetekst", "filer sjekket");
    tekst("treff", "0");
    tekst("igjen", "Regner ut …");
    tekst("igjentekst", "igjen av steg 1");
    nå("", false);
    framdrift(0, 0);
    each(rader, function (_, i) {
      rad(i, "venter", "I kø");
    });
    sheet.classList.remove("leser");
    each(ka.querySelectorAll(".ka-tekst mark"), function (m) {
      m.classList.remove("lit", "sladd");
    });
    $("sted").classList.remove("på");
    $("adressemerke").hidden = true;
    tekst("vis", "Vis sladdet");
    visStats(24);
    tekst("skrivenotat", "Lager rensede kopier ved siden av originalene…");
  }

  // Tidslinjen: hvert steg står med ventetid etter forrige steg.
  var tidslinje = [];
  var t = 0;
  function etter(dt, fn) {
    t += dt;
    tidslinje.push([t, fn]);
  }

  etter(0, nullstill);
  etter(900, function () {
    pek($("velg"));
  });
  etter(950, function () {
    klikk($("velg"));
  });
  etter(400, function () {
    skjulPeker();
    scene("forbered");
  });
  etter(1300, function () {
    pek($("rens"));
  });
  etter(950, function () {
    klikk($("rens"));
  });
  etter(400, function () {
    skjulPeker();
    scene("skann");
    tekst("motor", "Modell");
  });

  each(rader, function (_, i) {
    etter(i ? 0 : 450, function () {
      rad(i, "jobber", "Sjekker mot norske regler");
      nå("Nå: " + filer[i] + " — sjekker mot norske regler", false);
    });
    etter(380, function () {
      treff += regler[i];
      tekst("treff", treff);
      rad(i, "sjekket", treffTekst(regler[i]) + " · venter på grundig lesing");
      if (i === 1) tekst("igjen", "ca. 8 s");
      framdrift(i + 1, 2);
    });
  });

  etter(500, function () {
    steg($("steg1"), "ferdig", "✓");
    steg($("steg2"), "aktiv", "2");
    tekst("skanntittel", "Leser grundig");
    tekst(
      "forklaring",
      "Den lokale KI-en leser filene på nytt og finner det reglene ikke fanger. Den kjører på denne maskinen og bruker mye prosessorkraft, så maskinen kan være treg til den er ferdig."
    );
    tekst("ferdigetekst", "filer lest grundig");
    tekst("igjentekst", "igjen av steg 2");
    tekst("igjen", "ca. 54 s");
    tekst("ferdige", "0 / 6");
    $("meter").style.width = "0%";
  });

  each(rader, function (_, i) {
    etter(i ? 0 : 350, function () {
      rad(i, "jobber", "Leser grundig");
      nå("Nå: " + filer[i] + " — leses grundig. Kan ta et minutt.", true);
    });
    etter(560, function () {
      treff += totalt[i] - regler[i];
      tekst("treff", treff);
      tekst("igjen", i < 5 ? "ca. " + (45 - i * 9) + " s" : "—");
      rad(i, "ok", "Ferdig · " + treffTekst(totalt[i]));
      framdrift(i + 1, 9);
    });
  });

  etter(650, function () {
    scene("gjennom");
    tekst("motor", "");
  });
  etter(450, function () {
    sheet.classList.add("leser");
  });
  each(merker, function (m) {
    etter(190, function () {
      m.classList.add("lit");
    });
  });
  etter(700, function () {
    pek($("sted"));
  });
  etter(950, function () {
    klikk($("sted"));
    $("sted").classList.add("på");
    adresse.classList.add("lit");
    $("adressemerke").hidden = false;
    visStats(27);
  });
  etter(900, function () {
    pek($("vis"));
  });
  etter(950, function () {
    klikk($("vis"));
    tekst("vis", "Vis original");
  });
  each(ka.querySelectorAll(".ka-tekst mark"), function (m) {
    etter(140, function () {
      m.classList.add("sladd");
    });
  });
  etter(1400, function () {
    pek($("lag"));
  });
  etter(950, function () {
    klikk($("lag"));
  });
  etter(400, function () {
    skjulPeker();
    scene("skriver");
  });
  each(filer, function (fil) {
    etter(330, function () {
      tekst("skrivenotat", "Skriver " + fil);
    });
  });
  etter(400, function () {
    scene("ferdig");
  });
  etter(3600, function () {});

  // Klokken går bare mens vinduet er på skjermen og fanen er åpen.
  var klokke = 0;
  var neste = 0;
  var sist = 0;
  var timer = null;
  var synlig = false;

  function tikk() {
    var nå = Date.now();
    klokke += Math.min(nå - sist, 100);
    sist = nå;
    while (neste < tidslinje.length && tidslinje[neste][0] <= klokke) {
      tidslinje[neste++][1]();
    }
    if (neste >= tidslinje.length) {
      klokke = 0;
      neste = 0;
    }
  }
  function synk() {
    var går = synlig && !document.hidden;
    if (går === !!timer) return;
    if (går) {
      sist = Date.now();
      timer = setInterval(tikk, 50);
    } else {
      clearInterval(timer);
      timer = null;
    }
  }

  nullstill();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        synlig = entries[0].isIntersecting;
        synk();
      },
      { threshold: 0.25 }
    ).observe(ka);
  } else {
    synlig = true;
    synk();
  }
  document.addEventListener("visibilitychange", synk);
})();

// macOS-knappen i heroen er glass når man holder over. Musa er lyskilden:
// lyset innenfra står der den er (--mx, --my), og lyset på kanten ligger på
// siden mot den og på motsatt side (--vinkel, retningen fra midten).
// Gjelder begge Mac-knappene i heroen: i kortet og i svaret etter oppslaget.
document.querySelectorAll(".hero .os-mac").forEach(function (mac) {
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
  if (!c || !cm || !cl || !tekst || !ord || !privat || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
  var grunn = 0;
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
      for (var i = 0; i < grunn * MAKS; i++) f.push(nytt(-6 - Math.random() * h));
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
      tid += dt;
      var st = styrke();
      if (naa - maaltSist > 500) maal(naa);
      x.clearRect(0, 0, w, h);
      xm.clearRect(0, 0, w, h);
      x.fillStyle = xm.fillStyle = "#fff";
      var antall = Math.min(f.length, Math.round(grunn * (1 + (MAKS - 1) * st)));
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
        if (p.y > h + 6 || lander(p, forrigeY, st)) Object.assign(p, nytt(-6 - Math.random() * 40));
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
