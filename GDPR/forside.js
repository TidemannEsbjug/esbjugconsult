// Hei, du som leser dette. Se kommentaren øverst i kildekoden til siden.
console.info(
  "Hei, du som sjekker. Bra.\nProgrammet: /klart/til-it\nFant du noe? tidemann@esbjugconsult.com (/.well-known/security.txt)"
);

// Filmen i toppen spilles én gang, og så toner det skarpe stillbildet inn: siste
// bilde i filmen, hentet fra originalen og forstørret til 2336 px. Med redusert
// bevegelse vises bildet med en gang.
(function () {
  var scene = document.querySelector(".scene");
  var film = document.querySelector(".scene-film");
  if (!scene || !film) return;
  function stille() {
    scene.classList.add("stille");
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    film.removeAttribute("autoplay");
    film.pause();
    stille();
    return;
  }
  film.addEventListener("ended", stille);
  film.addEventListener("error", stille);
})();

// Menyen kommer først når man har scrollet forbi toppen av filmen.
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

  // I heroen: når de begynner å skrive, er de klare. Boksen over glir bort og feltet glir opp dit
  // den sto, mens overskriften står stille (CSS: .scene-tekst.skriver og --loft).
  var tekst = document.querySelector(".hero .scene-tekst");
  var boks = tekst && tekst.querySelector(".lokal");
  var toppskjema = tekst && tekst.querySelector("[data-orgport]");
  var harSvar = false;

  function maalLoft() {
    // offsetTop regner ikke med transform, så målet blir det samme om feltet alt er løftet.
    tekst.style.setProperty("--loft", boks.offsetTop - toppskjema.offsetTop + "px");
  }

  function skriver(ja) {
    if (!tekst || !boks || !toppskjema) return;
    if (ja) maalLoft();
    tekst.classList.toggle("skriver", ja);
  }

  window.addEventListener("resize", function () {
    if (tekst && tekst.classList.contains("skriver")) maalLoft();
  });

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
    // Svaret tar hele plassen: overskriften og boksen viker, og kortet står alene midt i bildet.
    if (tekst) {
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
      boks.querySelector("[data-oppsett]").href = "pris/?orgnr=" + svar.orgnr + "&vis=oppsett";
      var pris = boks.querySelector("[data-pris]");
      pris.hidden = !svar.pris;
      if (svar.pris) {
        boks.querySelector("[data-prisbelop]").textContent =
          new Intl.NumberFormat("nb-NO").format(svar.pris) + " kr";
        boks.querySelector("[data-prishvem]").textContent = svar.konsern ? svar.navn + " og hele konsernet" : svar.navn;
        boks.querySelector("[data-prislenke]").href = "pris/?orgnr=" + svar.orgnr;
      }
      boks.hidden = false;
    });
  }

  function nullstill() {
    harSvar = false;
    skjemaer.forEach(function (s) {
      s.classList.remove("stor", "svar");
      s.querySelector("[data-orgport-svar]").hidden = true;
      s.querySelector("[data-orgport-sok]").hidden = false;
    });
    if (tekst) tekst.classList.remove("har-svar");
    skriver(true);
  }

  skjemaer.forEach(function (skjema) {
    var input = skjema.querySelector("input");
    var knapp = skjema.querySelector("button[type=submit]");
    var feilEl = skjema.querySelector(".orgport-feil");
    var felt = KlartOrgfelt(input, skjema.querySelector(".orgforslag"), sjekk);

    if (skjema === toppskjema) {
      input.addEventListener("input", function () {
        if (input.value.trim()) skriver(true);
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
  // Reglene finner det meste i steg 1. Den lokale AI-en finner resten i steg 2.
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
      "Hver fil sjekkes mot norske regler. Etterpå leser den lokale AI-en filene grundig."
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
      "Den lokale AI-en leser filene på nytt og finner det reglene ikke fanger. Den kjører på denne maskinen og bruker mye prosessorkraft, så maskinen kan være treg til den er ferdig."
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
