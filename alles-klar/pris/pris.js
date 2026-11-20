(function () {
  var q = new URLSearchParams(location.search);
  var $ = function (id) {
    return document.getElementById(id);
  };
  var tall = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
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
    return n === 1 ? "1 registrierter Beschäftigter" : tall.format(n) + " registrierte Beschäftigte";
  }
  function datoTekst(iso) {
    if (!iso) return "";
    var d = iso.split("-");
    return new Date(+d[0], +d[1] - 1, +d[2]).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
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
    // Kantlinjen øverst og nederst tegnes som skygge mens elementet beveger seg, med samme plass i polstringen.
    // Chrome runder kantlinjer opp til 1 px helt til de er 0, og da ville alt under hoppet på slutten.
    var kantTopp = parseFloat(s.borderTopWidth) || 0;
    var kantBunn = parseFloat(s.borderBottomWidth) || 0;
    var aapen = {
      height: el.offsetHeight + "px",
      marginTop: s.marginTop,
      marginBottom: s.marginBottom,
      paddingTop: parseFloat(s.paddingTop) + kantTopp + "px",
      paddingBottom: parseFloat(s.paddingBottom) + kantBunn + "px",
      opacity: 1,
    };
    var lukket = { height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 };
    el.style.boxShadow = "inset 0 " + kantTopp + "px 0 " + s.borderTopColor + ", inset 0 " + -kantBunn + "px 0 " + s.borderBottomColor;
    el.style.borderTopWidth = "0";
    el.style.borderBottomWidth = "0";
    // Mellomrommet i et rutenett forsvinner ikke med høyden. Neste element tar det opp, så ingenting hopper.
    var ps = getComputedStyle(el.parentElement);
    var nabo = el.nextElementSibling;
    var mellomrom = /grid|flex/.test(ps.display) && nabo && !nabo.hidden ? parseFloat(ps.rowGap) || 0 : 0;
    var naboAnim = null;
    if (mellomrom) {
      var naboTopp = parseFloat(getComputedStyle(nabo).marginTop) || 0;
      var ute = { marginTop: naboTopp + "px" };
      var inne = { marginTop: naboTopp - mellomrom + "px" };
      naboAnim = nabo.animate(vis ? [inne, ute] : [ute, inne], { duration: GLID_TID.duration, easing: GLID_TID.easing, fill: "forwards" });
    }
    el.style.overflow = "hidden";
    el.style.boxSizing = "border-box";
    function rydd() {
      el.style.overflow = "";
      el.style.boxSizing = "";
      el.style.boxShadow = "";
      el.style.borderTopWidth = "";
      el.style.borderBottomWidth = "";
      if (naboAnim) naboAnim.cancel();
    }
    spill(el, vis ? [lukket, aapen] : [aapen, lukket], function () {
      el.hidden = !vis;
      rydd();
    });
    var stopp = el._glid.cancel;
    el._glid.cancel = function () {
      stopp();
      rydd();
    };
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
          if (!r.ok) throw new Error(j.feil || "Etwas ist schiefgelaufen. Bitte versuchen Sie es gleich noch einmal.");
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

  var STEG = ["s-port", "s-pris", "s-oppsett", "s-testing", "s-dekker", "s-book-sted", "s-book-dato", "s-book-kontakt", "s-betaling", "s-nokkel", "s-bekreft", "s-ferdig", "s-kvittering"];
  // Kortet er bredere der det er mer å se.
  var BREDDE = { "s-oppsett": "bred", "s-book-sted": "bred", "s-book-dato": "bred", "s-book-kontakt": "bred", "s-dekker": "middels", "s-betaling": "middels", "s-nokkel": "middels", "s-bekreft": "middels", "s-ferdig": "middels", "s-testing": "middels" };

  /** Slår opp virksomheten fra adressen: kortet er skjult til svaret er her (pris-tidlig.js). */
  function ferdigStartet() {
    document.documentElement.classList.remove("slaar-opp", "til-oversikt");
  }

  function vis(steg) {
    ferdigStartet();
    STEG.forEach(function (id) {
      $(id).hidden = id !== steg;
    });
    var el = $(steg);
    var bredde = steg === "s-pris" ? (tilbud && tilbud.stor ? "bred" : "middels") : BREDDE[steg];
    $("kort").classList.toggle("bred", bredde === "bred");
    $("kort").classList.toggle("middels", bredde === "middels");
    // Oversikten over oppsett og sprint er for høy til vinterbildet: der er bakgrunnen en rolig, ensfarget flate.
    $("port").classList.toggle("oversikt", steg === "s-oppsett" || steg.indexOf("s-book") === 0);
    // Pris, oversikt og booking står alene, uten spørsmål og bunn under.
    var alene = steg === "s-pris" || steg === "s-oppsett" || steg.indexOf("s-book") === 0;
    $("pris-bunn").hidden = alene;
    $("sporsmal").hidden = alene || steg === "s-port";
    tegnStegrad(steg);
    if (steg === "s-book-sted") startSted();
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
      var forrige = historikk.pop();
      if (!forrige && FRA_FORSIDEN) return tilForsiden();
      vis(forrige || "s-pris");
    });
  });

  // Kom de fra forsiden, går «Tilbake» dit igjen, med virksomheten deres valgt.
  var FRA_FORSIDEN = q.get("fra") === "forside";
  function tilForsiden() {
    location.href = "../?orgnr=" + tilbud.orgnr;
  }
  $("r-tilbake").hidden = !FRA_FORSIDEN;
  $("r-tilbake").addEventListener("click", tilForsiden);

  /** Stegraden øverst: Pris · (Lisensen) · Betaling · Bekreft. «Lisensen» er bare med når den er et steg. */
  function tegnStegrad(steg) {
    if (steg.indexOf("s-book") === 0) return tegnBookrad(steg);
    var rekke = ["s-pris", "s-dekker", "s-betaling", "s-bekreft"];
    var navn = { "s-pris": "Preis", "s-dekker": "Lizenz", "s-betaling": "Zahlung", "s-bekreft": "Bestätigen" };
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
    etikett.textContent = svar.type === "testing" ? "Code für den erweiterten Test" : "Lizenzschlüssel";
    var felt = document.createElement("textarea");
    felt.readOnly = true;
    felt.value = svar.kode;
    var rad = document.createElement("div");
    rad.className = "rad";
    var tekst = document.createElement("p");
    var hva = "Fügen Sie ihn in Alles Klar ein: Klicken Sie oben rechts auf die Lizenzanzeige (dort steht „Test: noch … Tage“ oder „Lizenz“) und fügen Sie den Schlüssel in das Feld dort ein.";
    if (svar.type === "testing") hva = "Der Code ermöglicht 50 Exporte ohne Zeitlimit. Er lässt sich ab der nächsten Version von Alles Klar verwenden.";
    else if (svar.utloper) hva += " Gültig bis einschließlich " + datoTekst(svar.utloper) + ".";
    tekst.textContent = hva;
    var kopier = document.createElement("button");
    kopier.type = "button";
    kopier.className = "btn sm";
    kopier.textContent = "Kopieren";
    kopier.addEventListener("click", function () {
      navigator.clipboard.writeText(felt.value).then(function () {
        kopier.textContent = "Kopiert";
        setTimeout(function () {
          kopier.textContent = "Kopieren";
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
          ? "Die Organisationsnummer stimmt nicht. Prüfen Sie, ob alle neun Ziffern richtig sind."
          : "Kein Unternehmen mit diesem Namen gefunden. Versuchen Sie es mit der Organisationsnummer."
      );
      $("orgnr").focus();
      return;
    }
    slaaOpp(o);
  });

  function slaaOpp(o) {
    var knapp = $("vis");
    opptatt(knapp, true);
    knapp.textContent = "Wird nachgeschlagen …";
    return api("pris?orgnr=" + o)
      .then(function (svar) {
        if (svar.underenhet) return visUnderenhet(svar);
        visPris(svar);
      })
      .catch(function (err) {
        feil("port-feil", err.message);
      })
      .finally(function () {
        ferdigStartet();
        opptatt(knapp, false);
        knapp.textContent = "Preis anzeigen";
      });
  }

  function visUnderenhet(svar) {
    $("underenhet-tekst").textContent = "Dies ist eine Betriebsstätte von " + svar.overordnet.navn + ".";
    $("underenhet-ja").textContent = "Weiter mit " + orgnrTekst(svar.overordnet.orgnr);
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
    $("r-hvem").appendChild(document.createTextNode(" · Org.-Nr. " + orgnrTekst(d.orgnr) + " · " + (d.konsern ? "Konzern" : ansatteTekst(d.ansatte))));
    $("r-pris").replaceChildren();
    $("r-pris").appendChild(document.createTextNode(nok(d.pris) + " "));
    var per = document.createElement("span");
    // Alle ser prisen per år, også kommuner og stat (eieren 11.11.2026).
    per.textContent = "pro Jahr, zzgl. MwSt.";
    $("r-pris").appendChild(per);

    // Vilkårene som betyr noe for kjøperen. Hva programmet gjør, vet de alt.
    var hvem = d.konsern ? "gesamten Konzern" : "Unternehmen";
    var v = $("r-vilkar");
    v.replaceChildren();
    v.appendChild(li("Gilt für alle Nutzer und Geräte im " + hvem + "."));
    v.appendChild(li((d.konsern ? "Deckt die Dokumente im gesamten Konzern ab" : "Deckt die Dokumente im Unternehmen ab") + ", auch die über Ihre Kunden."));
    // Kommuner og stat: ingen binding (eieren 11.11.2026).
    v.appendChild(li((d.fireAar ? "Jährliche Lizenz ohne Mindestlaufzeit." : "Jährliche Lizenz.") + " Sie werden 14 Tage vor der Verlängerung erinnert."));

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
      t.appendChild(li(d.testing.eksporter + " Exporte. Kein Zeitlimit."));
      t.appendChild(li("Einmal pro Unternehmen."));
      t.appendChild(li("Der volle Betrag von " + nok(d.testing.pris) + " wird auf die Lizenz angerechnet."));
      $("t-videre").disabled = !d.kjop || !d.testing.apen;
      $("t-videre").textContent = d.testing.apen ? "Weiter" : "Bald verfügbar";
    }

    // Betalingsmåtene virksomheten kan bruke. De andre vises ikke.
    document.querySelectorAll("[data-betaling]").forEach(function (b) {
      b.hidden = !d.betaling[b.getAttribute("data-betaling")];
    });

    velgEn(null, "data-dekker", "egen");
    velgEn(null, "data-ehf", d.ehf ? "ja" : "nei");
    $("kunde-panel").hidden = true;
    tegnKunder();
    settAdresse(d.orgnr);
    // Fra forsiden («Les om skreddersydd oppsett») går vi rett dit.
    if (q.get("vis") === "oppsett" && d.stor) {
      historikk = FRA_FORSIDEN ? [] : ["s-pris"];
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
      vis("s-port");
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
  var NAVN = { oppsett: "Einrichtungstag", kort: "Kurzer Sprint", sprint: "Sprint" };

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
    return n === 1 ? "1 Tag" : n + " Tage";
  }
  function forskudd(t) {
    return t.fast != null ? t.fast : t.grunn;
  }

  // Kortet ved siden av lisensprisen, og valgene på siden for oppsett og sprint.
  function visSprintPris(d) {
    // Hentes i forkant, så bildet er klart idet oversikten rulles ut.
    if (d.stor) new Image().src = "../assets/klart-maskin-sno.jpg";
    var liste = d.sprint || [];
    var sprinten = liste.find(function (t) {
      return t.id !== "oppsett";
    });
    $("r-oppsett").querySelector("h3").textContent = sprinten ? "Maßgeschneiderte Einrichtung" : "Einrichtungstag";
    $("r-oppsett").querySelector("p:not(.merke)").textContent = sprinten
      ? "Ein eigenes Modell, feinabgestimmt auf Ihre eigenen Dokumente und bei Ihnen eingerichtet, auf Hardware, die Ihnen gehört."
      : "Ich richte Alles Klar an einem Tag bei Ihnen ein, mit internem Zugriff und Schulung. " + nok(liste.length ? liste[0].fast : 0) + " zzgl. MwSt.";
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
      pris.textContent = nok(t.fast != null ? t.fast : t.total) + " zzgl. MwSt.";
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
    $("op-tittel").textContent = oppsett ? "Einrichtungstag bei Ihnen" : t.id === "kort" ? "Ein kurzer Sprint bei Ihnen" : "Ein Sprint bei Ihnen";
    $("op-merke").textContent = oppsett ? "Einrichtungstag" : "Maßgeschneiderte Einrichtung";
    document.querySelectorAll("#s-oppsett [data-blokk]").forEach(function (el) {
      glid(el, el.getAttribute("data-blokk") === (oppsett ? "oppsett" : "sprint"));
    });
    document.querySelectorAll("#s-oppsett [data-kun]").forEach(function (el) {
      glid(el, el.getAttribute("data-kun") === t.id);
    });
    var felt = {
      trinn: "Preis",
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
    var book = oppsett ? "Einrichtungstag buchen" : t.id === "kort" ? "Kurzen Sprint buchen" : "Sprint buchen";
    $("book-aapne").textContent = book;
    document.querySelectorAll("[data-book-merke]").forEach(function (el) {
      el.textContent = book;
    });
    glid($("op-mac"), !oppsett);
    $("kal-etikett").textContent = oppsett ? "Tag wählen" : "Startdatum wählen";
    $("kal-valgt").textContent = "Freie Termine werden geladen …";
    oppdaterKnapp();
  }

  function oppdaterKnapp() {
    var t = valgtTilbud;
    if (!t) return;
    var kjop = tilbud && tilbud.kjop;
    var foresp = valgtStart && forespurte && forespurte.has(valgtStart);
    $("book-aapne").disabled = !kjop;
    $("bk-knapp").disabled = !kjop;
    $("bk-knapp").textContent = !kjop ? "Buchung bald möglich" : foresp ? "Anfrage senden" : nok(forskudd(t) * 1.25) + " bezahlen und buchen";
    $("bk-info").textContent = foresp
      ? "In diesem Zeitraum liegt ein Einrichtungstag, den ich zuerst verschiebe. Sie zahlen jetzt nichts; ich sende Ihnen einen Zahlungslink, sobald die Termine bestätigt sind."
      : (t.id === "oppsett" ? "Der Preis" : "Das Grundhonorar") +
        " inkl. 25 % MwSt. Zahlung per Karte über Stripe. Der Termin wird 30 Minuten für Sie reserviert, während Sie bezahlen.";
  }

  function lastLedige() {
    if (!valgtTilbud) return Promise.resolve();
    var id = valgtTilbud.id;
    return api("sprint/ledige?tilbud=" + id + (sted && sted.reise ? "&reise=1" : ""))
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
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (u) {
      var el = document.createElement("span");
      el.className = "uke";
      el.textContent = u;
      rute.appendChild(el);
    });
    var aar = kalMaaned.getFullYear();
    var mnd = kalMaaned.getMonth();
    $("kal-maaned").textContent = kalMaaned.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
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
        el.setAttribute("aria-label", datoTekst(t) + (forespurte.has(t) ? ", als Anfrage" : ""));
        el.addEventListener(
          "click",
          (function (start) {
            return function () {
              valgtStart = start;
              feil("bd-feil", "");
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
      v.textContent = "Derzeit keine freien Termine. Schreiben Sie mir eine Nachricht, dann finden wir einen Termin.";
    } else if (valgtStart) {
      v.appendChild(document.createTextNode(hva + ": "));
      var b = document.createElement("b");
      b.textContent = dager === 1 ? datoTekst(valgtStart) : datoTekst(valgtStart) + " – " + datoTekst(sluttValgt);
      v.appendChild(b);
      if (dager > 1) v.appendChild(document.createTextNode(" (" + dagerTekst(dager) + ")"));
      if (forespurte.has(valgtStart)) v.appendChild(document.createTextNode(". Wird als Anfrage gesendet."));
    } else {
      v.textContent =
        dager === 1
          ? "Wählen Sie einen freien Tag."
          : "Wählen Sie einen freien Tag. " + (valgtTilbud.id === "kort" ? "Der kurze Sprint" : "Der Sprint") + " dauert " + dagerTekst(dager) + " ab dem Starttag." +
            (forespurte.size ? " Gestrichelte Tage werden als Anfrage gesendet." : "");
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

  // Booking: egne steg, først hvor og så når. Avstanden avgjør om jeg må reise dagen før.
  var sted = null;
  var stedVent = null;
  var stedNr = 0;

  $("book-aapne").addEventListener("click", function () {
    gaaTil("s-book-sted");
  });

  function tegnBookrad(steg) {
    var rad = $("stegrad");
    var med = ["s-book-sted", "s-book-dato", "s-book-kontakt"];
    var navn = ["Ort", "Datum", "Kontakt"];
    var i = med.indexOf(steg);
    rad.hidden = false;
    rad.replaceChildren();
    navn.forEach(function (n, j) {
      var el = li(n);
      if (j < i) el.className = "ferdig";
      if (j === i) {
        el.className = "her";
        el.setAttribute("aria-current", "step");
      }
      rad.appendChild(el);
    });
  }

  function startSted() {
    window.KlartKart.vis($("bs-kart")).catch(function () {});
    // Virksomhetens adresse som utgangspunkt. Da er det ofte bare å gå videre.
    if (!$("bs-adresse").value && tilbud && tilbud.besoksadresse) {
      $("bs-adresse").value = tilbud.besoksadresse;
      sokAdresse(tilbud.besoksadresse, true);
    }
  }

  function velgSted(t) {
    sted = t;
    valgtStart = null;
    kalMaaned = null;
    $("bs-adresse").value = t.tekst;
    $("bs-forslag").hidden = true;
    feil("bs-feil", "");
    $("bs-svar").textContent = t.reise
      ? "Das sind etwa " + t.km + " km von mir, daher reise ich am Vortag an. Reise und Hotel organisiere und bezahle ich selbst. Sie müssen nichts organisieren."
      : "Das sind etwa " + t.km + " km von mir, daher fahre ich selbst hin und zurück. Sie müssen nichts organisieren.";
    $("bs-svar").hidden = false;
    $("bs-videre").disabled = false;
    window.KlartKart.vis($("bs-kart"), t.lat, t.lon).catch(function () {});
  }

  function sokAdresse(q, velgForste) {
    var mitt = ++stedNr;
    api("adresse?q=" + encodeURIComponent(q))
      .then(function (svar) {
        if (mitt !== stedNr) return;
        var treff = svar.treff || [];
        if (velgForste && treff.length) return velgSted(treff[0]);
        var liste = $("bs-forslag");
        liste.replaceChildren();
        treff.forEach(function (t) {
          var rad = document.createElement("li");
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute("role", "option");
          var navn = document.createElement("span");
          navn.textContent = t.tekst;
          b.appendChild(navn);
          // mousedown, så valget skjer før feltet mister fokus.
          b.addEventListener("mousedown", function (e) {
            e.preventDefault();
            velgSted(t);
          });
          rad.appendChild(b);
          liste.appendChild(rad);
        });
        liste.hidden = !treff.length;
        liste._treff = treff;
      })
      .catch(function () {});
  }

  $("bs-adresse").addEventListener("input", function () {
    var q = this.value.trim();
    sted = null;
    $("bs-videre").disabled = true;
    $("bs-svar").hidden = true;
    clearTimeout(stedVent);
    if (q.length < 3) {
      stedNr++;
      $("bs-forslag").hidden = true;
      return;
    }
    stedVent = setTimeout(function () {
      sokAdresse(q);
    }, 220);
  });
  $("bs-adresse").addEventListener("keydown", function (e) {
    var treff = $("bs-forslag")._treff;
    if (e.key === "Enter" && treff && treff.length && !$("bs-forslag").hidden) {
      e.preventDefault();
      velgSted(treff[0]);
    } else if (e.key === "Escape") {
      $("bs-forslag").hidden = true;
    }
  });
  $("bs-adresse").addEventListener("blur", function () {
    setTimeout(function () {
      $("bs-forslag").hidden = true;
    }, 120);
  });

  $("bs-videre").addEventListener("click", function () {
    if (!sted) return feil("bs-feil", "Wählen Sie eine Adresse aus der Liste.");
    $("bd-ingress").textContent = sted.reise
      ? "Wählen Sie den Tag, an dem ich bei Ihnen anfange. Ich reise am Vortag an, darum kümmere ich mich."
      : "Wählen Sie den Tag, an dem ich bei Ihnen anfange.";
    gaaTil("s-book-dato");
    lastLedige();
  });

  $("bd-videre").addEventListener("click", function () {
    if (!valgtStart) return feil("bd-feil", "Wählen Sie ein Datum.");
    var dager = valgtTilbud.dager;
    var tid = dager === 1 ? datoTekst(valgtStart) : datoTekst(valgtStart) + " – " + datoTekst(leggTilDager(valgtStart, dager - 1));
    var liste = $("bk-liste");
    liste.replaceChildren();
    [["Ort", sted.tekst], ["Datum", tid]].concat(sted.reise ? [["Reise", "Ich reise am Vortag an, auf meine Kosten"]] : []).forEach(function (r) {
      var rad = document.createElement("div");
      var dt = document.createElement("dt");
      dt.textContent = r[0];
      var dd = document.createElement("dd");
      dd.textContent = r[1];
      rad.appendChild(dt);
      rad.appendChild(dd);
      liste.appendChild(rad);
    });
    gaaTil("s-book-kontakt");
  });


  $("book-skjema").addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      orgnr: tilbud ? tilbud.orgnr : null,
      tilbud: valgtTilbud ? valgtTilbud.id : null,
      start: valgtStart,
      adresse: sted ? sted.tekst : "",
      navn: $("bk-navn").value.trim(),
      epost: $("bk-epost").value.trim(),
      telefon: $("bk-tlf").value.trim(),
      nettside: $("bk-nettside").value,
    };
    if (!data.navn || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.epost)) return feil("bk-feil", "Geben Sie Name und E-Mail-Adresse ein.");
    feil("bk-feil", "");
    opptatt($("bk-knapp"), true);
    api("sprint/book", data)
      .then(function (svar) {
        if (svar.forespurt) {
          glid($("book-skjema"), false);
          glid($("bk-ferdig"), true);
          $("bk-ferdig-tekst").textContent =
            "Ich verschiebe den Einrichtungstag, der in diesem Zeitraum liegt, und sende einen Zahlungslink an " + data.epost +
            ", sobald der Zeitraum " + datoTekst(svar.start) + " – " + datoTekst(svar.slutt) + " bestätigt ist. Es wurde noch nichts bezahlt.";
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
      return feil("sa-feil", "Geben Sie Name und E-Mail-Adresse ein, dann melde ich mich.");
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
    if (!o) return feil("kunde-feil", "Unternehmen nicht gefunden. Versuchen Sie es mit der Organisationsnummer.");
    leggTilKunde(o);
  });

  function leggTilKunde(o) {
    feil("kunde-feil", "");
    if (o === tilbud.orgnr) return feil("kunde-feil", "Das ist Ihre eigene Organisationsnummer. Eigene Daten sind durch die Lizenz abgedeckt.");
    if (kunder.some(function (k) {
      return k.orgnr === o;
    })) return feil("kunde-feil", "Dieser Kunde steht bereits auf der Liste.");
    if (kunder.length >= 19) return feil("kunde-feil", "Eine Dienstleisterlizenz kann hier bis zu 19 Kunden umfassen. Schreiben Sie uns, wenn Sie mehr brauchen.");
    var skjema = $("kunde-skjema");
    skjema.classList.add("venter");
    return api("pris?som=kunde&orgnr=" + o)
      .then(function (k) {
        if (k.underenhet) {
          return feil("kunde-feil", "Dies ist eine Betriebsstätte von " + k.overordnet.navn + ". Verwenden Sie " + orgnrTekst(k.overordnet.orgnr) + ".");
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
      mer.textContent = "Org.-Nr. " + orgnrTekst(k.orgnr) + " · " + (k.konsern ? "Konzern" : ansatteTekst(k.ansatte));
      hvem.appendChild(mer);
      var belop = document.createElement("span");
      belop.className = "belop";
      belop.textContent = nok(k.pris);
      var fjern = document.createElement("button");
      fjern.type = "button";
      fjern.className = "fjern";
      fjern.setAttribute("aria-label", k.navn + " entfernen");
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
    if (!$("lev-kode").value.trim()) return feil("lev-feil", "Fügen Sie den Lizenzschlüssel ein, den Sie per E-Mail erhalten haben.");
    if (!kunder.length) return feil("lev-feil", "Fügen Sie zuerst die Kunden hinzu.");
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
          "Hinzugefügt: " +
          svar.kunder
            .map(function (c) {
              return c.navn;
            })
            .join(", ") +
          ". Der Preis für den Rest des Zeitraums wird jetzt in Rechnung gestellt. Der neue Schlüssel ersetzt den alten.";
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
      if (betaling === "faktura") $("b-epost").focus({ preventScroll: true });
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
      feil("betaling-feil", "Geben Sie die E-Mail-Adresse ein, an die die Rechnung gesendet werden soll.");
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
      feil("nokkel-feil", "Geben Sie die E-Mail-Adresse ein, an die der Lizenzschlüssel gesendet werden soll.");
      $("b-nokkel").focus();
      return;
    }
    feil("nokkel-feil", "");
    visBekreft();
  });

  // ---------- 5. Bekreft ----------

  var BETALING = { kort: "Karte, jährlich", faktura: "Rechnung, 7 Tage Zahlungsziel" };

  function visBekreft() {
    var rader = [
      ["Unternehmen", tilbud.navn],
      ["Org.-Nr.", orgnrTekst(tilbud.orgnr)],
    ];
    var data = { orgnr: tilbud.orgnr, betaling: betaling };
    if (kjop === "testing") {
      $("b-tittel").textContent = "Erweiterter Test für " + tilbud.navn;
      $("b-merke").textContent = "Erweiterter Test";
      rader.push(["Umfang", tilbud.testing.eksporter + " Exporte, ohne Zeitlimit"]);
      rader.push(["Anrechnung", "Der volle Betrag, auf die Lizenz"]);
      rader.push(["Preis, zzgl. MwSt.", nok(tilbud.testing.pris), "sum-rad"]);
      data.type = "testing";
    } else {
      $("b-tittel").textContent = "Lizenz für " + tilbud.navn;
      $("b-merke").textContent = "Bestätigen";
      rader.push(["Gilt für", tilbud.konsern ? "Den gesamten Konzern" : "Das Unternehmen"]);
      var sum = tilbud.pris;
      if (dekker === "kunder") {
        rader.push(["Eigene Lizenz", nok(tilbud.pris)]);
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
      rader.push(["Zahlung", BETALING[betaling]]);
      rader.push(["Preis pro Jahr, zzgl. MwSt.", nok(sum), "sum-rad"]);
      if (betaling === "faktura") {
        data.epost = $("b-epost").value.trim();
        if (annenNokkelEpost()) data.nokkelEpost = $("b-nokkel").value.trim();
        data.ehf = document.querySelector('[data-ehf][aria-checked="true"]').getAttribute("data-ehf") === "ja";
        rader.push(["Rechnung an", data.epost]);
        rader.push(["Lizenzschlüssel an", data.nokkelEpost || data.epost]);
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
    $("b-mva").textContent = faktura ? "25 % MwSt. werden auf der Rechnung hinzugerechnet." : "25 % MwSt. werden an der Kasse hinzugerechnet.";
    $("b-test").hidden = !tilbud.test || faktura;
    $("b-ok").textContent = faktura ? "Rechnung senden" : "Zur Zahlung";
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
    $("f-tittel").textContent = svar.navn + " · Org.-Nr. " + orgnrTekst(svar.orgnr);
    var rader = [["Betrag inkl. MwSt.", nok(f.belop)], ["Gesendet an", svar.epost]];
    if (f.nummer) rader.unshift(["Rechnungsnummer", f.nummer]);
    if (f.forfall) rader.push(["Fällig am", datoTekst(f.forfall)]);
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
    $("f-frist").textContent = f.forfall ? "bis zum " + datoTekst(f.forfall) : "innerhalb von 7 Tagen";
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
    $("k-tittel").textContent = "Gebucht";
    $("k-tekst").textContent = "Die Buchung wird abgerufen.";
    api("sprint/kvittering?session=" + encodeURIComponent(sprintOkt))
      .then(function (svar) {
        var hvem = svar.navn + " (Org.-Nr. " + orgnrTekst(svar.orgnr) + ")";
        if (svar.tilbud === "oppsett") {
          $("k-tittel").textContent = "Der Einrichtungstag ist gebucht";
          $("k-tekst").textContent =
            "Der Einrichtungstag bei " + hvem + " ist für den " + datoTekst(svar.start) + " gebucht. " + nok(svar.fast) +
            " zzgl. MwSt. wurden bezahlt. Die Bestätigung wurde an " + svar.epost + " gesendet. Ich sende Ihnen die Checkliste vor dem Termin.";
        } else {
          $("k-tittel").textContent = svar.tilbud === "kort" ? "Der kurze Sprint ist gebucht" : "Der Sprint ist gebucht";
          $("k-tekst").textContent =
            (svar.tilbud === "kort" ? "Der kurze Sprint" : "Der Sprint") + " bei " + hvem + " ist gebucht für " +
            datoTekst(svar.start) + " – " + datoTekst(svar.slutt) + ". Das Grundhonorar von " + nok(svar.grunn) +
            " zzgl. MwSt. wurde bezahlt und wird nicht erstattet. Der Rest wird nur in Rechnung gestellt, wenn das Erfolgskriterium erreicht ist. Die Bestätigung wurde an " + svar.epost +
            " gesendet. Ich melde mich, um vor Tag 1 schriftlich zu vereinbaren, wie ein bereinigtes Dokument aussehen soll.";
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
        var hvem = svar.navn + " (Org.-Nr. " + orgnrTekst(svar.orgnr) + ")";
        if (svar.type === "testing") {
          $("k-tittel").textContent = "Der erweiterte Test ist bereit";
          $("k-tekst").textContent = "Registriert auf " + hvem + ". Der volle Betrag wird auf die Lizenz angerechnet, wenn Sie kaufen.";
        } else {
          $("k-tekst").textContent =
            "Die Lizenz ist auf " + hvem + " registriert. Bewahren Sie den Schlüssel gut auf. Bei jeder Verlängerung erhalten Sie einen neuen per E-Mail.";
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
    } else {
      ferdigStartet();
    }
  }
})();
