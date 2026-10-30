// Kjøres før siden tegnes. Kommer de med en virksomhet i adressen, skal ikke skjemaet «Få prisen deres»
// vises mens prisen hentes. Skal de rett til oversikten, står riktig bakgrunn og bildet klart fra start.
(function () {
  var rot = document.documentElement;
  var q = new URLSearchParams(location.search);
  if (!/^\d{9}$/.test(String(q.get("orgnr") || "").replace(/\D/g, ""))) return;
  if (q.get("ordre") || q.get("sprint")) return;
  rot.classList.add("slaar-opp");
  if (q.get("vis") === "oppsett") {
    rot.classList.add("til-oversikt");
    new Image().src = "../assets/klart-maskin-sno.jpg";
  }
})();
