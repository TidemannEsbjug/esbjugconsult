// Tilbud som PDF for kommuner (Alles Klar). Lages i nettleseren, ingenting sendes til serveren.
// Prisen kommer fra samme kurve som kalkulatoren (data-punkter på #ke-skjema), selgeren fra data-* på #ke-angebot.
(function () {
  var skjema = document.getElementById("ke-angebot");
  var kurve = document.getElementById("ke-skjema");
  if (!skjema || !kurve) return;
  var punkter = JSON.parse(kurve.getAttribute("data-punkter"));
  var felt = function (id) { return document.getElementById(id); };
  var feil = felt("ka-feil");

  function pris(n) {
    if (n <= punkter[0][0]) return punkter[0][1];
    for (var i = 1; i < punkter.length; i++) {
      var a = punkter[i - 1], b = punkter[i];
      if (n <= b[0]) return a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]);
    }
    return punkter[punkter.length - 1][1];
  }
  var tall = function (n) { return n.toLocaleString("de-DE"); };
  // hardt mellomrom før €, så beløpet aldri brekkes

  var euro = function (n) { return tall(n) + "\u00a0€"; };
  var dato = function (d) {
    return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  };

  // ---------- Et lite PDF-skrivebord: Helvetica, WinAnsi, A4 ----------
  var SPESIAL = { "€": 128, "‚": 130, "„": 132, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151 };
  function pdfTekst(s) {
    var ut = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), k = s.charCodeAt(i);
      if (SPESIAL[c]) k = SPESIAL[c];
      else if (k === 0x202f || k === 0x2009 || k === 0xa0) k = 32;
      else if (k > 255) k = 63; // «?» for tegn Helvetica ikke har
      if (c === "(" || c === ")" || c === "\\") ut += "\\" + c;
      else if (k < 32 || k > 126) ut += "\\" + ("00" + k.toString(8)).slice(-3);
      else ut += String.fromCharCode(k);
    }
    return ut;
  }
  var maaler = document.createElement("canvas").getContext("2d");
  function bredde(s, str, fet) {
    maaler.font = (fet ? "bold " : "") + "100px Helvetica, Arial, sans-serif";
    return maaler.measureText(s).width / 100 * str;
  }
  function brekk(s, str, maks, fet) {
    var ord = s.split(" "), linjer = [], linje = "";
    for (var i = 0; i < ord.length; i++) {
      var prov = linje ? linje + " " + ord[i] : ord[i];
      if (linje && bredde(prov, str, fet) > maks) { linjer.push(linje); linje = ord[i]; }
      else linje = prov;
    }
    if (linje) linjer.push(linje);
    return linjer;
  }

  function lagPdf(tegn) {
    var obj = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "<< /Length " + tegn.length + " >>\nstream\n" + tegn + "\nendstream",
      "<< /Title (" + pdfTekst("Angebot Alles Klar") + ") /Producer (esbjugconsult.com) >>"
    ];
    var ut = "%PDF-1.4\n", plass = [];
    for (var i = 0; i < obj.length; i++) {
      plass.push(ut.length);
      ut += (i + 1) + " 0 obj\n" + obj[i] + "\nendobj\n";
    }
    var xref = ut.length;
    ut += "xref\n0 " + (obj.length + 1) + "\n0000000000 65535 f \n";
    for (var j = 0; j < plass.length; j++) ut += ("000000000" + plass[j]).slice(-10) + " 00000 n \n";
    ut += "trailer\n<< /Size " + (obj.length + 1) + " /Root 1 0 R /Info 7 0 R >>\nstartxref\n" + xref + "\n%%EOF";
    return new Blob([ut], { type: "application/pdf" }); // bare ASCII, så tegn = byte
  }

  // ---------- Selve tilbudet ----------
  function lagTilbud(k) {
    var V = 56.7, H = 538.6, B = H - V; // marger 2 cm
    var y = 785, s = "";
    var farge = function (r, g, b) { s += r + " " + g + " " + b + " rg\n"; };
    function tekst(x, t, str, fet, hoyre) {
      if (hoyre) x -= bredde(t, str, fet);
      s += "BT /" + (fet ? "F2" : "F1") + " " + str + " Tf " + x.toFixed(2) + " " + y.toFixed(2) + " Td (" + pdfTekst(t) + ") Tj ET\n";
    }
    function avsnitt(t, str, fet, luft) {
      var l = brekk(t, str, B, fet);
      for (var i = 0; i < l.length; i++) { tekst(V, l[i], str, fet); y -= str * 1.4; }
      y -= luft || 0;
    }
    function strek(y0) { s += "0.8 0.82 0.85 RG 0.6 w " + V + " " + y0 + " m " + H + " " + y0 + " l S\n"; }

    // Selgeren øverst til høyre, mottakeren til venstre
    var sy = y;
    farge(0.42, 0.45, 0.5);
    k.selger.forEach(function (l, i) { tekst(H, l, 8.5, i === 0, true); y -= 11.5; });
    var bunnSelger = y;
    y = sy;
    farge(0.1, 0.11, 0.13);
    tekst(V, "Alles Klar", 20, true); y -= 46;
    k.mottaker.forEach(function (l, i) { tekst(V, l, 10.5, i === 0); y -= 14.5; });
    y = Math.min(y, bunnSelger) - 28;

    tekst(V, "Angebot", 22, true); y -= 24;
    farge(0.42, 0.45, 0.5);
    tekst(V, "Angebotsnummer " + k.nummer + "   ·   Datum " + k.dato + "   ·   Gültig bis " + k.gyldig, 9.5);
    y -= 30;

    farge(0.1, 0.11, 0.13);
    avsnitt("Sehr geehrte Damen und Herren,", 10.5, false, 4);
    avsnitt("wir bieten Ihnen eine Lizenz für Alles Klar an. Der Preis richtet sich allein nach der Einwohnerzahl und entspricht unserer öffentlichen Preisliste. Jede Kommune gleicher Größe zahlt denselben Preis.", 10.5, false, 16);

    // Posisjonstabellen
    farge(0.42, 0.45, 0.5);
    tekst(V, "POS.", 8, true); tekst(V + 34, "LEISTUNG", 8, true); tekst(H, "BETRAG", 8, true, true);
    y -= 8; strek(y); y -= 17;
    farge(0.1, 0.11, 0.13);
    tekst(V, "1", 10.5); tekst(V + 34, "Alles Klar, Lizenz für die gesamte Verwaltung, vier Jahre", 10.5, true);
    tekst(H, euro(k.fire), 10.5, true, true); y -= 14.5;
    farge(0.32, 0.35, 0.4);
    tekst(V + 34, "Grundlage: " + tall(k.innbyggere) + " Einwohner   ·   Laufzeit " + k.start + " bis " + k.slutt, 9.5);
    y -= 12; strek(y); y -= 18;
    farge(0.1, 0.11, 0.13);
    tekst(V + 34, "Gesamtbetrag netto", 10.5, true); tekst(H, euro(k.fire), 12, true, true); y -= 15;
    farge(0.32, 0.35, 0.4);
    tekst(V + 34, "entspricht " + euro(k.aar) + " pro Jahr, zzgl. gesetzlicher MwSt.", 9.5); y -= 30;

    farge(0.1, 0.11, 0.13);
    tekst(V, "Leistungsumfang", 11, true); y -= 17;
    [
      "Nutzung durch alle Beschäftigten der Verwaltung, auf beliebig vielen Rechnern.",
      "Alle Updates während der Laufzeit.",
      "Die Verarbeitung erfolgt ausschließlich auf Ihren eigenen Rechnern. Ihre Dokumente werden nicht an uns übertragen.",
      "Rechnung jährlich im Voraus über " + euro(k.aar) + ", auf Wunsch der Gesamtbetrag auf einmal. Zahlungsziel 30\u00a0Tage."
    ].forEach(function (p) {
      var l = brekk(p, 10, B - 14, false);
      for (var i = 0; i < l.length; i++) { if (!i) tekst(V, "•", 10); tekst(V + 14, l[i], 10); y -= 14; }
      y -= 3;
    });
    y -= 12;
    avsnitt("Für Rückfragen erreichen Sie uns unter " + k.epost + ". Zur Annahme genügt eine kurze E-Mail mit der Angebotsnummer und der Rechnungsanschrift.", 10.5, false, 16);
    avsnitt("Mit freundlichen Grüßen", 10.5, false, 4);
    avsnitt(k.underskrift, 10.5, true, 0);

    // Bunntekst
    y = 48;
    farge(0.55, 0.58, 0.62);
    tekst(V, "Erstellt auf " + k.nettside + ". Dieses Angebot ist ohne Unterschrift gültig.", 8);
    return lagPdf(s);
  }

  skjema.addEventListener("submit", function (e) {
    e.preventDefault();
    var navn = felt("ka-kommune").value.trim();
    var n = parseInt((felt("ke-innbyggere").value || "").replace(/[^0-9]/g, ""), 10);
    if (!n) { feil.textContent = "Bitte oben die Einwohnerzahl eingeben."; feil.hidden = false; felt("ke-innbyggere").focus(); return; }
    if (!navn) { feil.textContent = "Bitte den Namen der Kommune eingeben."; feil.hidden = false; felt("ka-kommune").focus(); return; }
    feil.hidden = true;

    var naa = new Date();
    var gyldig = new Date(naa); gyldig.setDate(gyldig.getDate() + 90);
    var slutt = new Date(naa); slutt.setFullYear(slutt.getFullYear() + 4); slutt.setDate(slutt.getDate() - 1);
    var fire = Math.round(pris(n) / 100) * 100;
    var stempel = naa.getFullYear() + ("0" + (naa.getMonth() + 1)).slice(-2) + ("0" + naa.getDate()).slice(-2);
    var mottaker = [navn];
    felt("ka-adresse").value.split(/\n|,/).forEach(function (l) { if (l.trim()) mottaker.push(l.trim()); });
    var person = felt("ka-person").value.trim();
    if (person) mottaker.push("z. Hd. " + person);
    var d = skjema.dataset;

    var blob = lagTilbud({
      selger: d.selger.split("|"),
      epost: d.epost,
      nettside: d.nettside,
      underskrift: d.underskrift,
      mottaker: mottaker,
      nummer: "AK-" + stempel + "-" + n,
      dato: dato(naa),
      gyldig: dato(gyldig),
      start: dato(naa),
      slutt: dato(slutt),
      innbyggere: n,
      fire: fire,
      aar: Math.round(fire / 4)
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Angebot-Alles-Klar-" + navn.replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, "-").replace(/^-+|-+$/g, "") + ".pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  });
})();
