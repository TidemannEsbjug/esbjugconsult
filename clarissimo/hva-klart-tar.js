// «O que o Claríssimo deteta»: a largura das barras (data-b, em percentagem), se as houver, e a explicação que se abre com um clique.
// Ficheiro à parte porque a página não admite scripts nem atributos style dentro do HTML.
(function () {
  var barras = document.querySelectorAll(".stolpe[data-b]");
  for (var i = 0; i < barras.length; i++) {
    var b = parseFloat(barras[i].getAttribute("data-b")) || 0;
    barras[i].style.width = b + "%";
    if (b > 0) barras[i].style.minWidth = "3px";
  }
})();

(function () {
  var linhas = document.querySelectorAll(".rad");
  function fechar(exceto) {
    for (var i = 0; i < linhas.length; i++) if (linhas[i] !== exceto) linhas[i].classList.remove("apen");
  }
  for (var i = 0; i < linhas.length; i++) {
    linhas[i].addEventListener("click", function (e) {
      e.stopPropagation();
      fechar(this);
      this.classList.toggle("apen");
    });
  }
  document.addEventListener("click", function () { fechar(null); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(null); });
})();
