import { HEROES, HERO_IDS, heroOf, type Hero } from '../player/heroes.ts';
import { levelOf, type School } from '../player/levels.ts';
import { resume, slots } from '../core/save.ts';
import { Equipment, starter, type GearState } from '../loot/gear.ts';
import { SCHOOL_NAME } from './book.ts';
import { SelectStage } from './selectStage.ts';

// "Scegli il tuo Risorto", Diablo Immortal style: down the left the heroes (player/heroes.ts, every one of them, in order),
// each his portrait in a gilt diamond, his level under it and his name beside it; the chosen one lit, with his title and
// his two schools. In the middle the chosen hero himself on a cemetery island by night (ui/selectStage.ts), in what his
// save has him wear; a drag turns him. "Entra nel mondo" (Enter) starts the new game with him; the boot waits for it
// (main.ts), and the stage is freed before the game's renderer is made. Tap a portrait (or ←/→, ↑/↓) to change hero.

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
#select .who i { color: #d8c8a0; font-size: 15px; text-shadow: 0 1px 2px #000; }
#select .schools { gap: 8px; font-size: 14px; text-shadow: 0 1px 2px #000; }
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
  #select .roster { gap: 4px; padding-top: calc(6px + env(safe-area-inset-top)); padding-bottom: calc(6px + env(safe-area-inset-bottom)); padding-left: calc(12px + env(safe-area-inset-left)); justify-content: safe center; }
  #select .hero { --gem: 44px; gap: 8px; }
  #select .gem { height: calc(var(--gem) * 1.42 + 6px); }
  #select .lv { min-width: 26px; padding: 0 4px; font-size: 11px; border-width: 1px; }
  #select .who b { font-size: 15px; }
  #select .who i { font-size: 11px; }
  #select .schools { font-size: 11px; gap: 5px; }
  #select .schools small { font-size: 10px; }
  #select .foot { right: calc(14px + env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); gap: 6px; }
  #select .lore { max-width: 270px; font-size: 11px; }
  #select .go { padding: 8px 26px; font-size: 17px; letter-spacing: 3px; }
}
@media (max-width: 560px) and (min-height: 521px) { /* a phone upright */
  #select .roster { max-width: 42vw; padding-left: calc(10px + env(safe-area-inset-left)); }
  #select .hero { --gem: 50px; gap: 6px; }
  #select .who b { font-size: 14px; white-space: normal; }
  #select .hero.sel .who i, #select .hero.sel .who .schools { display: none; } /* no room beside him: the name only */
  #select .go { padding: 10px 28px; font-size: 20px; letter-spacing: 3px; }
  #select .foot { left: 16px; right: 16px; align-items: center; }
  #select .lore { text-align: center; }
}`;

/** Each hero's own game, if any: the run in progress and the three slots, his highest level among them. */
function saved(): Map<Hero, { lv: number; worn: GearState }> {
  const out = new Map<Hero, { lv: number; worn: GearState }>();
  for (const s of [resume(), ...slots().map((x) => x?.state)]) {
    if (!s) continue;
    const hero = heroOf(s.hero), lv = levelOf(s.build?.xp ?? 0).lv;
    if ((out.get(hero)?.lv ?? 0) >= lv) continue;
    const gear = new Equipment(); // read as a load would: ids from another build dropped
    gear.worn = starter(HEROES[hero].weapon);
    if (s.gear) gear.decode(s.gear);
    out.set(hero, { lv, worn: gear.worn });
  }
  return out;
}

const school = (s: School, second: boolean) => `<span style="color: ${COLOR[s] ?? '#f3e2b0'}">${SCHOOL_NAME.get(s)} <small>${second ? 'secondaria' : 'primaria'}</small></span>`;

/** Show the heroes and wait for one to be chosen; the screen and its stage go once he is. */
export function chooseHero(): Promise<Hero> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const games = saved();
  const el = document.createElement('div');
  el.id = 'select';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Scegli il tuo Risorto');
  el.innerHTML = `<div class="shade"></div><h1>SCEGLI IL TUO RISORTO</h1>
    <div class="roster" role="listbox">${HERO_IDS.map((id) => { const h = HEROES[id]; return `<div class="hero" data-id="${id}" role="option" tabindex="0" aria-label="${h.name}">
      <div class="gem"><div class="frame"><img alt="" src="${import.meta.env.BASE_URL}models/${h.portrait}"></div><span class="lv">${games.get(id)?.lv ?? 1}</span></div>
      <div class="who"><b>${h.name}</b><i>${h.title}</i><div class="schools">${school(h.school[0], false)}${school(h.school[1], true)}</div></div></div>`; }).join('')}</div>
    <div class="foot"><p class="lore"></p><button type="button" class="go">ENTRA NEL MONDO</button></div>`;
  document.body.append(el);
  const stage = new SelectStage(el);
  const rows = [...el.querySelectorAll<HTMLElement>('.hero')], lore = el.querySelector('.lore')!;
  let sel = -1;
  const select = (i: number) => {
    if (i === sel) return;
    sel = i;
    const id = HERO_IDS[i];
    rows.forEach((c, k) => { c.classList.toggle('sel', k === i); c.setAttribute('aria-selected', String(k === i)); });
    rows[i].scrollIntoView({ block: 'nearest' });
    lore.textContent = HEROES[id].lore;
    stage.show(id, games.get(id)?.worn ?? starter(HEROES[id].weapon));
  };
  select(0);
  return new Promise((done) => {
    const go = () => { if (!el.isConnected) return; removeEventListener('keydown', key, true); stage.dispose(); el.remove(); style.remove(); done(HERO_IDS[sel]); };
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') select((sel + rows.length - 1) % rows.length);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') select((sel + 1) % rows.length);
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(); }
    };
    addEventListener('keydown', key, true);
    rows.forEach((c, i) => c.addEventListener('click', () => select(i)));
    el.querySelector('.go')!.addEventListener('click', go);
  });
}
