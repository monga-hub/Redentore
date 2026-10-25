import { HEROES, HERO_IDS, type Hero } from '../player/heroes.ts';
import { TOMES, type School } from '../player/levels.ts';
import { SCHOOL_NAME } from './book.ts';
import { ICONS } from './icons.ts';
import risorto from './art/risorto.webp';
import bortolo from './art/bortolo.webp';
import fosca from './art/fosca.webp';

// "Scegli il tuo Risorto": a new game opens on the heroes side by side (player/heroes.ts), each his painted concept, name,
// title, his school and the one he leans to, a line of who he was. Click or tap one (←/→ too), then Risorgi (Enter); the
// boot waits for it (main.ts) and loads only the body chosen. Gilded like the other windows, full screen over the
// unbuilt world.

const ART: Record<Hero, string> = { risorto, bortolo, fosca };
const COLOR: Partial<Record<School, string>> = { bone: '#d9c8ff', shadow: '#b27cff', frost: '#8fdcff', storm: '#bcd2ff', plague: '#a8e05a', holy: '#ffe9a0' };

const CSS = `
#select { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom)); box-sizing: border-box; overflow-y: auto;
  background: radial-gradient(ellipse at 50% 40%, #17202c, #07090d 70%); color: #f3e2b0; font: 15px/1.4 Georgia, serif; user-select: none; touch-action: manipulation; }
#select .head { text-align: center; }
#select h1 { margin: 0; font: bold 40px Georgia, serif; letter-spacing: 2px; color: #e0b55a; text-shadow: 0 2px 4px #000, 0 0 18px rgba(255,200,90,.35); }
#select .head p { margin: 2px 0 0; font-style: italic; color: #b8a888; }
#select .cards { display: flex; gap: 22px; justify-content: center; width: min(1064px, 100%); }
#select .card { flex: 1 1 0; max-width: 340px; display: flex; flex-direction: column; cursor: pointer; overflow: hidden; box-sizing: border-box;
  border: 3px solid transparent; border-radius: 6px; background: var(--panel); box-shadow: var(--panel-shadow); transition: transform .12s, box-shadow .12s, filter .12s; filter: brightness(.8); }
#select .card:hover { filter: brightness(.95); }
#select .card.sel { filter: none; transform: translateY(-4px); box-shadow: var(--panel-shadow), 0 0 0 2px #7dff8a, 0 0 22px 4px rgba(255,200,90,.45); }
#select .art { flex: none; height: 300px; background: #0b0d12 center 20% / cover no-repeat; border-bottom: 1px solid rgba(255,226,150,.25); }
#select .txt { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 12px 14px; text-align: center; }
#select h2 { margin: 0; font: bold 24px Georgia, serif; color: #ffd75e; }
#select .title { margin-top: -6px; font-style: italic; color: #d8c8a0; }
#select .schools { display: flex; gap: 14px; justify-content: center; }
#select .school { display: flex; align-items: center; gap: 6px; text-align: left; }
#select .school .ic { width: 36px; height: 36px; flex: none; box-sizing: border-box; overflow: hidden; border: 2px solid transparent; border-radius: 4px;
  background: linear-gradient(#000, #000) padding-box, var(--gilt) border-box; }
#select .school.second .ic { width: 28px; height: 28px; }
#select .school b { display: block; font-size: 16px; }
#select .school.second b { font-size: 14px; }
#select .school small { display: block; margin-top: -3px; font-size: 11px; font-style: italic; color: #9a8c70; }
#select .lore { margin: 0; font-size: 13px; color: #e9dcc0; }
#select button { min-width: 240px; padding: 9px 30px; font: bold 26px Georgia, serif; color: #ffe3a0; cursor: pointer; border: 3px solid transparent; border-radius: 4px;
  background: linear-gradient(#4a1f1a, #2a1210) padding-box, var(--gilt) border-box; box-shadow: 0 0 0 1px #000, 0 6px 20px rgba(0,0,0,.8); }
#select button:hover { filter: brightness(1.2); }
body.diablo #select h1, body.diablo #select h2 { color: #ff8a5a; }
body.diablo #select .card { border-radius: 2px; }
@media (max-height: 520px) { /* a phone on its side: each card its art beside its words */
  #select { gap: 8px; justify-content: flex-start; padding-top: calc(8px + env(safe-area-inset-top)); }
  #select h1 { font-size: 24px; }
  #select .head p { font-size: 12px; }
  #select .cards { gap: 12px; }
  #select .card { flex-direction: row; max-width: 400px; }
  #select .card.sel { transform: none; }
  #select .art { width: 38%; height: auto; min-height: 220px; border-bottom: 0; border-right: 1px solid rgba(255,226,150,.25); }
  #select .txt { flex: 1; justify-content: center; gap: 4px; padding: 8px; }
  #select h2 { font-size: 20px; }
  #select .title { margin-top: -4px; font-size: 13px; }
  #select .schools { flex-direction: column; gap: 4px; align-items: flex-start; }
  #select .lore { font-size: 12px; }
  #select button { min-width: 200px; padding: 5px 24px; font-size: 20px; }
}
@media (max-width: 560px) and (min-height: 521px) { /* a phone upright: one under the other */
  #select { justify-content: flex-start; }
  #select h1 { font-size: 28px; }
  #select .cards { flex-direction: column; align-items: stretch; gap: 12px; }
  #select .card { flex: none; flex-direction: row; max-width: none; }
  #select .card.sel { transform: none; }
  #select .art { width: 36%; height: auto; min-height: 200px; border-bottom: 0; }
  #select .schools { flex-direction: column; gap: 4px; align-items: flex-start; }
  #select button { position: sticky; bottom: 0; flex: none; } /* in reach under three heroes */
}`;

const school = (s: School, second: boolean) => `<div class="school${second ? ' second' : ''}"><div class="ic">${ICONS[TOMES.find((t) => t.school === s)!.icon] ?? ''}</div>
  <div><b style="color: ${COLOR[s] ?? '#f3e2b0'}">${SCHOOL_NAME.get(s)}</b><small>${second ? 'secondaria' : 'primaria'}</small></div></div>`;

/** Show the heroes and wait for one to be chosen; the screen goes once he is. */
export function chooseHero(): Promise<Hero> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const el = document.createElement('div');
  el.id = 'select';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Scegli il tuo Risorto');
  el.innerHTML = `<div class="head"><h1>SCEGLI IL TUO RISORTO</h1><p>Giudecca, notte dei morti: chi si leva dalla fossa?</p></div>
    <div class="cards">${HERO_IDS.map((id) => { const h = HEROES[id]; return `<div class="card" data-id="${id}" role="button" tabindex="0" aria-label="${h.name}">
      <div class="art" style="background-image: url(${ART[id]})"></div>
      <div class="txt"><h2>${h.name}</h2><div class="title">${h.title}</div><div class="schools">${school(h.school[0], false)}${school(h.school[1], true)}</div><p class="lore">${h.lore}</p></div></div>`; }).join('')}</div>
    <button type="button">Risorgi</button>`;
  document.body.append(el);
  const cards = [...el.querySelectorAll<HTMLElement>('.card')];
  let sel = 0;
  const select = (i: number) => { sel = i; cards.forEach((c, k) => c.classList.toggle('sel', k === i)); };
  select(0);
  return new Promise((done) => {
    const go = () => { removeEventListener('keydown', key, true); el.remove(); style.remove(); done(HERO_IDS[sel]); };
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA') select((sel + cards.length - 1) % cards.length);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD') select((sel + 1) % cards.length);
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(); }
    };
    addEventListener('keydown', key, true);
    cards.forEach((c, i) => c.addEventListener('click', () => select(i)));
    el.querySelector('button')!.addEventListener('click', go);
  });
}
