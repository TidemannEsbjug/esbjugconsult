# esbjugconsult.com

Dette repoet er OFFENTLIG. Prosjektoversikt, regler for samarbeid mellom maskinene og alt som ikke hører hjemme offentlig står i `../CLAUDE.md` (det private repoet TidemannEsbjug/tidemann-esbjug, klonet én mappe opp).

- `git pull` før du begynner og før deploy. Deploy: `npx wrangler deploy` her.
- Etter hver endring i `index.html`: `python3 bygg-en.py`.
- `kunde/` skal aldri i git her. Kilden ligger i det private repoet, i `../kunde/`, og kopieres inn automatisk når du kjører `npx wrangler deploy` (se `../verktoy/kunde-sync.mjs`). Rediger der, ikke i `kunde/` her. Mangler det private repoet, stopper deployen.
- `/new/` (`new/index.html`) is the working copy of the agency site: Esbjug Consult is now a website agency. English only, noindex, not linked from the front page yet. The example uses the video and images in `/vvskontakten/assets/` (the jev Worker); if they move or are deleted, the example needs its own files. The photos in `new/media/` are Midjourney images based on the real workspace (Make Space, Koh Phangan): bright, sea view, no people. Each has a full-size file and an `-800` version. The hero is a photo for now; a video (Midjourney → Grok Imagine) may replace it later.
- Forsiden (`index.html`) er V2 (blå, rød og hvit, videohero) fra 7.10.2026. `/ny` sendes videre til `/` i `.worker/index.js`. V1 (gul) finnes i git-historikken.
- Ny Windows-PC som skal kunne publisere: kjør `powershell -ExecutionPolicy Bypass -File oppsett-windows.ps1`. Det installerer Node, kloner det private repoet til `%USERPROFILE%\Tidemann Esbjug` med dette repoet inni som `nettside\`, logger inn i wrangler og avslutter med en tørrkjøring. Det publiserer ikke. Jobb og publiser fra den nye mappa etterpå, ikke fra en løs klone av dette repoet.
