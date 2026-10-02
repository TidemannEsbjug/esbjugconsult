# esbjugconsult.com

Dette repoet er OFFENTLIG. Prosjektoversikt, regler for samarbeid mellom maskinene og alt som ikke hører hjemme offentlig står i `../CLAUDE.md` (det private repoet TidemannEsbjug/tidemann-esbjug, klonet én mappe opp).

- `git pull` før du begynner og før deploy. Deploy: `npx wrangler deploy` her.
- Etter hver endring i `index.html`: `python3 bygg-en.py`.
- `kunde/` skal aldri i git. Deploy fra en maskin uten `kunde/` fjerner kundeområdet fra nettet.
