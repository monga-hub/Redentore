# redentore-dungeon

Dungeon 3D esplorabile (stile WoW / Scarlet Monastery) basato sulla Chiesa del
Redentore + Orto dei Frati, Giudecca, Venezia.

- Three.js nel browser, build Vite.
- Terza persona, controlli WASD.
- v1: solo esplorazione (niente nemici/boss).
- Estetica ispirata a WoW; nessun asset o logo Blizzard.

Stato attuale: **slice verticale in greybox** — l'intero complesso è camminabile
dalla Fondamenta San Giacomo alla laguna, con materiali piatti segnaposto.

## Avvio

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck (tsc) + bundle in dist/
npm run check    # verifica headless: ogni area è raggiungibile dallo spawn
```

Richiede Node ≥ 22.6 (`npm run check` esegue TypeScript direttamente con Node).

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
  main.ts                    bootstrap: renderer, luci neutre, loop
  core/physics.ts            collisioni: tutto è un box (anche ruotato); pavimenti e muri
                             con la stessa regola (step 0,45 m). Nessuna dipendenza da three.
  core/input.ts              tastiera + mouse
  player/controller.ts       personaggio segnaposto, WASD, gravità, salto
  camera/thirdPersonCamera.ts camera follow/orbit con anti-compenetrazione
  ui/hud.ts                  nome dell'area corrente
  level/plan.ts              scala, assi, quote principali, spawn
  level/builder.ts           LevelBuilder: box, muri con porte, stanze, portici, scale,
                             pergole; registra collider e aree
  level/props.ts             prop stilizzati low-poly (ulivi, alberi da frutto, cipressi,
                             arbusti, viti, pergole su percorsi, panche, pozzi) in InstancedMesh
  level/dressing.ts          allestimento per zona: vegetazione, portici dell'orto, arredi
  level/materials.ts         materiali stilizzati per ruolo semantico
  level/index.ts             buildLevel(): assembla le zone sud → nord, poi dressLevel()
  level/zones/
    fondamenta.ts            acqua, suolo, fondamenta, sagrato + scalinata, calle
    chiesa.ts                navata, cappelle, crociera + cupola, presbiterio, coro
    convento.ts              ingresso, cortile degli ulivi, chiostrino, corridoio, 3 chiostri
    orto.ts                  pergola viti, orti, vasca, frutteto, apiario, uliveto, serra, ala est
    nord.ts                  corpo nord (cappella, sale, caffè, androne, laboratori,
                             frantoio), giardini (pitosfori, rose, pozzo), riva, pontile
scripts/check-walkable.ts    flood-fill di raggiungibilità con le regole del player
```

### Dove agganciarsi (navi successive)

- **Materiali:** ogni mesh ha `userData.role` (`stone`, `brick`, `plaster`, `paving`,
  `grass`, …). Sostituire i materiali in `materials.ts` o attraversare la scena per ruolo.
- **Props/ambienti per zona:** `level.zones.get('orto')` ecc. è il `THREE.Group` della
  zona (`zone:<id>` nella scena). `level.areas` elenca le sotto-aree con rettangolo.
- **Collisioni:** aggiungere box con `builder.box(...)`/`obox(...)`; mesh solo visive
  con `collide: false`. `npm run check` deve restare verde.
- Debug in console: `window.level`, `window.player`, `window.cam`, `window.scene`
  (es. `player.respawn({x: 0, z: -100, yaw: 0})`).

### Note per dopo (fuori scope qui)

- Luci, nebbia e post-processing. La vegetazione è instanziata con un colore per
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
