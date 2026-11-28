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
    // O endereço recebe #mac ou #windows, para que a ligação possa ser partilhada com a vista certa.
    try { history.replaceState(null, "", "#" + os); } catch (e) {}
    // Primeira escolha: se as verificações aparecerem fora da vista, a página desloca-se para se ver que algo aconteceu.
    var topp = innhold.getBoundingClientRect().top;
    if (forste && topp > window.innerHeight * 0.7) {
      window.scrollBy({ top: topp - window.innerHeight * 0.3, behavior: "smooth" });
    }
  }
  for (var i = 0; i < velgere.length; i++) {
    velgere[i].addEventListener("click", function () { vis(this.getAttribute("data-velg"), true); });
  }
  if (rot.hasAttribute("data-vis")) vis(rot.getAttribute("data-vis"), false);

  // O método antigo, para navegadores e janelas integradas que não permitem a API da área de transferência.
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
      if (!medMarkering(tekst)) throw new Error("cópia recusada");
    });
  }

  function kopier(blokk) {
    var knapp = blokk.querySelector(".kopier");
    var tekst = blokk.querySelector("pre").textContent.replace(/\s+$/, "");
    tilUtklipp(tekst).then(
      function () {
        knapp.textContent = "Copiado ✓";
        knapp.classList.add("kopiert");
        melding.textContent = "Comando copiado. Cole-o e prima Enter.";
      },
      function () {
        knapp.textContent = "Selecionar à mão";
        melding.textContent = "Não foi possível copiar. Selecione o texto e copie-o manualmente.";
      }
    );
    clearTimeout(knapp._tid);
    knapp._tid = setTimeout(function () {
      knapp.textContent = "Copiar";
      knapp.classList.remove("kopiert");
    }, 2200);
  }

  var blokker = document.querySelectorAll(".cmd");
  for (var j = 0; j < blokker.length; j++) {
    (function (blokk) {
      var knapp = document.createElement("button");
      knapp.type = "button";
      knapp.className = "kopier";
      knapp.textContent = "Copiar";
      knapp.setAttribute("aria-label", "Copiar comando");
      knapp.addEventListener("click", function () { kopier(blokk); });
      var bar = document.createElement("div");
      bar.className = "cmd-bar";
      var hvor = document.createElement("span");
      hvor.textContent = blokk.getAttribute("data-hvor") || (blokk.closest('.os[data-os="windows"]') ? "PowerShell" : "Terminal");
      bar.appendChild(hvor);
      bar.appendChild(knapp);
      blokk.insertBefore(bar, blokk.firstChild);
      // Clicar no próprio código também copia, exceto se tiver sido selecionado texto à mão.
      blokk.querySelector("pre").addEventListener("click", function () {
        var valgt = window.getSelection && String(window.getSelection());
        if (!valgt) kopier(blokk);
      });
    })(blokker[j]);
  }
})();
