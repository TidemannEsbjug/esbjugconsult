(function () {
  var rot = document.documentElement;
  // Chiarissimo: bare Mac-bygget finnes ennå, så siden viser alltid Mac (Windows og Linux er «in arrivo»).
  rot.classList.add("js");
  rot.setAttribute("data-vis", "mac");
})();
