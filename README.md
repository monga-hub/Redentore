# redentore-dungeon

Dungeon 3D esplorabile (stile WoW / Scarlet Monastery) basato sulla Chiesa del
Redentore + Orto dei Frati, Giudecca, Venezia; il livello 2 prosegue lungo la fondamenta
fino alla chiesa delle Zitelle, il livello 3 (l'ultimo) passa in gondola dalla Punta della Giudecca a San Giorgio Maggiore.

- Three.js nel browser, build Vite.
- Terza persona, controlli WASD.
- Nemici: frati non-morti che zappano l'orto a gruppi di 2-3 (32 in 12 gruppi, solo mischia) e preti
  non-morti che pregano nei chiostri a gruppi di 3 (1 gruppo nei chiostri piccoli, 2 nel mediano, 3 nel
  grande) e lanciano dardi d'ombra a distanza, indietreggiando se ti avvicini. Altri gruppi di preti
  (2-3, con un sacerdote nella cappella e nel frantoio) presidiano gli edifici verso la laguna: pontile,
  sala dei telai, refettorio dei frati, cappella del noviziato, falegnameria, frantoio. All'apiario un'ape gigante
  (élite tra sacerdote e boss: pungiglione in picchiata e uno sciame velenoso telegrafato a terra da
  cui scappare) con tre api operaie; fuori dalla portata dei sentieri lastricati. In chiesa due sacerdoti
  (bianco e viola, magia + mischia + un anello d'ombra telegrafato a terra) con due preti ciascuno — a
  capo della navata e dietro l'altare — e il boss, il Reverendissimo, sotto la cupola: magia, mischia,
  nova d'ombra da cui scappare, sotto il 60% marchi cremisi a terra (uno sotto i piedi, due ai lati:
  un passo di lato e li eviti), sotto il 30% furia (tutto più rapido), dopo 4 minuti di lotta ogni
  colpo triplica. Pensato per il livello 8-9: circa 3 minuti con una build sensata che schiva e
  l’equipaggiamento raccolto e assemblato per strada (col solo abito iniziale si perde spesso;
  le vecchie misure del bot con epici comprati non rappresentano la nuova economia); con il kit iniziale è quasi impossibile. Una morte ti risveglia al checkpoint senza perdere carte.
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
- **Livello 2, "La dote delle Zitelle"**: uscito dal portone, si torna da Fra' Zuane (ricompensa: 150
  esperienza e 80 oro); le sue catene ora sono di merletto, e la seconda missione racconta l'altra metà del voto:
  la Governatrice della Pia Casa delle Zitelle cuciva i morti contati dal Reverendissimo in un velo per la
  Madonna della Presentazione. Accettata la missione, le catene spettrali sul Ponte de la Croce cadono e la
  fondamenta della Giudecca si apre verso levante (`src/level/zones/giudecca.ts`): rio de la Croce e il suo
  ponte a gradini, Fondamenta de la Croce con sotoportego e campiello, il Campo de Santa Croce davanti alla chiesa
  chiusa, il rio e il ponte del Squero, lo squero con la gondola sui cavalletti, la Casa dei Tre Oci; oltre il
  canale Zattere, Salute e San Giorgio. Le Zitelle (`src/level/zones/zitelle.ts`): facciata bianca a due ordini
  col timpano e il finestrone termale, due campaniletti, cupola con lanterna; dentro l'aula quadrata ad angoli
  smussati sotto la cupola, i coretti con le grate, l'altar maggiore in un presbiterio a botte; attorno l'ospizio
  a ferro di cavallo (portineria, refettorio, sala del merletto, infermeria, dormitorio), il cortile col pozzo
  dietro l'abside e l'orto. Nemici (`src/enemies/zitelle.ts`, modelli Meshy): gondolieri annegati (remo, solo
  mischia) e codeghe, i portatori di lanterna della notte veneziana (fuochi fatui) lungo la fondamenta; zitelle
  spettrali con la rocca (fili) nell'ospizio; élite il Gastaldo dei gondolieri nello squero (vortice del remo,
  fuori strada) e la Maestra del merletto nella sala del merletto (forbici, linee di merletto a terra: un passo
  di lato e le eviti), che porta la chiave della chiesa: la porta si apre dal cortile, dietro l'altare. Il boss,
  la Governatrice, sotto la cupola: linee di merletto attraverso il giocatore, al 70% e al 40% chiama due zitelle
  ciascuna volta che le tengono il velo (finché vivono incassa l'80% in meno), sotto il 25% il fuso (fili
  incrociati che le girano attorno: si corre con loro, negli spazi), dopo 5 minuti e mezzo ogni colpo triplica.
  Morta lei, tutti i suoi cadono e il portone delle Zitelle si apre sul sagrato; Fra' Zuane chiude la missione
  (300 esperienza, 200 oro) e accenna a chi ha teso il filo. Bottino di livello 2: componenti per assemblare una delle tre famiglie del proprio eroe,
  oltre ad armi, gioielli e più oro; Mastro Iseppo vende componenti comuni, non comuni e rari di capitolo 2,
  mai epici o abiti completi (vedi sotto), e Fra' Bortolo dà una seconda infusione di ruta. Checkpoint: oltre il Ponte de la
  Croce, poi nell'andito dietro l'altare. Il salvataggio tiene la nuova missione (i salvataggi vecchi si caricano:
  a livello 1 finito si riparte dal rapporto a Fra' Zuane, la nebbia di guerra resta al suo posto).
- **Livello 3, "Le nozze di San Giorgio"** (l'ultimo): morta la Governatrice, Fra' Zuane manda il Risorto a
  est, oltre i Tre Oci, lungo la fondamenta di San Giovanni fino alla Punta della Giudecca (`src/level/zones/sangiorgio.ts`,
  `buildPunta`); al pontile della Punta la gondola di Mastro Iseppo, remata dall'ombra di un gondoliere annegato, lo porta (`src/quest/ferry.ts`, ~17 s sul bacino, la
  camera guarda l'isola e la nebbia del bacino si apre) fino all'approdo di San Giorgio Maggiore (`buildSanGiorgio`):
  piazzale, facciata palladiana, basilica con navata, crociera sotto la cupola e coro dei monaci, campanile, chiostro
  dei cipressi e chiostro degli allori, Scalone e Biblioteca del Longhena, antirefettorio e Cenacolo palladiano,
  darsena, giardino e Teatro Verde. L'Abate di San Giorgio rinnova lo sposalizio del mare con le anime della laguna;
  nemici (`src/enemies/sangiorgio.ts`, modelli Meshy): marinai annegati (mezzomarinaio), monaci neri (croce), amanuensi
  (penna, schizzi d'inchiostro), élite il Nostromo nella darsena (ancora) e il Bibliotecario in cima allo Scalone
  (ha la chiave del Cenacolo); boss l'Abate, alto il doppio dell'eroe, nel Cenacolo: Calice di Cana (cono di vino
  che versa: si esce di lato), Rintocchi (anelli di campana che corrono sul pavimento: si saltano), Acqua alta (il
  pavimento si allaga, restano asciutte poche isole: ci si sale), tre atti con onda dorata, rintocco e scossa a
  ogni cambio d'atto e tre rintocchi quando cade. Bottino di livello 3: componenti delle quattro rarità per gli abiti del nuovo capitolo,
  armi e gioielli, e il leggendario Anello della Sensa (solo dall’Abate); presa la missione, Fra’ Bortolo vende
  componenti comuni, non comuni e rari del livello 3, oltre alle precedenti armi e gioielli.
  Al ritorno Fra' Zuane chiude la storia (420 esperienza, 320 oro): i tre nodi sciolti, il voto del 1576 compiuto,
  lui libero di varcare la soglia; poi l'epilogo a tutto schermo e "Fine" (si continua a vagare). Il salvataggio tiene
  la missione e l'approdo (i salvataggi vecchi si caricano); i corpi del livello 3 si caricano con la missione e le
  zone si accendono solo a est dei Tre Oci.
- Nella serra dell'orto Fra' Bortolo, il fantasma dello speziale (punto esclamativo dorato finché non
  gli si parla), racconta l'antefatto che l'intro accenna: le fosse dell'orto, il conto del
  Reverendissimo, la ruta che ha lasciato al Risorto il suo nome. Una volta per partita congeda con la
  Benedizione della serra: per 3 minuti lanci il 20% più rapidi e +10% ai danni (icona e conto alla
  rovescia sotto il ritratto). La serra è fuori dalla portata dei frati. È anche un mercante
  (Commercia, in ogni pagina del dialogo): compra tutto quello che c'è nella borsa a un quarto del suo
  prezzo (con una fila per riacquistare le vendite della visita) e vende componenti comuni, non comuni e rari del capitolo sbloccato, le precedenti armi e gioielli epici, e i tomi delle due scuole dell'eroe (vedi Abilità).
- **Mastro Iseppo, el proto dello squero** (`src/quest/squero.ts`, modello Meshy): il fantasma del capomastro
  dello squero sul rio, in cortile accanto alla gondola sui cavalletti, fuori dalla portata dei mob. Sua figlia
  Marieta è ancora alle Zitelle; lui vuole finire l'ultima gondola per andarla a prendere. Missioni secondarie a
  catena (due alla volta, ognuna apre la successiva), stile WoW/Diablo: *I ferri di prua* (6 ferri dai gondolieri
  annegati), *Lumi spenti* (abbatti 6 codeghe), *La testa del Gastaldo* (la testa resta sul corpo anche se l'hai già
  ucciso), *Il ditale di Marieta* (sotto l'ultimo letto del dormitorio, un luccichio dorato), *Le forbici della
  Maestra*, *L'ex voto del Redentore* (si torna nella chiesa del livello 1, terza cappella a destra); e *La lettera
  di Marieta*, che parte raccogliendo un drop raro delle zitelle (sicuro dopo la chiave della Maestra). Ognuna
  paga esperienza e oro (tabella `QUESTS`, banner "Missione completata") conservando solo i precedenti premi diversi dall’armatura; Iseppo vende
  componenti comuni, non comuni e rari del capitolo della sua bottega (2 nello squero, 3 sull’approdo di San Giorgio), armi e gioielli precedenti e i tomi (Commercia). Tracker con più missioni, pin sulla minimappa per ogni
  obiettivo, oggetti di missione col raggio dorato; gondolieri e codeghe risorgono come i frati (lontano dall'eroe,
  un quarto dell'esperienza, bottino magro) finché la Governatrice è viva; se cade prima, le missioni di raccolta e
  di uccisione si consegnano lo stesso. Tutto nel salvataggio (i vecchi si caricano senza).
- **Missioni secondarie del Redentore** (livello 1, stesso motore di Mastro Iseppo, `GIVERS` in `src/quest/squero.ts`; due
  fantasmi cappuccini col corpo di Fra' Zuane, punto esclamativo dorato fin dall'inizio, missioni chiuse dalla morte del
  Reverendissimo): Fra' Anzolo, il foresterario, nella **foresteria** sull'uliveto, che la notte del voto lasciò fuori tre
  pellegrini. *Le lettere dei pellegrini*: tre lettere mai spedite, nel cortile degli ulivi, sulla panca della pergola delle
  viti e sotto la pergola di rose sulla laguna, in qualunque ordine. Poi *Il pane della cerca*: 4 pani dalle bisacce dei frati
  non-morti (50%, mai oltre i quattro), la tavola del refettorio dei frati apparecchiata, la campanella sull'altare della
  cappella del noviziato suonata per chiamarli a cena. Fra' Lunardo, l'apicoltore, nell'uliveto accanto all'apiario: *Il
  pungiglione della regina*, dall'ape gigante (resta accanto al corpo se è già morta), poi si affumicano gli alveari. 70, 80 e 80
  esperienza (230 in tutto) e un po' d'oro, nessun epico: chi le fa tutte arriva al Reverendissimo un livello sopra il percorso,
  non di più. Le note di zona salvate coi vecchi nomi (Caffè, Segreteria...) passano ai nuovi (`src/core/notes.ts` `RENAMED`).
- **Missioni secondarie di San Giorgio** (stesso motore, `GIVERS` in `src/quest/squero.ts`): *I marinai della Riva*
  da Mastro Iseppo sull'approdo, accanto alla gondola (abbatti 10 marinai annegati, che risorgono finché la missione è
  aperta; il Remo di Marieta); *I fari della darsena* dal Fanalista, un marinaio annegato che brilla color lanterna
  (riusa `marinaio.glb`: senza clip `Talk_*` parla con `Pray`/`Idle`). È a passi: 5 ampolle d'olio dai marinai, il faro
  di ponente (3 ampolle) e quello di levante (2), che sveglia un branco nascosto di 4 marinai sulla banchina e fa
  caricare il Nostromo; il suo spegnimoccolo al Fanalista. Paga la Lanterna del faro e indebolisce l'Abate: in *Acqua
  alta* un'isola asciutta in più (`PREPS` in `src/enemies/sangiorgio.ts`, applicate quando parte il combattimento). I
  branchi nascosti stanno in fondo a `PACKS`, salvati dopo l'Abate; le missioni si consegnano da sole se l'Abate cade.
- *Acqua di San Benedetto* da Padre Archivista, fantasma benedettino nel Passaggio del Longhena (corpo Meshy
  `archivista.glb`, Idle e Talk): al pozzo del chiostro degli Allori si attinge vino e salgono 3 monaci della cantina
  (branco nascosto: contano solo loro), poi si riattinge acqua (2 brocche) e se ne versa una per lavabo
  nell'Antirefettorio, ponente poi levante. Paga le Ampolle di San Benedetto e indebolisce l'Abate: il Calice di Cana
  fa il 40% di danno in meno (`PREPS=calice`).
- *Rintocchi muti*, la seconda dell'Archivista: la porta alla base del campanile porta con una dissolvenza alla cella
  campanaria, a 44 m (un pavimento tra i quattro pilastri, chiuso dal parapetto; la botola riporta giù). Lassù la
  telecamera resta corta e la foschia si apre sulla laguna: la cupola sotto, la Giudecca, la Salute, San Marco con la
  Riva degli Schiavoni, il Lido. Si tolgono i batacchi delle tre campane (maggiore, mezzana, piccola) e dalla scala sale
  il Campanaro di San Giorgio (branco nascosto: `monaco.glb` in bronzo, 2,8 m, con `campanaro.glb` in mano; ~5000 PV,
  i Rintocchi da saltare e il Rimbombo, una nova in uno spazio stretto). Paga il Batacchio di San Giorgio (arma epica,
  `campanaro.glb`) e indebolisce l'Abate: i suoi Rintocchi scendono da 3 a 2 anelli (`PREPS=rintocchi`).
  `node scripts/balance.ts campanaro` lo prova da solo.
- **La catena del Veronese**, obbligatoria prima del Cenacolo: il fantasma di Paolo Veronese aspetta
  nell'Antirefettorio (corpo Meshy `veronese.glb`, Idle e Talk). *I musici di Cana*: la viola in Biblioteca, il violino
  nel Presbiterio, il violone nel Coro e il flauto sul palco del Teatro Verde, in qualunque ordine, ognuno vicino al suo
  branco; paga 200 PE e 80 oro. *La tela tagliata*: sveglia il Commissario delle Arti nel chiostro dei Cipressi
  (corpo Meshy `commissario.glb`, ~7000 PV, resistenza 0.5; lo Squarcio, un fendente lungo e stretto a terra;
  l'Inventario, croci di gesso che esplodono; a metà vita chiama 3 granatieri, branco nascosto che torna a dormire se
  lui torna a riposo). Dal suo corpo la tela arrotolata: consegnata, paga la Sciabola del Commissario (`sciabola.glb`)
  e *Le nozze di Cana* tornano nella cornice del Cenacolo (`nozze.webp`). La porta del Cenacolo si apre solo con la
  chiave del Bibliotecario **e** la tela riportata; i salvataggi con la porta già aperta restano come sono.
  `node scripts/balance.ts commissario` lo prova da solo.
- **Le schede del conclave**: il fantasma del Cardinale benedettino (Barnaba Chiaramonti, poi Pio VII) aspetta sul
  Presbiterio, davanti all'altar maggiore (corpo Meshy `cardinale.glb`, Idle e Talk). Vuole 8 schede del conclave del
  1800, che cadono dagli amanuensi (50%) finché la missione è aperta; gli amanuensi intanto si rialzano, come i
  marinai per Mastro Iseppo. Paga 150 PE e 50 oro, nessun oggetto. È la prima delle tre missioni del Cardinale.
- **La tiara di cartapesta**: dopo le schede il Cardinale vuole i tre gioielli che le dame veneziane cucirono sulla
  tiara di cartapesta del 1800: lo smeraldo su uno scrittoio della Biblioteca, la perla sul palco del Teatro Verde
  (in qualsiasi ordine) e la spilla di rubini del Bibliotecario, che cade dal suo corpo anche se è già morto. Paga
  180 PE e 70 oro, nessun oggetto. Il Cardinale annuncia la processione fino al sagrato.
- **L'incoronazione**, la terza del Cardinale, una scorta (`src/quest/escort.ts`): appena l'eroe gli è vicino il
  Cardinale scende dal presbiterio e cammina, piano, sul tappeto della navata fino al sagrato sul Bacino. Ha 10000 PV
  (barra nel tracker) e si ferma tre volte: sotto la cupola, a metà navata e sul sagrato, dove si svegliano tre branchi
  nascosti di monaci neri (3, 4 e 4) che attaccano lui, non l'eroe. Aspetta l'eroe che resta indietro e, mentre cammina,
  recupera salute pregando. Se cade si rialza davanti all'altare e la processione ricomincia (anche dopo un
  caricamento). Sul Bacino si posa sul capo la tiara (un lampo d'oro); la consegna è lì e paga 350 PE, 150 oro
  e la *Benedizione apostolica*: i colpi dell'eroe sull'Abate fanno il 10% in
  più (`PREPS=benedizione`). `node scripts/balance.ts incoronazione` la gioca con il bot.
- **Il libro di sabbia**, la missione segreta: nessun "!" e nessun segnalino. La avvia una drop rara da un amanuense
  qualunque, *una pagina senza numero* (3% che sale dell'1% a uccisione), che manda «al centro del giardino dei sentieri
  che si biforcano»: al centro del labirinto Borges, sul tamburo di pietra, c'è il libro. Va riposto nella sesta
  scansia di noce a sinistra entrando in Biblioteca: le due pareti lunghe hanno otto scansie ciascuna, tutte con lo
  stesso «Riponi il libro», e solo quella giusta lo prende. Paga 200 PE e *Il libro di sabbia* (collo, epico unico), che
  a ogni apertura del tooltip mostra una pagina diversa.
- **Il drago di Carpaccio**, facoltativa (non serve per l'Abate): la dà la statua di San Giorgio nella nicchia sinistra
  della facciata della basilica, che parla senza corpo, solo luce e voce (ritratto: la testa del santo dal *San Giorgio e
  il drago* del Carpaccio, 1516, `statua.webp`). I tre pezzi della lancia (`token`) li hanno il Nostromo, il Bibliotecario
  e il Commissario delle Arti, che per questa missione si sveglia anche senza *La tela tagliata*; in qualunque ordine, e
  chi li ha già uccisi trova il pezzo accanto al corpo (anche dopo un caricamento o con l'Abate morto). Sul palco del
  Teatro Verde «Leva la lancia di San Giorgio verso la laguna»: il drago, che fino ad allora dorme, sale dall'acqua. Se
  l'eroe cade, o ricarica la partita, il drago lo aspetta sotto la laguna finché la missione è a quel passo. Abbattuto,
  si torna dalla statua: 450 PE, 200 oro e la *Lancia di San Giorgio* (arma leggendaria unica, `lancia.glb`, tenuta
  dritta come un bastone). Il combattimento è quello del prototipo.
  Con `?drago=1` nell'indirizzo il gioco parte al Teatro Verde con l'eroe al livello 18, il miglior
  equipaggiamento viola per posto e il branco del teatro addormentato; il salvataggio automatico è spento. Avvicinandosi
  al palco il drago (8000 PV, `src/enemies/drago.ts`) sale dalla laguna dietro il palco: testa Meshy su un corpo di
  serpente costruito nel codice (`src/enemies/serpent.ts`). Morso, sputo di veleno, *Fiato* (cono di veleno), *Coda*
  (nova attorno a sé), *Immersione* (sparisce sott'acqua e riemerge in uno dei tre punti segnati da briccole; l'anello
  di quello scelto si riempie di verde un attimo prima); al 40% e al 20% salgono due marinai annegati per volta. In
  console `drago()` lo rimette in piedi. `node scripts/balance.ts drago melee,arcane` lo gioca con il bot.
- Equipaggiamento (`src/loot/builds.ts`, `src/loot/gear.ts`): quattro posti, abito completo, arma, amuleto e anello.
  Ogni eroe ha tre famiglie (prima scuola, seconda scuola, ibrido), ciascuna nei tre capitoli: 45 definizioni prima delle
  rarità comune, non comune, rara ed epica. Si parte con un abito comune e l’arma del proprio eroe.
  I nuovi abiti si assemblano: raccogli sei componenti diversi (testa, spalle, torso, mani, gambe, piedi) dello stesso
  capitolo, rarità ed eroe. In borsa il progresso è `0–6/6`: **Unisci** avvia una breve animazione, poi tre carte illustrate
  mostrano le build equivalenti, ruolo, priorità e statistiche. Scegli e conferma: solo allora i sei pezzi diventano un abito.
  Annullare o ricaricare prima della conferma conserva tutto; una borsa cambiata richiede una nuova verifica.
  La borsa deve poter contenere l’abito dopo il consumo. I componenti si impilano fino a 20, non si indossano.
  Botteghe: sei componenti comuni, sei non comuni e sei rari del capitolo sbloccato; nessun componente epico e nessun
  abito completo. Armi e gioielli conservano economia e premi precedenti. Le missioni non regalano armature o abiti:
  mantengono PE, oro, premi diversi dall’armatura e completamento una tantum. Nessun premio viene riaccreditato.
  Pezzi di capitoli o rarità diversi non si uniscono e non si potenziano automaticamente. I vecchi pezzi, privi di
  metadati espliciti di componente/eroe, restano conservabili e vendibili ma non sono ingredienti; gli abiti già ottenuti restano tuoi.
  Drop componenti provvisori: worker 1 tiro al 50%, frate 1 al 75%, prete 1 all’85%, élite 2 al 100%/50%, boss 2 al
  100%/100%. Nel tiro riuscito, comune/noncomune/raro/epico: worker e frate 32/29/29/10, prete 28/30/30/12,
  élite 24/30/30/16, boss 22/29/29/20 (denominatore 100). Epici per morte attesi: 0,05/0,075/0,102/0,24/0,40.
  Dopo aver estratto la rarità si sceglie uniformemente una parte mancante in borsa per la stessa ricetta, se presente;
  altrimenti una delle sei. Nessun numero garantito di epici: sfortuna sulla rarità e duplicati dopo il set completo
  rimangono; ritardare la raccolta può produrre parti duplicate a terra. Nemici risorti: tabella worker, fino al boss;
  ricaricare un morto non rigenera bottino. `node scripts/simulate-components.ts` riproduce le simulazioni seeded dei
  roster reali, p50/p90/p99, ripetizioni e pressione della borsa: le stime non misurano minuti reali di gioco.
  Ruolo, statistiche consigliate e incantesimi suggeriti si leggono nei tooltip: le abilità vanno sempre apprese,
  nessuna viene concessa o bloccata dall’abito. Armatura e statistiche agiscono
  davvero: Vigore (+10 salute), Intelletto (+10 mana), Spirito (rigenerazione), Potenza (+% danni),
  Critico (probabilità di un colpo al 150%) e Celerità (velocità di lancio e recupero globale, tempi divisi per 1 + bonus/100);
  l'armatura toglie A / (A + 700) dei danni. Il confronto con il pezzo indossato è nel tooltip.
  I salvataggi precedenti conservano il corredo misto equipaggiato e tutti gli oggetti in borsa, con gli stessi bonus
  e prezzi di vendita. Al primo abito, i sei pezzi passano in borsa atomicamente: se manca spazio, niente cambia.
  I pezzi vecchi si possono conservare o vendere, senza nuovi equipaggiamenti separati. Gli ID sconosciuti e le borse
  eccedenti restano recuperabili nel salvataggio, senza statistiche o valore inventati; nessun reset o premio di migrazione.
  Il confronto di un abito include l’intero vecchio corredo. I quattro posti e l’anteprima sono nella scheda esistente.
  Per i corredi precedenti, quello che si indossa si vede sul Risorto (`src/player/outfit.ts`), come i set di WoW e Diablo: ogni famiglia di pezzi
  è un set con la sua sagoma e i suoi colori, e un set intero si legge come un solo personaggio. Livello 1: il becchino
  della peste (verde: cuoio cerato, ferro arrugginito, fiale di vetro, cappello e maschera a becco), il chierico (verde, per
  chi lancia: talare nera, cotta di pizzo, mozzetta cremisi, saturno), l'Arsenale (blu: acciaio e ottone, fascia cremisi,
  morione crestato col pennacchio), Murano (blu, per chi lancia: broccato verde-azzurro e oro, vetri d'ambra e cobalto
  accesi, corona di fiamme di vetro), il secondo voto (viola: acciaio annerito e filigrana d'oro, velluto viola, teschi,
  spallacci col teschio dagli occhi viola, mitria con la croce accesa). Livello 2: il gondoliere annegato (verde: maglia a
  righe, fascia cremisi, alghe e cirripedi, paglietta), la Pia Casa (blu: ferro catramato, pizzo bianco, argento, tricorno),
  la Governatrice (viola: broccato d'oro, pizzo, perle, cristalli ciano accesi, corona col velo). Il set di canapa è il
  corpo del Risorto com'è. Ogni set è il corpo stesso dipinto di nuovo (una ritexture Meshy del Risorto sui suoi UV, da un
  concept dipinto di lui in quel set: colore, rilievo, ruvidezza e metallo), e il corpo si dipinge a zone (cappuccio,
  spalle, petto, braccia, mani, fianchi, gambe, piedi) dal set del posto che le copre, così stoffa e armatura si piegano
  col corpo; sopra, scolpiti con Meshy e fissati alle ossa, l'elmo o il cappello sul cappuccio e gli spallacci (i suoi
  spallacci d'osso rientrano sotto i nuovi). Le armi sono gli oggetti di scena dei nemici (pastorale, remo, rocca, scettro...)
  o modelli Meshy loro (la mazza a campana, il turibolo di Murano); un'arma non attraversa il corpo: a ogni fotogramma si gira attorno al pugno quanto basta per uscire dal corpo (capsule sulle ossa) e dai pezzi indossati, e bastoni, pastorale, scettro e rocca restano dritti con la testa in su. Si carica solo quello che si indossa e si libera quello che si
  toglie. Nella scheda del personaggio c'è l'eroe stesso, a figura intera, di fronte e vestito com'è, che respira; trascinandolo si gira.
- Estetica ispirata a WoW; nessun asset o logo Blizzard.

Stato attuale: **slice verticale in greybox** — l'intero complesso è camminabile
dalla Fondamenta San Giacomo alla laguna, con materiali piatti segnaposto.

## Avvio

```sh
npm install
npm run dev      # http://localhost:5173/Redentore/
npm run build    # typecheck (tsc) + bundle in dist/
npm run balance  # banco di bilanciamento headless: un bot gioca la missione e poi il livello 2 fino alla Governatrice (6 build, ciascuna del suo eroe con le offerte delle sue due scuole: melee e mixed il Risorto, frost Bortolo, venom Suor Fosca, fire Fra' Tizian, storm Zanetto, + uno che non schiva; quando nessuna delle tre carte è della build il bot sceglie come un giocatore qualunque) e i boss da soli (il Reverendissimo ai livelli 1/6/8/9, la Governatrice a 10/11/12, l'Abate a 17), tabella per zona; il bot indossa il bottino migliore e vende il resto, i boss da soli in set iniziale, tipico, con epici comprati o tutto epico. Modi: route2, boss2, elite2, route3 (livelli 1, 2 e 3 di fila: Punta, gondola, isola, Bibliotecario, Abate), boss3, pack3 (un gruppo dell'isola contro chi lancia); `TOMES=plague,holy` parte coi tomi di quelle scuole letti, `HERO=bortolo` gioca ogni build su Bortolo (il suo attacco base, il suo kit, le offerte delle sue scuole; vedi scripts/balance.ts)
npm run check    # verifica headless: raggiungibilità per fase della quest (chiesa e chiostro grande chiusi all'inizio, tutto aperto con la chiave; la Giudecca e le Zitelle chiuse fino alla seconda missione, la loro chiesa fino alla chiave della Maestra) + sistema abilità + incantesimi e stati (rallentato, congelato, stordito) + IA di frati, preti, sacerdoti, boss e api, e del livello 2 (gondolieri, linee di merletto, velo, fuso) + salvataggi e loro fusione col cloud (client finto: cloud più avanti, dispositivo più avanti, eroe di prima del cloud contro uno nuovo, offline, non connesso, cloud in errore) + livelli e carte + volo dell'intro senza compenetrazioni + bottino, borsa, equipaggiamento e mercante
npm run soak     # il gioco vero in Chrome headless su un iPhone emulato: un bot combatte il Reverendissimo per tutti gli atti con le abilità delle due scuole dell'eroe (speciali comprese), la furia e il calo di qualità forzato; l'eroe si cambia due volte al secondo (set interi, misti, niente); nessun errore, niente che cresca, buffer GPU entro 200 MB (SOAK_SECONDS=600 per uno più lungo, SOAK_LEVEL=2 per la Governatrice sotto la cupola delle Zitelle, SOAK_LEVEL=3 per l'Abate nel Cenacolo, CHROME=... per il binario)
```

Richiede Node ≥ 22.6 (`npm run check` esegue TypeScript direttamente con Node).

Una nuova partita si apre con un piano sequenza in tempo reale (`src/camera/intro.ts`):
dalla laguna alle sale espositive, l'orto, il corridoio, i chiostri mediano e grande, la
chiesa, un giro attorno al Reverendissimo e fuori dal portone che si chiude, fino alla
camera dietro al personaggio. Sopra scorre l'antefatto in didascalie cinematografiche, una per
luogo (`CAPTIONS`: la peste del 1576, il voto e Palladio, i morti sepolti nell'orto, il secondo
voto del Reverendissimo, la notte del Redentore, il Risorto), ciascuna con l'id della sua futura
voce narrante (`Intro.onLine`). Esc, Spazio, Invio, clic o tap la saltano; una partita
caricata parte senza intro. La partita in corso si salva da sola ogni 5 s e quando la scheda va
in secondo piano, ma solo lontano dai combattimenti, e ogni avvio la riprende ("Partita ripresa"):
se iOS chiude la scheda (o l'app dalla schermata Home) si riparte da prima dell'ultimo scontro.
"Nuova partita" la cancella.

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
| 1 … 9 | barra delle abilità (anche clic/tap sui pulsanti): l'attacco primario, l'attacco base della scuola dell'eroe (Caduta d'ossa per il Risorto, Stiletto di ghiaccio per Bortolo, Spina di peste per Suor Fosca, Tizzone per Fra' Tizian, Folgore per Zanetto), fisso sull'1 (il tasto grande su touch), e gli otto posti 2 … 9 che si riempiono dal libro delle abilità (col mouse trascinali anche sulla barra per scambiarli; l'ordine resta salvato). Il Risorto parte con Preghiera di suffragio (2), Bortolo con Dardo di brina (2), Caligo gelato (3) e Preghiera di suffragio (4), Suor Fosca con Nube di peste (2), Sputo di bile (3) e Preghiera di suffragio (4), Fra' Tizian con Rogo dell'eretico (2), Cero funebre (3) e Preghiera di suffragio (4), Zanetto con Catena di saette (2), Rintocco del campanile (3) e Preghiera di suffragio (4); le altre arrivano coi livelli |
| R | Fiala di linfa tombale: ripristina il 30% della salute massima |
| T | Fiala di essenza spettrale: ripristina il 30% del mana massimo |
| Tab | passa al bersaglio successivo entro 40 m, in ordine di distanza dall’eroe, tornando al primo dopo l’ultimo |
| K | libro delle abilità (anche il pulsante col libro sotto la figura, o dal menu): vedi sotto |
| 1 / 2 / 3 | al passaggio di livello (il gioco si ferma) scegli una delle tre carte: nuova abilità o potenziamento (anche clic/tap, ←/→ e Invio) |
| Esc | annulla il lancio in corso; altrimenti apre il menu di gioco (salva/carica, audio, crediti) |
| B | borsa: oro e oggetti raccolti dai nemici (camminaci sopra; l'oro viene attirato), con descrizione al passaggio o al tocco; anche il pulsante sotto l'ingranaggio. Clic su un equipaggiamento (secondo tocco su touch) per indossarlo; i componenti si uniscono con Unisci: quello che toglie prende il suo posto nella borsa; dal mercante il clic vende |
| C | scheda del personaggio: manichino stile WoW con i quattro posti (abito, arma, amuleto e anello) attorno all'eroe a figura intera, vestito com'è (trascinalo per girarlo), e accanto i numeri (salute, mana, armatura, danni, critico, celerità, mana/s); clic su un pezzo per toglierlo. Anche il pulsante sotto la borsa; si apre accanto alla borsa |
| F | interagisci (parla con Fra' Zuane, apri baule, grate, porte); su touch tocca il riquadro che appare. Nel dialogo F, Spazio o Invio proseguono, Esc chiude |

Su telefono/tablet (solo dispositivi touch): stick virtuale a sinistra per muoversi,
trascina sul resto dello schermo per la camera, pizzica per lo zoom; a destra le
abilità diventano tasti tondi a ventaglio attorno all'angolo (stile action-RPG mobile): l'attacco
primario grande nell'angolo, gli otto posti attorno, e fuori dagli otto, in basso a sinistra dove
riposa il pollice, il salto e le due fiale. Accanto alle fiale, due tasti dorati selezionano soltanto:
quello superiore (frecce circolari) scorre i nemici, quello inferiore (mirino) sceglie il più vicino all’eroe.
Entrambi escludono morti, nemici in ritirata, non caricati o a 40 m e oltre; controllano la linea di vista
dall’eroe, così un ostacolo davanti alla sola telecamera non li impedisce. Tab conserva la visibilità
della visuale corrente. La selezione manuale resta prioritaria anche oltre la portata di una magia:
portata, muri e recupero sono verificati al lancio. Nessun candidato cancella la selezione. In colonna sotto l'ingranaggio borsa, figura e libro;
lo schermo intero (solo dove il browser lo permette) sta sotto il riquadro del personaggio.

In alto a sinistra il riquadro del personaggio mostra vita e mana (`src/player/stats.ts`,
anche `window.playerStats`: `takeDamage`, `heal`, `spendMana`).

## Eroi

Una partita nuova si apre sulla scelta dell'eroe (`src/ui/select.ts`, `src/player/heroes.ts`), alla Diablo Immortal:
il Risorto (Ossa, secondaria Ombra), il morto senza nome della Giudecca, e Bortolo (Gelo, secondaria Fulmine), il gondoliere
annegato l'inverno in cui gelò la laguna, col remo gelato, Suor Fosca (Peste, secondaria Sacro), la monaca del Lazzaretto
Vecchio che curò gli appestati fino a diventarne il contagio, con lo stiletto d'osso, Fra' Tizian (Fuoco, secondaria Sacro),
il frate soffiatore delle fornaci di Murano bruciato vivo al forno, con la canna da vetraio e la sua goccia di vetro fuso, e Zanetto
(Fulmine, secondaria Ossa), il campanaro del Redentore colto dal fulmine mentre suonava a morto, col martello da campana e le due
campane sul giogo dietro le spalle. A sinistra la colonna degli eroi (tutti quelli di
`HEROES`, in ordine): ritratto in un rombo dorato, sotto il livello del suo salvataggio migliore (1 se non ne ha), accanto il nome;
quello scelto è illuminato e mostra titolo, scuola primaria (medaglia d'oro) e secondaria (medaglia d'argento): le stesse medaglie
(`medal` in `src/ui/book.ts`) stanno sotto il nome nella scheda del personaggio e sulle due scuole del libro delle abilità. Al centro l'eroe stesso (`src/ui/selectStage.ts`), il
suo corpo vero vestito come nel salvataggio, che respira su un'isola-cimitero in laguna di notte (muro di mattoni e cipressi
come a San Michele, lapidi, colonna caduta e braciere da `gotico.glb`, luna, nebbia, la città controluce oltre l'acqua);
trascinandolo si gira. In basso a destra "Entra nel mondo" (o Invio) parte con lui; ←/→ ↑/↓ cambiano eroe. La scena ha un
renderer suo e un modello per volta, e tutto torna libero (GPU compresa) prima che nasca quello del gioco. La scuola va col personaggio: il Risorto parte con le Ossa,
Bortolo col Gelo (Stiletto di ghiaccio sul tasto grande, Dardo di brina e Caligo gelato), Suor Fosca con la Peste (Spina di peste
sul tasto grande, Nube di peste e Sputo di bile), Fra' Tizian col Fuoco (Tizzone sul tasto grande, Rogo dell'eretico e Cero
funebre), Zanetto col Fulmine (Folgore sul tasto grande, Catena di saette e Rintocco del campanile); carte dei livelli e tomi sono
solo delle sue due scuole (vedi Abilità). Le statistiche restano disponibili a tutti: Potenza è universale,
Potenza d'attacco aumenta i danni fisici, Potenza magica quelli magici (+1% per punto, bonus sommati).
Forza aggiunge `40 × F / (80 + F)` punti percentuali al canale fisico; Agilità aggiunge
`30 × A / (60 + A)` punti percentuali alla Celerità. I rendimenti decrescono, senza soglie obbligatorie.
Ossa usa il canale fisico, gli incantesimi quello magico; Sentenza del sepolcro divide a metà i due canali.
Turbine di brina separa il colpo fisico dal bonus magico contro i congelati. Veleni, evocazioni e zone usano
il canale magico; Critico vale per entrambi. Agilità e Celerità accelerano lanci e recupero globale,
non ricariche, attacchi base o canalizzazioni. Intelletto (+10 mana/punto), Spirito (+0,1 mana/s/punto)
e cure percentuali mantengono le loro regole. La scheda mostra separatamente danni fisici e magici.
Note di zona (`src/core/notes-cloud.ts`): «Salva e invia nota» conserva prima la nota in `redentore-notes`,
poi tenta una sola chiamata a `submit('redentore', note)` del modulo same-origin `/hub/notes.js`, con la sessione
Mongames. Invia categoria, testo, zona, livello della quest, eroe, posizione `{x, z}`, versione e data originale
ISO (`createdAt`). Il livello dell'eroe resta nella copia locale e negli export. Il pannello distingue invio
confermato, mancato accesso e invio non confermato. Senza login, offline, con import fallito o errore del database,
la copia locale e gli export restano disponibili. Se il salvataggio locale fallisce non parte alcun invio.
Nessun caricamento delle note storiche, polling o reinvio automatico; eliminare una nota rimuove solo la copia locale.
Non c'è un pulsante di retry: riscrivere e salvare lo stesso testo crea una nuova nota e può duplicare quella remota,
anche se una risposta precedente era andata persa dopo l'inserimento. Non viene registrato uno stato di consegna persistente.
La tabella e le policy richiedono l'applicazione di `supabase/notes.sql` nel progetto hub; le verifiche automatiche
usano un modulo simulato e non verificano login, schema o RLS sul database live.

Salvataggi nel cloud (`src/core/cloud.ts`): il gioco importa a runtime `/hub/saves.js` dell'hub Mongames (stesso dominio, stesso
login). Sotto il titolo della squadra e in fondo al menu c'è la riga dell'account (`src/ui/account.ts`): da non connesso il link
"Accedi per salvare nel cloud" (`/accedi.html?next=/Redentore/`), da connesso l'email e lo stato del cloud. La partita sul
dispositivo resta quella giocata; da connesso ogni eroe ha uno slot suo (`slot` = id dell'eroe), mandato al massimo ogni 15 s
dopo i salvataggi automatici, quando la scheda va in background e a "Cambia eroe". All'avvio e a ogni accesso dispositivo e
account si fondono eroe per eroe: vince la partita più avanti (più XP, poi più tempo giocato, poi il timbro `at` più
recente), in tutte e due le direzioni, così un eroe salvato prima del cloud non perde contro uno nuovo provato su un altro
dispositivo; una partita del dispositivo sostituita resta in `redentore.replaced.<eroe>` (e torna se è più avanti). Offline,
in `npm run dev`, senza hub o con un errore del cloud tutto resta sul dispositivo come prima, e la riga dell'account dice
"Cloud non riuscito" (il motivo nel suo `title` e in console); "Ricomincia" cancella anche lo slot dell'eroe.
La scelta resta nel salvataggio (`hero`; i salvataggi di prima e quello pronto per il livello 2 sono il Risorto) e il
gioco carica solo il corpo dell'eroe scelto. I cinque sono corpi Meshy sullo stesso scheletro a 24 ossa, ciascuno con la sua
sagoma, la sua altezza (`HEROES.height`: dai 2,25 m del gigante gelato Bortolo agli 1,68 del tozzo Fra' Tizian) e il suo bagliore
(il fuoco viola nelle costole del Risorto scheletrico, i cristalli di Bortolo, il verde veleno di Suor Fosca, il vetro fuso nelle
braccia di Fra' Tizian, il verderame di Zanetto), e con le sue clip (idle, passo, corsa, salto, capriola, colpi, incantesimi,
reazioni, morte) prese dalla libreria di animazioni Meshy e ritagliate sugli stessi nomi e tempi del gioco (colpi, capriola, la
finestra in aria del salto), così il gioco è identico per tutti. Ognuno ha la sua arma di partenza in un file suo
(`arma-<eroe>.glb`: la clava di femore, il remo da guerra gelato, lo stiletto al veleno, la canna da vetraio con la goccia fusa,
il martello da campana).

Ogni eroe ha tre aspetti coordinati, uno per famiglia di build (`src/player/whole-outfit-key.ts`). L’abito completo
sceglie insieme le sei parti corrispondenti dello stesso sorgente; capitolo e rarità modificano rilievi e finiture sulla
sagoma della famiglia. La palette appartiene alla build: comune sobrio e opaco, raro più ricco, epico rifinito con
bagliori discreti, senza imporre stoffa blu agli oggetti rari. Il cambio è atomico anche nel renderer: il corredo precedente
resta visibile finché quello nuovo è interamente pronto, e resta intatto se un caricamento fallisce. Il vecchio corredo
misto continua a usare la resa precedente fino al primo abito. Le quindici illustrazioni di indumenti completi sono
nell’atlante `public/models/hero-outfits/whole-icons.webp`, condiviso da borsa, scheda e botteghe.

Sono riutilizzati i dodici master di produzione di Bortolo, Fosca, Tizian e Zanetto. I tre master del Risorto sono
assemblati da texture originali Arsenale/Chierico/Voto e ornamenti già adattati: **nessun nuovo modello interamente
scolpito**. Restano scheletro, animazioni, mani e presa delle armi originali. La coerenza del completo non elimina ogni
compenetrazione o irregolarità delle vecchie fonti: il Risorto conserva costole e arti scheletrici esposti e non ha una
nuova corazza chiusa con avambracci e schinieri scolpiti. Per raggiungere quel tipo di riferimento servirebbe ulteriore
lavoro sulla geometria degli indumenti; questo aggiornamento non lo dichiara raggiunto. Asset e provenienza sono in
`public/models/hero-outfits/`; `scripts/check-whole-outfits.ts` verifica le quindici identità, coperture, scheletro e
caricamenti atomici, insieme ai controlli delle fonti precedenti.

## Abilità

Si parte con l'attacco base della propria scuola, Preghiera di suffragio (la cura) e la fiala, Bortolo anche con Dardo di brina e Caligo gelato, Suor Fosca con Nube di peste e Sputo di bile, Fra' Tizian con Rogo dell'eretico e Cero funebre, Zanetto con Catena di saette e Rintocco del campanile.
Ogni scuola ha il suo **attacco base** (`BASE_ATTACK`), da tenere premuto: istantaneo, fuori dal recupero globale, uno ogni 0,3 s, gratis,
e un colpo ogni tre è il terzo della combo. Ossa: Caduta d'ossa (la clava, combo a tre colpi); Gelo: Stiletto di ghiaccio (triplo su chi è
congelato, rallenta del 25% per 2 s, schegge per un terzo entro 2 m); Peste: Spina di peste; Ombra: Strale d'ombra; Fuoco: Tizzone (braci per un terzo entro 2 m); Fulmine: Folgore; Sacro: Castigo (gli ultimi cinque, strali da 8
danni). Ognuno ha i suoi quattro potenziamenti, come Caduta d'ossa: più danni a colpo (+40% a rango), lo schizzo (metà dei danni entro 2,5 m;
lo Stiletto: i Frantumi del congelato), il terzo colpo (+75% a rango), 4 mana a colpo a rango. Chi conosce 3 delle 5 abilità della sua scuola secondaria
impara da solo anche il suo attacco base ("Hai appreso..."): nel libro *Sul tasto grande* lo scambia col proprio, la scelta resta nel
salvataggio (`build.main`) e i potenziamenti restano a ciascuno, anche nelle carte.

**Alberi dei talenti** (`src/player/talents.ts`): ogni punto va su un nodo di uno dei tre alberi dell'eroe, la scuola primaria, le
Fusioni (i passivi, le fiale, Rancore e la fusione delle sue due scuole in fondo) e la scuola secondaria. Un albero di scuola parte
dalla sua medaglia (data): sotto l'attacco base e le tre abilità con i loro potenziamenti, le due speciali appese a due percorsi
ciascuna. Un nodo si apre quando un nodo sopra collegato ha un rango (un'abilità: posseduta), l'albero ha il suo livello (scuole 2,
Fusioni 3) e le righe sopra la sua fascia hanno abbastanza punti dell'albero (`GATE`: righe 4-5 due, 6-7 sei; nelle Fusioni la fusione
cinque); un nodo a scelta prende uno dei due effetti, mai entrambi. Ogni carta ha un rango massimo (`CAP` in `src/player/levels.ts`, la
carta mostra "rango N/max"). Ogni livello offre tre carte, una per albero, tra i nodi aperti (un nodo mai preso pesa 3, un altro rango
1, `offer`): ai livelli pari fino al 10 le carte delle scuole sono abilità nuove se ce n'è una aperta, al 6 e all'8 quella della primaria
una speciale; un albero senza nodi aperti passa la carta agli altri, e Linfa tombale riempie quando tutto è chiuso (`src/player/levels.ts`:
34 abilità, cinque per scuola contando quelle iniziali e lasciando a parte gli attacchi base; 104 carte di potenziamento di cui 11
fusioni). Escono solo carte delle due scuole dell'eroe e quelle di nessuna scuola (`ours`), e di fusioni solo quella delle sue due
scuole: Passo spezzaossa (il Risorto), Saetta di brina (Bortolo), Miasma velenoso (Suor Fosca), Giudizio ardente (Fra' Tizian),
Turbine a martello (Zanetto). **Build del personaggio** (`src/ui/build.ts`, dalla scheda del personaggio e dal Custode): i tre alberi
affiancati (sul telefono a schede), nodi quadrati le abilità, tondi i potenziamenti, ottagoni le scelte; toccando un nodo si vedono
effetto, rango, cosa manca e "Potenzia · 1 punto" per i punti da parte. I salvataggi di prima degli alberi si adattano al caricamento
(`fit`): i ranghi oltre il massimo, il lato minore di una scelta presa due volte e i nodi rimasti senza nodo sopra o senza i punti della
fascia tornano punti da spendere, mai persi; abilità e Linfa tombale restano. Non c'è un livello massimo (servono 20 × livello
esperienza per salire). Le
abilità sbloccate prendono il primo tasto libero della barra, nell'ordine del pollice sul ventaglio touch; con gli otto posti pieni aspettano nel libro.

**Tomi** (Fra' Bortolo e Mastro Iseppo, Commercia): uno per scuola (Ossa, Peste, Ombra, Fuoco, Gelo, Fulmine, Sacro), ma il mercante
vende a ciascuno solo i due delle sue scuole (`tomesOf`). Insegna subito tutte le abilità della scuola che non si conoscono ancora, che
vanno nel Libro delle abilità pronte da equipaggiare. Costa 200 oro per abilità e 350 per una speciale, solo per quelle che insegna
davvero (una scuola completa 1300, il Sacro 1100: Preghiera di suffragio si ha dall'inizio; a Bortolo il Gelo 900, a Suor Fosca la
Peste 900, a Fra' Tizian il Fuoco 900, a Zanetto il Fulmine 900, le due abilità del kit le hanno già; gli attacchi base non stanno nei
tomi); quando non ha più niente da insegnare sparisce. Le abilità dei tomi non escono più come carte, i loro potenziamenti sì. Nel
salvataggio (`build.learned`; i vecchi si caricano senza).

**Salvataggi di prima delle scuole per eroe** (`ownSchools` in `src/player/levels.ts`, al caricamento in `src/core/save.ts`): le carte
prese d'una scuola che l'eroe non ha più si tolgono e i livelli che le avevano date tornano da scegliere (le offerte ripartono dalle
sue due scuole, `Levels.pending`); le abilità imparate da un tomo d'altre scuole si rimborsano al prezzo del tomo (200 oro, 350 una
speciale); e cadono anche le carte che senza di loro non reggono (una fusione senza una delle sue abilità, un potenziamento
dell'abilità tolta, una carta della furia senza nessuna speciale), rimborsate allo stesso modo come livelli da riscegliere. Un
salvataggio già convertito ricaricato non cambia più.

**Libro delle abilità** (K, il pulsante col libro, o "Libro delle abilità" nel menu; il gioco si ferma), impaginato come
quello di Diablo Immortal (`src/ui/book.ts`): a sinistra solo le due scuole dell'eroe, in cima la primaria (medaglia d'oro) e sotto la
secondaria (medaglia d'argento), ciascuna col suo attacco base, le tre abilità a mana e le due speciali; sotto, a parte, Preghiera
di suffragio per chi non ha il Sacro. Ogni abilità
con icona, rango (1 più i potenziamenti scelti per lei) e una spunta se è sulla barra; quelle ancora da imparare restano
grigie con come si ottengono (le carte dei livelli pari, le speciali dal 6, o il tomo della scuola), così si vede in cosa può crescere
una build. A destra una pagina di pergamena: icona grande, nome, scuola, costo, lancio, recupero, la descrizione con i
numeri evidenziati, i potenziamenti, le fusioni e i passivi che la toccano, e sotto una copia piccola della barra (il
ventaglio su touch e in Stile Diablo, la fila coi tasti altrimenti). *Equipaggia* (o *Sposta*) illumina gli otto posti:
toccandone uno l'abilità va lì, scambiandosi con quella che c'era se era sulla barra, o rimandando nel libro quella che
c'era; *Rimuovi* svuota il suo posto. Col mouse si trascina un'abilità dalla lista o da un posto su un altro posto, o un
posto sulla lista per toglierlo. L'attacco primario (il tasto grande: solo un attacco base, scelto con *Sul tasto grande*) e le due fiale sono fissi; un'abilità tolta resta nel
libro anche ricaricando, una carta appena scelta va comunque sulla barra. La disposizione resta salvata nel browser e
quella di prima (dodici tasti con la pozione) si converte da sola. La fiala di mana aggiunge un posto fisso senza spostare gli otto personalizzabili.

Le due fiale sono riutilizzabili, disponibili a ogni eroe e fuori dal recupero globale: ciascuna ha un recupero indipendente di 30 s. *Linfa capiente/rapida* e *Essenza capiente/rapida* potenziano separatamente quantità (+15 punti percentuali per rango) e recupero (−30% del tempo restante per rango). I vecchi ranghi *Fiala capiente/rapida* conservano il beneficio su entrambe le fiale e contano ancora come una sola scelta: nessun livello o progresso si perde e salvare/ricaricare non duplica il bonus. Anche i premi del rito migliorano entrambe le fiale. Il vecchio tasto della pozione resta alla salute; se T era già personalizzato, il mana riceve il primo tasto libero (prima Y), visibile nella barra e rimappabile nei Comandi.

Cinque abilità per scuola (l'attacco base a parte), sul modello di WoW e Diablo, tutte con la stessa forma: **tre a mana** (col loro
costo, recupero e lancio) e **due speciali** (le carte dal livello 6), istantanee, senza mana né recupero, che si lanciano solo con la
barra della furia piena e la svuotano (`special` in `src/abilities/system.ts`; la furia sale coi colpi dell'attacco base):

| Scuola | A mana | Speciali (furia piena) |
|---|---|---|
| ossa | Balzo del sepolcro (balzo fino a 12 m, stordisce all'atterraggio) · Turbine d'ossa (3 s di rotazione, anche correndo) · Colpo di grazia (fendente a due mani, fino al triplo sui feriti) | Sentenza del sepolcro (lancia d'ossa da 120) · Lamento della cripta (80 danni entro 6 m) |
| ombra | Passo d'ombra (scatto di 8 m) · Carica del dannato (a testa bassa sul nemico, stordisce, riempie un quarto della furia; ora 25 mana) · Risucchio d'anima (Drain Life: canalizzato 3 s, 16 danni ogni mezzo secondo e il 2% della salute a te) | Velo spettrale (5 s a metà danni; prima a recupero) · Patto della tomba (5 s di immunità) |
| peste (veleno: Witch Doctor e Necromante di Diablo, veleni del ladro di WoW) | Nube di peste · Sputo di bile (istantaneo, 18 danni e una dose di veleno: 4 al secondo per dose per 8 s, fino a 5 dosi) · Unguento dell'untore (come gli untori del 1630: il veleno del bersaglio, almeno 2 dosi, passa a chi gli sta entro 6 m) | Fiato della fossa (ora un soffio: il miasma in un cono di 8 m davanti a te, 45 danni, 3 dosi e chi colpisce sbalzato indietro di 5 m, i boss un terzo; si ferma ai muri e ai gradini) · Febbre di palude (Amplifica danno: +30% di danni subiti per 12 s entro 4 m, la metà sui boss) |
| fuoco (mago) | Fuoco fatuo · Rogo dell'eretico (lancio 1,2 s, globo di fuoco dei ceri, schizzi, bersaglio in fiamme, pavimento che arde) · Cero funebre (Living Bomb: 12 al secondo per 4 s, poi scoppia per 60 entro 4 m) | Colonna di fiamme (Flamestrike, ora istantanea: 100 danni entro 3,5 m sotto il bersaglio, brucia e lascia il pavimento in fiamme) · Fornace di Murano (Dragon's Breath: cono di 8 m, 80 danni, brucia e stordisce 2 s) |
| gelo (mago) | Dardo di brina (lancio 1 s, rallenta il bersaglio e chi gli sta entro 3 m) · Caligo gelato (Cone of Cold: la nebbia gelata della laguna in un cono di 8 m, 45 danni, rallenta del 60% per 5 s; recupero 6 s) · Bufera di bora (Blizzard: canalizzato 4 s sul bersaglio, 18 danni ogni mezzo secondo entro 4 m, rallenta) | Acquasantiera gelata (60 danni e congela 4 s chi è entro 5 m) · Globo di brina (Frozen Orb: rotola 15 m, 25 danni ogni mezzo secondo a chi sfiora, poi scoppia) |
| fulmine (sciamano) | Catena di saette (lancio 1 s, rimbalza di nemico in nemico) · Rintocco del campanile (un segno a terra, poi il fulmine: stordisce) · Scudo di saette (Lightning Shield: 4 saette per 20 s, 55 danni a chi ti arriva entro 3 m) | Parafulmine (un totem: per 12 s fulmina ogni secondo il più vicino entro 9 m, 35 danni) · Burrasca (Thunderstorm: 100 danni entro 6 m e i nemici sbalzati via di 5 m, i boss un terzo) |
| sacro (paladino) | Preghiera di suffragio (di tutti dal primo livello: lancio lungo 3 s, cura il 35% della salute, 120 mana, nessun recupero) · Giudizio del Redentore (Judgment: martello di luce, 70 danni, recupero 6 s) · Terra consacrata (Consecration: 14 al secondo per 8 s entro 4 m, e a te l'1% della salute al secondo se ci stai sopra) | Martello della penitenza (Hammer of Justice: 60 danni e stordito 4 s, un terzo sui boss) · Aureola del redento (Divine Shield: fuori dal recupero globale, 5 s di immunità) |

Diventate speciali, le abilità che prima avevano un recupero lungo cambiano i loro potenziamenti: dove riducevano il recupero ora
danno più forza (Acquasantiera: +60% danni a rango; Martello: +40% danni e +20% stordimento; Aureola: +30% di durata; Fossa comune:
una dose e +30% di danni in più). Ossa conserva la struttura 3+2; per compensare il tempo perso in mischia ora Caduta fa 16 danni (prima 10), Sentenza 120 (prima 50) e Lamento 80 (prima 20).

Ogni abilità nuova ha un potenziamento (Doppio sputo, Fossa comune, Processione, Bora scura, Corona di saette, Parafulmine di San
Marco, Giudizio universale, Santità...). Tutte si fermano ai muri come le altre (`World.ray`/`sees`): la Burrasca non sbalza nessuno
oltre un muro o giù da un gradino, il globo scoppia contro il muro, i lanci (Colonna di fiamme) arretrano se colpiti.

Ogni scuola ha il suo tempo di recupero globale (1,5 s): dopo un'abilità di gelo aspettano solo quelle di gelo, mentre
fuoco, fulmine, ossa o peste partono subito, e sulla barra gira solo la lancetta dei tasti della stessa scuola. Come in
WoW, ogni colpo subito durante un lancio fa arretrare la barra di 0,5 s (al massimo 3 volte per lancio, la barra
lampeggia di rosso); i canali come Turbine d'ossa non arretrano. La cura si lancia quindi lontano dalla mischia, o si
paga in tempo.

Le magie non attraversano i muri (`World.ray` in `src/core/physics.ts`, un test esatto contro i box di collisione,
porte e grate chiuse comprese): i dardi dell'eroe e dei preti si infrangono sul muro che incontrano, un bersaglio
dietro un muro rifiuta il lancio ("Bersaglio non in vista.", niente mana né recupero, anche a barra piena), la catena
non salta oltre un muro, novae, acquasantiera, turbine, nube di peste, fuoco a terra e fendenti non colpiscono chi sta
dall'altra parte. I frati non si accorgono di chi è dietro un muro e, se restano bloccati a inseguirlo senza vederlo,
dopo 6 s tornano a zappare.

Fusioni nuove: Frantumazione (fuoco su gelo: +60% e schegge), Miasma elettrico (fulmini, parafulmine e scudo di saette +50% e catena più lunga su
chi sta nella peste), Turbine di brina (il turbine gela e raddoppia sui congelati), Miasma velenoso (la Nube di peste dà una dose di veleno al
secondo), Giudizio ardente (il Giudizio incendia, +50% su chi brucia). Frantumazione e Turbine di brina valgono con qualunque abilità di gelo. I lanci si interrompono muovendosi
(il turbine no) e mentre si lancia o si canalizza la clava resta ferma. Rallentamenti, congelamenti e stordimenti
(`src/enemies/control.ts`) si vedono sui nemici (tinta gelida, corpo fermo nel ghiaccio, stelle, fiamme), hanno
rendimenti decrescenti (metà, un quarto, poi immune per 15 s); sacerdoti e api li scuotono via prima e il
Reverendissimo dura a un terzo, così il boss resta una sfida.

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
  bare, lapidi nel chiostro grande e nel cortile degli ulivi, colonne cadute, una gabbia (i bracieri
  sono quelli di ferro di `src/fx/torches.ts`, in entrambe le modalità). Solo visivo: nessun collider,
  percorribilità invariata.

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

- **1 unità = 1 metro.** −X = est, +Y = alto, +Z = nord (Fondamenta e canale della Giudecca), −Z = sud
  (laguna), come sull'isola vera: guardando la facciata dal canale le Zitelle (livello 2) sono a sinistra.
  Origine = centro della facciata della chiesa, quota fondamenta. Il codice del livello 1 tiene i nomi della
  piantina letta dal basso (`X.west`, "nord" per la laguna); minimappa e mappa mostrano il nord vero in alto.
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
                             Scala di qualità (fps bassi sostenuti la scendono un gradino
                             alla volta): meno pixel, ombre a metà, niente post, poi i due
                             gradini "ultra-leggeri" per telefoni Android deboli (niente
                             ombre, 3 luci delle torce, cielo senza nuvole, niente foschia
                             e pulviscolo, metà particelle, infine pixel ratio 0,75);
                             `?fx=low` e "Grafica: Bassa" fissano l'ultimo. Ogni gradino ne
                             libera i buffer. Su telefono (`core/device.ts`, puntatore
                             touch) pixel ratio 1,5, niente MSAA sul canvas, MSAA 2x nel
                             post, ombre 1024 e texture dei modelli dimezzate: iOS ricarica
                             la scheda oltre ~1 GB di memoria, GPU compresa; un Android con
                             ≤ 4 GB (`deviceMemory`) o una GPU debole nota (nome WebGL:
                             Mali, Adreno, PowerVR vecchi) parte già senza post o
                             ultra-leggero. Al primo avvio una prova di 4 s sulla scena
                             vera (l'intro o il gioco, a modelli caricati) sceglie subito
                             il gradino giusto;
                             il gradino resta salvato sul dispositivo per questa build e
                             segue la scala, "Grafica: Auto" rifà la prova
  fx/torches.ts              il fuoco: torce a muro, bracieri, cesti di fuoco e candelabri
                             di ferro gotico veneziano (Meshy, `fuoco.glb`, istanziati per
                             celle di 48 m, solo visivi) nei tre livelli; fiamme billboard
                             con shader a rumore, HDR per il bloom; pool di 8 PointLight
                             tremolanti (caduta al quadrato, raggio corto: pozze di luce nel
                             buio) ai fuochi più vicini al player, gli altri dipingono la
                             loro luce sul pavimento (e sul muro dietro la torcia), anche nei
                             gradini bassi; scintille e braci che salgono nell'aria attorno
                             ai sei fuochi più vicini (metà nei gradini ultra-leggeri);
                             candele, lampadari e bagliori colorati da `level.lights`
  core/physics.ts            collisioni: tutto è un box (anche ruotato); pavimenti e muri
                             con la stessa regola (step 0,45 m). Nessuna dipendenza da three.
  core/input.ts              tastiera + mouse
  core/models.ts             modelli Meshy: caricamento GLB, posa in piedi, oggetto nel pugno
                             (corpi esclusi fuori dal campo visivo su bounding sphere larghe, ombre solo
                             entro 30 m dall'eroe: `Shadows`)
  player/controller.ts       personaggio segnaposto, WASD, gravità, salto
  player/undead.ts           il corpo Meshy dell'eroe scelto con le sue clip: idle,
                             guardia dopo il combattimento, passo e corsa a
                             falcata misurata (niente piedi che scivolano), combo a 3 colpi, una
                             mossa per incantesimo, reazioni ai colpi, morte; aura per Velo e Patto
  player/outfit.ts           abiti completi atomici sulle ossa originali, compatibilità coi corredi
                             precedenti e arma in pugno; hero-outfits.ts carica le sei parti coordinate
  player/whole-outfit-key.ts quindici identità visuali per le famiglie canoniche degli eroi
  loot/builds.ts             quindici famiglie: ruolo, priorità, spell consigliate e ricette statistiche
  ui/figure.ts               l'eroe nella scheda: lui stesso, disegnato dal renderer del gioco
                             in un angolo del canvas e copiato nella scheda, solo mentre è aperta
  camera/thirdPersonCamera.ts camera follow/orbit con anti-compenetrazione
  camera/intro.ts            piano sequenza d'apertura (spline Catmull-Rom sulle chiavi, saltabile)
  camera/diabloCamera.ts     Stile Diablo: camera isometrica fissa; CameraBlend per i cambi di stile
  core/style.ts              interruttore Stile Diablo (localStorage), `onStyle` per chi ne dipende
  player/diabloControls.ts   Stile Diablo: clic per muoversi e attaccare, mira dei lanci
  fx/occlusion.ts            Stile Diablo: muri abbassati, tetti e prop svaniti, sagome x-ray
  fx/diabloFx.ts             Stile Diablo: numeri di danno, sangue, colonne di luce
  ui/hud.ts                  nome dell'area corrente
  ui/actionBar.ts            barra abilità stile WoW (primario, 8 posti e due fiale, sweep del cooldown, castbar,
                             tooltip, errori, testo di combattimento); ui/icons.ts icone dipinte
                             (un atlante WebP, `ui/icons.webp`, dipinto e impacchettato da
                             `scripts/icons/build.py`); la pelle stile WoW (pietra e cornici dorate,
                             Stile Diablo in ferro) sta nelle variabili `--panel`/`--gilt` di index.html
  ui/book.ts                 libro delle abilità: lista per scuola, pagina, Equipaggia / Rimuovi, barra in piccolo
  abilities/system.ts        esecutore abilità data-driven: cooldown, GCD 1,5 s per scuola, off-GCD, pushback,
                             lanci, canalizzate, interruzione al movimento; la barra (posti fissi e gli otto del
                             libro, `equip`/`remove`, salvataggio e conversione). Nessun DOM/three
  abilities/forsaken.ts      le abilità del Reietto (tabella `ABILITIES`, ordine `BAR`), numeri vivi in `tune`, e i loro effetti
  abilities/grimoire.ts      regole di fuoco, gelo, fulmine e dei colpi nuovi (dardi a ricerca, fiamme a terra, catena,
                             fulmine ritardato, balzo e carica, esecuzione), senza grafica: le usa anche il banco. Nessun three
  enemies/control.ts         stati dei nemici: rallentato, congelato, stordito, in fiamme; rendimenti decrescenti e resistenza
  player/levels.ts           livelli d'esperienza: curva, XP dai morti, le carte (nuove abilità,
                             potenziamenti, passivi, fusioni) e i ranghi massimi. Nessun DOM/three
  player/talents.ts          i tre alberi dei talenti: nodi, prerequisiti, fasce, offerta d'una carta per
                             albero e adattamento dei vecchi salvataggi (`fit`). Nessun DOM/three
  ui/levelUp.ts              finestra di scelta delle tre carte, lampo "Livello N!"
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
  enemies/zitelle.ts         livello 2: gondolieri, codeghe, zitelle, il Gastaldo, la Maestra, la Governatrice (velo,
                             linee di merletto, fuso) e i loro gruppi; il cervello è quello di caster.ts
  enemies/sangiorgio.ts      livello 3: marinai, monaci, amanuensi, il Nostromo, il Bibliotecario, l'Abate
                             (calice, rintocchi, acqua alta) e i loro gruppi
  enemies/bees.ts            ape gigante e operaie: un calabrone Meshy statico animato in codice (volo
                             librato, ali che battono nel vertex shader, picchiata col pungiglione,
                             sciame velenoso, sussulto ai colpi, caduta da morta); IA: caster.ts `APE`
  enemies/priests.ts         un corpo Meshy per tipo: prete in tonaca nera con stola viola (bastone col
                             cristallo), sacerdote templare in piastre nere e oro (mazza da guerra),
                             Reverendissimo arcivescovo-lich gigante con l'aureola (pastorale); animazioni
                             (reazioni, colpi alternati, morti varie), dardi d'ombra con scia,
                             nova del boss e dei sacerdoti telegrafata a terra, marchi del boss
  audio/engine.ts            motore audio: bus, impostazioni, sblocco, sprite MP3, voci 3D, ducking
  audio/mix.ts               mix sheet: livello, bus, variazione e portata di ogni suono
  audio/music.ts             musica adattiva (intro, esplorazione + combattimento, boss, stacchi) e letti d'ambiente
  audio/director.ts          regia: dallo stato del mondo ai suoni, alla musica e all'ambiente
  audio/manifest.ts          generato da scripts/audio/build.py: dove sta ogni suono
  quest/progress.ts          stato della progressione: fasi della missione, grate e porte (collider
                             rimovibili), baule con la chiave, Fra' Zuane, prompt di interazione,
                             vittoria. Nessuna dipendenza da three
  quest/dialogue.ts          battute di Fra' Zuane per fase, obiettivi del tracker
  quest/ferry.ts             la gondola di Mastro Iseppo dalla Punta a San Giorgio e ritorno
  quest/npc.ts               Fra' Zuane (Meshy, idle e gesti mentre parla, "!" sulla testa)
  quest/view.ts              grate e battenti animati, baule Meshy col coperchio che si apre e il
                             bottino, prompt "F", tracker della missione, barra del boss, banner di vittoria
  ui/dialogue.ts             finestra di dialogo stile WoW (ritratto, testo a macchina, Accetta / Rifiuta, Commercia)
  loot/gear.ts               equipaggiamento: posti, oggetti e budget di statistiche, armatura, critico, prezzi,
                             Equipment (indossa / togli), vendita e acquisto. Nessuna dipendenza da three
  ui/bag.ts, ui/sheet.ts,    borsa, scheda del personaggio e botteghe di Fra' Bortolo e Mastro Iseppo nella stessa finestra;
  ui/vendor.ts, ui/tooltip.ts tooltip stile WoW con il pezzo indossato accanto e le differenze
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
    orto.ts                  pergola viti, orti, vasca, frutteto, apiario, uliveto, serra, ala est (foresteria)
    giudecca.ts              livello 2: fondamenta fino alle Zitelle, rii e ponti, campo, squero, Tre Oci, skyline
    zitelle.ts               livello 2: chiesa delle Zitelle, ospizio, cortile, orto
    sangiorgio.ts            livello 3: fondamenta San Giovanni e Punta, l'isola di San Giorgio Maggiore
    nord.ts                  corpo nord (cappella del noviziato, sala dei telai, refettorio,
                             androne, falegnameria, frantoio), giardini (pitosfori, rose, pozzo,
                             brolo dei cipressi), riva, pontile
scripts/check-walkable.ts    flood-fill di raggiungibilità con le regole del player, per fase della quest
scripts/check-abilities.ts   GCD per scuola, pushback, cooldown, lanci, canali e interruzioni del sistema abilità
scripts/check-spells.ts      stati dei nemici e loro effetto sulle IA, regole degli incantesimi nuovi e delle fusioni
scripts/check-levels.ts      curva XP, offerte delle carte su molte partite casuali, fusioni, slot riservati
scripts/check-talents.ts     alberi dei talenti: ogni carta su un albero, prerequisiti, fasce, scelte, offerte, vecchi salvataggi
scripts/soak-boss.ts         il combattimento col boss nel gioco vero, Chrome headless su iPhone emulato: errori, crescita, memoria GPU
scripts/balance.ts           banco di bilanciamento: livello, IA, abilità e carte veri, giocati da un bot sul percorso della missione
```

### Dove agganciarsi (navi successive)

- **Materiali:** ogni mesh ha `userData.role` (`stone`, `brick`, `plaster`, `paving`,
  `grass`, …). Sostituire i materiali in `materials.ts` o attraversare la scena per ruolo.
- **Props/ambienti per zona:** `level.zones.get('orto')` ecc. è il `THREE.Group` della
  zona (`zone:<id>` nella scena). `level.areas` elenca le sotto-aree con rettangolo.
- **Collisioni:** aggiungere box con `builder.box(...)`/`obox(...)`; mesh solo visive
  con `collide: false`. `npm run check` deve restare verde.
- **Abilità:** aggiungere un oggetto `Ability` in `abilities/forsaken.ts` (o un altro kit)
  e il suo id in `BAR`; l'icona è un prompt in `scripts/icons/build.py` (`ICONS`), poi
  `python3 scripts/icons/build.py` la dipinge con Meshy (3 crediti) e rifà l'atlante.
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
frutteto, apiario, uliveto a est con la foresteria nell'ala est, serra) → corpo nord
trasversale (falegnameria, frantoio/smielatura, sala dei telai, cappella del noviziato,
refettorio dei frati) → giardini dei pitosfori, pergola di rose, pozzo, brolo dei cipressi → laguna.
