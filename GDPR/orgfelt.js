// Feltet for organisasjonsnummer eller navn, på forsiden og prissiden. Skriver man sifre, formateres de
// som «123 456 789». Skriver man bokstaver, kommer forslag fra Enhetsregisteret (GET /klart/api/sok).
//
//   var felt = KlartOrgfelt(input, liste, function (orgnr) { … });  // kalles når et forslag velges
//   felt.orgnr()   → ni gyldige sifre fra feltet, eller null
//   felt.forste()  → org.nr. til det første forslaget, eller null
//   felt.tom()     → tømmer feltet og forslagene
(function () {
  function gyldig(o) {
    // MOD11 med vektene 3 2 7 6 5 4 3 2. Rest 11 gir 0, rest 10 er ugyldig. Sjekkes igjen på serveren.
    if (!/^\d{9}$/.test(o)) return false;
    var v = [3, 2, 7, 6, 5, 4, 3, 2];
    var sum = 0;
    for (var i = 0; i < 8; i++) sum += v[i] * +o[i];
    var k = 11 - (sum % 11);
    if (k === 10) return false;
    return (k === 11 ? 0 : k) === +o[8];
  }

  function tekst(o) {
    return String(o).replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
  }

  function KlartOrgfelt(input, liste, valgt) {
    var treff = [];
    var aktiv = -1;
    var vent = null;
    var nr = 0;

    function tegn() {
      liste.innerHTML = "";
      treff.forEach(function (t, i) {
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.className = i === aktiv ? "aktiv" : "";
        b.setAttribute("role", "option");
        var navn = document.createElement("span");
        navn.textContent = t.navn;
        var mer = document.createElement("small");
        mer.textContent = (t.sted ? t.sted + " · " : "") + tekst(t.orgnr);
        b.appendChild(navn);
        b.appendChild(mer);
        // mousedown, så valget skjer før feltet mister fokus og lista lukkes.
        b.addEventListener("mousedown", function (e) {
          e.preventDefault();
          velg(t);
        });
        li.appendChild(b);
        liste.appendChild(li);
      });
      liste.hidden = !treff.length;
      input.setAttribute("aria-expanded", treff.length ? "true" : "false");
    }

    function velg(t) {
      input.value = tekst(t.orgnr);
      treff = [];
      aktiv = -1;
      tegn();
      valgt(t.orgnr);
    }

    function sok(q) {
      var mitt = ++nr;
      fetch("/klart/api/sok?q=" + encodeURIComponent(q))
        .then(function (r) {
          return r.ok ? r.json() : { treff: [] };
        })
        .then(function (svar) {
          if (mitt !== nr) return;
          treff = svar.treff || [];
          aktiv = treff.length ? 0 : -1;
          tegn();
        })
        .catch(function () {});
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    input.addEventListener("input", function () {
      var v = input.value;
      clearTimeout(vent);
      if (/^[\d\s]*$/.test(v)) {
        // Bare sifre: formater som org.nr. og lukk forslagene.
        var d = v.replace(/\D/g, "").slice(0, 9);
        input.value = d.replace(/^(\d{3})(\d{1,3})?(\d{1,3})?$/, function (_, a, b, c) {
          return [a, b, c].filter(Boolean).join(" ");
        });
        nr++;
        treff = [];
        tegn();
        return;
      }
      if (v.trim().length < 2) {
        nr++;
        treff = [];
        tegn();
        return;
      }
      vent = setTimeout(function () {
        sok(v.trim());
      }, 220);
    });

    input.addEventListener("keydown", function (e) {
      if (!treff.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        aktiv = (aktiv + (e.key === "ArrowDown" ? 1 : -1) + treff.length) % treff.length;
        tegn();
      } else if (e.key === "Enter" && aktiv >= 0) {
        e.preventDefault();
        velg(treff[aktiv]);
      } else if (e.key === "Escape") {
        treff = [];
        tegn();
      }
    });

    input.addEventListener("blur", function () {
      setTimeout(function () {
        treff = [];
        tegn();
      }, 120);
    });

    return {
      orgnr: function () {
        var d = input.value.replace(/\s/g, "");
        return gyldig(d) ? d : null;
      },
      sifre: function () {
        return /^[\d\s]+$/.test(input.value.trim());
      },
      forste: function () {
        return treff.length ? treff[Math.max(aktiv, 0)].orgnr : null;
      },
      tom: function () {
        input.value = "";
        treff = [];
        tegn();
      },
    };
  }

  KlartOrgfelt.gyldig = gyldig;
  KlartOrgfelt.tekst = tekst;
  window.KlartOrgfelt = KlartOrgfelt;
})();
