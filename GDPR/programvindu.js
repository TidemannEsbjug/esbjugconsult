// Forteller forsiden (samme domene) hvor høyt programvinduet er, så iframen der får riktig høyde.
(function () {
  if (window.parent === window) return;
  var sist = 0;
  function meld() {
    var h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h && h !== sist) {
      sist = h;
      window.parent.postMessage({ programvindu: h }, location.origin);
    }
  }
  meld();
  if ("ResizeObserver" in window) new ResizeObserver(meld).observe(document.body);
  window.addEventListener("load", meld);
  window.addEventListener("resize", meld);
})();
