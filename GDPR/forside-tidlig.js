// Kjøres før siden tegnes. Kommer de tilbake med en virksomhet i adressen, skal kortet stå der med en gang:
// ikke feltet først, og ikke godkjent-animasjonen på nytt.
(function () {
  var o = String(new URLSearchParams(location.search).get("orgnr") || "").replace(/\D/g, "");
  if (/^\d{9}$/.test(o)) document.documentElement.classList.add("kommer-tilbake", "uten-feiring");
})();
