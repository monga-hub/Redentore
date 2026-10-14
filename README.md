# redentore-dungeon

Dungeon 3D esplorabile (stile WoW / Scarlet Monastery) basato sulla Chiesa del
Redentore + Orto dei Frati, Giudecca, Venezia.

- Three.js nel browser, build Vite.
- Terza persona, controlli WASD.
- Nemici: frati non-morti che zappano l'orto a gruppi di 2-3 (32 in 12 gruppi, solo mischia) e preti
  non-morti che pregano nei chiostri a gruppi di 3 (1 gruppo nei chiostri piccoli, 2 nel mediano, 3 nel
  grande) e lanciano dardi d'ombra a distanza, indietreggiando se ti avvicini. Altri gruppi di preti
  (2-3, con un sacerdote nella cappella e nel frantoio) presidiano gli edifici verso la laguna: pontile,
  sale espositive, caffè, cappella di meditazione, laboratori, frantoio. All'apiario un'ape gigante
  (élite tra sacerdote e boss: pungiglione in picchiata e uno sciame velenoso telegrafato a terra da
  cui scappare) con tre api operaie; fuori dalla portata dei sentieri lastricati. In chiesa due sacerdoti
  (bianco e viola, magia + mischia) con due preti ciascuno — a capo della navata e dietro l'altare —
  e il boss, il Reverendissimo, sotto la cupola (magia, mischia, nova d'ombra da cui scappare).
- Progressione (missione "La chiave del portinaio"): il portone della chiesa è sbarrato. Sulla
  fondamenta Fra' Zuane, il fantasma incatenato del portinaio dei cappuccini (punto esclamativo
  dorato), affida la missione in una finestra di dialogo stile WoW (ritratto, testo scritto a
  macchina, Accetta / Rifiuta); finché non la si accetta il baule resta sigillato. Dalla calle si
  attraversa il convento e l'orto fino al pontile sulla laguna, dove un baule-reliquiario custodisce
  la chiave delle grate del chiostro grande (il coperchio si spalanca in una pioggia d'oro e la
  chiave sale dal baule); dal chiostro si entra in chiesa dalla porta del coro. Morto il
  Reverendissimo, tutti i nemici cadono e il portone si apre: uscire sulla fondamenta chiude la
  missione. L'obiettivo corrente sta sotto la minimappa (a sinistra su touch); Fra' Zuane ha una
  battuta per ogni fase e nessuno può attaccarlo.
- Estetica ispirata a WoW; nessun asset o logo Blizzard.

Stato attuale: **slice verticale in greybox** — l'intero complesso è camminabile
dalla Fondamenta San Giacomo alla laguna, con materiali piatti segnaposto.

## Avvio

```sh
npm install
npm run dev      # http://localhost:5173/Redentore/
npm run build    # typecheck (tsc) + bundle in dist/
npm run check    # verifica headless: raggiungibilità per fase della quest (chiesa e chiostro grande chiusi all'inizio, tutto aperto con la chiave) + sistema abilità + IA di frati, preti, sacerdoti, boss e api + salvataggi + volo dell'intro senza compenetrazioni
```

Richiede Node ≥ 22.6 (`npm run check` esegue TypeScript direttamente con Node).

Una nuova partita si apre con un piano sequenza in tempo reale (`src/camera/intro.ts`):
dalla laguna alle sale espositive, l'orto, il corridoio, i chiostri mediano e grande, la
chiesa, un giro attorno al Reverendissimo e fuori dal portone che si chiude, fino alla
camera dietro al personaggio. Sopra scorre l'antefatto in didascalie cinematografiche, una per
luogo (`CAPTIONS`: la peste del 1576, il voto e Palladio, i morti sepolti nell'orto, il secondo
voto del Reverendissimo, la notte del Redentore, il Risorto), ciascuna con l'id della sua futura
voce narrante (`Intro.onLine`). Esc, Spazio, Invio, clic o tap la saltano; una partita
caricata parte senza intro.

## Controlli

| Input | Azione |
|---|---|
| W A S D / frecce | muovi (relativo alla camera) |
| Shift | cammina (default: corsa) |
| Spazio | salta |
| trascina tasto sinistro | orbita la camera |
| trascina tasto destro | orbita e gira il personaggio verso la camera |
| sinistro + destro | avanti |
| rotella | zoom |
| Q / E | ruota la camera |
| 1 … 0 - = | barra delle abilità (anche clic/tap sui pulsanti; col mouse trascinale per scambiarle, l'ordine resta salvato); 9 = pozione all'inizio |
| Esc | annulla il lancio in corso; altrimenti apre il menu di gioco (salva/carica, audio, crediti) |
| F | interagisci (parla con Fra' Zuane, apri baule, grate, porte); su touch tocca il riquadro che appare. Nel dialogo F, Spazio o Invio proseguono, Esc chiude |

Su telefono/tablet (solo dispositivi touch): stick virtuale a sinistra per muoversi,
trascina sul resto dello schermo per la camera, pizzica per lo zoom; a destra le
abilità diventano tasti tondi a ventaglio attorno all'angolo (stile action-RPG mobile),
con salto e pozione tra i tasti piccoli.

In alto a sinistra il riquadro del personaggio mostra vita e mana (`src/player/stats.ts`,
anche `window.playerStats`: `takeDamage`, `heal`, `spendMana`).

## Stile Diablo

Nel menu di gioco (anche nella schermata del titolo) l'interruttore **Stile Diablo** passa alla
visuale e all'aspetto di Diablo Immortal, subito e senza ricaricare; la scelta resta salvata nel
browser (`src/core/style.ts`). Predefinito: la camera in terza persona stile WoW. L'intro resta
com'è e passa alla visuale Diablo quando si prende il controllo.

- Camera alta e fissa (`src/camera/diabloCamera.ts`): imbardata a 45° (il complesso si legge in
  diagonale), inclinazione 58°, obiettivo stretto (33°), eroe piccolo e un po' sotto il centro;
  rotella o pizzico per lo zoom entro un intervallo, niente orbita.
- Muri e tetti tra la camera e l'eroe (`src/fx/occlusion.ts`), come in Diablo Immortal: niente
  veli trasparenti. I muri dal lato della camera che coprono il pavimento attorno all'eroe (fino ai
  muri della stanza in cui si trova) scendono in un quarto di secondo a un moncone di un metro
  chiuso da una copertina di pietra (un muro con cornici e archi, un lato di chiostro, un edificio,
  che dentro il bordo di pietra è pieno e scuro); quelli dal lato opposto restano interi. I tetti
  che coprono quel pavimento, quel che poggia o pende da un muro abbassato e quel che pende sotto
  un tetto sparito (lampadari, costoloni) svaniscono del tutto; alberi, pergole e colonne tra la
  camera e l'eroe pure. Isteresi su distanza e lato, così camminare lungo
  un muro non lo fa lampeggiare. L'eroe e i nemici ancora coperti si vedono in sagoma luminosa
  (x-ray). I pezzi (`LevelBuilder.together`) scendono o sfumano senza draw call in più: una texture
  di altezze di taglio e dissolvenze per pezzo; le copertine sono due draw call, solo mentre un
  muro è giù, e quel che è svanito del tutto non si disegna (ma fa ancora ombra).
- Comandi: WASD e stick relativi allo schermo; col mouse clic sul pavimento per andarci (tieni
  premuto per seguire il cursore), clic su un nemico per raggiungerlo e colpirlo finché cade
  (`src/player/diabloControls.ts`). I lanci girano l'eroe verso il bersaglio, altrimenti verso il
  nemico più vicino o il cursore. Le abilità si dispongono a ventaglio in basso a destra anche su desktop.
- Aspetto: grading gotico più scuro (desaturato, ombre fredde e luci calde, contrasto, vignetta),
  una luce calda che segue l'eroe, torce più forti; all'aperto (orto, giardini, laguna) la notte
  si schiarisce quanto basta a leggere piante, sentieri e nemici, chiesa e chiostri restano bui
  (`src/fx/atmosphere.ts`); numeri di danno, scintille, sangue a terra che si asciuga e una colonna
  di luce sui nemici caduti e, a missione accettata, sul baule della chiave (`src/fx/diabloFx.ts`); HUD in ferro scuro e
  rosso sangue.
- Arredo gotico Meshy, solo in questa modalità e caricato la prima volta che la si attiva
  (`src/level/gothic.ts`, `public/models/gotico.glb`): cumuli di teschi, ossa, candelabri,
  bare, lapidi nel chiostro grande e nel cortile degli ulivi, colonne cadute, una gabbia, bracieri
  di ferro chiodato con teschi. Solo visivo: nessun collider, percorribilità invariata.

## Audio

Suono e musica stile WoW/Diablo su Web Audio (`src/audio/`), tutto in `public/audio/` (~5 MB di MP3).

- **Motore** (`engine.ts`): un AudioContext avviato al primo gesto (iOS/Chrome), limiter sul master e
  quattro bus — musica, effetti, ambiente, voci — regolati dal pannello Audio del menu (generale +
  un cursore per bus, muto) e salvati nel browser. Effetti posizionati in 3D attorno all'eroe (alla
  camera durante l'intro) con attenuazione per distanza, tetto di voci per suono e totale, variante,
  intonazione e volume casuali a ogni colpo; la musica si abbassa sotto i colpi grossi e le battute
  del boss; il mondo si ovatta quando il menu o la mappa sono aperti; scheda nascosta = silenzio.
- **Mix** (`mix.ts`): livello, bus, variazione, voci massime, portata di ogni suono. Si ritocca lì,
  senza ricompilare l'audio.
- **Regia** (`director.ts`): legge il mondo a ogni frame e ne confronta lo stato col frame prima —
  aggro, colpi, lanci, dardi, nova, morti dei mob, passi dell'eroe sul suolo dipinto (pietra, ghiaia,
  erba, legno del pontile), salti, ferite, morte e risveglio, baule, chiave, grate e porte (anche
  quelle che l'intro apre e richiude) — più i suoni di ambiente per area (laguna: acqua, gabbiani,
  campane lontane; orto: vento tra le foglie, civette, rane alla vasca, l'alveare; chiostri e chiesa:
  fontana del pozzo, canto lontano, silenzio della navata, scricchiolii), torce che crepitano, preti
  che pregano sottovoce.
  Le abilità dell'eroe e le zappe dei frati suonano dove accadono (`forsaken.ts`, `friars.ts`).
- **Musica** (`music.ts`): tema dell'intro sincronizzato al piano sequenza (in streaming), esplorazione
  e strato di combattimento in loop sincroni (il combattimento aggiunge tamburi, ostinato e corni sugli
  stessi accordi), tema del Reverendissimo, stacchi di vittoria e di morte; letti d'ambiente in
  dissolvenza per area. Se il browser blocca l'audio, l'intro attende un tocco prima di partire.
- **Sorgenti**: la musica è sintetizzata da `scripts/audio/` (Python: numpy, scipy, soundfile);
  ambienti, voci ed effetti sono registrazioni reali CC0 (Kenney, OpenGameArt, Freesound: elenco in
  `scripts/audio/sources.py` e `ATTRIBUTION.md`) scaricate dalla build, tagliate, intonate,
  stratificate e messe in ambiente; il codice aggiunge solo lo scintillio delle magie.

```sh
python3 -m venv .venv && .venv/bin/pip install numpy scipy soundfile
.venv/bin/python scripts/audio/build.py      # rigenera public/audio/ e src/audio/manifest.ts
```

## Deploy

Push su `main` → GitHub Actions (`.github/workflows/deploy.yml`) builda e pubblica
`dist/` su GitHub Pages: https://monga-hub.github.io/Redentore/ . Vite usa
`base: '/Redentore/'`. Una tantum: in Settings → Pages scegliere "GitHub Actions" come sorgente.

## Scala e coordinate

- **1 unità = 1 metro.** +X = est, +Y = alto, −Z = nord (laguna), +Z = sud
  (Fondamenta). Origine = centro della facciata della chiesa, quota fondamenta.
- Calibrazione: corpo della chiesa (navata + cappelle) ≈ 26 m di larghezza, fronte
  del tempio ≈ 20 m → ≈ 0,12 m per pixel della piantina a 1500 px di larghezza.
  Tutto il resto è posizionato con lo stesso fattore e arrotondato al mezzo metro.
- Pavimento della chiesa a +2,4 m (12 gradini da 0,2 m). Complesso ≈ 75 × 206 m.
- Dettagli e quote di riferimento in `src/level/plan.ts`; ogni file di zona ha in
  testa la tabella delle sue coordinate.

## Struttura del codice

```
src/
  main.ts                    bootstrap: renderer, loop
  fx/atmosphere.ts           notte di luna piena: cielo (stelle, luna, nuvole), luna +
                             ombre, hemisphere, nebbia (più fitta verso la laguna), foschia
                             sull'acqua, pulviscolo, post (bloom, grading notturno, ACES);
                             interni/esterni sfumati per area.
                             `?fx=low` (o fps bassi sostenuti) spegne ombre e post
  fx/torches.ts              torce e bracieri: fiamme emissive, scintille, pool di 8
                             PointLight assegnate alle torce più vicine al player; candele,
                             lampadari e bagliori colorati delle vetrate da `level.lights`
  core/physics.ts            collisioni: tutto è un box (anche ruotato); pavimenti e muri
                             con la stessa regola (step 0,45 m). Nessuna dipendenza da three.
  core/input.ts              tastiera + mouse
  core/models.ts             modelli Meshy: caricamento GLB, posa in piedi, oggetto nel pugno
                             (corpi esclusi fuori dal campo visivo su bounding sphere larghe, ombre solo
                             entro 30 m dall'eroe: `Shadows`)
  player/controller.ts       personaggio segnaposto, WASD, gravità, salto
  player/undead.ts           modello del Reietto (Meshy) con la clava d'ossa: idle ansimante con
                             giravolte della clava, guardia dopo il combattimento, passo e corsa a
                             falcata misurata (niente piedi che scivolano), combo a 3 colpi, una
                             mossa per incantesimo, reazioni ai colpi, morte; aura per Velo e Patto
  camera/thirdPersonCamera.ts camera follow/orbit con anti-compenetrazione
  camera/intro.ts            piano sequenza d'apertura (spline Catmull-Rom sulle chiavi, saltabile)
  camera/diabloCamera.ts     Stile Diablo: camera isometrica fissa; CameraBlend per i cambi di stile
  core/style.ts              interruttore Stile Diablo (localStorage), `onStyle` per chi ne dipende
  player/diabloControls.ts   Stile Diablo: clic per muoversi e attaccare, mira dei lanci
  fx/occlusion.ts            Stile Diablo: muri abbassati, tetti e prop svaniti, sagome x-ray
  fx/diabloFx.ts             Stile Diablo: numeri di danno, sangue, colonne di luce
  ui/hud.ts                  nome dell'area corrente
  ui/actionBar.ts            barra abilità stile WoW (12 slot, sweep del cooldown, castbar,
                             tooltip, errori, testo di combattimento); ui/icons.ts icone SVG
  abilities/system.ts        esecutore abilità data-driven: cooldown, GCD 1,5 s, off-GCD,
                             lanci, canalizzate, interruzione al movimento. Nessun DOM/three
  abilities/forsaken.ts      le 8 abilità del Reietto (tabella `ABILITIES`, ordine `BAR`)
  abilities/vfx.ts           effetti di tutti gli incantesimi, in pool e senza allocazioni per
                             frame: particelle su quad da un atlante procedurale (bagliori,
                             scintille stirate, fumo che si erode, schegge, fiamme), scie, decal
                             a terra (onde d'urto, cerchi runici, crepe, pozze, telegrafi che si
                             riempiono), spuntoni d'osso, l'unica PointLight delle abilità e la
                             scossa della camera
  enemies/brain.ts           IA dei frati non-morti (zappa, aggro di gruppo, inseguimento,
                             zappata in mischia, evade, morte/respawn) e punti di spawn
                             nell'orto. Nessuna dipendenza da three
  enemies/friars.ts          modello (frate non-morto Meshy con la zappa in pugno), animazioni
                             (tre colpi a turno, reazioni ai colpi, grido all'aggro, morti varie),
                             barra vita; danni al player via `PlayerStats.takeDamage`
  enemies/caster.ts          IA dei preti caster (anche sacerdoti, Reverendissimo e api: `CasterKind` con mischia
                             e nova; spawn della chiesa, della laguna e dell'apiario, `killAll` alla vittoria) (preghiera, aggro con linea di vista, lancio
                             con cooldown, dardi a ricerca, indietreggiare restando nel
                             chiostro, evade, morte/respawn) e spawn per dimensione del chiostro
  enemies/bees.ts            ape gigante e operaie: un calabrone Meshy statico animato in codice (volo
                             librato, ali che battono nel vertex shader, picchiata col pungiglione,
                             sciame velenoso, sussulto ai colpi, caduta da morta); IA: caster.ts `APE`
  enemies/priests.ts         un corpo Meshy per tipo: prete in tonaca nera e cremisi (bastone col
                             cristallo), sacerdote corazzato viola e oro (mazza alata),
                             Reverendissimo arcivescovo-lich gigante (pastorale); animazioni
                             (reazioni, colpi alternati, morti varie), dardi d'ombra con scia,
                             nova del boss telegrafata a terra
  audio/engine.ts            motore audio: bus, impostazioni, sblocco, sprite MP3, voci 3D, ducking
  audio/mix.ts               mix sheet: livello, bus, variazione e portata di ogni suono
  audio/music.ts             musica adattiva (intro, esplorazione + combattimento, boss, stacchi) e letti d'ambiente
  audio/director.ts          regia: dallo stato del mondo ai suoni, alla musica e all'ambiente
  audio/manifest.ts          generato da scripts/audio/build.py: dove sta ogni suono
  quest/progress.ts          stato della progressione: fasi della missione, grate e porte (collider
                             rimovibili), baule con la chiave, Fra' Zuane, prompt di interazione,
                             vittoria. Nessuna dipendenza da three
  quest/dialogue.ts          battute di Fra' Zuane per fase, obiettivi del tracker
  quest/npc.ts               Fra' Zuane (Meshy, idle e gesti mentre parla, "!" sulla testa)
  quest/view.ts              grate e battenti animati, baule Meshy col coperchio che si apre e il
                             bottino, prompt "F", tracker della missione, barra del boss, banner di vittoria
  ui/dialogue.ts             finestra di dialogo stile WoW (ritratto, testo a macchina, Accetta / Rifiuta)
  level/plan.ts              scala, assi, quote principali, spawn
  level/builder.ts           LevelBuilder: box, muri con porte, stanze, portici, scale,
                             pergole; registra collider e aree
  level/props.ts             prop stilizzati low-poly (ulivi, alberi da frutto, cipressi,
                             arbusti, viti, pergole su percorsi, panche, pozzi) in InstancedMesh
  level/dressing.ts          allestimento per zona: vegetazione, portici dell'orto, arredi
  level/gothic.ts            Stile Diablo: arredo gotico Meshy (teschi, lapidi, bracieri...), solo visivo
  level/materials.ts         materiali stilizzati per ruolo semantico
  level/index.ts             buildLevel(): assembla le zone sud → nord, poi dressLevel()
  level/zones/
    fondamenta.ts            acqua, suolo, fondamenta, sagrato + scalinata, calle
    chiesa.ts                navata, cappelle, crociera + cupola, presbiterio, coro
    chiesaInterno.ts         interno in chiave WoW: volta a cassettoni, paraste, vetrate e
                             fasci di luna, baldacchino, tappeto, stendardi, lampadari
    convento.ts              ingresso, cortile degli ulivi, chiostrino, corridoio, 3 chiostri
    orto.ts                  pergola viti, orti, vasca, frutteto, apiario, uliveto, serra, ala est
    nord.ts                  corpo nord (cappella, sale, caffè, androne, laboratori,
                             frantoio), giardini (pitosfori, rose, pozzo), riva, pontile
scripts/check-walkable.ts    flood-fill di raggiungibilità con le regole del player, per fase della quest
scripts/check-abilities.ts   GCD, cooldown, lanci, canali e interruzioni del sistema abilità
```

### Dove agganciarsi (navi successive)

- **Materiali:** ogni mesh ha `userData.role` (`stone`, `brick`, `plaster`, `paving`,
  `grass`, …). Sostituire i materiali in `materials.ts` o attraversare la scena per ruolo.
- **Props/ambienti per zona:** `level.zones.get('orto')` ecc. è il `THREE.Group` della
  zona (`zone:<id>` nella scena). `level.areas` elenca le sotto-aree con rettangolo.
- **Collisioni:** aggiungere box con `builder.box(...)`/`obox(...)`; mesh solo visive
  con `collide: false`. `npm run check` deve restare verde.
- **Abilità:** aggiungere un oggetto `Ability` in `abilities/forsaken.ts` (o un altro kit)
  e il suo id in `BAR`; l'icona va in `ui/icons.ts`.
- Debug in console: `window.level`, `window.player`, `window.cam`, `window.scene`, `window.kit`, `window.quest`
  (es. `player.respawn({x: 0, z: -100, yaw: 0})`).

### Note per dopo (fuori scope qui)

- La vegetazione è instanziata con un colore per
  istanza che moltiplica il materiale del ruolo (`olive`, `flower`, `fruit`, …).
- Prestazioni: ~530 mesh non unite + ~7000 istanze in poche InstancedMesh (~60 fps).
  Se servirà, unire la geometria statica per zona.
- Interni non accessibili (masse grigie del convento, ala est) sono volumi chiusi.
- Le barriere invisibili chiudono la fondamenta a ±60 m e la riva nord.

## Materiale di reference

- `reference/piantina.jpg` — piantina illustrata del complesso (nord in basso a
  sinistra). Nessuna misura: la scala va derivata dalle dimensioni reali note
  del Redentore. Versione full-res (19MB PNG) in
  `~/Desktop/redentore_prova/_lavoro_claude/piantina.png`.
- Frame video di reference visiva (facciata, chiostri, orto, materiali):
  `~/Desktop/redentore_prova/_lavoro_claude/frames/` (`fa/`, `fb/`, 575 jpg
  720×1280).

## Layout (da sud a nord)

Fondamenta San Giacomo → sagrato/scalinata → chiesa (navata unica + cupola +
presbiterio) → convento con chiostri (cortile degli ulivi, ingresso a ovest) →
muro → Orto (vasca delle ninfee al centro, pergole di viti, orti a griglia,
frutteto, apiario, uliveto a est, serra) → corpo nord trasversale (laboratori,
frantoio/smielatura, sale espositive, cappella di meditazione, caffè,
segreteria) → giardini dei pitosfori, pergola di rose, pozzo → laguna.
