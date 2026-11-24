# Utgavene uten egen kode i klart.js

Hver fil her (gb.js, fr.js, es.js, it.js, nl.js, pl.js) beskriver én utgave: adressen, navnet, lisensprefikset,
prisfilen (som siden og serveren deler) og alle tekstene kunden ser i fakturaen og lisens-e-posten, på utgavens
språk. Koden som bruker dem er `handleUtgave` i ../klart.js. Teksten til eieren (varselet og betalt-siden) er norsk
og står i klart.js.

API, likt for alle:
  POST /<sti>/api/order   { art, persons, sector, inhabitants, employees, name, email, address, reference, website }
                          → { ok, invoice, price, due, sent } eller { error }
  GET/POST /<sti>/api/paid?nr&t   eierens lenke: betalt → lisensnøkkelen sendes kunden.
  GET /<sti>/download/{mac,windows,linux,linux-arm}

Prisfilen eksporterer `price({ art, persons, sector, inhabitants, employees })` med art "business" | "municipal" |
"state" og gir `{ price, art, persons?, sector?, inhabitants?, fourYears?, employees? }` eller null.
Se gb.js for en fullstendig mal på engelsk.
