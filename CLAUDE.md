# esbjugconsult.com

Dette repoet er OFFENTLIG. Prosjektoversikt, regler for samarbeid mellom maskinene og alt som ikke hører hjemme offentlig står i `../CLAUDE.md` (det private repoet TidemannEsbjug/tidemann-esbjug, klonet én mappe opp).

- `git pull` før du begynner og før deploy. Deploy: `npx wrangler deploy` her.
- Etter hver endring i `index.html`: `python3 bygg-en.py`.
- `kunde/` skal aldri i git her. Kilden ligger i det private repoet, i `../kunde/`, og kopieres inn automatisk når du kjører `npx wrangler deploy` (se `../verktoy/kunde-sync.mjs`). Rediger der, ikke i `kunde/` her. Mangler det private repoet, stopper deployen.
- `/new/` (`new/index.html`) is the light, traditional agency page with the tropical office as hero (photos of the real workspace, Make Space on Koh Phangan, made with Midjourney, in `new/media/`). English only, noindex. Its plumbing example uses `/vvskontakten/assets/` (the jev Worker). The pulse (heart and number in the chat header), the chat, the cookie banner and the hidden visitor counters are copied from `en/index.html` (CSS, HTML and the second `<script>`); change them on the front page first, then copy over. "Chat with us" in the contact box opens the chat (`.aapne-chat`). This is the version to keep working on; the fantasy.co attempt (730c67d) and the front-page copy with an agency hero (2fc8f90) are only in git history. `/new2/` is gone.
- Forsiden (`index.html`) er V2 (blå, rød og hvit, videohero) fra 7.10.2026. `/ny` sendes videre til `/` i `.worker/index.js`. V1 (gul) finnes i git-historikken.
- Ny Windows-PC som skal kunne publisere: kjør `powershell -ExecutionPolicy Bypass -File oppsett-windows.ps1`. Det installerer Node, kloner det private repoet til `%USERPROFILE%\Tidemann Esbjug` med dette repoet inni som `nettside\`, logger inn i wrangler og avslutter med en tørrkjøring. Det publiserer ikke. Jobb og publiser fra den nye mappa etterpå, ikke fra en løs klone av dette repoet.
