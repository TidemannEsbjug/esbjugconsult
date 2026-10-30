(function () {
  var rot = document.documentElement;
  var velgere = document.querySelectorAll("[data-velg]");
  var melding = document.getElementById("melding");

  var innhold = document.getElementById("innhold");

  function vis(os, klikket) {
    var forste = !rot.hasAttribute("data-vis");
    rot.setAttribute("data-vis", os);
    for (var i = 0; i < velgere.length; i++) {
      velgere[i].setAttribute("aria-pressed", velgere[i].getAttribute("data-velg") === os ? "true" : "false");
    }
    if (!klikket) return;
    // Adressen får #mac eller #windows, så lenken kan sendes videre til riktig visning.
    try { history.replaceState(null, "", "#" + os); } catch (e) {}
    // Første valg: dukker sjekkene opp under synsfeltet, rull dem fram så man ser at noe skjedde.
    var topp = innhold.getBoundingClientRect().top;
    if (forste && topp > window.innerHeight * 0.7) {
      window.scrollBy({ top: topp - window.innerHeight * 0.3, behavior: "smooth" });
    }
  }
  for (var i = 0; i < velgere.length; i++) {
    velgere[i].addEventListener("click", function () { vis(this.getAttribute("data-velg"), true); });
  }
  if (rot.hasAttribute("data-vis")) vis(rot.getAttribute("data-vis"), false);

  // Den gamle måten, for nettlesere og innebygde vinduer som nekter utklippstavle-API-et.
  function medMarkering(tekst) {
    var felt = document.createElement("textarea");
    felt.value = tekst;
    felt.setAttribute("readonly", "");
    felt.style.position = "fixed";
    felt.style.opacity = "0";
    document.body.appendChild(felt);
    felt.select();
    var gikk = false;
    try { gikk = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(felt);
    return gikk;
  }

  function tilUtklipp(tekst) {
    var api = navigator.clipboard && window.isSecureContext
      ? navigator.clipboard.writeText(tekst)
      : Promise.reject();
    return api.catch(function () {
      if (!medMarkering(tekst)) throw new Error("kopiering nektet");
    });
  }

  function kopier(blokk) {
    var knapp = blokk.querySelector(".kopier");
    var tekst = blokk.querySelector("pre").textContent.replace(/\s+$/, "");
    tilUtklipp(tekst).then(
      function () {
        knapp.textContent = "Kopiert ✓";
        knapp.classList.add("kopiert");
        melding.textContent = "Kommandoen er kopiert. Lim den inn og trykk Enter.";
      },
      function () {
        knapp.textContent = "Marker selv";
        melding.textContent = "Kunne ikke kopiere. Marker kommandoen og kopier den selv.";
      }
    );
    clearTimeout(knapp._tid);
    knapp._tid = setTimeout(function () {
      knapp.textContent = "Kopier";
      knapp.classList.remove("kopiert");
    }, 2200);
  }

  var blokker = document.querySelectorAll(".cmd");
  for (var j = 0; j < blokker.length; j++) {
    (function (blokk) {
      var knapp = document.createElement("button");
      knapp.type = "button";
      knapp.className = "kopier";
      knapp.textContent = "Kopier";
      knapp.setAttribute("aria-label", "Kopier kommandoen");
      knapp.addEventListener("click", function () { kopier(blokk); });
      var bar = document.createElement("div");
      bar.className = "cmd-bar";
      var hvor = document.createElement("span");
      hvor.textContent = blokk.getAttribute("data-hvor") || (blokk.closest('.os[data-os="windows"]') ? "PowerShell" : "Terminal");
      bar.appendChild(hvor);
      bar.appendChild(knapp);
      blokk.insertBefore(bar, blokk.firstChild);
      // Et trykk på selve koden kopierer også, men ikke når noen har markert tekst selv.
      blokk.querySelector("pre").addEventListener("click", function () {
        var valgt = window.getSelection && String(window.getSelection());
        if (!valgt) kopier(blokk);
      });
    })(blokker[j]);
  }
})();
