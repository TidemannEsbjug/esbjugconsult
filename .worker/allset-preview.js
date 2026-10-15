// AllSet preview: read the client's public site and pour it into our own template.
// extractSite() fetches one page (plus up to two stylesheets for colours) and pulls out title, text, images,
// logo and colours with HTMLRewriter. layout() decides which image goes where; render() writes the HTML.
// Everything taken from the client's site is escaped on the way out, and the page is served with a CSP that
// allows no script at all (see servePreview in allset.js).

const UA = "AllSetPreview/1.0 (+https://esbjugconsult.com/allset/)";
const MAX_HTML = 1_500_000;
const MAX_CSS = 300_000;

// Only public web hosts: no IP literals, localhost or internal names, and not this site itself.
export function publicHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h.includes(".") || h.startsWith("[") || /^[\d.]+$/.test(h)) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(h)) return false;
  return !/(^|\.)esbjugconsult\.com$/.test(h);
}

// "example.com" or "https://example.com/x" → "https://example.com/x", or "" when it is not a usable address.
export function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s || s.length > 500) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || u.port || !publicHost(u.hostname)) return "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

// GET with redirects followed by hand, so every hop is checked; the body is cut at `max` bytes.
async function safeGet(url, max, accept) {
  let target = url;
  for (let hop = 0; hop < 5; hop++) {
    const u = new URL(target);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.port || !publicHost(u.hostname)) throw new Error("blocked address");
    const res = await fetch(target, { redirect: "manual", headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("Location")) {
      target = new URL(res.headers.get("Location"), target).toString();
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`site answered ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = "", n = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      text += dec.decode(value, { stream: true });
      if (n >= max) { await reader.cancel(); break; }
    }
    return { url: target, text, type: res.headers.get("Content-Type") || "" };
  }
  throw new Error("too many redirects");
}

// HTMLRewriter hands over text and attributes as written in the source, entities included.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", copy: "©" };
const decode = (s) => String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; }
  return ENT[e.toLowerCase()] ?? m;
});
const tidy = (s) => decode(s).replace(/\s+/g, " ").trim();
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Text of an element, delivered when its end tag arrives.
function collect(done) {
  let buf = null;
  return {
    element(el) { buf = ""; try { el.onEndTag(() => { done(tidy(buf)); buf = null; }); } catch { buf = null; } },
    text(t) { if (buf !== null) buf += t.text; },
  };
}

export async function extractSite(siteUrl) {
  const page = await safeGet(siteUrl, MAX_HTML, "text/html,application/xhtml+xml");
  if (!/html/i.test(page.type)) throw new Error("not an HTML page");
  const base = page.url;
  const abs = (v) => { try { const u = new URL(decode(v).trim(), base); return u.protocol === "https:" ? u.toString() : ""; } catch { return ""; } };
  const s = { url: base, host: new URL(base).hostname.replace(/^www\./, ""), title: "", desc: "", ogTitle: "", ogImage: "", siteName: "", themeColor: "", logo: "", icon: "", flow: [], images: [], css: "", sheets: [] };
  const meta = (key) => ({ element(el) { if (!s[key]) s[key] = tidy(el.getAttribute("content")); } });

  await new HTMLRewriter()
    .on("title", collect((t) => { if (!s.title) s.title = t; }))
    .on('meta[name="description"]', meta("desc"))
    .on('meta[property="og:title"]', meta("ogTitle"))
    .on('meta[property="og:site_name"]', meta("siteName"))
    .on('meta[name="theme-color"]', meta("themeColor"))
    .on('meta[property="og:image"]', { element(el) { if (!s.ogImage) s.ogImage = abs(el.getAttribute("content") || ""); } })
    .on('link[rel="apple-touch-icon"], link[rel~="icon"]', { element(el) { const h = abs(el.getAttribute("href") || ""); if (h && (!s.icon || /apple/.test(el.getAttribute("rel")))) s.icon = h; } })
    .on('link[rel="stylesheet"]', { element(el) { const h = abs(el.getAttribute("href") || ""); if (h && s.sheets.length < 2) s.sheets.push(h); } })
    .on("style", { text(t) { if (s.css.length < MAX_CSS) s.css += t.text; } })
    .on("[style]", { element(el) { if (s.css.length < MAX_CSS) s.css += ";" + el.getAttribute("style"); } })
    .on("h1", collect((t) => t && s.flow.push({ h: 1, t })))
    .on("h2, h3", collect((t) => t && s.flow.push({ h: 2, t })))
    .on("p, li", collect((t) => t && s.flow.push({ p: t })))
    .on("img", { element(el) {
      const set = el.getAttribute("srcset") || el.getAttribute("data-srcset") || "";
      const src = abs(el.getAttribute("data-src") || el.getAttribute("src") || set.split(",")[0].trim().split(/\s+/)[0] || "");
      if (!src) return;
      const alt = tidy(el.getAttribute("alt"));
      const hint = [el.getAttribute("class"), el.getAttribute("id"), alt, src].join(" ");
      if (!s.logo && /logo/i.test(hint)) { s.logo = src; return; }
      const w = +el.getAttribute("width") || 0, h = +el.getAttribute("height") || 0;
      if ((w && w < 120) || (h && h < 80)) return;
      if (/\.(svg|gif)(\?|$)|data:|pixel|spacer|blank|1x1|sprite|icon|favicon|badge|avatar|logo/i.test(src)) return;
      if (s.images.length < 16 && !s.images.some((i) => i.src === src)) s.images.push({ src, alt });
    } })
    .transform(new Response(page.text, { headers: { "Content-Type": "text/html" } }))
    .arrayBuffer();

  for (const sheet of s.sheets) {
    try { s.css += (await safeGet(sheet, MAX_CSS, "text/css")).text; } catch {}
  }
  return digest(s);
}

// Raw findings → what the template needs.
function digest(s) {
  const junk = /cookie|javascript|browser|©|all rights reserved|privacy policy|skip to/i;
  const h1 = s.flow.find((x) => x.h === 1)?.t;
  const brand = (s.siteName || s.title.split(/\s[|–—·-]\s/)[0] || s.host).slice(0, 60);
  const seen = new Set();
  const sections = [];
  let cur = { title: "", paras: [] };
  for (const x of s.flow) {
    if (x.h === 2) {
      if (cur.paras.length) sections.push(cur);
      cur = { title: x.t.slice(0, 90), paras: [] };
    } else if (x.p && x.p.length >= 40 && !junk.test(x.p) && !seen.has(x.p) && cur.paras.length < 3) {
      seen.add(x.p);
      cur.paras.push(x.p.length > 600 ? x.p.slice(0, 597) + "…" : x.p);
    }
  }
  if (cur.paras.length) sections.push(cur);
  const firstPara = sections[0]?.paras[0] || "";
  return {
    url: s.url,
    host: s.host,
    brand,
    headline: (h1 || s.ogTitle || s.title || brand).slice(0, 120),
    tagline: (s.desc || firstPara).slice(0, 240),
    sections: sections.slice(0, 6),
    images: s.images,
    ogImage: s.ogImage,
    logo: s.logo || s.icon,
    colors: palette(s.themeColor + ";" + s.css, s.themeColor),
  };
}

// The two most used colourful colours in the site's CSS (theme-color counts extra). Greys, near-white and
// near-black are skipped, and the accent has to differ clearly from the main colour.
function palette(css, theme) {
  const count = new Map();
  const add = (hex, w = 1) => count.set(hex, (count.get(hex) || 0) + w);
  const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const v = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    add("#" + v.toLowerCase());
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)) add(toHex(+m[1], +m[2], +m[3]));
  const t = /^#[0-9a-f]{6}$/i.test(theme) ? theme.toLowerCase() : "";
  if (t) add(t, 10);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const colourful = (h) => { const [r, g, b] = rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx - mn > 40 && mx > 40 && mn < 230; };
  const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const ranked = [...count].filter(([h]) => colourful(h)).sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const primary = ranked[0] || "#00205b";
  const accent = ranked.find((h) => dist(h, primary) > 120) || (primary === "#ba0c2f" ? "#00205b" : "#ba0c2f");
  return { primary, accent };
}

const onColour = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
};

// Which image goes where. Slots nobody could fill are listed in `missing` for generateImages().
export function layout(site) {
  const pool = site.images.map((i) => ({ src: i.src, alt: i.alt }));
  const hero = site.ogImage ? { src: site.ogImage, alt: "" } : pool.shift() || null;
  if (hero) for (let i = pool.length - 1; i >= 0; i--) if (pool[i].src === hero.src) pool.splice(i, 1);
  const sectionImages = site.sections.map(() => pool.shift() || null);
  const plan = { hero, sectionImages, gallery: pool.slice(0, 6), missing: [] };
  if (!hero) plan.missing.push("hero");
  sectionImages.forEach((img, i) => { if (!img) plan.missing.push(`section-${i}`); });
  return plan;
}

// Put images from generateImages() into their slots.
export function fill(plan, generated) {
  for (const g of generated || []) {
    if (!g?.url) continue;
    const img = { src: g.url, alt: g.alt || "" };
    if (g.slot === "hero") plan.hero = img;
    const m = /^section-(\d+)$/.exec(g.slot || "");
    if (m && +m[1] < plan.sectionImages.length) plan.sectionImages[+m[1]] = img;
  }
  return plan;
}

export function render(site, plan) {
  const { primary, accent } = site.colors;
  const img = (i, cls = "") => (i ? `<img class="${cls}" src="${esc(i.src)}" alt="${esc(i.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : "");
  const nav = site.sections.filter((x) => x.title).slice(0, 4).map((x) => `<a href="#s${site.sections.indexOf(x)}">${esc(x.title)}</a>`).join("");
  const sections = site.sections.map((x, i) => `
<section id="s${i}" class="split${i % 2 ? " flip" : ""}${plan.sectionImages[i] ? "" : " solo"}"><div class="w">
  <div class="txt">${x.title ? `<h2>${esc(x.title)}</h2>` : ""}${x.paras.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
  ${plan.sectionImages[i] ? `<figure>${img(plan.sectionImages[i])}</figure>` : ""}
</div></section>`).join("");
  const gallery = plan.gallery.length ? `<section class="gal"><div class="w"><div class="grid">${plan.gallery.map((g) => `<figure>${img(g)}</figure>`).join("")}</div></div></section>` : "";
  const logo = site.logo ? `<img src="${esc(site.logo)}" alt="${esc(site.brand)}" referrerpolicy="no-referrer">` : esc(site.brand);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(site.brand)} · AllSet preview</title>
<style>
:root{--p:${primary};--a:${accent};--on-p:${onColour(primary)};--on-a:${onColour(accent)};--g:clamp(16px,6vw,88px)}
*{box-sizing:border-box}html,body{margin:0}
body{font:400 17px/1.6 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#1a1a1a;background:#fff;-webkit-font-smoothing:antialiased}
.w{max-width:1160px;margin:0 auto;padding:0 var(--g)}
h1,h2{font-family:Georgia,"Times New Roman",serif;letter-spacing:-.02em;line-height:1.05;margin:0}
.bar{background:#111;color:#fff;font:600 13px/1.4 ui-monospace,Menlo,monospace;text-align:center;padding:8px 16px}
.bar a{color:#fff}
.top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #eee}
.top .w{display:flex;align-items:center;gap:24px;min-height:72px}
.brand{font:700 1.3rem/1 Georgia,serif;color:var(--p);text-decoration:none;margin-right:auto}
.brand img{display:block;max-height:44px;max-width:180px;object-fit:contain}
.top nav{display:flex;gap:20px;flex-wrap:wrap}.top nav a{color:#333;text-decoration:none;font-weight:600;font-size:.95rem}
.cta{display:inline-block;background:var(--a);color:var(--on-a);text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px}
.hero{position:relative;background:var(--p);color:var(--on-p);overflow:hidden}
.hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero.ph::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.65),rgba(0,0,0,.15))}
.hero .w{position:relative;z-index:1;padding-top:clamp(80px,14vw,180px);padding-bottom:clamp(80px,14vw,180px)}
.hero.ph .w{color:#fff}
.hero h1{font-size:clamp(2.4rem,6vw,4.6rem);max-width:16ch}
.hero p{font-size:clamp(1.1rem,1.8vw,1.35rem);max-width:36em;margin:22px 0 30px;opacity:.92}
.split{padding:clamp(56px,8vw,104px) 0}
.split .w{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,72px);align-items:center}
.split.flip figure{order:-1}.split.solo .w{grid-template-columns:minmax(0,46em)}
.split:nth-of-type(even){background:#f6f6f4}
.split h2{font-size:clamp(1.8rem,3.6vw,2.8rem);color:var(--p);margin-bottom:18px}
.split p{margin:0 0 14px}
figure{margin:0}figure img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:18px}
.gal{padding:0 0 clamp(56px,8vw,104px)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.contact{background:var(--p);color:var(--on-p);padding:clamp(64px,9vw,120px) 0}
.contact h2{font-size:clamp(2rem,4.4vw,3.2rem);margin-bottom:24px}
footer{padding:28px 0;font-size:.9rem;color:#666}
@media (max-width:760px){.split .w{grid-template-columns:1fr}.split.flip figure{order:0}.top nav{display:none}}
</style>
</head>
<body>
<div class="bar">Preview by <a href="/allset/" target="_top">AllSet</a>, rebuilt from ${esc(site.host)}. Not live.</div>
<header class="top"><div class="w"><a class="brand" href="#">${logo}</a><nav>${nav}</nav><a class="cta" href="#contact">Contact</a></div></header>
<section class="hero${plan.hero ? " ph" : ""}">${plan.hero ? img(plan.hero) : ""}<div class="w">
  <h1>${esc(site.headline)}</h1>${site.tagline ? `<p>${esc(site.tagline)}</p>` : ""}<a class="cta" href="#contact">Get in touch</a>
</div></section>
${sections}
${gallery}
<section class="contact" id="contact"><div class="w"><h2>Let's talk.</h2><p>${esc(site.brand)} · ${esc(site.host)}</p></div></section>
<footer><div class="w">${esc(site.brand)} · Preview made by AllSet from your current site's text, photos and colours.</div></footer>
</body>
</html>`;
}
