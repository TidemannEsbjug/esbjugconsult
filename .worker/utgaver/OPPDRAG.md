# Brief: build the website for one Klart edition (24.11.2026)

The owner asked for websites for every edition. Live today: /klart/ (Norwegian, folder GDPR/), /alles-klar/
(German, folder alles-klar/) and /frostcopy/ (US English, folder frostcopy/). You build ONE new edition's site.

Repo: `~/Desktop/Tidemann Esbjug/nettside-utgaver` (git worktree, branch `utgaver`; a Cloudflare Worker serves
the folder statically). Work ONLY in your edition's folder and in `.worker/utgaver/<kode>.js`. Do not touch
other folders, `.worker/klart.js`, `.worker/index.js`, `wrangler.jsonc`. Do not commit, push or deploy; the
lead does that. Do not start dev servers or heavy processes (the machine has 8 GB RAM); `node --check` is fine.

## What to build

Copy the model site into your folder and turn every visible word into your edition's language and market:
- EU editions: model is `alles-klar/` (German). UK: model is `frostcopy/` (US English).
- Pages: the front page (index.html), the "what it catches" page, the "for IT" page, the program-window
  preview (programvindu.html + forhandsvisning.js strings), pricing with the order form, terms, privacy, and
  an activation page at `<sti>/<aktivering>/index.html` (model: alles-klar/aktiver/). Name the sub-folders
  and pages in your language (e.g. `prix/`, `conditions/`), and make every internal link point inside
  your folder. Drop German-only pages (test.html, kommer-snart.*) unless your site needs them.
- Assets: do NOT copy `alles-klar/assets/` (21 MB). Point images at `/alles-klar/assets/...` (or
  `/frostcopy/assets/...` for UK). Exception: the app icon — use your edition's own icon from its tree
  (`src-tauri/icons/`), copied into your folder. If the hero film (`assets/film`) shows German text, leave it
  out for your edition. Fonts: copy the small `fonts/` folder and `fonts.css`.
- Keep the visual style exactly (same CSS); change words, not design. Keep `<meta name="robots" content="noindex">`.
  No slogans of the form "Not X, but Y" / "Do X. Not Y."
- Downloads: `/<sti>/download/mac`, `/windows`, `/linux`, `/linux-arm`. Only link what exists in your
  config's `filer` (see below). Editions with only a Mac build: show Mac as the download, and say plainly in
  your language that Windows and Linux are coming (no dead links, no greyed-out buttons). The Mac builds of
  FR/ES/IT/NL/PL are first builds; do not call them "beta" or "test" on the page, just offer them.
- Ordering: the pricing page shows the price as people type (never the formula), with three buyer types:
  business (people + sector), municipality (population; the price curve gives a 4-year total, invoiced a
  quarter per year), and state body (staff). It POSTs JSON to `/<sti>/api/order` with exactly these keys:
  `{ art: "business"|"municipal"|"state", persons, sector, inhabitants, employees, name, email, address,
  reference, website }` (`website` is the hidden honeypot) and gets `{ ok, invoice, price, due, sent }` or
  `{ error }`. Adapt `alles-klar/pris/bestellung.js` + `preis.js`; drop the PDF quote (`angebot.js`) and
  `kommune-eur.js` unless you adapt them fully. Invoice payment, key after payment, 30 days.
- Price module `<sti>/<prisSti>/price.js` (shared by page and server): export
  `price({ art, persons, sector, inhabitants, employees })` → `{ price, art, persons?, sector?, inhabitants?,
  fourYears?, employees? }` or null, `sector` being the sector's display name. Start from
  `alles-klar/pris/preis.js`: same business curve and sector shares (sector names translated), municipal and
  state curves fitted to your country's direct-award thresholds from the edition's research (see below) so a
  public buyer never lands above what it may buy without a tender. Currency: EUR, except PL in złoty (convert
  at ~4.3 zł/€, rounded to nice numbers) and UK in pounds (~0.85 £/€). Write your choices as a comment at the
  top of price.js; the owner has not set these prices.
- Worker config `.worker/utgaver/<kode>.js`: copy `.worker/utgaver/gb.js` (the English model), keep every key,
  translate every customer-facing text, set `sti`, `alias` (other spellings people might type, lowercase,
  e.g. without hyphens/accents), `aktivering`, `prisSti`, `navn`, `avsender` (email `<ascii-name>@esbjugconsult.com`),
  `prefiks`, `nrPrefiks`, `lisensfil`, `penger`, `dato`, `filer`, VAT line (reverse charge wording usual in
  your country), bank lines (same account). Owner-facing Norwegian text lives in klart.js; ignore it.

## Facts you must take from the edition itself (do not invent)

- Name, main verb, licence prefix, licence-file extension, the words on the app's buttons (Licence, Activate,
  Share with colleagues, trial label, the clean / restore / hide / keep actions): read the edition's tree,
  `src/ui/*.tsx` (texts are in `nd(no, de, us, gb?, fr(…), es(…), ita(…), nld(…)/pol(…))`) and
  `src-tauri/src/aktivering.rs`. The activation path the app opens is in `lisens_apne_side` in aktivering.rs.
- What it catches: the identifiers and categories in the edition's engine (`src/engine/<lang>/`) and research
  notes (`/Volumes/Avia SSD/Klart-<kode>-grunnlag/research/`, especially the identifiers and law files).
- Terms and privacy: use the edition's own terms text from `src/ui/vilkar.tsx` (VilkårTekst<Xx>), so the site
  says what the app says. Law and courts as stated there.
- Leak percentages: only numbers measured for your edition that are written in the groundwork (`maaling/`);
  if unsure, leave numbers out rather than borrowing German or US ones.
- Remove everything German/US-specific (DSGVO, Bund/Land, Landkreis, US states, HIPAA…) and replace with your
  country's equivalents where the page needs them.

## Done means

All pages in your folder, every link resolving inside your folder or to the shared assets, no German (or US)
words left (grep for them), `node --check` passes on every .js you wrote, and `.worker/utgaver/<kode>.js` imports
your price.js with a correct relative path. Report back: the folder's page list with their URLs, your price
choices (curves and why), anything you could not confirm, and any app wording you were unsure of. Keep the
report under 300 words.
