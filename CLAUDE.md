# esbjugconsult.com

Dette repoet er OFFENTLIG. Prosjektoversikt, regler for samarbeid mellom maskinene og alt som ikke hører hjemme offentlig står i `../CLAUDE.md` (det private repoet TidemannEsbjug/tidemann-esbjug, klonet én mappe opp).

- `git pull` før du begynner og før deploy. Deploy: `npx wrangler deploy` her.
- Etter hver endring i `index.html`: `python3 bygg-en.py`.
- `kunde/` skal aldri i git. Deploy fra en maskin uten `kunde/` fjerner kundeområdet fra nettet.
- Forsiden (`index.html`) er V1 (gul) igjen fra 9.10.2026, med bildet `media/tidemann.jpg` og hovedbudskapet i en snakkeboble. V2 (blå, rød og hvit, videohero) ligger på `/ny/` (`ny/index.html`, `python3 bygg-en.py ny`), med noindex fra `.worker/index.js`.
