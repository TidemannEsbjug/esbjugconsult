// Nedtellingen på passordsiden (test.html) til Klart åpner for alle. Tidspunktet står i
// data-til (UTC) og er det samme som LANSERING i .worker/klart.js: der åpner workeren siden
// og nedlastingene av seg selv. Når tiden er ute, lastes siden på nytt og viser den ekte forsiden.
(function () {
  var el = document.querySelector("[data-til]");
  if (!el) return;
  var til = Date.parse(el.getAttribute("data-til"));
  var tall = el.querySelector("[data-tall]");
  if (!til || !tall) return;
  function to(n) {
    return (n < 10 ? "0" : "") + n;
  }
  var lastet = false;
  function tikk() {
    var igjen = Math.max(0, Math.floor((til - Date.now()) / 1000));
    tall.textContent = to(Math.floor(igjen / 3600)) + ":" + to(Math.floor((igjen % 3600) / 60)) + ":" + to(igjen % 60);
    if (igjen === 0 && !lastet) {
      lastet = true;
      // Litt slakk, så workerens klokke også har passert tidspunktet.
      setTimeout(function () {
        location.reload();
      }, 3000);
    }
  }
  tikk();
  setInterval(tikk, 1000);
})();
