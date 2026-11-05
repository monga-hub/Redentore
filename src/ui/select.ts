import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';
import { levelOf, type School } from '../player/levels.ts';
import { chapter, forget, resume, type GameState } from '../core/save.ts';
import { Equipment, starter, type GearState } from '../loot/gear.ts';
import { RANK, SCHOOL_NAME, medal } from './book.ts';
import { SelectStage } from './selectStage.ts';
import { playTime } from './menu.ts';
import { accountLine } from './account.ts';
import type { CloudSync } from '../core/cloud.ts';

// The squad, Diablo Immortal style, shown on every boot: down the left the heroes (player/heroes.ts, every one of them, in
// order), each his portrait in a gilt diamond, his level under it and his name beside it, and his own run (core/save.ts):
// the level of the dungeon reached and the time played, or "Nuovo"; the chosen one lit, with his title and his two schools,
// the gold medal on his primary and the silver on his secondary (the only ones he learns spells of).
// In the middle the chosen hero himself on a cemetery island by night (ui/selectStage.ts), in what his run has him wear;
// a drag turns him. "Continua" (Enter) resumes his run, "Entra nel mondo" starts a new one; "Ricomincia" asks first and
// forgets only his. The boot waits for it (main.ts), and the stage is freed before the game's renderer is made. Tap a
// portrait (or ←/→, ↑/↓) to change hero; the last one played is lit at first. Under the title, the account line
// (ui/account.ts); a hero brought down from the account (core/cloud.ts) shows up as soon as the merge is over.

const COLOR: Partial<Record<School, string>> = { bone: '#d9c8ff', shadow: '#b27cff', frost: '#8fdcff', storm: '#bcd2ff', plague: '#a8e05a', holy: '#ffe9a0', fire: '#ff9a4a' };

const CSS = `
#select { position: fixed; inset: 0; z-index: 40; overflow: hidden; background: #07090d; color: #f3e2b0; font: 15px/1.3 Georgia, serif;
  user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#select .stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
#select .stage:active { cursor: grabbing; }
#select .shade { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(3,4,7,.85), rgba(3,4,7,.45) 22%, transparent 40%), linear-gradient(0deg, rgba(3,4,7,.6), transparent 22%); }
#select h1 { position: absolute; top: calc(14px + env(safe-area-inset-top)); right: calc(22px + env(safe-area-inset-right)); margin: 0; pointer-events: none;
  font: bold 18px Georgia, serif; letter-spacing: 3px; color: rgba(224,181,90,.75); text-shadow: 0 2px 4px #000; }
#select .account { position: absolute; top: calc(40px + env(safe-area-inset-top)); right: calc(22px + env(safe-area-inset-right)); max-width: 46vw; margin: 0; text-align: right; }
#select .roster { position: absolute; top: 0; bottom: 0; left: 0; display: flex; flex-direction: column; justify-content: center; gap: 14px;
  padding: calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom)) calc(26px + env(safe-area-inset-left));
  overflow-y: auto; scrollbar-width: none; max-width: 46vw; box-sizing: border-box; }
#select .hero { --gem: 76px; display: flex; align-items: center; gap: 16px; flex: none; cursor: pointer; outline: none; }
#select .gem { position: relative; width: calc(var(--gem) * 1.42); height: calc(var(--gem) * 1.42 + 10px); flex: none; display: flex; justify-content: center; }
#select .gem .frame { position: absolute; top: calc(var(--gem) * .21); width: var(--gem); height: var(--gem); transform: rotate(45deg); box-sizing: border-box; overflow: hidden;
  border: 3px solid transparent; background: linear-gradient(#120d0a, #120d0a) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 4px 14px rgba(0,0,0,.9); }
#select .gem img { position: absolute; left: 50%; top: 50%; width: 142%; height: 142%; transform: translate(-50%, -50%) rotate(-45deg); filter: grayscale(.55) brightness(.6); transition: filter .15s; }
#select .lv { position: absolute; bottom: 0; min-width: 34px; padding: 1px 6px; box-sizing: border-box; text-align: center; font: bold 15px Georgia, serif; color: #f3e2b0;
  border: 2px solid transparent; border-radius: 2px; background: linear-gradient(#4a1712, #210907) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000; }
#select .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#select .who b { font: bold 21px Georgia, serif; color: #9a917f; text-shadow: 0 2px 3px #000; white-space: nowrap; transition: color .15s; }
#select .who i, #select .who .schools { display: none; }
#select .who .run { font: 13px/1.2 system-ui, sans-serif; color: #c9b48a; text-shadow: 0 1px 2px #000; }
#select .who .run.new { color: #8a7f68; font-style: italic; }
#select .lv:empty { display: none; }
#select .acts { display: flex; align-items: center; gap: 14px; }
#select .again { padding: 10px 18px; min-height: 48px; font: bold 15px Georgia, serif; color: #f3e2b0; cursor: pointer; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 3px; background: linear-gradient(#3a2c1c, #140e08) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 4px 12px rgba(0,0,0,.8); }
#select .again[hidden] { display: none; }
#select .ask { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.7); }
#select .ask .box { box-sizing: border-box; width: min(380px, 100%); padding: 22px 20px 16px; text-align: center; border: 3px solid transparent; border-radius: 8px;
  background: linear-gradient(#24180f, #0d0906) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 10px 40px rgba(0,0,0,.9); }
#select .ask h2 { margin: 0 0 10px; font: bold 20px Georgia, serif; color: #ffd75e; }
#select .ask p { margin: 0 0 16px; font: 14px/1.4 system-ui, sans-serif; color: #e8dcc0; }
#select .ask button { display: block; width: 100%; min-height: 52px; margin: 8px 0; cursor: pointer; font: bold 17px Georgia, serif; color: #ffd75e; text-shadow: 0 1px 2px #000;
  border: 2px solid transparent; border-radius: 4px; background: linear-gradient(#4a3a26, #1c140c) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000; }
#select .ask button.red { background: linear-gradient(#9a2216, #520c07 55%, #2e0503) padding-box, var(--gilt) border-box; }
#select .who i { color: #d8c8a0; font-size: 15px; text-shadow: 0 1px 2px #000; }
#select .schools { gap: 10px; font-size: 14px; text-shadow: 0 1px 2px #000; }
#select .schools > span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
#select .schools small { color: #9a8c70; font-style: italic; font-size: 12px; }
#select .hero:hover img { filter: grayscale(.2) brightness(.85); }
#select .hero.sel img { filter: none; }
#select .hero.sel .frame { box-shadow: 0 0 0 1px #000, 0 0 16px 3px rgba(255,170,70,.55), 0 4px 14px rgba(0,0,0,.9); }
#select .hero.sel .who b { color: #ffe3a0; }
#select .hero.sel .who i { display: block; }
#select .hero.sel .who .schools { display: flex; }
#select .foot { position: absolute; right: calc(28px + env(safe-area-inset-right)); bottom: calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
#select .lore { max-width: 420px; margin: 0; text-align: right; font-style: italic; font-size: 16px; color: #d9cdb2; text-shadow: 0 1px 3px #000, 0 0 10px #000; }
#select .go { position: relative; padding: 13px 46px; white-space: nowrap; font: bold 25px Georgia, serif; letter-spacing: 4px; color: #ffe3a0; cursor: pointer; text-shadow: 0 2px 3px #000;
  border: 3px solid transparent; border-radius: 3px; background: radial-gradient(ellipse at 50% 0, #8a2a1a, #4a140c 55%, #250805) padding-box, var(--gilt) border-box;
  box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(0,0,0,.7), inset 0 0 0 3px rgba(255,210,120,.25), 0 8px 24px rgba(0,0,0,.85); }
#select .go::before, #select .go::after { content: ''; position: absolute; top: 50%; width: 14px; height: 14px; margin-top: -7px; transform: rotate(45deg);
  background: linear-gradient(135deg, #fff2c0, #c9973e 50%, #6b4718); box-shadow: 0 0 0 1px #000; }
#select .go::before { left: -9px; }
#select .go::after { right: -9px; }
#select .go:hover { filter: brightness(1.2); }
body.diablo #select .hero.sel .frame { box-shadow: 0 0 0 1px #000, 0 0 16px 3px rgba(220,50,25,.6), 0 4px 14px rgba(0,0,0,.9); }
@media (max-height: 520px) { /* a phone on its side */
  #select h1 { font-size: 13px; letter-spacing: 2px; top: calc(8px + env(safe-area-inset-top)); }
  #select .account { top: calc(28px + env(safe-area-inset-top)); font-size: 11px; }
  #select .roster { gap: 4px; padding-top: calc(6px + env(safe-area-inset-top)); padding-bottom: calc(6px + env(safe-area-inset-bottom)); padding-left: calc(12px + env(safe-area-inset-left)); justify-content: safe center; }
  #select .hero { --gem: 44px; gap: 8px; }
  #select .gem { height: calc(var(--gem) * 1.42 + 6px); }
  #select .lv { min-width: 26px; padding: 0 4px; font-size: 11px; border-width: 1px; }
  #select .who b { font-size: 15px; }
  #select .who i { font-size: 11px; }
  #select .who .run { font-size: 11px; }
  #select .again { min-height: 40px; padding: 6px 14px; font-size: 13px; }
  #select .schools { font-size: 11px; gap: 5px; }
  #select .schools small { font-size: 10px; }
#select .foot { right: calc(14px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); gap: 6px; }
  #select .lore { max-width: 270px; font-size: 11px; }
  #select .go { padding: 8px 26px; font-size: 17px; letter-spacing: 3px; }
}
@media (max-width: 560px) and (min-height: 521px) { /* a phone upright */
  #select .roster { top: calc(66px + env(safe-area-inset-top)); bottom: auto; width: 100%; max-width: none;
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px;
    padding: 0 calc(12px + env(safe-area-inset-right)) 0 calc(12px + env(safe-area-inset-left)); overflow: visible; }
  #select .hero { --gem: clamp(32px, 9vw, 44px); flex-direction: column; gap: 4px; min-width: 0; text-align: center; }
  #select .who { width: 100%; }
  #select .who b { font-size: 12px; white-space: normal; }
  #select .hero.sel .who i, #select .hero.sel .who .schools { display: none; } /* the compact portrait strip keeps the name and progress */
  #select .go { padding: 10px 18px; font-size: clamp(15px, 4.6vw, 20px); letter-spacing: 2px; }
#select .foot { left: 16px; right: 16px; align-items: center; }
  #select .who .run { font-size: 11px; }
  #select .acts { max-width: 100%; flex-wrap: wrap; justify-content: center; gap: 8px; }
  #select .lore { text-align: center; }
}`;

/** Each hero's own run (core/save.ts), with his level and what it has him wear. */
function saved(): Map<Hero, { lv: number; worn: GearState; s: GameState }> {
  const out = new Map<Hero, { lv: number; worn: GearState; s: GameState }>();
  for (const hero of HERO_IDS) {
    const s = resume(hero);
    if (!s) continue;
    const gear = new Equipment(hero); // read as a load would: ids from another build dropped
    gear.worn = starter(HEROES[hero].weapon);
    if (s.gear) gear.decode(s.gear);
    out.set(hero, { lv: levelOf(s.build?.xp ?? 0).lv, worn: gear.worn, s });
  }
  return out;
}

const LAST = 'redentore.last'; // the hero played last, lit first
const run = (s: GameState) => `Livello\u00a0${chapter(s)} · ${playTime(s.time).replace(/ /g, '\u00a0')}`; // wraps at the dot only

/** How the chosen hero enters: his own run, a new game (his run forgotten), or the Risorto ready for level 2 (core/prepared.ts). */
export type Start = 'run' | 'new' | 'l2';

const school = (s: School, rank: number) => `<span style="color: ${COLOR[s] ?? '#f3e2b0'}">${medal(rank)}${SCHOOL_NAME.get(s)} <small>${RANK[rank]}</small></span>`;

/** Show the squad and wait for a hero to be chosen; the screen and its stage go once he is. */
export function chooseHero(sync: CloudSync): Promise<{ hero: Hero; start: Start }> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  let games = saved();
  const el = document.createElement('div');
  el.id = 'select';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'La tua squadra');
  el.innerHTML = `<div class="shade"></div><h1>LA TUA SQUADRA</h1>
    <div class="roster" role="listbox">${HERO_IDS.map((id) => { const h = HEROES[id]; return `<div class="hero" data-id="${id}" role="option" tabindex="0" aria-label="${h.name}">
      <div class="gem"><div class="frame"><img alt="" src="${import.meta.env.BASE_URL}models/${h.portrait}"></div><span class="lv"></span></div>
      <div class="who"><b>${h.name}</b><span class="run"></span><i>${h.title}</i><div class="schools">${school(h.school[0], 0)}${school(h.school[1], 1)}</div></div></div>`; }).join('')}</div>
    <div class="foot"><p class="lore"></p><div class="acts"><button type="button" class="again"></button><button type="button" class="go"></button></div></div>`;
  el.querySelector('h1')!.after(accountLine(sync));
  document.body.append(el);
  const stage = new SelectStage(el);
  const rows = [...el.querySelectorAll<HTMLElement>('.hero')], lore = el.querySelector('.lore')!;
  const go = el.querySelector<HTMLButtonElement>('.go')!, again = el.querySelector<HTMLButtonElement>('.again')!;
  /** Each row's level and run, from `games`. */
  const fill = () => rows.forEach((c, i) => {
    const g = games.get(HERO_IDS[i]), r = c.querySelector('.run')!;
    c.querySelector('.lv')!.textContent = g ? String(g.lv) : '';
    r.textContent = g ? run(g.s) : 'Nuovo';
    r.classList.toggle('new', !g);
  });
  fill();
  let sel = -1;
  const select = (i: number, force = false) => {
    if (i === sel && !force) return;
    sel = i;
    const id = HERO_IDS[i], g = games.get(id);
    rows.forEach((c, k) => { c.classList.toggle('sel', k === i); c.setAttribute('aria-selected', String(k === i)); });
    rows[i].scrollIntoView({ block: 'nearest' });
    lore.textContent = HEROES[id].lore;
    go.textContent = g ? 'CONTINUA' : 'ENTRA NEL MONDO';
    again.textContent = g ? 'Ricomincia' : 'Dal livello 2';
    again.hidden = !g && id !== 'risorto'; // a new Risorto may start ready for level 2
    stage.show(id, g?.worn ?? starter(HEROES[id].weapon));
  };
  let last = 0;
  try { last = Math.max(0, HERO_IDS.indexOf(localStorage.getItem(LAST) as Hero)); } catch { /* blocked storage: the first */ }
  select(last);
  let ask: HTMLElement | undefined;
  sync.on(() => { // a merge may have brought runs down from the account
    if (!el.isConnected) return false;
    if (sync.status !== 'ok') return;
    games = saved();
    fill();
    if (!ask) select(sel, true);
  });
  return new Promise((done) => {
    const finish = (start: Start) => {
      if (!el.isConnected) return;
      const hero = HERO_IDS[sel];
      if (start === 'new') { forget(hero); sync.forget(hero); } // confirmed: only his run goes, here and in the account
      try { localStorage.setItem(LAST, hero); } catch { /* not remembered */ }
      removeEventListener('keydown', key, true);
      stage.dispose(); el.remove(); style.remove();
      done({ hero, start }); // 'run' with nothing kept is a new game, told by main.ts after the boot merge (it may bring his run down)
    };
    const close = () => { ask?.remove(); ask = undefined; again.focus(); };
    /** "Ricomincia": his run is lost, so it asks first; the Risorto may also start over ready for level 2. */
    const confirm = () => {
      const id = HERO_IDS[sel], g = games.get(id);
      if (!g) { finish('l2'); return; } // nothing to lose
      ask = document.createElement('div');
      ask.className = 'ask';
      ask.setAttribute('role', 'alertdialog');
      ask.setAttribute('aria-modal', 'true');
      ask.setAttribute('aria-label', `Ricominciare con ${HEROES[id].name}?`);
      ask.innerHTML = `<div class="box"><h2>Ricominciare con ${HEROES[id].name}?</h2>
        <p>La sua partita (liv. ${g.lv} · ${run(g.s)}) andrà persa. Gli altri eroi della squadra non cambiano.</p>
        <button type="button" class="red" data-a="new">Ricomincia da capo</button>
        ${id === 'risorto' ? '<button type="button" data-a="l2">Ricomincia dal livello 2</button>' : ''}
        <button type="button" data-a="no">Annulla</button></div>`;
      ask.addEventListener('click', (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
        if (a === 'no' || e.target === ask) close();
        else if (a === 'new' || a === 'l2') finish(a);
      });
      el.append(ask);
      ask.querySelector<HTMLElement>('[data-a="no"]')!.focus();
    };
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (ask) { if (e.code === 'Escape') close(); return; } // the dialog's buttons take Enter themselves
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') select((sel + rows.length - 1) % rows.length);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') select((sel + 1) % rows.length);
      else if ((e.code === 'Enter' || e.code === 'Space') && !(e.target as HTMLElement).closest?.('button')) { e.preventDefault(); finish('run'); } // a focused button clicks itself
    };
    addEventListener('keydown', key, true);
    rows.forEach((c, i) => c.addEventListener('click', () => select(i)));
    go.addEventListener('click', () => finish('run'));
    again.addEventListener('click', confirm);
  });
}
