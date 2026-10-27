// Kartet for /norge og /animasjon. Samme høstfarger som forsiden. Tallene kommer fra GET /chat/norge.
(function () {
  const HOST = {
    bunn: "#21160f", bolig: "#2b1d14", bygg: "#3a291e", vann: "#123048", elv: "#1b4766", park: "#c9971a", gress: "#8f7a22", eng: "#b98a1c",
    skog: ["#b3261e", "#d9541e", "#e8891c", "#c4410f", "#a8681a"], vatmark: "#4f5a2a", sand: "#6e5634", kirkegard: "#5b3a2a", bane: "#6f7f25",
    motorvei: "#b9874f", hoved: "#9c7a5a", sekundar: "#836a52", liten: "#5c4838", sti: "#4f3d2f", kant: "#140d08", jernbane: "#5f4838",
    tekst: "#f6e7d2", halo: "#1a110b",
  };
  const farg = (st) => {
    const skogF = ["match", ["%", ["coalesce", ["id"], ["to-number", ["get", "osm_id"], 0], 0], 5], 0, HOST.skog[0], 1, HOST.skog[1], 2, HOST.skog[2], 3, HOST.skog[3], HOST.skog[4]];
    for (const l of st.layers) {
      const id = l.id, p = l.paint || (l.paint = {});
      if (id === "background") p["background-color"] = HOST.bunn;
      else if (id === "natural_earth" || id === "building-3d" || id === "park_outline") l.layout = { ...(l.layout || {}), visibility: "none" };
      else if (id === "park") { p["fill-color"] = HOST.park; p["fill-opacity"] = .45; }
      else if (id === "landuse_residential") { p["fill-color"] = HOST.bolig; p["fill-opacity"] = 1; }
      else if (id === "landcover_wood") { p["fill-color"] = skogF; p["fill-opacity"] = ["interpolate", ["linear"], ["zoom"], 3, .74, 6, .5, 8.5, .34]; }
      else if (id === "landcover_grass") { p["fill-color"] = ["match", ["get", "subclass"], ["meadow", "grassland"], HOST.eng, HOST.gress]; p["fill-opacity"] = .55; }
      else if (id === "landcover_wetland") { p["fill-color"] = HOST.vatmark; p["fill-opacity"] = .6; }
      else if (id === "landcover_sand") p["fill-color"] = HOST.sand;
      else if (id === "landuse_cemetery") p["fill-color"] = HOST.kirkegard;
      else if (id === "landuse_pitch" || id === "landuse_track") p["fill-color"] = HOST.bane;
      else if (/^landuse_|^aeroway_fill/.test(id)) p["fill-color"] = HOST.bolig;
      else if (id === "water") p["fill-color"] = HOST.vann;
      else if (/^waterway/.test(id) && l.type === "line") p["line-color"] = HOST.elv;
      else if (id === "building") { p["fill-color"] = HOST.bygg; p["fill-outline-color"] = HOST.kant; }
      else if (l.type === "line" && /casing/.test(id)) p["line-color"] = HOST.kant;
      else if (l.type === "line" && /rail/.test(id)) p["line-color"] = HOST.jernbane;
      else if (l.type === "line" && /motorway/.test(id)) p["line-color"] = HOST.motorvei;
      else if (l.type === "line" && /trunk_primary/.test(id)) p["line-color"] = HOST.hoved;
      else if (l.type === "line" && /secondary_tertiary/.test(id)) p["line-color"] = HOST.sekundar;
      else if (l.type === "line" && /path|pedestrian|service_track/.test(id)) p["line-color"] = HOST.sti;
      else if (l.type === "line" && /minor|street|link/.test(id)) p["line-color"] = HOST.liten;
      else if (l.type === "line" && /boundary/.test(id)) p["line-color"] = "rgba(246,231,210,.25)";
      else if (l.type === "symbol") { if (p["text-color"] !== undefined || l.layout?.["text-field"]) { p["text-color"] = HOST.tekst; p["text-halo-color"] = HOST.halo; p["text-halo-width"] = 1.2; } if (/poi|shield|one_way/.test(id)) l.layout = { ...(l.layout || {}), visibility: "none" }; }
    }
    return st;
  };
  const OSM = { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] };
  const GLØD = ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 14, 5, 34];
  const RAD = ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 5.5, 5, 15];
  const FARGE = ["interpolate", ["linear"], ["get", "n"], 1, "#FFD23F", 6, "#FF6A3D", 18, "#BA0C2F"];
  const LAG = ["steder-glod", "steder-prikk", "steder-treff"];

  const nå = Date.now(), d = 864e5;
  const DEMO = {
    demo: true, totalt: 64,
    steder: [
      { by: "Oslo", region: "", kode: "NO", land: "Norge", lat: 59.91, lon: 10.75, n: 18, forst: nå - 20 * d, sist: nå - d },
      { by: "Bergen", region: "Vestland", kode: "NO", land: "Norge", lat: 60.39, lon: 5.32, n: 9, forst: nå - 16 * d, sist: nå - 2 * d },
      { by: "Trondheim", region: "Trøndelag", kode: "NO", land: "Norge", lat: 63.43, lon: 10.4, n: 7, forst: nå - 14 * d, sist: nå - 3 * d },
      { by: "Stavanger", region: "Rogaland", kode: "NO", land: "Norge", lat: 58.97, lon: 5.73, n: 6, forst: nå - 12 * d, sist: nå - 4 * d },
      { by: "Kristiansand", region: "Agder", kode: "NO", land: "Norge", lat: 58.15, lon: 8.0, n: 5, forst: nå - 11 * d, sist: nå - 5 * d },
      { by: "Tromsø", region: "Troms", kode: "NO", land: "Norge", lat: 69.65, lon: 18.96, n: 4, forst: nå - 9 * d, sist: nå - 6 * d },
      { by: "Ålesund", region: "Møre og Romsdal", kode: "NO", land: "Norge", lat: 62.47, lon: 6.15, n: 3, forst: nå - 8 * d, sist: nå - 2 * d },
      { by: "Drammen", region: "Buskerud", kode: "NO", land: "Norge", lat: 59.74, lon: 10.2, n: 3, forst: nå - 7 * d, sist: nå - d },
      { by: "Bodø", region: "Nordland", kode: "NO", land: "Norge", lat: 67.28, lon: 14.4, n: 2, forst: nå - 6 * d, sist: nå - 3 * d },
      { by: "Fredrikstad", region: "Østfold", kode: "NO", land: "Norge", lat: 59.22, lon: 10.93, n: 2, forst: nå - 5 * d, sist: nå - 2 * d },
      { by: "London", region: "", kode: "GB", land: "Storbritannia", lat: 51.51, lon: -0.13, n: 2, forst: nå - 4 * d, sist: nå - d },
      { by: "Stockholm", region: "", kode: "SE", land: "Sverige", lat: 59.33, lon: 18.07, n: 2, forst: nå - 3 * d, sist: nå - d },
      { by: "Lillestrøm", region: "Akershus", kode: "NO", land: "Norge", lat: 59.96, lon: 11.05, n: 1, forst: nå - 36e5, sist: nå - 36e5 },
    ],
  };
  DEMO.nyeste = DEMO.steder[DEMO.steder.length - 1];

  function marg() {
    const smal = matchMedia("(max-width: 720px)").matches;
    if (smal) return { top: 28, right: 24, bottom: Math.round(innerHeight * 0.5), left: 24 };
    return { top: 48, right: 56, bottom: 48, left: 420 };
  }

  function geo(steder) {
    return {
      type: "FeatureCollection",
      features: steder.map((s, i) => ({ type: "Feature", id: i, properties: { n: s.n, by: s.by, i }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })),
    };
  }

  async function hent() {
    const r = await fetch("/chat/norge", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (!j || !Array.isArray(j.steder)) throw new Error("svar");
    return j;
  }

  function kart(el) {
    const lov = window.maplibregl
      ? fetch("https://tiles.openfreemap.org/styles/liberty").then((r) => r.json()).then(farg).catch(() => OSM)
      : Promise.resolve(OSM);
    return lov.then((st) => new Promise((ok) => {
      const m = new maplibregl.Map({
        container: el, style: st, center: [10.8, 64.6], zoom: 3.7,
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        fadeDuration: 0, pixelRatio: Math.min(devicePixelRatio || 1, 2),
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        m.addSource("steder", { type: "geojson", data: geo([]) });
        m.addLayer({ id: "steder-glod", type: "circle", source: "steder", paint: { "circle-radius": GLØD, "circle-color": FARGE, "circle-opacity": .4, "circle-blur": .85 } });
        m.addLayer({ id: "steder-prikk", type: "circle", source: "steder", paint: { "circle-radius": RAD, "circle-color": FARGE, "circle-stroke-width": ["case", ["boolean", ["feature-state", "valgt"], false], 3.5, 2], "circle-stroke-color": "#fff8dc" } });
        m.addLayer({ id: "steder-treff", type: "circle", source: "steder", paint: { "circle-radius": 18, "circle-color": "#000", "circle-opacity": 0 } });
        el.classList.add("klar");
        ok(m);
      });
      addEventListener("resize", () => m.resize());
    }));
  }

  function tegn(m, steder) {
    const src = m.getSource("steder");
    if (src) src.setData(geo(steder));
  }

  function synlig(m, på) {
    for (const id of LAG) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", på ? "visible" : "none");
  }

  function merk(m, forrige, neste) {
    if (forrige != null) m.setFeatureState({ source: "steder", id: forrige }, { valgt: false });
    if (neste != null) m.setFeatureState({ source: "steder", id: neste }, { valgt: true });
  }

  function ramme(m, steder, anim) {
    const no = steder.filter((s) => s.kode === "NO");
    const bruk = no.length ? no : steder;
    const varighet = anim ? 900 : 0;
    if (!bruk.length) { m.jumpTo({ center: [10.8, 64.6], zoom: 3.7 }); return; }
    if (bruk.length === 1) { m.easeTo({ center: [bruk[0].lon, bruk[0].lat], zoom: 5.4, padding: marg(), duration: varighet }); return; }
    const b = new maplibregl.LngLatBounds();
    for (const s of bruk) b.extend([s.lon, s.lat]);
    m.fitBounds(b, { padding: marg(), maxZoom: 5.6, duration: varighet });
  }

  function fly(m, sted) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.flyTo({ center: [sted.lon, sted.lat], zoom: sted.kode === "NO" ? 7.3 : 4.4, padding: marg(), duration: still ? 0 : 1400, essential: true });
  }

  let merke = [];
  function puls(m, sted) {
    for (const x of merke) x.remove();
    const p = document.createElement("div");
    p.className = "puls";
    const f = document.createElement("div");
    f.className = "flagg";
    const b = document.createElement("b");
    b.textContent = sted.by;
    const n = document.createElement("span");
    n.textContent = String(sted.n);
    f.append(b, n);
    merke = [
      new maplibregl.Marker({ element: p, anchor: "center" }).setLngLat([sted.lon, sted.lat]).addTo(m),
      new maplibregl.Marker({ element: f, anchor: "bottom", offset: [0, -34] }).setLngLat([sted.lon, sted.lat]).addTo(m),
    ];
  }
  function rydd() { for (const x of merke) x.remove(); merke = []; }

  function klikk(m, fn) {
    m.on("click", "steder-treff", (e) => { const f = e.features && e.features[0]; if (f) fn(Number(f.id)); });
    m.on("mouseenter", "steder-treff", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "steder-treff", () => { m.getCanvas().style.cursor = ""; });
  }

  function undertekst(s) {
    if (s.kode !== "NO") return s.land || "";
    return s.region && s.region !== s.by ? s.region : "";
  }

  function oppsummer(steder) {
    const no = steder.filter((s) => s.kode === "NO").length, ut = steder.length - no;
    const ord = (n) => n === 1 ? "sted" : "steder";
    if (no && ut) return `${no} ${ord(no)} i Norge · ${ut} utenfor`;
    if (no) return `${no} ${ord(no)} i Norge`;
    if (ut) return `${ut} ${ord(ut)} utenfor`;
    return "";
  }

  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tall(el, n, rull) {
    const s = String(Math.max(0, n | 0));
    el.setAttribute("aria-label", s);
    if (!rull || still()) { el.classList.remove("od"); el.textContent = s; return; }
    el.textContent = "";
    el.classList.add("od");
    for (const ch of s) {
      const til = Number(ch), d = document.createElement("span"), r = document.createElement("span");
      d.className = "d"; r.className = "r";
      for (let i = 0; i <= til; i++) { const x = document.createElement("span"); x.textContent = String(i); r.append(x); }
      d.append(r); el.append(d);
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = `translateY(${-til}em)`; }));
    }
  }

  function liste(el, steder, rekkefolge, onVelg) {
    el.innerHTML = "";
    el.classList.remove("inn");
    rekkefolge.forEach((i, vis) => {
      const s = steder[i], b = document.createElement("button");
      b.type = "button"; b.className = "rad"; b.style.setProperty("--i", vis); b.dataset.i = String(i);
      const navn = document.createElement("span"); navn.className = "rad-n";
      const sterk = document.createElement("b"); sterk.textContent = s.by;
      const liten = document.createElement("small"); const u = undertekst(s); liten.textContent = u; liten.hidden = !u;
      navn.append(sterk, liten);
      const ant = document.createElement("span"); ant.className = "ant"; ant.textContent = "0";
      b.append(navn, ant);
      b.addEventListener("click", () => onVelg(i));
      el.append(b);
    });
    requestAnimationFrame(() => el.classList.add("inn"));
  }

  function merkRad(el, i) {
    for (const b of el.querySelectorAll(".rad")) b.classList.toggle("valgt", Number(b.dataset.i) === i);
    const valgt = el.querySelector(".rad.valgt");
    if (valgt) valgt.scrollIntoView({ block: "nearest" });
  }

  window.Norge = { DEMO, hent, kart, tegn, synlig, merk, ramme, fly, puls, rydd, klikk, oppsummer, tall, liste, merkRad, marg };
})();
