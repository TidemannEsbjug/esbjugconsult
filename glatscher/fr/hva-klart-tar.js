// «Hva Klart tar»: stolpenes bredde (data-b, prosent) og forklaringen som åpnes ved klikk.
// Egen fil fordi siden ikke tillater skript eller style-attributter i HTML-en.
(function () {
  var stolper = document.querySelectorAll(".stolpe[data-b]");
  for (var i = 0; i < stolper.length; i++) {
    var b = parseFloat(stolper[i].getAttribute("data-b")) || 0;
    stolper[i].style.width = b + "%";
    if (b > 0) stolper[i].style.minWidth = "3px";
  }
})();

(function () {
  var rader = document.querySelectorAll(".rad");
  function lukk(unntak) {
    for (var i = 0; i < rader.length; i++) if (rader[i] !== unntak) rader[i].classList.remove("apen");
  }
  for (var i = 0; i < rader.length; i++) {
    rader[i].addEventListener("click", function (h) {
      h.stopPropagation();
      lukk(this);
      this.classList.toggle("apen");
    });
  }
  document.addEventListener("click", function () { lukk(null); });
  document.addEventListener("keydown", function (h) { if (h.key === "Escape") lukk(null); });
})();

