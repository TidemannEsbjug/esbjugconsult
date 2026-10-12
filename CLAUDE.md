# esbjugconsult.com

Dette repoet er OFFENTLIG. Prosjektoversikt, regler for samarbeid mellom maskinene og alt som ikke hører hjemme offentlig står i `../CLAUDE.md` (det private repoet TidemannEsbjug/tidemann-esbjug, klonet én mappe opp).

- `git pull` før du begynner og før deploy. Deploy: `npx wrangler deploy` her.
- Etter hver endring i `index.html`: `python3 bygg-en.py`.
- `kunde/` skal aldri i git her. Kilden ligger i det private repoet, i `../kunde/`, og kopieres inn automatisk når du kjører `npx wrangler deploy` (se `../verktoy/kunde-sync.mjs`). Rediger der, ikke i `kunde/` her. Mangler det private repoet, stopper deployen.
- `/new/` (`new/index.html`) er arbeidskopien av byråsiden: vi selger nettsider med film og bilder laget med KI (Midjourney, Kling, Grok Imagine). Bare norsk, noindex, ikke lenket fra forsiden ennå. Eksempelet bruker filmen og bildene i `/vvskontakten/assets/` (jev-workeren); flyttes eller slettes de, må eksempelet få egne filer. Bakgrunnsfilmen er foreløpig `/media/hero.mp4` til den generelle KI-filmen er klar.
- Forsiden (`index.html`) er V2 (blå, rød og hvit, videohero) fra 7.10.2026. `/ny` sendes videre til `/` i `.worker/index.js`. V1 (gul) finnes i git-historikken.
- Ny Windows-PC som skal kunne publisere: kjør `powershell -ExecutionPolicy Bypass -File oppsett-windows.ps1`. Det installerer Node, kloner det private repoet til `%USERPROFILE%\Tidemann Esbjug` med dette repoet inni som `nettside\`, logger inn i wrangler og avslutter med en tørrkjøring. Det publiserer ikke. Jobb og publiser fra den nye mappa etterpå, ikke fra en løs klone av dette repoet.
