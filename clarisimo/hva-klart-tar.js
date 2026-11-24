// «Qué detecta Clarísimo»: el ancho de las barras (data-b, en porcentaje), si las hay, y la explicación que se abre al hacer clic.
// Archivo aparte porque la página no admite scripts ni atributos style dentro del HTML.
(function () {
  var barras = document.querySelectorAll(".stolpe[data-b]");
  for (var i = 0; i < barras.length; i++) {
    var b = parseFloat(barras[i].getAttribute("data-b")) || 0;
    barras[i].style.width = b + "%";
    if (b > 0) barras[i].style.minWidth = "3px";
  }
})();

(function () {
  var filas = document.querySelectorAll(".rad");
  function cerrar(excepto) {
    for (var i = 0; i < filas.length; i++) if (filas[i] !== excepto) filas[i].classList.remove("apen");
  }
  for (var i = 0; i < filas.length; i++) {
    filas[i].addEventListener("click", function (e) {
      e.stopPropagation();
      cerrar(this);
      this.classList.toggle("apen");
    });
  }
  document.addEventListener("click", function () { cerrar(null); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrar(null); });
})();
