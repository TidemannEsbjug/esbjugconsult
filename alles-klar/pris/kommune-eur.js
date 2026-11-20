// Prisen for kommuner i euro (Alles Klar): fire år, rett linje mellom punktene i data-punkter, tak på siste punkt.
// Viser svaret i prisboksen (#ke-svar). Bestillingen regnes med preis.js, som har de samme punktene.
(function () {
  var skjema = document.getElementById("ke-skjema");
  if (!skjema) return;
  var felt = document.getElementById("ke-innbyggere");
  var svar = document.getElementById("ke-svar");
  var punkter = JSON.parse(skjema.getAttribute("data-punkter"));
  var euro = function (n) { return n.toLocaleString("de-DE") + " €"; };

  function pris(innbyggere) {
    if (innbyggere <= punkter[0][0]) return punkter[0][1];
    for (var i = 1; i < punkter.length; i++) {
      var a = punkter[i - 1], b = punkter[i];
      if (innbyggere <= b[0]) return a[1] + (b[1] - a[1]) * (innbyggere - a[0]) / (b[0] - a[0]);
    }
    return punkter[punkter.length - 1][1];
  }

  function vis() {
    var n = parseInt(felt.value.replace(/[^0-9]/g, ""), 10);
    if (!n) { svar.hidden = true; return; }
    var fire = Math.round(pris(n) / 100) * 100;
    svar.textContent = "";
    var b = document.createElement("b");
    b.textContent = euro(fire);
    svar.appendChild(b);
    svar.appendChild(document.createTextNode(" für vier Jahre (" + euro(Math.round(fire / 4)) + " pro Jahr)"));
    svar.hidden = false;
  }

  felt.addEventListener("input", vis);
  skjema.addEventListener("submit", function (e) { e.preventDefault(); vis(); });
})();
