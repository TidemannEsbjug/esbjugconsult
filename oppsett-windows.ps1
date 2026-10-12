# Setter opp en Windows-PC slik at den kan publisere esbjugconsult.com.
# Kjor i PowerShell:  powershell -ExecutionPolicy Bypass -File oppsett-windows.ps1
# Skriptet publiserer ingenting. Det avslutter med en torrkjoring som viser om alt er paa plass.
#
# Oppsettet som trengs (se CLAUDE.md): det private repoet tidemann-esbjug som rotmappe, og dette
# repoet (esbjugconsult) klonet inn i det som nettside\. Deployen henter kundesidene fra rotmappa.
$ErrorActionPreference = "Stop"
$rot = Join-Path $HOME "Tidemann Esbjug"

function Finnes($navn) { [bool](Get-Command $navn -ErrorAction SilentlyContinue) }
function Oppdater-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }

Write-Host "1/5 Node"
if (-not (Finnes node)) {
  if (-not (Finnes winget)) { throw "Fant verken node eller winget. Installer Node LTS fra https://nodejs.org og kjor skriptet paa nytt." }
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  Oppdater-Path
}
if (-not (Finnes node)) { throw "Node ble installert, men finnes ikke i PATH ennaa. Lukk PowerShell, aapne paa nytt og kjor skriptet igjen." }
Write-Host ("    node " + (node --version))

Write-Host "2/5 Git"
if (-not (Finnes git)) { throw "Git mangler. Installer med: winget install --id Git.Git -e" }

Write-Host "3/5 Det private repoet (rotmappa)"
if (-not (Test-Path (Join-Path $rot ".git"))) {
  # Git spor om innlogging i nettleseren hvis PC-en ikke har tilgang til det private repoet fra for.
  git clone https://github.com/TidemannEsbjug/tidemann-esbjug.git $rot
  if ($LASTEXITCODE -ne 0) { throw "Fikk ikke klonet det private repoet. Logg inn paa GitHub med en konto som har tilgang, og kjor paa nytt." }
} else {
  git -C $rot pull --ff-only
}
if (-not (Test-Path (Join-Path $rot "kunde"))) { throw "Rotmappa mangler kunde\. Sjekk at $rot er repoet tidemann-esbjug." }

Write-Host "4/5 Nettsiden (nettside\)"
$nett = Join-Path $rot "nettside"
if (-not (Test-Path (Join-Path $nett ".git"))) {
  git clone https://github.com/TidemannEsbjug/esbjugconsult.git $nett
  if ($LASTEXITCODE -ne 0) { throw "Fikk ikke klonet esbjugconsult." }
} else {
  git -C $nett pull --ff-only
}

Write-Host "5/5 Cloudflare"
Set-Location $nett
# wrangler skriver til stderr ogsaa naar alt er i orden; da skal ikke skriptet stoppe.
$ErrorActionPreference = "Continue"
npx --yes wrangler whoami 2>&1 | Out-String | Tee-Object -Variable hvem | Out-Null
if ($hvem -notmatch "@") {
  Write-Host "    Ikke logget inn. Nettleseren aapnes: logg inn paa Cloudflare-kontoen som eier esbjugconsult.com og godkjenn."
  npx --yes wrangler login
}

Write-Host ""
Write-Host "Torrkjoring (publiserer ingenting):"
npx --yes wrangler deploy --dry-run
if ($LASTEXITCODE -ne 0) { throw "Torrkjoringen feilet. Se meldingen over." }
Write-Host ""
Write-Host "Ferdig. Jobb og publiser herfra:  $nett"
Write-Host "Publisering:  git pull  (i baade $rot og $nett), saa  npx wrangler deploy"
