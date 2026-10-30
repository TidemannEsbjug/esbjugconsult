(function () {
  var q = new URLSearchParams(location.search);
  var $ = function (id) {
    return document.getElementById(id);
  };
  var tall = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });
  var orgnrTekst = KlartOrgfelt.tekst;

  // Det kjøperen har valgt så langt.
  var tilbud = null; // svaret fra /klart/api/pris
  var dekker = "egen"; // «egen» eller «kunder»
  var kunder = []; // { orgnr, navn, ansatte, konsern, pris }
  var betaling = null; // «kort» eller «faktura»
  var kjop = null; // «lisens» eller «testing»
  var historikk = []; // stegene vi har vært på, for «Tilbake»

  // ---------- Hjelpere ----------

  function nok(n) {
    return tall.format(n) + " NOK";
  }
  function ansatteTekst(n) {
    return n === 1 ? "1 registrert ansatt" : tall.format(n) + " registrerte ansatte";
  }
  function datoTekst(iso) {
    if (!iso) return "";
    var d = iso.split("-");
    return new Date(+d[0], +d[1] - 1, +d[2]).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
  }
  // Ingenting dukker opp eller forsvinner i et hopp på denne siden: det som åpnes, glir opp og tones inn.
  var GLID_TID = { duration: 360, easing: "cubic-bezier(0.4, 0, 0.2, 1)" };
  var UTEN_BEVEGELSE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Spiller animasjonen og rydder opp på tid, så sluttilstanden kommer også i en fane som ligger i bakgrunnen. */
  function spill(el, bilder, ferdig) {
    var a = el.animate(bilder, { duration: GLID_TID.duration, easing: GLID_TID.easing, fill: "forwards" });
    var t = setTimeout(function () {
      el._glid = null;
      ferdig();
      a.cancel();
    }, GLID_TID.duration);
    el._glid = {
      cancel: function () {
        clearTimeout(t);
        a.cancel();
      },
    };
  }

  /** Viser eller skjuler et element med høyden og fargen i bevegelse. Skjult forelder gir ingen animasjon. */
  function glid(el, vis) {
    if (el._glid) {
      el._glid.cancel();
      el._glid = null;
    } else if (el.hidden === !vis) {
      return;
    }
    el.hidden = false;
    if (UTEN_BEVEGELSE || !el.offsetHeight) {
      el.hidden = !vis;
      return;
    }
    var s = getComputedStyle(el);
    var aapen = {
      height: el.offsetHeight + "px",
      marginTop: s.marginTop,
      marginBottom: s.marginBottom,
      paddingTop: s.paddingTop,
      paddingBottom: s.paddingBottom,
      opacity: 1,
    };
    var lukket = { height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 };
    el.style.overflow = "hidden";
    el.style.boxSizing = "border-box";
    spill(el, vis ? [lukket, aapen] : [aapen, lukket], function () {
      el.style.overflow = "";
      el.style.boxSizing = "";
      el.hidden = !vis;
    });
  }

  // Spørsmålene og andre <details> åpnes og lukkes på samme måte.
  document.querySelectorAll("details").forEach(function (d) {
    var sum = d.querySelector("summary");
    sum.addEventListener("click", function (e) {
      if (UTEN_BEVEGELSE) return;
      e.preventDefault();
      if (d._glid) d._glid.cancel();
      var fra = d.offsetHeight;
      var aapner = !d.open;
      d.open = true;
      var full = d.offsetHeight;
      var til = aapner ? full : sum.offsetHeight + (full - d.clientHeight);
      d.style.overflow = "hidden";
      spill(d, { height: [fra + "px", til + "px"] }, function () {
        d.style.overflow = "";
        d.open = aapner;
      });
    });
  });

  function feil(id, tekst) {
    if (tekst) $(id).textContent = tekst;
    glid($(id), Boolean(tekst));
  }
  function api(sti, data) {
    return fetch(
      "/klart/api/" + sti,
      data ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : undefined
    ).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (j) {
          if (!r.ok) throw new Error(j.feil || "Noe gikk galt. Prøv igjen om litt.");
          return j;
        });
    });
  }
  function opptatt(el, ja) {
    el.disabled = ja;
    el.classList.toggle("venter", ja);
  }
  function settAdresse(orgnr) {
    var ny = new URLSearchParams(location.search);
    ny.delete("ordre");
    ny.delete("vis");
    ny.delete("sprint");
    ny.delete("avbrutt");
    if (orgnr) ny.set("orgnr", orgnr);
    else ny.delete("orgnr");
    var s = ny.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  }
  function li(tekst) {
    var el = document.createElement("li");
    el.textContent = tekst;
    return el;
  }
  function velgEn(gruppe, attr, verdi) {
    document.querySelectorAll("[" + attr + "]").forEach(function (b) {
      if (gruppe && !gruppe.contains(b)) return;
      b.setAttribute("aria-checked", b.getAttribute(attr) === verdi ? "true" : "false");
    });
  }

  // ---------- Stegene: ett om gangen i samme kort ----------

  var STEG = ["s-port", "s-pris", "s-oppsett", "s-testing", "s-dekker", "s-betaling", "s-nokkel", "s-bekreft", "s-ferdig", "s-kvittering"];
  // Kortet er bredere der det er mer å se.
  var BREDDE = { "s-oppsett": "bred", "s-dekker": "middels", "s-betaling": "middels", "s-nokkel": "middels", "s-bekreft": "middels", "s-ferdig": "middels", "s-testing": "middels" };

  function vis(steg, tilbake) {
    STEG.forEach(function (id) {
      $(id).hidden = id !== steg;
    });
    var el = $(steg);
    el.classList.toggle("tilbake-inn", Boolean(tilbake));
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = "";
    var bredde = steg === "s-pris" ? (tilbud && tilbud.stor ? "bred" : "middels") : BREDDE[steg];
    $("kort").classList.toggle("bred", bredde === "bred");
    $("kort").classList.toggle("middels", bredde === "middels");
    // Oversikten over oppsett og sprint er for høy til vinterbildet: der er bakgrunnen en blå flate.
    $("port").classList.toggle("oversikt", steg === "s-oppsett");
    tegnStegrad(steg);
    if (steg === "s-oppsett") lastLedige();
    var overskrift = el.querySelector("h2[tabindex], h1");
    if (overskrift && steg !== "s-port") overskrift.focus({ preventScroll: true });
    if ($("port").getBoundingClientRect().top < 0) $("port").scrollIntoView({ behavior: "smooth" });
  }

  function gaaTil(steg) {
    var her = STEG.find(function (id) {
      return !$(id).hidden;
    });
    if (her && her !== steg) historikk.push(her);
    vis(steg);
  }

  document.querySelectorAll("[data-tilbake]").forEach(function (b) {
    b.addEventListener("click", function () {
      // Fra fakturafeltene går «Tilbake» først til valget mellom kort og faktura.
      if (b.closest("#s-betaling") && betaling === "faktura") {
        betaling = "kort";
        visBetaling();
        return;
      }
      vis(historikk.pop() || "s-pris", true);
    });
  });

  /** Stegraden øverst: Pris · (Lisensen) · Betaling · Bekreft. «Lisensen» er bare med når den er et steg. */
  function tegnStegrad(steg) {
    var rekke = ["s-pris", "s-dekker", "s-betaling", "s-bekreft"];
    var navn = { "s-pris": "Pris", "s-dekker": "Lisensen", "s-betaling": "Betaling", "s-bekreft": "Bekreft" };
    var med = rekke.filter(function (s) {
      return s !== "s-dekker" || (tilbud && (tilbud.leverandorAktuell || dekker === "kunder" || steg === "s-dekker"));
    });
    var i = med.indexOf(steg === "s-nokkel" ? "s-betaling" : steg);
    var rad = $("stegrad");
    rad.hidden = i < 0 || kjop === "testing";
    rad.replaceChildren();
    med.forEach(function (s, j) {
      var el = li(navn[s]);
      if (j < i) el.className = "ferdig";
      if (j === i) {
        el.className = "her";
        el.setAttribute("aria-current", "step");
      }
      rad.appendChild(el);
    });
  }

  /** Nøkkelen i en boks med kopier-knapp. */
  function nokkelBoks(mal, svar) {
    mal.replaceChildren();
    var boks = document.createElement("div");
    boks.className = "nokkel";
    var etikett = document.createElement("span");
    etikett.className = "etikett";
    etikett.textContent = svar.type === "testing" ? "Kode for utvidet testing" : "Lisensnøkkel";
    var felt = document.createElement("textarea");
    felt.readOnly = true;
    felt.value = svar.kode;
    var rad = document.createElement("div");
    rad.className = "rad";
    var tekst = document.createElement("p");
    var hva = "Lim den inn i Klart: klikk «Gratis prøve» øverst til høyre, og lim nøkkelen inn i feltet der.";
    if (svar.type === "testing") hva = "Koden gir 50 eksporter, uten tidsgrense. Den tas i bruk i neste versjon av Klart.";
    else if (svar.utloper) hva += " Gjelder til og med " + datoTekst(svar.utloper) + ".";
    tekst.textContent = hva;
    var kopier = document.createElement("button");
    kopier.type = "button";
    kopier.className = "btn sm";
    kopier.textContent = "Kopier";
    kopier.addEventListener("click", function () {
      navigator.clipboard.writeText(felt.value).then(function () {
        kopier.textContent = "Kopiert";
        setTimeout(function () {
          kopier.textContent = "Kopier";
        }, 1600);
      });
    });
    rad.appendChild(tekst);
    rad.appendChild(kopier);
    boks.appendChild(etikett);
    boks.appendChild(felt);
    boks.appendChild(rad);
    mal.appendChild(boks);
  }

  // ---------- 1. Virksomheten ----------

  if (q.get("from") === "quota") $("kvote").hidden = false;
  var portfelt = KlartOrgfelt($("orgnr"), $("orgnr-forslag"), function (orgnr) {
    return slaaOpp(orgnr);
  });

  $("port-skjema").addEventListener("submit", function (e) {
    e.preventDefault();
    feil("port-feil", "");
    $("underenhet").hidden = true;
    var o = portfelt.orgnr() || (!portfelt.sifre() && portfelt.forste());
    if (!o) {
      feil(
        "port-feil",
        portfelt.sifre()
          ? "Organisasjonsnummeret stemmer ikke. Sjekk at alle ni sifrene er riktige."
          : "Fant ingen virksomhet med det navnet. Prøv organisasjonsnummeret."
      );
      $("orgnr").focus();
      return;
    }
    slaaOpp(o);
  });

  function slaaOpp(o) {
    var knapp = $("vis");
    opptatt(knapp, true);
    knapp.textContent = "Slår opp …";
    return api("pris?orgnr=" + o)
      .then(function (svar) {
        if (svar.underenhet) return visUnderenhet(svar);
        visPris(svar);
      })
      .catch(function (err) {
        feil("port-feil", err.message);
      })
      .finally(function () {
        opptatt(knapp, false);
        knapp.textContent = "Vis prisen";
      });
  }

  function visUnderenhet(svar) {
    $("underenhet-tekst").textContent = "Dette er en underenhet av " + svar.overordnet.navn + ".";
    $("underenhet-ja").textContent = "Fortsett med " + orgnrTekst(svar.overordnet.orgnr);
    $("underenhet-ja").onclick = function () {
      $("orgnr").value = orgnrTekst(svar.overordnet.orgnr);
      $("underenhet").hidden = true;
      slaaOpp(svar.overordnet.orgnr);
    };
    glid($("underenhet"), true);
  }

  // ---------- 2. Prisen ----------

  function visPris(d) {
    tilbud = d;
    dekker = "egen";
    kunder = [];
    betaling = null;
    kjop = "lisens";
    historikk = [];

    $("r-hvem").replaceChildren();
    var navn = document.createElement("b");
    navn.textContent = d.navn;
    $("r-hvem").appendChild(navn);
    $("r-hvem").appendChild(document.createTextNode(" · Org.nr. " + orgnrTekst(d.orgnr) + " · " + (d.konsern ? "konsern" : ansatteTekst(d.ansatte))));
    $("r-pris").replaceChildren();
    $("r-pris").appendChild(document.createTextNode(nok(d.pris) + " "));
    var per = document.createElement("span");
    per.textContent = "per år, eks. mva";
    $("r-pris").appendChild(per);

    // Vilkårene som betyr noe for kjøperen. Hva programmet gjør, vet de alt.
    var hvem = d.konsern ? "hele konsernet" : "virksomheten";
    var v = $("r-vilkar");
    v.replaceChildren();
    v.appendChild(li("Gjelder alle brukere og enheter i " + hvem + "."));
    v.appendChild(li((d.konsern ? "Dekker dokumentene i hele konsernet" : "Dekker dokumentene i virksomheten") + ", også de som handler om kundene."));
    v.appendChild(li("Årlig lisens. Dere får påminnelse 14 dager før den fornyes."));

    $("pris-videre").disabled = !d.kjop;
    $("kjop-stengt").hidden = d.kjop;
    // Behandler de trolig data for andre, blir det et eget steg. Ellers bare en lenke.
    $("til-dekker").hidden = d.leverandorAktuell;
    $("til-testing").hidden = !d.testing;
    $("r-oppsett").hidden = !d.stor;
    visSprintPris(d);
    if (d.testing) {
      $("t-pris").textContent = nok(d.testing.pris);
      var t = $("t-vilkar");
      t.replaceChildren();
      t.appendChild(li(d.testing.eksporter + " eksporter. Ingen tidsgrense."));
      t.appendChild(li("Én per virksomhet."));
      t.appendChild(li("Hele beløpet på " + nok(d.testing.pris) + " godskrives lisensen."));
      $("t-videre").disabled = !d.kjop || !d.testing.apen;
      $("t-videre").textContent = d.testing.apen ? "Gå videre" : "Åpner snart";
    }

    // Betalingsmåtene virksomheten kan bruke. De andre vises ikke.
    document.querySelectorAll("[data-betaling]").forEach(function (b) {
      b.hidden = !d.betaling[b.getAttribute("data-betaling")];
    });

    velgEn(null, "data-dekker", "egen");
    $("kunde-panel").hidden = true;
    tegnKunder();
    $("sporsmal").hidden = false;
    settAdresse(d.orgnr);
    // Fra forsiden («Les om skreddersydd oppsett») går vi rett dit.
    if (q.get("vis") === "oppsett" && d.stor) {
      historikk = ["s-pris"];
      vis("s-oppsett");
    } else {
      vis("s-pris");
      $("r-pris").focus({ preventScroll: true });
    }
  }

  document.querySelectorAll("[data-endre]").forEach(function (b) {
    b.addEventListener("click", function () {
      tilbud = null;
      historikk = [];
      portfelt.tom();
      $("sporsmal").hidden = true;
      settAdresse(null);
      vis("s-port", true);
      $("orgnr").focus();
    });
  });

  $("pris-videre").addEventListener("click", function () {
    kjop = "lisens";
    if (!tilbud.leverandorAktuell) forberedBetaling();
    gaaTil(tilbud.leverandorAktuell ? "s-dekker" : "s-betaling");
  });
  $("til-dekker").addEventListener("click", function () {
    kjop = "lisens";
    gaaTil("s-dekker");
  });
  $("til-oppsett").addEventListener("click", function () {
    gaaTil("s-oppsett");
  });
  $("til-testing").addEventListener("click", function () {
    kjop = "testing";
    gaaTil("s-testing");
  });

  // ---------- Oppsett og sprint: tilbudene, prisen og «Betal og book» ----------

  var valgtTilbud = null; // ett av tilbud.sprint: { id: oppsett|kort|sprint, dager, fast | grunn+total }
  var ledige = null; // ledige startdager (ÅÅÅÅ-MM-DD) fra /klart/api/sprint/ledige
  var forespurte = null; // startdager som blir en forespørsel (en oppsettsdag ligger i perioden)
  var valgtStart = null;
  var kalMaaned = null; // første dag i måneden som vises
  var NAVN = { oppsett: "Oppsettsdag", kort: "Kort sprint", sprint: "Sprint" };

  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fraIso(t) {
    var d = t.split("-");
    return new Date(+d[0], +d[1] - 1, +d[2]);
  }
  function leggTilDager(t, n) {
    var d = fraIso(t);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function maanedFra(t) {
    var d = fraIso(t);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function dagerTekst(n) {
    return n === 1 ? "1 dag" : n + " dager";
  }
  function forskudd(t) {
    return t.fast != null ? t.fast : t.grunn;
  }

  // Kortet ved siden av lisensprisen, og valgene på siden for oppsett og sprint.
  function visSprintPris(d) {
    var liste = d.sprint || [];
    var sprinten = liste.find(function (t) {
      return t.id !== "oppsett";
    });
    $("r-oppsett").querySelector("h3").textContent = sprinten ? "Skreddersydd oppsett" : "Oppsettsdag";
    $("r-oppsett").querySelector("p:not(.merke)").textContent = sprinten
      ? "En egen modell, finjustert på deres egne dokumenter og satt opp hos dere, på maskinvare dere eier."
      : "Vi setter opp Klart hos dere på én dag, med tilgang internt og opplæring. " + nok(liste.length ? liste[0].fast : 0) + " eks. mva.";
    $("r-oppsett").querySelector("svg").style.display = sprinten ? "" : "none";

    var valg = $("op-valg");
    valg.replaceChildren();
    valg.hidden = liste.length < 2;
    liste.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("data-tilbud", t.id);
      var navn = document.createElement("b");
      navn.textContent = NAVN[t.id] + (t.id === "oppsett" ? "" : ", " + dagerTekst(t.dager));
      var pris = document.createElement("span");
      pris.textContent = nok(t.fast != null ? t.fast : t.total) + " eks. mva";
      b.appendChild(navn);
      b.appendChild(pris);
      b.addEventListener("click", function () {
        velgTilbud(t);
        lastLedige();
      });
      valg.appendChild(b);
    });
    // Har de flere valg, står den største først.
    if (liste.length) velgTilbud(sprinten || liste[0]);
  }

  function velgTilbud(t) {
    valgtTilbud = t;
    valgtStart = null;
    kalMaaned = null;
    velgEn($("op-valg"), "data-tilbud", t.id);
    var oppsett = t.id === "oppsett";
    $("op-tittel").textContent = oppsett ? "Oppsettsdag hos dere" : t.id === "kort" ? "En kort sprint hos dere" : "En sprint hos dere";
    $("op-merke").textContent = oppsett ? "Oppsettsdag" : "Skreddersydd oppsett";
    document.querySelectorAll("#s-oppsett [data-blokk]").forEach(function (el) {
      glid(el, el.getAttribute("data-blokk") === (oppsett ? "oppsett" : "sprint"));
    });
    document.querySelectorAll("#s-oppsett [data-kun]").forEach(function (el) {
      glid(el, el.getAttribute("data-kun") === t.id);
    });
    var felt = {
      trinn: "Pris",
      fast: t.fast != null ? nok(t.fast) : "",
      total: t.total != null ? nok(t.total) : "",
      grunn: t.grunn != null ? nok(t.grunn) : "",
      rest: t.total != null ? nok(t.total - t.grunn) : "",
      dager: dagerTekst(t.dager),
      utvidet: t.utvidetTotal ? nok(t.utvidetTotal) : "",
    };
    document.querySelectorAll("#s-oppsett [data-felt]").forEach(function (el) {
      el.textContent = felt[el.getAttribute("data-felt")];
    });
    $("book-aapne").textContent = oppsett ? "Book oppsettsdag" : t.id === "kort" ? "Book kort sprint" : "Book sprint";
    glid($("book-skjema"), false);
    glid($("book-start"), true);
    $("kal-etikett").textContent = oppsett ? "Velg dag" : "Velg startdato";
    $("kal-valgt").textContent = "Laster ledige datoer …";
    oppdaterKnapp();
  }

  function oppdaterKnapp() {
    var t = valgtTilbud;
    if (!t) return;
    var kjop = tilbud && tilbud.kjop;
    var foresp = valgtStart && forespurte && forespurte.has(valgtStart);
    $("book-aapne").disabled = !kjop;
    $("bk-knapp").disabled = !kjop;
    $("bk-knapp").textContent = !kjop ? "Booking åpner snart" : foresp ? "Send forespørsel" : "Betal " + nok(forskudd(t) * 1.25) + " og book";
    $("bk-info").textContent = foresp
      ? "Det ligger en oppsettsdag i perioden, som vi flytter først. Dere betaler ingenting nå; vi sender en betalingslenke når datoene er bekreftet."
      : (t.id === "oppsett" ? "Prisen" : "Grunnhonoraret") +
        " inkl. 25 % mva. Betaling med kort i Stripe. Datoen holdes i 30 minutter mens dere betaler.";
  }

  function lastLedige() {
    if (!valgtTilbud) return Promise.resolve();
    var id = valgtTilbud.id;
    return api("sprint/ledige?tilbud=" + id)
      .then(function (svar) {
        if (!valgtTilbud || valgtTilbud.id !== id) return;
        ledige = new Set(svar.ledige);
        forespurte = new Set(svar.forespurt || []);
        if (valgtStart && !ledige.has(valgtStart) && !forespurte.has(valgtStart)) valgtStart = null;
        var alle = svar.ledige.concat(svar.forespurt || []).sort();
        if (!kalMaaned) kalMaaned = alle.length ? maanedFra(alle[0]) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        tegnKalender();
      })
      .catch(function (err) {
        $("kal-valgt").textContent = err.message;
      });
  }

  function tegnKalender() {
    var dager = valgtTilbud.dager;
    var rute = $("kal-dager");
    rute.replaceChildren();
    ["ma", "ti", "on", "to", "fr", "lø", "sø"].forEach(function (u) {
      var el = document.createElement("span");
      el.className = "uke";
      el.textContent = u;
      rute.appendChild(el);
    });
    var aar = kalMaaned.getFullYear();
    var mnd = kalMaaned.getMonth();
    $("kal-maaned").textContent = kalMaaned.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
    for (var i = 0; i < (kalMaaned.getDay() + 6) % 7; i++) rute.appendChild(document.createElement("span"));
    var sluttValgt = valgtStart ? leggTilDager(valgtStart, dager - 1) : null;
    var antall = new Date(aar, mnd + 1, 0).getDate();
    for (var dag = 1; dag <= antall; dag++) {
      var t = iso(new Date(aar, mnd, dag));
      var el;
      if (ledige.has(t) || forespurte.has(t)) {
        el = document.createElement("button");
        el.type = "button";
        if (forespurte.has(t)) el.className = "forespurt";
        el.setAttribute("aria-pressed", t === valgtStart ? "true" : "false");
        el.setAttribute("aria-label", datoTekst(t) + (forespurte.has(t) ? ", som forespørsel" : ""));
        el.addEventListener(
          "click",
          (function (start) {
            return function () {
              valgtStart = start;
              feil("bk-feil", "");
              tegnKalender();
            };
          })(t)
        );
      } else {
        el = document.createElement("span");
        el.className = "dag";
      }
      if (valgtStart && t > valgtStart && t <= sluttValgt) el.classList.add("i-sprint");
      el.textContent = dag;
      rute.appendChild(el);
    }
    var liste = Array.from(ledige).concat(Array.from(forespurte)).sort();
    $("kal-forrige").disabled = !liste.length || kalMaaned <= maanedFra(liste[0]);
    $("kal-neste").disabled = !liste.length || kalMaaned >= maanedFra(liste[liste.length - 1]);
    var v = $("kal-valgt");
    v.replaceChildren();
    var hva = NAVN[valgtTilbud.id];
    if (!liste.length) {
      v.textContent = "Ingen ledige datoer akkurat nå. Send oss en melding, så finner vi en tid.";
    } else if (valgtStart) {
      v.appendChild(document.createTextNode(hva + ": "));
      var b = document.createElement("b");
      b.textContent = dager === 1 ? datoTekst(valgtStart) : datoTekst(valgtStart) + " – " + datoTekst(sluttValgt);
      v.appendChild(b);
      if (dager > 1) v.appendChild(document.createTextNode(" (" + dagerTekst(dager) + ")"));
      if (forespurte.has(valgtStart)) v.appendChild(document.createTextNode(". Blir en forespørsel."));
    } else {
      v.textContent =
        dager === 1
          ? "Velg en ledig dag."
          : "Velg en ledig dag. " + (valgtTilbud.id === "kort" ? "Den korte sprinten" : "Sprinten") + " varer " + dagerTekst(dager) + " fra startdagen." +
            (forespurte.size ? " Stiplede dager blir en forespørsel." : "");
    }
    oppdaterKnapp();
  }

  $("kal-forrige").addEventListener("click", function () {
    kalMaaned = new Date(kalMaaned.getFullYear(), kalMaaned.getMonth() - 1, 1);
    tegnKalender();
  });
  $("kal-neste").addEventListener("click", function () {
    kalMaaned = new Date(kalMaaned.getFullYear(), kalMaaned.getMonth() + 1, 1);
    tegnKalender();
  });

  // Kalenderen og skjemaet kommer først når de har lest og trykker «Book».
  $("book-aapne").addEventListener("click", function () {
    glid($("book-start"), false);
    glid($("book-skjema"), true);
    setTimeout(function () {
      $("book-skjema").scrollIntoView({ behavior: UTEN_BEVEGELSE ? "auto" : "smooth", block: "start" });
    }, GLID_TID.duration);
  });

  $("book-skjema").addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      orgnr: tilbud ? tilbud.orgnr : null,
      tilbud: valgtTilbud ? valgtTilbud.id : null,
      start: valgtStart,
      navn: $("bk-navn").value.trim(),
      epost: $("bk-epost").value.trim(),
      telefon: $("bk-tlf").value.trim(),
      nettside: $("bk-nettside").value,
    };
    if (!data.start) return feil("bk-feil", "Velg en dato.");
    if (!data.navn || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.epost)) return feil("bk-feil", "Skriv inn navn og e-post.");
    feil("bk-feil", "");
    opptatt($("bk-knapp"), true);
    api("sprint/book", data)
      .then(function (svar) {
        if (svar.forespurt) {
          glid($("book-skjema"), false);
          glid($("samtale-ferdig"), true);
          $("samtale-ferdig").querySelector(".merke").textContent = "Forespørsel sendt";
          $("samtale-ferdig").querySelector(".tekst").textContent =
            "Vi flytter oppsettsdagen som ligger i perioden, og sender en betalingslenke til " + data.epost +
            " når " + datoTekst(svar.start) + " – " + datoTekst(svar.slutt) + " er bekreftet. Ingenting er betalt ennå.";
          return;
        }
        try {
          sessionStorage.setItem("klart-sprint-okt", svar.okt);
        } catch (err) {}
        location.href = svar.adresse;
      })
      .catch(function (err) {
        feil("bk-feil", err.message);
        opptatt($("bk-knapp"), false);
        lastLedige();
      });
  });

  $("til-samtale").addEventListener("click", function () {
    glid($("samtale-skjema"), $("samtale-skjema").hidden);
  });

  // Tilbake fra Stripe uten å betale: økten avsluttes, og datoen blir ledig igjen med en gang.
  if (q.get("avbrutt")) {
    var avbruttOkt = null;
    try {
      avbruttOkt = sessionStorage.getItem("klart-sprint-okt");
      sessionStorage.removeItem("klart-sprint-okt");
    } catch (err) {}
    if (avbruttOkt) {
      api("sprint/avbryt", { session: avbruttOkt }).finally(function () {
        if (!$("s-oppsett").hidden) lastLedige();
      });
    }
  }

  // ---------- Skreddersydd oppsett: spørsmål først ----------

  $("samtale-skjema").addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      navn: $("sa-navn").value.trim(),
      epost: $("sa-epost").value.trim(),
      telefon: $("sa-tlf").value.trim(),
      melding: $("sa-melding").value.trim(),
      nettside: $("sa-nettside").value,
      orgnr: tilbud ? tilbud.orgnr : null,
    };
    if (!data.navn || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.epost)) {
      return feil("sa-feil", "Skriv inn navn og e-post, så tar vi kontakt.");
    }
    var skjema = this;
    skjema.classList.add("venter");
    api("sprint", data)
      .then(function () {
        glid(skjema, false);
        glid($("samtale-ferdig"), true);
      })
      .catch(function (err) {
        feil("sa-feil", err.message);
      })
      .finally(function () {
        skjema.classList.remove("venter");
      });
  });

  // ---------- Utvidet testing ----------

  $("t-videre").addEventListener("click", function () {
    kjop = "testing";
    betaling = "kort";
    visBekreft();
  });

  // ---------- 3. Hvem lisensen dekker ----------

  document.querySelectorAll("[data-dekker]").forEach(function (b) {
    b.addEventListener("click", function () {
      dekker = b.getAttribute("data-dekker");
      velgEn(null, "data-dekker", dekker);
      glid($("kunde-panel"), dekker === "kunder");
      if (dekker === "kunder") $("kunde-orgnr").focus();
      tegnKunder();
      tegnStegrad("s-dekker");
    });
  });

  var kundefelt = KlartOrgfelt($("kunde-orgnr"), $("kunde-forslag"), function (orgnr) {
    return leggTilKunde(orgnr);
  });

  $("kunde-skjema").addEventListener("submit", function (e) {
    e.preventDefault();
    var o = kundefelt.orgnr() || (!kundefelt.sifre() && kundefelt.forste());
    if (!o) return feil("kunde-feil", "Fant ikke virksomheten. Prøv organisasjonsnummeret.");
    leggTilKunde(o);
  });

  function leggTilKunde(o) {
    feil("kunde-feil", "");
    if (o === tilbud.orgnr) return feil("kunde-feil", "Det er deres eget organisasjonsnummer. Egne data dekkes av lisensen.");
    if (kunder.some(function (k) {
      return k.orgnr === o;
    })) return feil("kunde-feil", "Den kunden står allerede på listen.");
    if (kunder.length >= 19) return feil("kunde-feil", "En leverandørlisens kan ha opptil 19 kunder her. Skriv til oss for flere.");
    var skjema = $("kunde-skjema");
    skjema.classList.add("venter");
    return api("pris?som=kunde&orgnr=" + o)
      .then(function (k) {
        if (k.underenhet) {
          return feil("kunde-feil", "Dette er en underenhet av " + k.overordnet.navn + ". Bruk " + orgnrTekst(k.overordnet.orgnr) + ".");
        }
        kunder.push(k);
        kundefelt.tom();
        tegnKunder();
      })
      .catch(function (err) {
        feil("kunde-feil", err.message);
      })
      .finally(function () {
        skjema.classList.remove("venter");
        $("kunde-orgnr").focus();
      });
  }

  function kundesum() {
    return kunder.reduce(function (s, k) {
      return s + k.pris;
    }, 0);
  }

  function tegnKunder() {
    var liste = $("kundeliste");
    liste.replaceChildren();
    kunder.forEach(function (k, i) {
      var el = document.createElement("li");
      var hvem = document.createElement("span");
      hvem.textContent = k.navn;
      var mer = document.createElement("small");
      mer.textContent = "Org.nr. " + orgnrTekst(k.orgnr) + " · " + (k.konsern ? "konsern" : ansatteTekst(k.ansatte));
      hvem.appendChild(mer);
      var belop = document.createElement("span");
      belop.className = "belop";
      belop.textContent = nok(k.pris);
      var fjern = document.createElement("button");
      fjern.type = "button";
      fjern.className = "fjern";
      fjern.setAttribute("aria-label", "Fjern " + k.navn);
      fjern.textContent = "×";
      fjern.addEventListener("click", function () {
        kunder.splice(i, 1);
        tegnKunder();
      });
      el.appendChild(hvem);
      el.appendChild(belop);
      el.appendChild(fjern);
      liste.appendChild(el);
    });
    if (tilbud) {
      $("sum-egen").textContent = nok(tilbud.pris);
      $("sum-kunder").textContent = nok(kundesum());
      $("sum-totalt").textContent = nok(tilbud.pris + kundesum());
    }
    glid($("kunde-sum"), Boolean(kunder.length));
    $("dekker-videre").disabled = dekker === "kunder" && !kunder.length;
  }

  $("dekker-videre").addEventListener("click", function () {
    forberedBetaling();
    gaaTil("s-betaling");
  });

  $("lev-legg-til").addEventListener("click", function () {
    var knapp = this;
    feil("lev-feil", "");
    $("lev-ferdig").replaceChildren();
    if (!$("lev-kode").value.trim()) return feil("lev-feil", "Lim inn lisensnøkkelen dere fikk på e-post.");
    if (!kunder.length) return feil("lev-feil", "Legg til kundene først.");
    opptatt(knapp, true);
    api("kunder", {
      kode: $("lev-kode").value,
      kunder: kunder.map(function (c) {
        return c.orgnr;
      }),
    })
      .then(function (svar) {
        var p = document.createElement("p");
        p.className = "tekst ok";
        p.textContent =
          "Lagt til: " +
          svar.kunder
            .map(function (c) {
              return c.navn;
            })
            .join(", ") +
          ". Prisen for resten av perioden faktureres nå. Den nye nøkkelen erstatter den gamle.";
        $("lev-ferdig").appendChild(p);
        var mal = document.createElement("div");
        $("lev-ferdig").appendChild(mal);
        nokkelBoks(mal, svar);
      })
      .catch(function (err) {
        feil("lev-feil", err.message);
      })
      .finally(function () {
        opptatt(knapp, false);
      });
  });

  // ---------- 4. Betaling ----------

  /** Viser valget. Er faktura valgt, skjules kort, og bare fakturafeltene står igjen. */
  function visBetaling() {
    velgEn(null, "data-betaling", betaling);
    glid($("faktura-felt"), betaling === "faktura");
    glid(document.querySelector('[data-betaling="kort"]'), betaling !== "faktura");
  }

  /** Velger den første betalingsmåten virksomheten kan bruke. */
  function forberedBetaling() {
    var med = function (m) {
      return tilbud.betaling[m];
    };
    document.querySelectorAll("[data-betaling]").forEach(function (b) {
      b.hidden = !med(b.getAttribute("data-betaling"));
    });
    if (!betaling || !med(betaling)) betaling = ["kort", "faktura"].find(med);
    visBetaling();
    feil("betaling-feil", "");
  }

  document.querySelectorAll("[data-betaling]").forEach(function (b) {
    b.addEventListener("click", function () {
      betaling = b.getAttribute("data-betaling");
      visBetaling();
      if (betaling === "faktura") $("b-epost").focus();
    });
  });
  function annenNokkelEpost() {
    return document.querySelector('[data-nokkel="annen"]').getAttribute("aria-checked") === "true";
  }
  document.querySelectorAll("[data-nokkel]").forEach(function (b) {
    b.addEventListener("click", function () {
      velgEn(null, "data-nokkel", b.getAttribute("data-nokkel"));
      glid($("nokkel-felt"), annenNokkelEpost());
      if (annenNokkelEpost()) $("b-nokkel").focus();
    });
  });
  document.querySelectorAll("[data-ehf]").forEach(function (b) {
    b.addEventListener("click", function () {
      velgEn(null, "data-ehf", b.getAttribute("data-ehf"));
    });
  });

  $("betaling-videre").addEventListener("click", function () {
    if (betaling === "faktura" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("b-epost").value.trim())) {
      feil("betaling-feil", "Skriv inn e-postadressen fakturaen skal sendes til.");
      $("b-epost").focus();
      return;
    }
    feil("betaling-feil", "");
    kjop = "lisens";
    if (betaling === "faktura") {
      $("nokkel-samme").textContent = $("b-epost").value.trim();
      feil("nokkel-feil", "");
      gaaTil("s-nokkel");
      return;
    }
    visBekreft();
  });

  $("nokkel-videre").addEventListener("click", function () {
    if (annenNokkelEpost() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("b-nokkel").value.trim())) {
      feil("nokkel-feil", "Skriv inn e-postadressen lisensnøkkelen skal sendes til.");
      $("b-nokkel").focus();
      return;
    }
    feil("nokkel-feil", "");
    visBekreft();
  });

  // ---------- 5. Bekreft ----------

  var BETALING = { kort: "Kort, årlig", faktura: "Faktura, 7 dagers betalingsfrist" };

  function visBekreft() {
    var rader = [
      ["Virksomhet", tilbud.navn],
      ["Org.nr.", orgnrTekst(tilbud.orgnr)],
    ];
    var data = { orgnr: tilbud.orgnr, betaling: betaling };
    if (kjop === "testing") {
      $("b-tittel").textContent = "Utvidet testing for " + tilbud.navn;
      $("b-merke").textContent = "Utvidet testing";
      rader.push(["Omfang", tilbud.testing.eksporter + " eksporter, uten tidsgrense"]);
      rader.push(["Godskrives", "Hele beløpet, på lisensen"]);
      rader.push(["Pris, eks. mva", nok(tilbud.testing.pris), "sum-rad"]);
      data.type = "testing";
    } else {
      $("b-tittel").textContent = "Lisens for " + tilbud.navn;
      $("b-merke").textContent = "Bekreft";
      rader.push(["Gjelder", tilbud.konsern ? "Hele konsernet" : "Virksomheten"]);
      var sum = tilbud.pris;
      if (dekker === "kunder") {
        rader.push(["Egen lisens", nok(tilbud.pris)]);
        kunder.forEach(function (k) {
          rader.push([k.navn, nok(k.pris)]);
        });
        sum += kundesum();
        data.type = "leverandor";
        data.kunder = kunder.map(function (k) {
          return k.orgnr;
        });
      } else {
        data.type = "lisens";
      }
      rader.push(["Betaling", BETALING[betaling]]);
      rader.push(["Pris per år, eks. mva", nok(sum), "sum-rad"]);
      if (betaling === "faktura") {
        data.epost = $("b-epost").value.trim();
        if (annenNokkelEpost()) data.nokkelEpost = $("b-nokkel").value.trim();
        data.ehf = document.querySelector('[data-ehf][aria-checked="true"]').getAttribute("data-ehf") === "ja";
        rader.push(["Faktura til", data.epost]);
        rader.push(["Lisensnøkkel til", data.nokkelEpost || data.epost]);
      }
    }
    var liste = $("b-liste");
    liste.replaceChildren();
    rader.forEach(function (r) {
      var rad = document.createElement("div");
      if (r[2]) rad.className = r[2];
      var dt = document.createElement("dt");
      dt.textContent = r[0];
      var dd = document.createElement("dd");
      dd.textContent = r[1];
      rad.appendChild(dt);
      rad.appendChild(dd);
      liste.appendChild(rad);
    });
    var faktura = betaling === "faktura";
    $("b-mva").textContent = faktura ? "25 % mva legges til på fakturaen." : "25 % mva legges til i kassen.";
    $("b-test").hidden = !tilbud.test || faktura;
    $("b-ok").textContent = faktura ? "Send faktura" : "Gå til betaling";
    $("b-ok").disabled = false;
    feil("b-feil", "");
    $("b-ok").onclick = function () {
      var knapp = this;
      opptatt(knapp, true);
      api("kasse", data)
        .then(function (svar) {
          if (svar.adresse) {
            location.href = svar.adresse;
            return;
          }
          visFaktura(svar);
        })
        .catch(function (err) {
          feil("b-feil", err.message);
          opptatt(knapp, false);
        });
    };
    gaaTil("s-bekreft");
  }

  function visFaktura(svar) {
    var f = svar.faktura;
    $("f-tittel").textContent = svar.navn + " · Org.nr. " + orgnrTekst(svar.orgnr);
    var rader = [["Beløp inkl. mva", nok(f.belop)], ["Sendt til", svar.epost]];
    if (f.nummer) rader.unshift(["Fakturanummer", f.nummer]);
    if (f.forfall) rader.push(["Forfall", datoTekst(f.forfall)]);
    var liste = $("f-liste");
    liste.replaceChildren();
    rader.forEach(function (r) {
      var dt = document.createElement("dt");
      dt.textContent = r[0];
      var dd = document.createElement("dd");
      dd.textContent = r[1];
      var rad = document.createElement("div");
      rad.appendChild(dt);
      rad.appendChild(dd);
      liste.appendChild(rad);
    });
    $("f-frist").textContent = f.forfall ? "innen " + datoTekst(f.forfall) : "innen 7 dager";
    $("f-nokkel-til").textContent = svar.nokkelEpost;
    $("f-faktura").hidden = !f.adresse;
    if (f.adresse) $("f-faktura").href = f.adresse;
    historikk = [];
    vis("s-ferdig");
  }

  // ---------- Tilbake fra Stripe, eller fra «Avbryt» der ----------

  var ordre = q.get("ordre");
  var sprintOkt = q.get("sprint");
  if (sprintOkt) {
    vis("s-kvittering");
    $("k-tittel").textContent = "Booket";
    $("k-tekst").textContent = "Vi henter bookingen.";
    api("sprint/kvittering?session=" + encodeURIComponent(sprintOkt))
      .then(function (svar) {
        var hvem = svar.navn + " (org.nr " + orgnrTekst(svar.orgnr) + ")";
        if (svar.tilbud === "oppsett") {
          $("k-tittel").textContent = "Oppsettsdagen er booket";
          $("k-tekst").textContent =
            "Oppsettsdagen hos " + hvem + " er booket " + datoTekst(svar.start) + ". " + nok(svar.fast) +
            " eks. mva er betalt. Bekreftelsen er sendt til " + svar.epost + ". Vi sender sjekklisten før dagen.";
        } else {
          $("k-tittel").textContent = svar.tilbud === "kort" ? "Den korte sprinten er booket" : "Sprinten er booket";
          $("k-tekst").textContent =
            (svar.tilbud === "kort" ? "Den korte sprinten" : "Sprinten") + " hos " + hvem + " er booket " +
            datoTekst(svar.start) + " – " + datoTekst(svar.slutt) + ". Grunnhonoraret på " + nok(svar.grunn) +
            " eks. mva er betalt og beholdes. Resten faktureres bare hvis suksesskriteriet er nådd. Bekreftelsen er sendt til " + svar.epost +
            ". Vi tar kontakt for å avtale fasiten og hva som skal bort, skriftlig før dag én.";
        }
        $("k-ics").href = "/klart/api/sprint/ics?session=" + encodeURIComponent(sprintOkt);
        $("k-ics-rad").hidden = false;
      })
      .catch(function (err) {
        $("k-tekst").textContent = "";
        feil("k-feil", err.message);
      });
  } else if (ordre) {
    vis("s-kvittering");
    api("ordre?session=" + encodeURIComponent(ordre))
      .then(function (svar) {
        var hvem = svar.navn + " (org.nr " + orgnrTekst(svar.orgnr) + ")";
        if (svar.type === "testing") {
          $("k-tittel").textContent = "Utvidet testing er klar";
          $("k-tekst").textContent = "Registrert på " + hvem + ". Hele beløpet godskrives lisensen når dere kjøper.";
        } else {
          $("k-tekst").textContent =
            "Lisensen er registrert på " + hvem + ". Ta vare på nøkkelen. Ved hver fornyelse kommer en ny på e-post.";
        }
        nokkelBoks($("k-nokkel"), svar);
      })
      .catch(function (err) {
        $("k-tekst").textContent = "";
        feil("k-feil", err.message);
      });
  } else {
    var start = String(q.get("orgnr") || "").replace(/\D/g, "");
    if (KlartOrgfelt.gyldig(start)) {
      $("orgnr").value = orgnrTekst(start);
      slaaOpp(start);
    }
  }
})();
