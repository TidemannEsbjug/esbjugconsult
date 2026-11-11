// Siden på /klart før Klart åpner (test.html): nedtellingen, snøen og den skjulte innloggingen.

// Nedtellingen. Tidspunktet står i data-til (UTC) og er det samme som LANSERING i
// .worker/klart.js, der workeren åpner siden og nedlastingene av seg selv. Når tiden er ute,
// lastes siden på nytt og viser den ekte forsiden.
(function () {
  var el = document.querySelector("[data-til]");
  var til = el && Date.parse(el.getAttribute("data-til"));
  var t = el && el.querySelector('[data-del="t"]');
  var m = el && el.querySelector('[data-del="m"]');
  var s = el && el.querySelector('[data-del="s"]');
  if (!til || !t || !m || !s) return;
  function to(n) {
    return (n < 10 ? "0" : "") + n;
  }
  var lastet = false;
  function tikk() {
    var igjen = Math.max(0, Math.floor((til - Date.now()) / 1000));
    t.textContent = to(Math.floor(igjen / 3600));
    m.textContent = to(Math.floor((igjen % 3600) / 60));
    s.textContent = to(igjen % 60);
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

// Den skjulte innloggingen: klikk på merket, skriv passordet og trykk Enter. Ingenting vises
// mens man skriver. Feil passord laster bare siden på nytt.
(function () {
  var merke = document.querySelector("[data-merke]");
  var skjema = document.querySelector("form.skjult");
  if (!merke || !skjema) return;
  var lytter = false;
  var skrevet = "";
  merke.addEventListener("click", function () {
    lytter = true;
    skrevet = "";
  });
  document.addEventListener("keydown", function (e) {
    if (!lytter || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!skrevet) return;
      skjema.elements.passord.value = skrevet;
      lytter = false;
      skjema.submit();
    } else if (e.key === "Escape") {
      lytter = false;
      skrevet = "";
    } else if (e.key === "Backspace") {
      skrevet = skrevet.slice(0, -1);
    } else if (e.key.length === 1) {
      skrevet += e.key;
    }
  });
})();

// Snø som faller over bildet, bak merket og kortet. Står stille for dem som har bedt om
// mindre bevegelse.
(function () {
  var c = document.querySelector("canvas.sno");
  if (!c || !c.getContext) return;
  var ctx = c.getContext("2d");
  var rolig = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fnugg = [];
  var b = 0, h = 0, dpr = 1;
  function str() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    b = window.innerWidth;
    h = window.innerHeight;
    c.width = Math.round(b * dpr);
    c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var antall = Math.round(Math.min(220, (b * h) / 9000));
    while (fnugg.length < antall) fnugg.push(nytt(true));
    fnugg.length = antall;
  }
  function nytt(hvorSomHelst) {
    var r = Math.random();
    var stor = r * r * 2.6 + 0.6;
    return {
      x: Math.random() * b,
      y: hvorSomHelst ? Math.random() * h : -10,
      r: stor,
      fart: 18 + stor * 22 + Math.random() * 14,
      drift: Math.random() * Math.PI * 2,
      svai: 8 + Math.random() * 18,
      lys: 0.55 + Math.random() * 0.4,
    };
  }
  var forrige = performance.now();
  function tegn(naa) {
    var dt = Math.min((naa - forrige) / 1000, 0.05);
    forrige = naa;
    ctx.clearRect(0, 0, b, h);
    for (var i = 0; i < fnugg.length; i++) {
      var f = fnugg[i];
      if (!rolig) {
        f.y += f.fart * dt;
        f.drift += dt * 0.8;
        f.x += Math.sin(f.drift) * f.svai * dt;
        if (f.y > h + 10) fnugg[i] = f = nytt(false);
        if (f.x < -10) f.x = b + 10;
        if (f.x > b + 10) f.x = -10;
      }
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255," + f.lys + ")";
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!rolig) requestAnimationFrame(tegn);
  }
  window.addEventListener("resize", str);
  str();
  requestAnimationFrame(tegn);
})();
