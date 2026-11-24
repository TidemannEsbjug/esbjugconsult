# Brief: add the Windows and Linux downloads to one edition's site (24.11.2026)

The five sites (cest-clair/, clarisimo/, chiarissimo/, klip-en-klaar/, wszystko-jasne/) were built this morning when
only a Mac build existed, so they offer Mac only and say "Windows and Linux are coming". Signed Windows installers
and Linux .deb packages (amd64 + arm64) now exist and are in R2. The download routes already work:
`/<sti>/download/windows`, `/<sti>/download/linux` (amd64), `/<sti>/download/linux-arm` (arm64) —
`.worker/utgaver/<kode>.js` lists them. Do not edit `.worker/`, other sites, or anything outside your folder.
Do not commit, push, deploy or start servers.

Repo: `~/Desktop/Tidemann Esbjug/nettside-utgaver`. Model: `alles-klar/` (the German site has all three systems).

Do, in your edition's language and wording style already on your site:
1. Front page (index.html + forside.js): bring back the Windows and Linux buttons exactly as alles-klar has them
   (hero download card, the second download block near the bottom, the mobile text, the Linux terminal hover if
   your agent removed it, the arm64 link). Remove every "Windows/Linux coming" sentence.
2. Machine check (videre.js): if your site rewrites the shared machine-check answers to say PCs are "coming",
   drop that so Windows and Linux answers say supported, still translated into your language.
3. IT page: restore the Windows (PowerShell) and Linux blocks the model has, adapted to your edition's names
   (installer name, program name, install folder, firewall rule name, Debian package name, binary). Read them from
   the edition tree `/Volumes/Avia SSD/Klart-<kode>` (src-tauri/tauri.<kode>.conf.json, windows/brannmur-<kode>.nsh,
   Cargo/package names) — do not guess. Put all four checksums in the checksum list (below). Remove "coming" lines.
4. Pricing page, terms, FAQ, anywhere else: remove "Mac only / Windows and Linux coming" wording.
5. Leave the HTML comments explaining the change short and in Norwegian like the rest.

Facts per edition (Debian package name = program name; maintainer ESBJUG CONSULT; Windows installers are signed by
ESBJUG CONSULT; download file names are what the browser saves):

| kode | sti | Windows file saved as | Debian package | Windows note |
|---|---|---|---|---|
| fr | cest-clair | C'est Clair.exe | cestclair | installed product name is «C’est Clair» with a typographic apostrophe |
| es | clarisimo | Clarísimo.exe | clarisimo | |
| it | chiarissimo | Chiarissimo.exe | chiarissimo | |
| nl | klip-en-klaar | Klip en Klaar.exe | klipenklaar | |
| pl | wszystko-jasne | Wszystko Jasne.exe | wszystkojasne | |

SHA-256 (from /Volumes/Avia SSD/Klart-utgivelse/{mac,windows,linux}-<kode>-2026-11-24/SHA256.txt — read the file
for your edition and copy exactly; Mac is already on the page).

Done means: no "coming"/"only Mac" wording left (grep your language's words), every new link points to
`/<sti>/download/{windows,linux,linux-arm}`, `node --check` passes on changed .js. Report in under 150 words: files
changed, anything you could not confirm.
