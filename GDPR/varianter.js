// Fem utkast til nedlastingsdelen i heroen, til å se på etter hverandre.
// Sover til adressen har ?varianter — siden er helt uberørt uten den.
//
//   http://localhost:8088/index.html?varianter
//
// ← og → blar, 1–5 hopper rett dit, 0 går tilbake til slik siden er nå.
// Valget huskes i localStorage, så det overlever ⌘R.
//
// Utkastene ligger i varianter.css. Her settes bare en klasse på <html>.
// Ingen innerHTML: siden svarer med require-trusted-types-for 'script'.
(function () {
  if (!/(^|[?&])varianter\b/.test(location.search)) return;

  var UTKAST = [
    { klasse: "", navn: "Som nå" },
    { klasse: "v2", navn: "Lite felt" },
    { klasse: "v3", navn: "Side om side" },
    { klasse: "v4", navn: "Kort" },
    { klasse: "v5", navn: "Smal" },
  ];

  var rot = document.documentElement;
  var na = Number(localStorage.getItem("klart-variant") || 0);
  if (!(na >= 0 && na < UTKAST.length)) na = 0;

  // Stripa nederst: nummer, navn og en prikk per utkast.
  var strip = document.createElement("div");
  strip.className = "var-strip";
  var tall = document.createElement("b");
  var navn = document.createElement("span");
  var prikker = document.createElement("div");
  prikker.className = "var-prikker";
  var prikk = UTKAST.map(function () {
    var p = document.createElement("i");
    p.className = "var-prikk";
    prikker.appendChild(p);
    return p;
  });
  strip.appendChild(tall);
  strip.appendChild(navn);
  strip.appendChild(prikker);

  function vis() {
    UTKAST.forEach(function (u) {
      if (u.klasse) rot.classList.remove(u.klasse);
    });
    if (UTKAST[na].klasse) rot.classList.add(UTKAST[na].klasse);
    tall.textContent = na + 1 + " / " + UTKAST.length;
    navn.textContent = UTKAST[na].navn;
    prikk.forEach(function (p, i) {
      p.className = "var-prikk" + (i === na ? " na" : "");
    });
    localStorage.setItem("klart-variant", String(na));
  }

  function gaa(steg) {
    na = (na + steg + UTKAST.length) % UTKAST.length;
    vis();
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var mal = e.target;
    if (mal && (mal.tagName === "INPUT" || mal.tagName === "TEXTAREA")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { gaa(1); e.preventDefault(); return; }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { gaa(-1); e.preventDefault(); return; }
    var n = Number(e.key);
    if (n >= 1 && n <= UTKAST.length) { na = n - 1; vis(); e.preventDefault(); return; }
    if (e.key === "0") { na = 0; vis(); e.preventDefault(); }
  });

  document.body.appendChild(strip);
  vis();

  // Nettsyn leser denne hvert par sekund og skriver den til fil, så valget
  // finnes på disk og ikke bare på skjermen.
  window.NAKEN_TILSTAND = function () {
    return JSON.stringify({ variant: na + 1, navn: UTKAST[na].navn });
  };
})();
