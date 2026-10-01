#!/usr/bin/env python3
"""Lager den engelske siden (en/index.html) fra den norske (index.html).

Hver norsk tekst byttes mot sin engelske oversettelse. Finnes ikke en norsk tekst lenger (fordi den er
endret på den norske siden), stopper skriptet og sier hvilken, så oversettelsen kan oppdateres.
Kjør etter endringer i index.html:  python3 bygg-en.py  (og publiser med npx wrangler deploy).
"""
import pathlib, re, sys

HER = pathlib.Path(__file__).parent
no = (HER / "index.html").read_text()

# (norsk, engelsk). Rekkefølgen betyr noe der en tekst er en del av en annen: lange først.
T = [
    # --- hode ---
    ('<html lang="nb">', '<html lang="en">'),
    ('<title>Esbjug Consult</title>', '<title>Esbjug Consult</title>'),
    ('content="Kode og design har gått gjennom en revolusjon som ikke må oversees."',
     'content="Code and design have gone through a revolution that must not be overlooked."'),

    # --- toppen ---
    ('Kunde-login &rarr;', 'Customer login &rarr;'),
    ('aria-label="Hovedbudskapet jeg prøver å rope fra taket på bygninger i disse dager er at kode og design har gått gjennom en revolusjon som ikke må oversees."',
     'aria-label="The main message I keep shouting from the rooftops these days is that code and design have gone through a revolution that must not be overlooked."'),
    ('Hovedbudskapet jeg prøver å rope fra taket på bygninger i disse dager er at <span class="kd"><i>kode</i></span> og <span class="ds" data-t="design">design</span> har gått gjennom en revolusjon som ikke må oversees.',
     'The main message I keep shouting from the rooftops these days is that <span class="kd"><i>code</i></span> and <span class="ds" data-t="design">design</span> have gone through a revolution that must not be overlooked.'),
    ('Å kjøpe nettsider, apper eller digital markedsføring i dag for samme pris som før er absurd. Det er også masse muligheter som tidligere var for dyre til å begi seg ut på.',
     'Buying websites, apps or digital marketing today at the same price as before is absurd. There are also lots of opportunities that used to be too expensive to take on.'),
    ('Snakk med meg om alt dette.', 'Talk to me about all of this.'),

    # --- prosjektene ---
    ('<h2>Jobber med nå</h2>', '<h2>Working on now</h2>'),
    ('&gt; Konsultasjon', '&gt; Consulting'),
    ('&gt; Egne prosjekter', '&gt; Own projects'),
    ('<h3>Kunde i laksenæringen</h3>', '<h3>Client in the salmon industry</h3>'),
    ('<dt>Hva</dt>', '<dt>What</dt>'),
    ('<dt>Pågått</dt>', '<dt>Running</dt>'),
    ('<dt>Størrelse</dt>', '<dt>Size</dt>'),
    ('<dt>Jeg gjør</dt>', '<dt>I do</dt>'),
    ('>Siden mai 2026<', '>Since May 2026<'),
    ('>Siden september 2026<', '>Since September 2026<'),
    ('>Siden april 2026<', '>Since April 2026<'),
    ('aria-label="Skjult"', 'aria-label="Hidden"'),
    ('Enkel konsultasjon i liten skala', 'Simple consulting on a small scale'),
    ('Markedsføringsstrategi og restrukturering', 'Marketing strategy and restructuring'),
    ('alt="Laks som hopper, tegnet i gult og svart"', 'alt="A leaping salmon, drawn in yellow and black"'),
    ('Sammen har vi allerede gjort spennende fremskritt, i stor grad ved hjelp av analyse fra Claude Code.',
     'Together we have already made exciting progress, largely thanks to analysis from Claude Code.'),
    ('Ved å laste inn Google Ads-tall fra deres eksisterende byrå, fant vi store besparelser som følge av ineffektivitet i targeting og for høye administrasjonsgebyr. Det var en case hvor ledelsen hadde gitt fullstendig tillit til byrået, og jeg tror ikke jeg vil finne denne type besparelser like enkelt i de fleste bedrifter.',
     'By loading in Google Ads numbers from their existing agency, we found large savings caused by inefficient targeting and administration fees that were too high. It was a case where management had placed complete trust in the agency, and I don\'t think I\'ll find savings like these as easily in most companies.'),
    ('Vi flyttet Google Ads in-house og kuttet kostnaden betraktelig, uten kvalitetstap. Mitt vederlag utgjorde 25% av den årlige besparelsen som følge av høy effektivitet fra AI-bruk. Vinn-vinn!',
     'We moved Google Ads in-house and cut the cost considerably, with no loss of quality. My fee came to 25% of the annual savings, thanks to the high efficiency of using AI. Win-win!'),

    ('Alarm-app for familier, iPhone og Android', 'Alarm app for families, iPhone and Android'),
    ('55 000 linjer Swift, 10 språk', '55,000 lines of Swift, 10 languages'),
    ('Idé, design, kode, reklamefilm', 'Idea, design, code, promo film'),
    ('aria-label="Reklamefilm for Athena"', 'aria-label="Promo film for Athena"'),
    ('Målet mitt med Athena er <b>å redde et liv</b>.', 'My goal with Athena is <b>to save a life</b>.'),
    ('<i>Det er det hele.</i>', '<i>That\'s all there is to it.</i>'),
    ('Ideen kom fra broren til min brors kone, som fortalte meg umiddelbart hvilken app jeg burde bygge etter jeg sa at jeg bygget apper.',
     'The idea came from my brother\'s wife\'s brother, who told me straight away which app I should build after I said I build apps.'),
    ('Han hadde blitt ringt av en gammel dame som hadde falt og ligget på baderomsgulvet i flere dager, etternavnet hans starter med A, og han var øverst.',
     'He had been called by an old lady who had fallen and lain on the bathroom floor for several days. His surname starts with A, so he was at the top of her list.'),
    ('Han sa «du bør bygge en alarm som gjør at det å sjekke inn blir en naturlig del av hverdagen» - og jeg var enig.',
     'He said "you should build an alarm that makes checking in a natural part of everyday life" - and I agreed.'),
    ('Selv om ikke alle eldre bruker en alarm, er det mange nok som gjør det til at det kan hjelpe. Det finnes versjoner av appen fra før, men det kan forbedres på mange måter.',
     'Not all older people use an alarm, but enough of them do for it to help. Versions of this kind of app already exist, but they can be improved in many ways.'),
    ('Han eier noe uvisst halve, en idé er en idé, men jeg har priset det kun til server-kostnad, så vi kommer til å tjene om lag 1 krone og 80 øre hver i måneden per familie som bruker dette. Jeg ville gjerne gjort appen gratis, men jeg vil ha mulighet til å nå så mange som mulig uten å måtte subsidiere server-kostnad.',
     'He owns an undetermined half - an idea is an idea - but I have priced it at server cost only, so we will each earn about 1.80 NOK a month per family using it. I would have liked to make the app free, but I want to be able to reach as many people as possible without having to subsidise server costs.'),
    ('Jeg har lange visjoner for å gjøre den større og gi den mange føtter for branding, men versjon 1 med uttrykket over er snart klar.',
     'I have long-term visions for making it bigger and giving it many legs for branding, but version 1, with the look above, is almost ready.'),

    ('Stemme-app for piano, iPhone, iPad, Mac og Android', 'Piano tuning app, iPhone, iPad, Mac and Android'),
    ('46 000 linjer Swift', '46,000 lines of Swift'),
    ('Idé, design, kode, <a href="https://tidemannesbjug.github.io/piano/">nettside&nbsp;↗</a>',
     'Idea, design, code, <a href="https://tidemannesbjug.github.io/piano/">website&nbsp;↗</a>'),
    ('alt="Forsiden til Resonance Piano Tuner: «Tune your own piano.»"', 'alt="The front page of Resonance Piano Tuner: \'Tune your own piano.\'"'),
    ('Jeg fikk for meg at jeg skulle stemme flygelet til moren min, hvor jeg var nysgjerrig rundt hvordan det fungerte.',
     'I got it into my head that I would tune my mother\'s grand piano, and I was curious about how it worked.'),
    ('Jeg spurte Claude om det tekniske rundt det, hvor intuisjonen min var at «hvis et menneske kan høre det, bør jo en mikrofon kunne høre det samme».',
     'I asked Claude about the technical side of it. My intuition was that "if a human can hear it, a microphone should be able to hear the same".'),
    ('Jeg ville teste Fable 5.1 som nettopp hadde kommet ut, og ga den en tung oppgave å lage denne appen, som ble veldig bra.',
     'I wanted to test Fable 5.1, which had just come out, and gave it the heavy task of building this app. It turned out very well.'),
    ('Grok build 4.7 kom ut like etter, som scoret best av alle i musikk-teori, og den fant noen justeringer.',
     'Grok build 4.7 came out right after, scoring best of all in music theory, and it found a few adjustments.'),

    ('<h3>Stor app – hemmelig</h3>', '<h3>Big app – secret</h3>'),
    ('<br>iPhone og Android</dd>', '<br>iPhone and Android</dd>'),
    ('204 000 linjer kode', '204,000 lines of code'),
    ('<dd>Alt</dd>', '<dd>Everything</dd>'),
    ('alt="To mobiltelefoner side om side, i gult og svart"', 'alt="Two phones side by side, in yellow and black"'),
    ('<b>180 000</b><span>linjer Swift i selve appen</span>', '<b>180,000</b><span>lines of Swift in the app itself</span>'),
    ('<b>24 000</b><span>linjer serverkode</span>', '<b>24,000</b><span>lines of server code</span>'),
    ('<span>skyfunksjoner: kode som kjører på servere, ikke på telefonen</span>', '<span>cloud functions: code that runs on servers, not on the phone</span>'),
    ('<span>går av seg selv på timeplan eller når data endres</span>', '<span>run on their own on a schedule or when data changes</span>'),
    ('<span>mediefiler i appen: 124 bilder og 54 videoer</span>', '<span>media files in the app: 124 images and 54 videos</span>'),
    ('<span>språk, 2 800 tekster hver</span>', '<span>languages, 2,800 strings each</span>'),
    ('Dette er hovedprosjektet mitt, og jeg har lagt inn mer arbeid enn jeg har gjort tidligere.',
     'This is my main project, and I have put more work into it than into anything before.'),
    ('Jeg har en «produkt først»-filosofi hvor jeg stiller meg selv et spørsmål langs veien',
     'I have a "product first" philosophy where I keep asking myself one question along the way'),
    ('«Hvis vi kunne fryse tiden, i en million år, hvordan ville vi bygget dette med nåværende teknologi?»',
     '"If we could freeze time for a million years, how would we build this with today\'s technology?"'),
    ('Eksempler er at jeg har egne versjoner basert på hardware, hvor apper ofte sier «det blir for mye arbeid å ta med de gamle telefonene», men jeg tror denne appen vil gjøre godt, og jeg vil nå så mange som mulig, så jeg har bygget om nøkkelfunksjoner for å fungere på tvers av hardware, fra iPhone 8 til 18 Pro Max, hvor jeg ikke degraderer brukeropplevelsen for de med moderne telefoner - som gjør dette til mye arbeid på tvers av iPhone og Android.',
     'For example, I have separate versions based on hardware. Apps often say "it\'s too much work to support the old phones", but I believe this app will do good and I want to reach as many people as possible, so I have rebuilt key features to work across hardware, from iPhone 8 to 18 Pro Max, without degrading the experience for people with modern phones - which makes this a lot of work across iPhone and Android.'),
    ('Jeg ser ikke etter investorer, men jeg er ute etter konsulent-arbeid for å gi meg runway, og er blitt veldig kyndig i iPhone, variasjon i modeller og så og si alle funksjoner tenkelig.',
     'I\'m not looking for investors, but I am looking for consulting work to give me runway, and I have become very skilled with iPhone, the differences between models and just about every feature imaginable.'),
    ('Målet er å bygge den beste appen i verdenshistorien til det jeg gjør, og jeg tror jeg gjør det.',
     'The goal is to build the best app in the history of the world for what it does, and I believe I\'m doing it.'),
    ('Dette er ikke en "Uber" eller "Instagram" stor app, ikke noe revolusjonerende., men den er stor å jobbe med.',
     'This isn\'t an "Uber" or "Instagram" kind of big app, nothing revolutionary, but it is big to work on.'),

    ('<h2>Nylig utførte prosjekter</h2>', '<h2>Recently completed projects</h2>'),
    ('<h3>Operasjonell IT-sikkerhet for hacket familie</h3>', '<h3>Operational IT security for a hacked family</h3>'),
    ('alt="Hengelås i gult og svart"', 'alt="A padlock in yellow and black"'),
    ('En bekjent kom til meg med en case hvor en venn av ham hadde fått noen av kontoene sine hacket, uhyggelige beskjeder, og var veldig bekymret for overvåkning og videre hacking.',
     'An acquaintance came to me with a case where a friend of his had had some of his accounts hacked, had received unsettling messages, and was very worried about surveillance and further hacking.'),
    ('Jeg sjekket mange systemer og nettverk etter trusler, med stor hjelp av et system jeg bygget med Claude Code, med verktøy som LuLu og KnockKnock for å lage rapporter kjørt gjennom Claude Code, i tillegg til et eget verktøy jeg bygget ved navn ACHILLES.',
     'I checked many systems and networks for threats, with a lot of help from a system I built with Claude Code, using tools like LuLu and KnockKnock to produce reports run through Claude Code, plus a tool of my own called ACHILLES.'),
    ('Når sikkerheten først faller føles alt som en trussel, og del av jobben var å lytte, utdanne kunden rundt angrepsmuligheter, og å bygge ut nye systemer helt fra bunn.',
     'Once security falls, everything feels like a threat, and part of the job was to listen, teach the client about possible attacks, and build new systems from the ground up.'),
    ('Vi satt opp nye enheter sammen og opprettet nye kontoer med sikre metoder.',
     'We set up new devices together and created new accounts using secure methods.'),
    ('Proton, Starlink, Sikringsmodus, dedikerte Revolut-kort, flere telefon-nummer, flere e-post-addresser, fysisk passordhåndtering.',
     'Proton, Starlink, Lockdown Mode, dedicated Revolut cards, several phone numbers, several email addresses, physical password management.'),
    ('Vi gikk gjennom operasjonell sikkerhet i innstillinger og tilganger på iPhone.',
     'We went through operational security in the settings and permissions on iPhone.'),
    ('Det var en gradvis prossess, hvor vi steg etter steg opprettet brukere for å returnere til en vanlig og sikker hverdag.',
     'It was a gradual process, where step by step we created accounts to return to a normal and safe everyday life.'),
    ('Det var viktig at kunden kunne fortsette å bruke systemene kunden var vandt med, og vi gjorde derfor ikke oppsett av f.eks Tails og Monero.',
     'It was important that the client could keep using the systems they were used to, so we did not set up things like Tails and Monero.'),
    ('Jeg har likevel gjort klar en Tails-usb til kunden, litt for å symbolsk ha gjort det jeg evner.',
     'I still prepared a Tails USB stick for the client, partly as a symbolic gesture of doing everything I could.'),
    ('På grunn av oppdragets natur holder jeg kundens identitet skjult.',
     'Because of the nature of the assignment, I keep the client\'s identity hidden.'),
    ('<b>Interessert i denne type arbeid?</b>', '<b>Interested in this kind of work?</b>'),
    ('Jeg liker godt caser som dette, fordi det tillater meg å roe menneskers hverdag, som er meningsfullt.',
     'I really like cases like this, because they let me bring calm to people\'s everyday lives, which is meaningful.'),
    ('Det gjør meg også til en delvis aktivist når det gjelder rett til digitalt privatliv.',
     'It also makes me something of an activist when it comes to the right to digital privacy.'),
    ('En tanke om dette, morgen 1. oktober.', 'A thought on this, morning of 1 October.'),
    ('Denne artikkelen er fra 29. september.', 'This article is from 29 September.'),
    ('…og viser hvordan vi nærmer oss et punkt hvor cyber-angrep med AI kan bli langt vanligere.',
     '…and shows how we are approaching a point where cyber attacks using AI could become far more common.'),
    ('Dette gjør det å være forberedt når det kommer til cyber-angrep noe å tenke på.',
     'That makes being prepared for cyber attacks something worth thinking about.'),

    # --- bunnen ---
    ('Denne nettsiden ble bygget på fire dager, for <b>1,5&nbsp;%</b> av Claude Code Max 20 Weekly Credits.',
     'This website was built in four days, for <b>1.5&nbsp;%</b> of Claude Code Max 20 Weekly Credits.'),
    ('>Informasjonskapsler</a>', '>Cookies</a>'),

    # --- samtykkebanneret ---
    ('aria-label="Informasjonskapsler"', 'aria-label="Cookies"'),
    ('aria-label="Lukk uten å godta"', 'aria-label="Close without accepting"'),
    ('<b>Informasjonskapsler</b>Jeg bruker informasjonskapsler til chatten og til å se hvordan siden brukes, så den kan bli bedre.',
     '<b>Cookies</b>I use cookies for the chat and to see how the site is used, so it can get better.'),
    ('aria-expanded="false">Les mer</button>', 'aria-expanded="false">Read more</button>'),
    ('Chatten bruker én informasjonskapsel for å kjenne deg igjen mellom besøk, og viser meg omtrentlig hvor du er (by, ut fra IP-adressen) og hvor på siden du er mens du er her. Besøket tas opp (rulling og klikk, aldri det du skriver), så jeg kan gjøre siden bedre. Opptak slettes etter 30 dager. Ingen reklame, og ingen sporing utenfor denne siden.',
     'The chat uses one cookie to recognise you between visits, and shows me roughly where you are (city, based on your IP address) and where on the page you are while you\'re here. The visit is recorded (scrolling and clicks, never what you type) so I can make the site better. Recordings are deleted after 30 days. No ads, and no tracking outside this site.'),
    ('class="ck-ja">Godta</button>', 'class="ck-ja">Accept</button>'),
    ('class="ck-nei">Bare nødvendige</button>', 'class="ck-nei">Only necessary</button>'),

    # --- chatten (markup) ---
    ('aria-label="Chat med Tidemann"', 'aria-label="Chat with Tidemann"'),
    ('aria-label="Åpne chatten"', 'aria-label="Open the chat"'),
    ('aria-label="Lyd av"', 'aria-label="Mute"'),
    ('aria-label="Legg på"', 'aria-label="Hang up"'),
    ('<span class="cp-t">I samtale med Tidemann</span>', '<span class="cp-t">In a call with Tidemann</span>'),
    ('<span>Ikke nøl! Go, go, go!</span>', '<span>Don\'t hesitate! Go, go, go!</span>'),
    ('class="ch-del" type="button">Slett samtalen</button>', 'class="ch-del" type="button">Delete conversation</button>'),
    ('aria-label="Lukk chat"', 'aria-label="Close chat"'),
    ('<b class="cc-t">Tidemann ringer deg</b><span class="cc-s">Lydsamtale i nettleseren</span>',
     '<b class="cc-t">Tidemann is calling you</b><span class="cc-s">Voice call in the browser</span>'),
    ('class="cc-ans">Svar</button>', 'class="cc-ans">Answer</button>'),
    ('class="cc-dec">Avslå</button>', 'class="cc-dec">Decline</button>'),
    ('class="cc-mute" hidden>Lyd av</button>', 'class="cc-mute" hidden>Mute</button>'),
    ('class="cc-min" hidden>Minimer</button>', 'class="cc-min" hidden>Minimise</button>'),
    ('class="cc-end" hidden>Legg på</button>', 'class="cc-end" hidden>Hang up</button>'),
    ('hidden>Sende mail istedet?</a>', 'hidden>Send an email instead?</a>'),
    ('aria-label="Legg ved fil"', 'aria-label="Attach file"'),
    ('aria-label="Spill inn lydmelding"', 'aria-label="Record a voice message"'),
    ('placeholder="Skriv en melding …"', 'placeholder="Write a message …"'),
    ('aria-label="Melding"', 'aria-label="Message"'),

    # --- skriptene ---
    ("const STAT={available:['Tilgjengelig','på'],meeting:['I møte','møte'],sleeping:['Sover','sover']};",
     "const STAT={available:['Available','på'],meeting:['In a meeting','møte'],sleeping:['Asleep','sover']};"),
    ("'Chat med Tidemann ('", "'Chat with Tidemann ('"),
    ("'Sover, opp klokken 04:00 - svarer når jeg er våken'", "'Asleep, up at 04:00 - I\\'ll reply when I\\'m awake'"),
    ("'I møte, kan kanskje svare'", "'In a meeting, might be able to reply'"),
    ("'Tidemann er her nå'", "'Tidemann is here now'"),
    ("'Ikke nøl! Go, go, go!'", "'Don\\'t hesitate! Go, go, go!'"),
    ("'Tidemann ringer deg'", "'Tidemann is calling you'"),
    ("'Lydsamtale i nettleseren'", "'Voice call in the browser'"),
    ("'Samtalen er avsluttet'", "'The call has ended'"),
    ("'Kobler til …'", "'Connecting …'"),
    ("'Fikk ikke tilgang til mikrofonen'", "'Could not access the microphone'"),
    ("'I samtale med Tidemann'", "'In a call with Tidemann'"),
    ("'Fikk ikke koblet til samtalen'", "'Could not connect the call'"),
    ("'Du avslo samtalen'", "'You declined the call'"),
    ("'Tidemann la på'", "'Tidemann hung up'"),
    ("'Lyd på':'Lyd av'", "'Unmute':'Mute'"),
    ("'I samtale · '", "'In a call · '"),
    ("'Trykk igjen for å slette'", "'Tap again to delete'"),
    ("'Slett samtalen'", "'Delete conversation'"),
    ("'Sender '", "'Sending '"),
    ("'Filen er for stor (maks 25 MB).'", "'The file is too large (max 25 MB).'"),
    ("'Kunne ikke sende filen.'", "'Could not send the file.'"),
    ("'Tar opp '", "'Recording '"),
    ("' · trykk på mikrofonen for å sende'", "' · tap the microphone to send'"),
    ("'Fikk ikke tilgang til mikrofonen.'", "'Could not access the microphone.'"),
    ("'Skriv en melding …'", "'Write a message …'"),
    ("'Lydmelding.'", "'Voice message.'"),
    ("'Vis mindre':'Les mer'", "'Show less':'Read more'"),
    ("m+' mnd':Math.max(1,Math.floor(d/7))+' uker'", "m+' mo':Math.max(1,Math.floor(d/7))+' weeks'"),
    ("[...'kode'].map", "[...'code'].map"),
    ("ki.textContent='kode'", "ki.textContent='code'"),
]

out = no
missing = []
for a, b in T:
    if a not in out:
        missing.append(a)
        continue
    out = out.replace(a, b)

# Stier: siden ligger i /en/, bildene i /media/.
out = re.sub(r'(src|poster)="media/', r'\1="/media/', out)

# Flagget: på den engelske siden går det tilbake til norsk, og notatet om oversettelsen vises.
out = out.replace('<a class="lang" href="/en/" hreflang="en" lang="en" aria-label="English">',
                  '<a class="lang" href="/" hreflang="nb" lang="nb" aria-label="Norsk">')
out = out.replace('<span class="lang-flag-gb"', '<span class="lang-flag-no"')
out = out.replace('>English</span></a>', '>Norsk</span></a>')
out = out.replace('<!--EN-MERKNAD-->',
                  '<p class="en-note mono">Auto translated with Claude from Norwegian - excuse any strangeness :)</p>')

if missing:
    print("Fant ikke disse norske tekstene (endret på den norske siden?), oppdater bygg-en.py:")
    for m in missing:
        print("  -", m[:110])
    sys.exit(1)

# Sjekk at ingen synlig norsk tekst er igjen (kommentarer i CSS/JS teller ikke).
visible = re.sub(r"/\*.*?\*/", "", out, flags=re.S)
visible = re.sub(r"(?m)^\s*//.*$", "", visible)
visible = re.sub(r"<!--.*?-->", "", visible, flags=re.S)
left = [w for w in ("Hovedbudskapet", "Snakk med meg", "Jobber med nå", "Informasjonskapsler", "Slett samtalen", "linjer Swift") if w in visible]
if left:
    print("Norsk tekst igjen på den engelske siden:", left)
    sys.exit(1)

(HER / "en").mkdir(exist_ok=True)
(HER / "en" / "index.html").write_text(out)
print(f"en/index.html skrevet ({len(T)} oversettelser)")
