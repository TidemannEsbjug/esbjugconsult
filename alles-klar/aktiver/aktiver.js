(function () {
  var q = new URLSearchParams(location.search);
  // «Kjøp lisens» i appen åpner denne siden med ?hva=kjop. Kjøpet skjer nå på prissiden, der
  // lisensen gjelder hele virksomheten og prisen følger antall ansatte.
  if (q.get("hva") === "kjop") {
    location.replace("/alles-klar/pris/?from=upgrade");
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
    visFirma("Suche im norwegischen Unternehmensregister (Brønnøysundregistrene) …");
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
    return new Date(+d[0], +d[1] - 1, +d[2]).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function visKode(svar, tittel) {
    feil("");
    $("kode").value = svar.kode;
    $("resultat-tittel").textContent = tittel;
    var tekst = "Fügen Sie ihn in Alles Klar ein: Klicken Sie oben rechts auf die Lizenzanzeige (dort steht „Test: noch … Tage“ oder „Lizenz“) und fügen Sie den Code dort in das Feld ein.";
    if (svar.utloper) tekst += " Gültig bis einschließlich " + datoTekst(svar.utloper) + ".";
    $("resultat-tekst").textContent = tekst;
    $("resultat").hidden = false;
    $("resultat").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function gyldigMaskin() {
    var m = maskin.value.trim().toUpperCase();
    if (!MONSTER.test(m)) {
      feil("Geben Sie den Gerätecode aus Alles Klar ein. Sie finden ihn im Lizenzfenster von Alles Klar (oben rechts), im Format XXXX-XXXX-XXXX-XXXX.");
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
        if (!r.ok) throw new Error(j.feil || "Etwas ist schiefgelaufen.");
        return j;
      });
    });
  }

  function opptatt(knapp, ja) {
    knapp.disabled = ja;
  }

  $("kjop").addEventListener("click", function () {
    if (!firma) {
      feil("Geben Sie die Organisationsnummer Ihres Unternehmens ein. Lizenzen werden an Unternehmen verkauft.");
      orgnr.focus();
      return;
    }
    // Kjøpet skjer på prissiden, på faktura. Virksomheten følger med dit.
    location.href = "/alles-klar/pris/?orgnr=" + firma.orgnr;
  });

  $("hent").addEventListener("click", function () {
    var m = gyldigMaskin();
    if (!m) return;
    opptatt(this, true);
    var knapp = this;
    api("hent", { maskin: m, epost: $("epost").value })
      .then(function (svar) {
        visKode(svar, "Hier ist Ihr Lizenzcode");
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
        knapp.textContent = "Kopieren";
      }, 1600);
    });
  });

  $("kjop").disabled = false;

  var hva = q.get("hva");
  if (hva === "kjop") $("tittel").textContent = "Alles Klar kaufen";
  if (hva === "aktiver") $("tittel").textContent = "Lizenz aktivieren";
})();
