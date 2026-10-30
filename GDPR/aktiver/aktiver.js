(function () {
  var q = new URLSearchParams(location.search);
  // «Kjøp lisens» i appen åpner denne siden med ?hva=kjop. Kjøpet skjer nå på prissiden, der
  // lisensen gjelder hele virksomheten og prisen følger antall ansatte.
  if (q.get("hva") === "kjop" && !q.get("session")) {
    location.replace("/klart/pris/?from=upgrade");
    return;
  }
  var $ = function (id) {
    return document.getElementById(id);
  };
  var maskin = $("maskin");
  var MONSTER = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

  maskin.value = (q.get("maskin") || "").toUpperCase();

  // Org.nr → firmanavn fra Enhetsregisteret. Kjøp går bare med et firma som finnes.
  var orgnr = $("orgnr");
  var firma = null;
  var oppslag = 0;
  function visFirma(tekst, ok) {
    $("firma").textContent = tekst || "";
    $("firma").className = "firma" + (ok ? " ok" : "");
  }
  orgnr.addEventListener("input", function () {
    var o = orgnr.value.replace(/\s/g, "");
    firma = null;
    if (o.length < 9) return visFirma("");
    var nr = ++oppslag;
    visFirma("Slår opp i Brønnøysundregistrene …");
    api("firma?orgnr=" + encodeURIComponent(o))
      .then(function (f) {
        if (nr !== oppslag) return;
        firma = f;
        visFirma("✓ " + f.navn, true);
      })
      .catch(function (e) {
        if (nr === oppslag) visFirma(e.message);
      });
  });

  function feil(tekst) {
    $("feil").textContent = tekst || "";
    $("feil").hidden = !tekst;
  }

  function datoTekst(iso) {
    if (!iso) return "";
    var d = iso.split("-");
    return new Date(+d[0], +d[1] - 1, +d[2]).toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function visKode(svar, tittel) {
    feil("");
    $("kode").value = svar.kode;
    $("resultat-tittel").textContent = tittel;
    var tekst = "Lim den inn i Klart: klikk «Gratis prøve» øverst til høyre, og lim koden inn i feltet der.";
    if (svar.utloper) tekst += " Gyldig til og med " + datoTekst(svar.utloper) + ".";
    $("resultat-tekst").textContent = tekst;
    $("resultat").hidden = false;
    $("resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function gyldigMaskin() {
    var m = maskin.value.trim().toUpperCase();
    if (!MONSTER.test(m)) {
      feil("Skriv inn maskinkoden fra Klart. Den står i lisensvinduet i Klart (øverst til høyre), på formen XXXX-XXXX-XXXX-XXXX.");
      maskin.focus();
      return null;
    }
    return m;
  }

  function api(sti, data) {
    return fetch("/klart/api/" + sti, data
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }
      : undefined
    ).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.feil || "Noe gikk galt.");
        return j;
      });
    });
  }

  function opptatt(knapp, ja) {
    knapp.disabled = ja;
  }

  $("kjop").addEventListener("click", function () {
    var m = gyldigMaskin();
    if (!m) return;
    if (!firma) {
      feil("Skriv inn bedriftens organisasjonsnummer. Lisenser selges til bedrifter.");
      orgnr.focus();
      return;
    }
    opptatt(this, true);
    var knapp = this;
    api("kjop", { maskin: m, orgnr: firma.orgnr, epost: $("epost").value })
      .then(function (svar) {
        location.href = svar.adresse;
      })
      .catch(function (e) {
        feil(e.message);
        opptatt(knapp, false);
      });
  });

  $("hent").addEventListener("click", function () {
    var m = gyldigMaskin();
    if (!m) return;
    opptatt(this, true);
    var knapp = this;
    api("hent", { maskin: m, epost: $("epost").value })
      .then(function (svar) {
        visKode(svar, "Her er lisenskoden din");
      })
      .catch(function (e) {
        feil(e.message);
      })
      .finally(function () {
        opptatt(knapp, false);
      });
  });

  $("kopier").addEventListener("click", function () {
    var knapp = this;
    navigator.clipboard.writeText($("kode").value).then(function () {
      knapp.textContent = "Kopiert";
      setTimeout(function () {
        knapp.textContent = "Kopier";
      }, 1600);
    });
  });

  // Hva som er åpent: kjøp er stengt til prisen er satt.
  api("status")
    .then(function (s) {
      $("kjop").disabled = !s.kjop;
      $("kjop-tekst").textContent = s.kjop
        ? s.test
          ? "Testmodus: bruk testkort 4242 4242 4242 4242."
          : "Betal med kort hos Stripe."
        : "Kjøp åpner snart.";
    })
    .catch(function () {});

  var hva = q.get("hva");
  if (hva === "kjop") $("tittel").textContent = "Kjøp Klart";
  if (hva === "aktiver") $("tittel").textContent = "Aktiver lisensen din";

  // Tilbake fra Stripe: vis koden med en gang.
  var okt = q.get("session");
  if (okt) {
    $("tittel").textContent = "Takk for kjøpet";
    $("ingress").textContent = "Vi henter lisenskoden din.";
    $("valg").hidden = true;
    $("firma-blokk").hidden = true;
    api("kvittering?session=" + encodeURIComponent(okt))
      .then(function (svar) {
        var hvem = svar.orgnr ? svar.navn + " (org.nr " + svar.orgnr.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") + ")" : svar.navn;
        $("ingress").textContent = "Lisensen er registrert på " + hvem + (svar.epost ? ", med " + svar.epost + "." : ".");
        visKode(svar, "Her er lisenskoden din");
      })
      .catch(function (e) {
        feil(e.message);
      });
  }
})();
