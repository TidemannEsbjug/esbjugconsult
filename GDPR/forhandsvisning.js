// Programvinduet (figure.kv) spiller av Klart slik appen er fra november 2026, i fem
// kapitler: rens en mappe (PDF, e-post med bilde av en bil, regneark og PowerPoint leses;
// ansiktene og skiltet pikseleres underveis), gjennomgangen av det uavklarte, kopiene (også
// svart sladd), høyreklikk i Finder, og tekst som renses, gis til en KI med kodene og
// tilbakeføres i Klart. Raden under vinduet hopper mellom kapitlene. Bygget i HTML og CSS
// (forhandsvisning.css), ikke film. Går bare når vinduet er på skjermen og fanen er åpen.
//
// Lesingen vises rolig, av hensyn til epilepsi og lysfølsomhet (i appen er «Se
// skanningen live» av som standard av samme grunn): ingenting blinker, ett lesehode
// glir én gang ned over hver side, merkene toner inn når det passerer, sidene toner
// over i hverandre, og tallene endres høyst et par ganger i sekundet. Pekeren er alltid
// i bildet og glir mellom stedene. Med redusert bevegelse står vinduet stille i editoren
// med alt gjennomgått, slik det står uten JS.
(function () {
  var kv = document.querySelector(".kv");
  if (!kv) return;
  var ramme = kv.querySelector(".kv-ramme");

  // Vinduet bygges i fast størrelse og skaleres til bredden. Smalt: uten fillisten.
  function skaler() {
    var b = ramme.clientWidth;
    if (!b) return;
    var smal = b < 760;
    kv.classList.toggle("smal", smal);
    kv.style.setProperty("--s", String(b / (smal ? 640 : 1120)));
  }
  skaler();
  if ("ResizeObserver" in window) new ResizeObserver(skaler).observe(ramme);
  else window.addEventListener("resize", skaler);

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  kv.classList.add("spiller");

  function $(key) {
    return kv.querySelector('[data-kv="' + key + '"]');
  }
  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  var peker = kv.querySelector(".kv-peker");
  var sider = kv.querySelectorAll(".kv-side");
  var alleMerker = kv.querySelectorAll(".kv-side mark");
  var filer = $("filer").children;
  var register = $("register").children;
  var merknad = $("merknad");
  var arbeid = $("arbeid");
  var ansikt1 = $("ansikt1");
  var ansikt2 = $("ansikt2");
  var skilt = $("skilt");
  var knapper = kv.querySelectorAll(".kv-kapitler button");
  var LES = 1700; // lesehodet over én side (CSS)

  var DOKTYPE = { vedtak: "PDF", epost: "E-POST", liste: "REGNEARK", ppt: "POWERPOINT" };
  var REGISTER_STEDER = 0;
  each(register, function (li) {
    REGISTER_STEDER += +li.getAttribute("data-s");
  });

  function scene(navn) {
    kv.setAttribute("data-scene", navn);
  }
  function tekst(key, verdi) {
    $(key).textContent = verdi;
  }
  function side(dok) {
    return kv.querySelector('.kv-side[data-dok="' + dok + '"]');
  }
  function filnavn(i) {
    return filer[i].querySelector(".kv-fnavn").textContent;
  }

  // Siden som vises i midten, og filen som er valgt i lista.
  function visDok(dok) {
    each(sider, function (s) {
      s.classList.toggle("vist", s.getAttribute("data-dok") === dok);
    });
    each(filer, function (li, i) {
      var her = li.getAttribute("data-dok") === dok;
      li.classList.toggle("valgt", her);
      if (her) tekst("docnavn", filnavn(i));
    });
    tekst("doctype", DOKTYPE[dok]);
  }

  function fil(i, tilstand, meta) {
    var li = filer[i];
    li.classList.remove("ko", "leses", "uavklart");
    if (tilstand) li.classList.add(tilstand);
    li.querySelector(".kv-fmeta").textContent = meta;
  }
  function filLest(i, medUavklart) {
    var li = filer[i];
    var u = medUavklart && li.getAttribute("data-uavklart");
    var meta = li.getAttribute("data-steder") + " steder";
    if (li.getAttribute("data-ekstra")) meta += " · " + li.getAttribute("data-ekstra");
    fil(i, u ? "uavklart" : "", meta + (u ? " · " + u + " uavklart" : ""));
  }

  // Registeret fylles i takt med filene som er lest (andel 0–1).
  function fyllRegister(andel) {
    var sum = 0;
    each(register, function (li) {
      var n = Math.round(+li.getAttribute("data-n") * andel);
      var s = Math.round(+li.getAttribute("data-s") * andel);
      sum += n;
      li.classList.toggle("tom", !s);
      li.querySelector("em").textContent = n + " · " + s + (s === 1 ? " sted" : " steder");
    });
    tekst("opplysninger", sum);
    tekst("skjules", Math.round(REGISTER_STEDER * andel));
    tekst("faarstaa", "0");
  }

  // Lesehodet glir ned over siden (CSS). Hvert merke toner inn når hodet passerer:
  // forsinkelsen regnes ut fra hvor merket står på siden.
  function lesSide(dok) {
    var s = side(dok);
    var r = s.getBoundingClientRect();
    var h = r.height || 1;
    s.style.setProperty("--hoyde", Math.round(s.offsetHeight) + "px");
    each(s.querySelectorAll("mark"), function (m) {
      var y = Math.max(0, Math.min(1, (m.getBoundingClientRect().top - r.top) / h));
      m.style.transitionDelay = Math.round(y * LES) + "ms";
      m.classList.add("sett");
    });
    s.classList.remove("lest");
    s.classList.add("leser");
  }
  function sideLest(dok) {
    var s = side(dok);
    s.classList.remove("leser");
    s.classList.add("lest");
    each(s.querySelectorAll("mark"), function (m) {
      m.style.transitionDelay = "";
    });
  }

  // Pekeren er alltid i bildet og glir dit den skal; den forsvinner aldri og dukker ikke opp fra intet.
  var pekerX = 0;
  var pekerY = 0;
  function settPeker(x, y, glid) {
    pekerX = x;
    pekerY = y;
    if (!glid) {
      peker.style.transition = "none";
      peker.style.transform = "translate(" + x + "px," + y + "px)";
      peker.offsetWidth;
      peker.style.transition = "";
    } else peker.style.transform = "translate(" + x + "px," + y + "px)";
  }
  function pek(el) {
    var r = el.getBoundingClientRect();
    var f = kv.getBoundingClientRect();
    if (!r.width) return;
    settPeker(r.left - f.left + r.width * 0.55, r.top - f.top + r.height * 0.55, true);
  }
  // Et rolig sted å stå når ingenting skal klikkes: litt til siden, nede i vinduet.
  function hvil() {
    var f = ramme.getBoundingClientRect();
    settPeker(f.width * 0.62, f.height * 0.82, true);
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
  function velgMerke(mark) {
    each(alleMerker, function (m) {
      m.classList.remove("vald");
    });
    if (mark) mark.classList.add("vald");
  }
  function form(navn) {
    each($("former").children, function (p) {
      p.classList.toggle("på", p.getAttribute("data-form") === navn);
    });
    kv.classList.toggle("svart", navn === "svart");
    kv.classList.add("kopi");
    tekst("kopimerke", navn === "svart" ? "Kopien · svart sladd, som PDF" : "Kopien · kodeliste bakerst");
  }
  function ubtn(n) {
    var b = $("ubtn");
    b.textContent = "";
    b.append(document.createElement("i"), "Uavklart " + n);
  }
  function ansikter(klasse) {
    ansikt1.className = "kv-ansikt a1" + (klasse ? " " + klasse : "");
    ansikt2.className = "kv-ansikt a2" + (klasse ? " " + klasse : "");
  }

  // ---------- Tekst som skrives: tegn for tegn, og et merke når et ord er ferdig ----------
  // Delene er [tekst] eller [tekst, kode, merkelapp]. `som`: «merke» (et ord som skal skjules)
  // eller «kode» (en kode i et svar fra KI-en).
  function skriver(mål, deler, som, påFerdig) {
    var biter = deler.map(function (d) {
      var el;
      var ut;
      if (d[1] && som === "merke") {
        el = document.createElement("mark");
        ut = document.createElement("span");
        ut.className = "o";
        var k = document.createElement("span");
        k.className = "k";
        k.textContent = "[" + d[1] + "]";
        el.append(ut, k);
      } else {
        el = document.createElement("span");
        ut = el;
      }
      mål.appendChild(el);
      return { d: d, el: el, ut: ut, ferdig: false };
    });
    var lengde = deler.reduce(function (n, d) {
      return n + (som === "kode" && d[1] ? d[1].length + 2 : d[0].length);
    }, 0);
    return {
      lengde: lengde,
      til: function (n) {
        var rest = n;
        biter.forEach(function (b) {
          var t = som === "kode" && b.d[1] ? "[" + b.d[1] + "]" : b.d[0];
          var vis = Math.max(0, Math.min(t.length, rest));
          rest -= t.length;
          if (b.ut.textContent.length !== vis && !b.ferdig) b.ut.textContent = t.slice(0, vis);
          if (b.d[1] && vis === t.length && !b.ferdig) {
            b.ferdig = true;
            if (som === "merke") b.el.classList.add("sett");
            else {
              b.el.textContent = "";
              var c = document.createElement("code");
              c.textContent = t;
              b.el.appendChild(c);
            }
            if (påFerdig) påFerdig(b.d);
          }
        });
      },
      nullstill: function () {
        biter.forEach(function (b) {
          b.ferdig = false;
          b.el.classList.remove("sett");
          if (som === "kode") b.el.textContent = "";
          else b.ut.textContent = "";
        });
      }
    };
  }

  // Tekstverktøyet, fane 1: meldingen som skrives inn.
  var MELDING = [
    ["Hei! Kan du ringe "],
    ["Kari Nordmann", "Person 6311794", "Person"],
    [" på "],
    ["922 11 334", "Telefon 6289990", "Telefon"],
    [" i dag? Hun har flyttet til "],
    ["Glenneveien 272", "Adresse 8950779", "Adresse"],
    [", og lønnen skal nå gå til konto "],
    ["1503 42 17886", "Kontonummer 7719741", "Kontonummer"],
    ["."]
  ];
  function listepunkt(lapp, verdi) {
    var li = document.createElement("li");
    var c = document.createElement("code");
    c.textContent = lapp;
    var s = document.createElement("span");
    s.textContent = verdi;
    li.append(c, s);
    $("rtliste").appendChild(li);
  }
  var melding = skriver($("rttekst"), MELDING, "merke", function (d) {
    listepunkt(d[2], d[0]);
  });

  // Svaret fra KI-en: med kodene, aldri med navnene.
  var SVAR = [
    ["Hei! Jeg ringer "],
    ["Kari Nordmann", "Person 6311794"],
    [" på "],
    ["922 11 334", "Telefon 6289990"],
    [" i ettermiddag. Den nye adressen, "],
    ["Glenneveien 272", "Adresse 8950779"],
    [", er lagt inn, og lønnen går til "],
    ["1503 42 17886", "Kontonummer 7719741"],
    [" fra neste utbetaling."]
  ];
  var svar = skriver($("kisvartekst"), SVAR, "kode");

  // Tekstverktøyet, fane 2: svaret limes inn med kodene, og de blir til det som sto der.
  var tbMerker = [];
  (function () {
    var p = $("rtsvar");
    SVAR.forEach(function (d) {
      if (!d[1]) return p.append(d[0]);
      var m = document.createElement("mark");
      var c = document.createElement("code");
      c.textContent = "[" + d[1] + "]";
      var o = document.createElement("span");
      o.className = "o";
      o.textContent = d[0];
      m.append(c, o);
      p.appendChild(m);
      tbMerker.push(m);
    });
  })();

  function nullstillTekst() {
    melding.nullstill();
    svar.nullstill();
    $("rtliste").textContent = "";
    tekst("rtlistetittel", "Skjules");
    $("rtorig").classList.add("på");
    $("rtrenset").classList.remove("på");
    $("fanerens").classList.add("på");
    $("fanetb").classList.remove("på");
    $("toast").classList.remove("vis");
    kv.classList.remove("renset", "tbtekst");
    tbMerker.forEach(function (m) {
      m.classList.remove("tilbake");
    });
    $("kibruker").classList.remove("vis");
    $("kisvar").classList.remove("vis", "ferdig");
  }
  function nullstillFinder() {
    $("meny").classList.remove("vis");
    $("undermeny").classList.remove("vis");
    $("hurtig").classList.remove("aktiv");
    $("rensmed").classList.remove("aktiv");
    $("fmappe").classList.remove("valgt");
    $("fny").classList.remove("vis", "valgt");
    $("varsel").classList.remove("vis");
  }

  // Hele tilstanden settes på nytt ved starten av hvert kapittel, så avspillingen kan
  // hoppe rett dit. `lest`: mappen er lest; `avklart`: det uavklarte er gått gjennom.
  function tilstand(o) {
    kv.classList.remove("kopi", "svart", "gaar-gjennom");
    kv.classList.toggle("avklart", !!o.avklart);
    each(sider, function (s) {
      s.classList.remove("leser", "lest", "bytter");
    });
    each(alleMerker, function (m) {
      m.style.transitionDelay = "";
      m.classList.toggle("sett", !!o.lest);
      m.classList.remove("vald");
    });
    merknad.className = o.avklart ? "s" : "u";
    arbeid.className = o.avklart ? "b" : "u";
    if (o.lest) {
      merknad.classList.add("sett");
      arbeid.classList.add("sett");
    }
    each(filer, function (_, i) {
      if (o.lest) filLest(i, !o.avklart);
      else fil(i, "ko", "I kø");
    });
    fyllRegister(o.lest ? 1 : 0);
    if (o.avklart) {
      tekst("skjules", REGISTER_STEDER + 1);
      tekst("faarstaa", "1");
    }
    ansikter(o.dekket ? "pikselert" : "");
    skilt.className = "kv-skilt" + (o.dekket ? " dekket" : "");
    visDok(o.dok || "vedtak");
    tekst("leser", filnavn(0));
    tekst("nr", "1 av " + filer.length);
    tekst("vis", "Vis kopien");
    tekst("lag", "Lag 10 kopier");
    tekst("lagnaa", "Lag 10 kopier");
    ubtn(2);
    $("u1").classList.remove("avgjort");
    $("u2").classList.remove("avgjort");
    form("kort");
    kv.classList.remove("kopi");
    nullstillTekst();
    nullstillFinder();
    scene(o.scene);
  }

  // ---------- Tidslinjen: hvert steg står med ventetid etter forrige steg ----------
  var tidslinje = [];
  var kapitler = [];
  var t = 0;
  function etter(dt, fn) {
    t += dt;
    tidslinje.push([t, fn]);
  }
  function kapittel(nr, fn) {
    kapitler[nr] = { start: t, steg: tidslinje.length };
    etter(0, function () {
      aktivt(nr);
      fn();
    });
  }
  function trykkPå(hent, vent, etterpå) {
    etter(vent || 900, function () {
      pek(hent());
    });
    etter(900, function () {
      klikk(hent());
      if (etterpå) etterpå();
    });
  }

  // 1. Rens en mappe: startskjermen › «Før skanningen» › lesingen av ti filer.
  kapittel(0, function () {
    tilstand({ scene: "start" });
  });
  trykkPå(function () {
    return $("velg");
  }, 700);
  etter(300, function () {
    scene("forvalg");
  });
  trykkPå(function () {
    return $("skann");
  }, 1200);
  etter(300, function () {
    scene("leser");
    visDok("vedtak");
    hvil();
  });
  // Filene leses én om gangen. De fire med egen side vises mens de leses (lesehodet går
  // over siden); de andre går raskt i lista.
  each(filer, function (li, i) {
    var dok = li.getAttribute("data-dok");
    etter(i ? 0 : 400, function () {
      fil(i, "leses", "leses …");
      tekst("leser", filnavn(i));
      tekst("nr", i + 1 + " av " + filer.length);
      if (dok) visDok(dok);
    });
    if (dok) {
      etter(380, function () {
        lesSide(dok);
      });
      etter(LES + 100, function () {
        sideLest(dok);
        filLest(i, true);
        fyllRegister((i + 1) / filer.length);
        if (dok === "ppt") ansikter("pikselert");
        if (dok === "epost") skilt.className = "kv-skilt dekket";
      });
      // Ansiktene og skiltet pikseleres når siden er lest: litt ekstra tid så det synes.
      etter(dok === "ppt" || dok === "epost" ? 1100 : 200, function () {});
    } else {
      etter(420, function () {
        filLest(i, true);
        fyllRegister((i + 1) / filer.length);
      });
    }
  });
  etter(300, function () {
    scene("gjennom");
  });

  // 2. Gå gjennom: det Klart er usikker på. Skjul det første, la det andre stå.
  kapittel(1, function () {
    tilstand({ scene: "gjennom", lest: true, dok: "vedtak", dekket: true });
  });
  trykkPå(function () {
    return $("gaa");
  }, 700);
  etter(300, function () {
    kv.classList.add("gaar-gjennom");
    velgMerke(merknad);
    tekst("gkode", "Merknad 2760056");
    tekst("gnr", "1 av 2");
    tekst("ghvorfor", "Klart er usikker på om dette er en merknad om en person. · 02-vedtak-vergemal.pdf");
    $("gstrek").style.width = "50%";
  });
  trykkPå(function () {
    return $("skjul");
  }, 1200, function () {
    merknad.className = "s sett vald";
    $("u1").classList.add("avgjort");
    tekst("skjules", REGISTER_STEDER + 1);
  });
  etter(600, function () {
    velgMerke(arbeid);
    tekst("gkode", "Arbeidsplass 5521093");
    tekst("gnr", "2 av 2");
    tekst("ghvorfor", "Klart er usikker på om dette er en arbeidsplass. · 02-vedtak-vergemal.pdf");
    $("gstrek").style.width = "100%";
  });
  trykkPå(function () {
    return $("lastaa");
  }, 900, function () {
    arbeid.className = "b sett vald";
    $("u2").classList.add("avgjort");
    tekst("faarstaa", "1");
  });
  etter(600, function () {
    velgMerke(null);
    kv.classList.remove("gaar-gjennom");
    kv.classList.add("avklart");
    filLest(1, false);
  });

  // 3. Kopiene: kodene i stedet for opplysningene, formene kopiene kan få (svart sladd vises), og «Klart.».
  kapittel(2, function () {
    tilstand({ scene: "gjennom", lest: true, dok: "vedtak", dekket: true, avklart: true });
  });
  trykkPå(function () {
    return $("vis");
  }, 700, function () {
    side("vedtak").classList.add("bytter");
  });
  etter(360, function () {
    kv.classList.add("kopi");
    tekst("vis", "Vis originalen");
    side("vedtak").classList.remove("bytter");
  });
  trykkPå(function () {
    return $("lag");
  }, 1800);
  etter(300, function () {
    scene("kopivalg");
  });
  trykkPå(function () {
    return kv.querySelector('[data-form="svart"]');
  }, 1000, function () {
    side("vedtak").classList.add("bytter");
  });
  etter(360, function () {
    form("svart");
    side("vedtak").classList.remove("bytter");
  });
  trykkPå(function () {
    return kv.querySelector('[data-form="kort"]');
  }, 2000, function () {
    side("vedtak").classList.add("bytter");
  });
  etter(360, function () {
    form("kort");
    side("vedtak").classList.remove("bytter");
  });
  trykkPå(function () {
    return $("lagnaa");
  }, 900);
  each([3, 6, 10], function (n) {
    etter(420, function () {
      tekst("lagnaa", "Lager kopi " + n + " av 10 …");
    });
  });
  etter(420, function () {
    scene("ferdig");
    hvil();
  });
  etter(3200, function () {});

  // 4. Høyreklikk i Finder: Hurtighandlinger › Rens med Klart, uten å åpne appen.
  kapittel(3, function () {
    tilstand({ scene: "finder", lest: true, avklart: true, dekket: true });
  });
  etter(900, function () {
    pek($("fmappe"));
  });
  etter(900, function () {
    klikk($("fmappe"));
    $("fmappe").classList.add("valgt");
    $("meny").classList.add("vis");
  });
  etter(900, function () {
    pek($("hurtig"));
  });
  etter(800, function () {
    $("hurtig").classList.add("aktiv");
    $("undermeny").classList.add("vis");
  });
  etter(700, function () {
    pek($("rensmed"));
  });
  etter(800, function () {
    $("rensmed").classList.add("aktiv");
  });
  etter(250, function () {
    klikk($("rensmed"));
  });
  etter(300, function () {
    $("meny").classList.remove("vis");
    $("undermeny").classList.remove("vis");
    tekst("vtittel", "Renser «kundesaker» …");
    tekst("vtekst", "Kopiene legges ved siden av. Du får beskjed når de er klare.");
    $("varsel").classList.add("vis");
    hvil();
  });
  etter(2600, function () {
    $("varsel").classList.remove("vis");
  });
  etter(500, function () {
    tekst("vtittel", "«kundesaker» er renset");
    tekst("vtekst", "10 kopier i «kundesaker-klar».");
    $("varsel").classList.add("vis");
    $("fmappe").classList.remove("valgt");
    $("fny").classList.add("vis", "valgt");
  });
  etter(3400, function () {});

  // 5. Rens og tilbakefør tekst: meldingen renses i Tekstverktøyet, KI-en svarer med kodene, og svaret
  // tilbakeføres, så navnene kommer tilbake uten at KI-en har sett dem.
  kapittel(4, function () {
    tilstand({ scene: "tekst", lest: true, avklart: true, dekket: true });
  });
  for (var n = 3; n < melding.lengde + 3; n += 3) {
    (function (n) {
      etter(n === 3 ? 700 : 80, function () {
        melding.til(n);
      });
    })(n);
  }
  trykkPå(function () {
    return $("rtrenset");
  }, 600, function () {
    $("rtrenset").classList.add("på");
    $("rtorig").classList.remove("på");
    kv.classList.add("renset");
  });
  trykkPå(function () {
    return $("rtkopier");
  }, 1000, function () {
    tekst("toast", "Kopiert med kodene");
    $("toast").classList.add("vis");
  });
  etter(1300, function () {
    scene("ki");
    hvil();
  });
  etter(700, function () {
    $("kibruker").classList.add("vis");
  });
  etter(1200, function () {
    $("kisvar").classList.add("vis");
  });
  for (var m = 4; m < svar.lengde + 4; m += 4) {
    (function (m) {
      etter(70, function () {
        svar.til(m);
      });
    })(m);
  }
  etter(300, function () {
    $("kisvar").classList.add("ferdig");
  });
  trykkPå(function () {
    return $("kikopier");
  }, 1200);
  etter(500, function () {
    scene("tekst");
    $("toast").classList.remove("vis");
  });
  trykkPå(function () {
    return $("fanetb");
  }, 600, function () {
    $("fanetb").classList.add("på");
    $("fanerens").classList.remove("på");
    $("rtorig").classList.add("på");
    $("rtrenset").classList.remove("på");
    kv.classList.remove("renset");
    kv.classList.add("tbtekst");
    $("rtliste").textContent = "";
    tekst("rtlistetittel", "Tilbakeført");
  });
  etter(1300, function () {
    tbMerker.forEach(function (mk) {
      mk.classList.add("tilbake");
    });
    MELDING.forEach(function (d) {
      if (d[1]) listepunkt(d[2], d[0]);
    });
  });
  trykkPå(function () {
    return $("rtkopier");
  }, 1900, function () {
    tekst("toast", "Kopiert med navnene tilbake");
    $("toast").classList.add("vis");
  });
  etter(2400, function () {
    $("toast").classList.remove("vis");
    hvil();
  });
  etter(700, function () {});

  var SLUTT = t;
  kapitler.forEach(function (k, i) {
    k.slutt = i + 1 < kapitler.length ? kapitler[i + 1].start : SLUTT;
  });

  // ---------- Kapitlene under vinduet ----------
  var nåKapittel = -1;
  function aktivt(nr) {
    nåKapittel = nr;
    each(knapper, function (b, i) {
      if (i === nr) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      b.style.setProperty("--fylt", "0");
    });
  }
  each(knapper, function (b) {
    b.addEventListener("click", function () {
      hopp(+b.getAttribute("data-kapittel"));
    });
  });

  // ---------- Klokken: går bare mens vinduet er på skjermen og fanen er åpen ----------
  var klokke = 0;
  var neste = 0;
  var sist = 0;
  var timer = null;
  var synlig = false;

  function hopp(nr) {
    klokke = kapitler[nr].start;
    neste = kapitler[nr].steg;
    tikk(true);
  }
  function tikk(stille) {
    var nå = Date.now();
    if (stille !== true) klokke += Math.min(nå - sist, 100);
    sist = nå;
    while (neste < tidslinje.length && tidslinje[neste][0] <= klokke) tidslinje[neste++][1]();
    if (neste >= tidslinje.length) {
      klokke = 0;
      neste = 0;
    }
    var k = kapitler[nåKapittel];
    if (k) knapper[nåKapittel].style.setProperty("--fylt", String(Math.max(0, Math.min(1, (klokke - k.start) / (k.slutt - k.start)))));
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

  // Pekeren står i vinduet fra start, på hvileplassen.
  (function () {
    var f = ramme.getBoundingClientRect();
    settPeker(f.width * 0.62, f.height * 0.82, false);
  })();
  tidslinje[0][1]();
  neste = 1;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        synlig = entries[0].isIntersecting;
        synk();
      },
      { threshold: 0.25 }
    ).observe(kv);
  } else {
    synlig = true;
    synk();
  }
  document.addEventListener("visibilitychange", synk);
})();
