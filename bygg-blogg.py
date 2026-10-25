# Bygger /blogg/<n>/index.html og /blogg/index.html fra blogg/innlegg.json. Kjør fra nettside/: python3 bygg-blogg.py
# Innleggene er skrevet av Claude Code ut fra transkripsjonen av hver podkastepisode. Bildene ligger i blogg/media/epN(.webp/-1200.webp).
import json, html, pathlib
E = lambda t: html.escape(t, quote=True)
HER = pathlib.Path(__file__).parent
ROT = HER / "blogg"
INN = json.loads((ROT / "innlegg.json").read_text(encoding="utf-8"))
EP = {e["n"]: e for e in json.loads((HER / "podcast" / "episoder.json").read_text(encoding="utf-8"))}
MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
dato = lambda d: f"{int(d[8:])}. {MND[int(d[5:7]) - 1]} {d[:4]}"
mmss = lambda s: f"{s // 60}:{s % 60:02d}"
MERK = "Dette innlegget er skrevet av Claude Code ut fra episoden, ikke av meg. Hovedpoengene er hentet fra transkripsjonen."

HODE = """<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#00163f">
<title>{tittel}</title>
<meta name="description" content="{beskrivelse}">
<meta property="og:title" content="{tittel}">
<meta property="og:description" content="{beskrivelse}">
{bilde_meta}<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2300205B'/%3E%3Ccircle cx='16' cy='16' r='9' fill='%23BA0C2F' stroke='%23fff' stroke-width='3'/%3E%3C/svg%3E">
<style>
  @font-face{{font-family:"Fraunces";src:url(/media/fonts/fraunces.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}}
  @font-face{{font-family:"Fraunces";src:url(/media/fonts/fraunces-italic.woff2) format("woff2");font-weight:100 900;font-style:italic;font-display:swap}}
  :root{{--serif:"Fraunces",Georgia,"Times New Roman",serif;--mono:"SF Mono",Menlo,monospace;--g:clamp(16px,6vw,96px)}}
  *{{box-sizing:border-box}}
  html,body{{margin:0;background:#00163f;color:#fff}}
  body{{min-height:100svh;background:radial-gradient(60% 50% at 50% 30%,#0b2f70,#00163f) fixed;font:400 clamp(17px,1.2vw,19px)/1.6 var(--serif);-webkit-font-smoothing:antialiased}}
  a{{color:inherit}}
  .side{{max-width:760px;margin:0 auto;padding:clamp(28px,6vh,72px) var(--g) clamp(80px,14vh,160px)}}
  .topp{{display:flex;justify-content:space-between;align-items:center;gap:12px;font:600 10.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55)}}
  .topp a{{text-decoration:none}}.topp a:hover{{color:#fff}}
  .merk{{margin:28px 0 0;padding:12px 16px;border:1px solid rgba(255,255,255,.16);border-radius:12px;font:500 13px/1.45 var(--mono);letter-spacing:.02em;color:rgba(255,255,255,.7)}}
  h1{{margin:26px 0 .35em;font:500 clamp(34px,4.6vw,58px)/1.04 var(--serif);letter-spacing:-.025em;text-wrap:balance}}
  .dato{{font:500 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5)}}
  /* Avspilleren: episoden kan spilles rett her, eller åpnes i podkastspilleren. */
  .spiller{{margin:24px 0 0;display:flex;align-items:center;gap:16px;padding:14px 18px 14px 14px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}}
  .sp-k{{flex:none;width:48px;height:48px;border-radius:50%;border:1.5px solid rgba(255,255,255,.7);background:none;color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}}
  .sp-k svg{{width:18px;height:18px}}.sp-k .pa{{display:none}}.spiller-pa .sp-k .pl{{display:none}}.spiller-pa .sp-k .pa{{display:block}}
  .sp-i{{flex:1;min-width:0;display:flex;flex-direction:column;gap:9px}}
  .sp-t{{display:flex;justify-content:space-between;gap:10px;font:600 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6)}}
  .sp-t a{{text-decoration:none;white-space:nowrap}}.sp-t a:hover{{color:#fff}}
  .sp-b{{position:relative;height:16px;cursor:pointer;touch-action:none}}
  .sp-b::before{{content:"";position:absolute;left:0;right:0;top:7px;height:2px;border-radius:2px;background:rgba(255,255,255,.2)}}
  .sp-b i{{position:absolute;left:0;top:7px;height:2px;border-radius:2px;background:#fff;width:0}}
  .sp-b b{{position:absolute;top:3px;left:0;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:#fff}}
  @media (max-width:520px){{.sp-t{{flex-direction:column;gap:7px}}}}
  .strip{{display:block;width:100%;height:auto;aspect-ratio:4/1;margin:30px 0 8px;border-radius:16px;box-shadow:0 18px 50px rgba(0,8,30,.45)}}
  h2{{margin:2em 0 .5em;font:500 clamp(24px,2.4vw,32px)/1.15 var(--serif);letter-spacing:-.015em}}
  p{{margin:0 0 1em;color:rgba(255,255,255,.88)}}
  .ingress{{font-size:1.15em;color:#fff;margin-top:1.4em}}
  .slutt{{margin-top:3em;padding-top:1.4em;border-top:1px solid rgba(255,255,255,.14);font:500 12px/1.6 var(--mono);letter-spacing:.06em;color:rgba(255,255,255,.55)}}
  .liste{{list-style:none;margin:36px 0 0;padding:0;display:flex;flex-direction:column;gap:18px}}
  .liste a{{display:grid;gap:12px;text-decoration:none;padding:16px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.12)}}
  .liste img{{width:100%;height:auto;aspect-ratio:4/1;border-radius:10px;display:block}}
  .liste b{{font:500 clamp(22px,2.2vw,28px)/1.15 var(--serif)}}
  .liste span{{color:rgba(255,255,255,.75)}}
</style>
</head>
<body>
"""

SPILLER = """  <div class="spiller" data-lyd="/podcast/lyd/ep{n}.m4a" data-sek="{sek}">
    <button class="sp-k" type="button" aria-label="Spill av episode {n}"><svg class="pl" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg><svg class="pa" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg></button>
    <div class="sp-i">
      <div class="sp-t"><span>Episode {n} · <span class="sp-tid">0:00</span> / {lengde}</span><a href="/podcast/{n}/">Åpne i podkasten ↗</a></div>
      <div class="sp-b" role="slider" tabindex="0" aria-label="Spoling" aria-valuemin="0" aria-valuemax="{sek}" aria-valuenow="0"><i></i><b></b></div>
    </div>
    <audio preload="none" playsinline></audio>
  </div>
"""

SKRIPT = """<script>
// Avspilleren øverst: play/pause, tiden, og spoling ved å trykke eller dra i linja (piltaster: 10 s).
document.querySelectorAll('.spiller').forEach(sp=>{const a=sp.querySelector('audio'),k=sp.querySelector('.sp-k'),b=sp.querySelector('.sp-b'),tid=sp.querySelector('.sp-tid'),len=+sp.dataset.sek;
  const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
  const vis=()=>{const t=a.currentTime||0,p=Math.min(1,t/(a.duration||len));b.querySelector('i').style.width=p*100+'%';b.querySelector('b').style.left=p*100+'%';tid.textContent=fmt(t);b.setAttribute('aria-valuenow',Math.round(t))};
  const last=()=>{if(!a.src)a.src=sp.dataset.lyd};
  k.addEventListener('click',()=>{last();a.paused?a.play():a.pause()});
  a.addEventListener('play',()=>sp.classList.add('spiller-pa'));a.addEventListener('pause',()=>sp.classList.remove('spiller-pa'));a.addEventListener('timeupdate',vis);
  const til=e=>{const r=b.getBoundingClientRect(),p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));last();
    const sett=()=>{a.currentTime=p*(a.duration||len);vis()};a.readyState?sett():a.addEventListener('loadedmetadata',sett,{once:true});if(a.paused)a.play()};
  let dra=false;b.addEventListener('pointerdown',e=>{dra=true;b.setPointerCapture(e.pointerId);til(e)});b.addEventListener('pointermove',e=>{if(dra)til(e)});b.addEventListener('pointerup',()=>dra=false);
  b.addEventListener('keydown',e=>{const d={ArrowRight:10,ArrowLeft:-10}[e.key];if(!d)return;e.preventDefault();last();a.currentTime=Math.max(0,(a.currentTime||0)+d);vis()})});
</script>
"""


def innlegg(i):
    ep = EP[i["n"]]
    bilde = f'/blogg/media/ep{i["n"]}'
    d = [HODE.format(tittel=E(i["tittel"]) + " · Esbjug Consult", beskrivelse=E(i["ingress"]),
                     bilde_meta=f'<meta property="og:image" content="https://esbjugconsult.com{bilde}-1200.webp">\n'),
         '<main class="side">\n',
         f'  <div class="topp"><a href="/blogg/">← Blogg</a><span class="dato">{dato(ep["dato"])}</span></div>\n',
         f'  <p class="merk">{E(MERK)}</p>\n',
         f'  <h1>{E(i["tittel"])}</h1>\n',
         SPILLER.format(n=i["n"], sek=ep["sek"], lengde=mmss(ep["sek"])),
         f'  <img class="strip" src="{bilde}-1200.webp" srcset="{bilde}-1200.webp 1200w, {bilde}.webp 2176w" sizes="(max-width:760px) 100vw, 760px" width="2176" height="544" alt="{E(i["alt"])}">\n',
         f'  <p class="ingress">{E(i["ingress"])}</p>\n']
    for del_ in i["deler"]:
        d.append(f'  <h2>{E(del_["h"])}</h2>\n')
        d += [f'  <p>{E(p)}</p>\n' for p in del_["p"]]
    d.append(f'  <p class="slutt">Fra episode {i["n"]} av podkasten, «{E(ep["tittel"])}». <a href="/podcast/{i["n"]}/">Hør hele episoden</a>.</p>\n</main>\n')
    d += [SKRIPT, "</body>\n</html>\n"]
    ut = ROT / str(i["n"])
    ut.mkdir(parents=True, exist_ok=True)
    (ut / "index.html").write_text("".join(d), encoding="utf-8", newline="\n")


for i in INN:
    innlegg(i)

liste = [HODE.format(tittel="Blogg · Esbjug Consult", beskrivelse="Innlegg laget ut fra episodene i podkasten.", bilde_meta=""),
         '<main class="side">\n  <div class="topp"><a href="/">← Esbjug Consult</a><a href="/podcast/">Podkasten ↗</a></div>\n  <h1>Blogg</h1>\n',
         '  <p class="merk">Innleggene er skrevet av Claude Code ut fra episodene i podkasten, ikke av meg.</p>\n  <ul class="liste">\n']
for i in sorted(INN, key=lambda x: -x["n"]):
    liste.append(f'    <li><a href="/blogg/{i["n"]}/"><img src="/blogg/media/ep{i["n"]}-1200.webp" width="1200" height="300" alt="" loading="lazy"><b>{E(i["tittel"])}</b><span>{E(i["ingress"])}</span></a></li>\n')
liste.append("  </ul>\n</main>\n</body>\n</html>\n")
(ROT / "index.html").write_text("".join(liste), encoding="utf-8", newline="\n")
print("skrev", len(INN), "innlegg og blogg/index.html")
