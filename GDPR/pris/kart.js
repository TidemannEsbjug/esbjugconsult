// Kartet i bookingen: MapLibre fra våre egne filer, og kartdata via vårt eget API (/klart/api/kart/…). Alt holder seg
// innenfor sikkerhetshodene på /klart/, og kundens adresse går aldri rett til en tredjepart. Lastes først når det trengs.
(function () {
  var HER = new URL("kart/", document.currentScript.src).href;
  var JS = HER + "maplibre-gl-csp.js";
  var ARBEIDER = HER + "maplibre-gl-csp-worker.js";

  // Sidene har Trusted Types på. Bare disse to filene kan lastes som skript.
  if (window.trustedTypes && !window.trustedTypes.defaultPolicy) {
    window.trustedTypes.createPolicy("default", {
      createScriptURL: function (u) {
        if (u === JS || u === ARBEIDER) return u;
        throw new TypeError("Ikke tillatt skript: " + u);
      },
    });
  }

  var FARGE = { land: "#eef3fb", skog: "#e1eaf3", is: "#ffffff", vann: "#b9d0f2", vei: "#ffffff", kant: "#d3deee", tekst: "#4d5b6c" };
  var API = location.origin + "/klart/api/kart/";
  var STIL = {
    version: 8,
    glyphs: API + "fonts/{fontstack}/{range}.pbf",
    sources: { om: { type: "vector", url: API + "planet" } },
    layers: [
      { id: "land", type: "background", paint: { "background-color": FARGE.land } },
      { id: "skog", type: "fill", source: "om", "source-layer": "landcover", filter: ["==", ["get", "class"], "wood"], paint: { "fill-color": FARGE.skog } },
      { id: "is", type: "fill", source: "om", "source-layer": "landcover", filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": FARGE.is } },
      { id: "vann", type: "fill", source: "om", "source-layer": "water", paint: { "fill-color": FARGE.vann } },
      { id: "bygg", type: "fill", source: "om", "source-layer": "building", minzoom: 13, paint: { "fill-color": FARGE.kant } },
      {
        id: "vei",
        type: "line",
        source: "om",
        "source-layer": "transportation",
        filter: ["!=", ["get", "class"], "ferry"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": FARGE.vei, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 1.5, 16, 7] },
      },
      {
        id: "steder",
        type: "symbol",
        source: "om",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village", "suburb"]]],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
        paint: { "text-color": FARGE.tekst, "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
      },
    ],
  };

  var lastet = null;
  function last() {
    if (lastet) return lastet;
    lastet = new Promise(function (ok, nei) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = HER + "maplibre-gl.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = JS;
      s.onload = function () {
        window.maplibregl.setWorkerUrl(ARBEIDER);
        ok(window.maplibregl);
      };
      s.onerror = nei;
      document.head.appendChild(s);
    });
    return lastet;
  }

  var kart = null;
  var nal = null;

  /** Tegner kartet i elementet første gang. Med lat og lon flyttes kartet dit og nålen settes. */
  function vis(el, lat, lon) {
    return last().then(function (gl) {
      if (!kart) {
        kart = new gl.Map({
          container: el,
          style: STIL,
          center: lon != null ? [lon, lat] : [13, 64.5],
          zoom: lon != null ? 13 : 3.4,
          attributionControl: false,
          interactive: false,
        });
      }
      if (lon == null) return;
      if (!nal) {
        var prikk = document.createElement("div");
        prikk.className = "book-nal";
        nal = new gl.Marker({ element: prikk }).setLngLat([lon, lat]).addTo(kart);
      } else {
        nal.setLngLat([lon, lat]);
      }
      kart.flyTo({ center: [lon, lat], zoom: 13, duration: 900 });
    });
  }

  function endreStorrelse() {
    if (kart) kart.resize();
  }

  window.KlartKart = { vis: vis, endreStorrelse: endreStorrelse };
})();
