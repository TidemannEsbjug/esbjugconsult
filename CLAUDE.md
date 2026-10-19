# esbjugconsult.com

Dette repoet er OFFENTLIG. Prosjektoversikt, regler for samarbeid mellom maskinene og alt som ikke hører hjemme offentlig står i `../CLAUDE.md` (det private repoet TidemannEsbjug/tidemann-esbjug, klonet én mappe opp).

- `git pull` før du begynner og før deploy. Deploy: `npx wrangler deploy` her.
- `bygg-en.py` hørte til den norske V2-forsiden. Ikke kjør den på dagens engelske forside.
- `kunde/` skal aldri i git her. Kilden ligger i det private repoet, i `../kunde/`, og kopieres inn automatisk når du kjører `npx wrangler deploy` (se `../verktoy/kunde-sync.mjs`). Rediger der, ikke i `kunde/` her. Mangler det private repoet, stopper deployen.
- `/new/` (`new/index.html`) er fra 19.10.2026 den norske forsiden slik den var før 18.10 (`814f178^:index.html`, V2 med alt om hva jeg jobber med), uten språkbryter og med noindex. `new/media/` brukes fortsatt av forsiden (hero-wide), så den skal ikke slettes. Den engelske byråsiden som lå på /new/ ligger i git-historikken (`2f15d76:new/index.html`).
- Forsiden (`index.html`) er fra 18.10.2026 heroen og menyen fra `/new/`, fulgt av dronevideoen over hele skjermen med «Under Construction». Alle menylenker og knapper går til `#uc`. Engelsk, så `/en/` og `/ny` sendes til `/` i `.worker/index.js`. V2 (blå/rød/hvit, norsk) og V1 (gul) finnes i git-historikken.
- Ny Windows-PC som skal kunne publisere: kjør `powershell -ExecutionPolicy Bypass -File oppsett-windows.ps1`. Det installerer Node, kloner det private repoet til `%USERPROFILE%\Tidemann Esbjug` med dette repoet inni som `nettside\`, logger inn i wrangler og avslutter med en tørrkjøring. Det publiserer ikke. Jobb og publiser fra den nye mappa etterpå, ikke fra en løs klone av dette repoet.
