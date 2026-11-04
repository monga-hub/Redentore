// Scenic layers are DOM-only: no textures, callbacks or model loads in the hero's WebGL scene.
const CSS = `
#select .sanctuary { position:absolute; inset:0; overflow:hidden; pointer-events:none;
  background:radial-gradient(ellipse at 60% 40%, #334c62, #121e2d 65%, #080f18); }
#select .sanctuary-plate { position:absolute; width:max(100%, 177.778vh); height:max(100%, 56.25vw); container-type:inline-size; left:60%; top:50%; transform:translate(-60%, -50%); }
#select .sanctuary-art { width:100%; height:100%; object-fit:fill; display:block; }
#select .sanctuary-fx { position:absolute; inset:0; opacity:0; transition:opacity 1s; }
#select .sanctuary.ready .sanctuary-fx { opacity:1; }
#select .sanctuary .cloud { position:absolute; left:24%; top:15%; width:53%; height:22%; opacity:.18;
  background:radial-gradient(ellipse at 35% 55%, #a5c0d0, transparent 55%), radial-gradient(ellipse at 65% 40%, #8ca6ba, transparent 60%);
  mask-image:radial-gradient(ellipse, #000 10%, transparent 70%); animation:select-cloud 48s ease-in-out infinite alternate; }
#select .sanctuary .cloud.low { top:62%; left:30%; height:18%; opacity:.12; animation-duration:34s; animation-delay:-17s; }
#select .sanctuary .brazier { position:absolute; left:87%; top:61%; width:0; height:0; }
#select .sanctuary .fire-glow { position:absolute; width:15cqw; height:15cqw; left:-7.5cqw; top:-9cqw;
  background:radial-gradient(ellipse, #ff9c383c, transparent 65%); mix-blend-mode:screen; animation:select-glow 1.7s ease-in-out infinite alternate; }
#select .sanctuary .flame { position:absolute; bottom:0; width:1.3cqw; height:3.8cqw; left:-.65cqw; border-radius:75% 25% 55% 45%;
  transform-origin:50% 100%; background:radial-gradient(ellipse at 50% 85%, #fff4bb 0%, #ffc04a 28%, #ef5e18b0 55%, transparent 75%);
  mix-blend-mode:screen; animation:select-flame .7s ease-in-out infinite alternate; }
#select .sanctuary .flame:nth-child(2) { left:-1.1cqw; height:2.6cqw; animation-delay:-.3s; animation-duration:.9s; }
#select .sanctuary .flame:nth-child(3) { left:.1cqw; height:3.1cqw; animation-delay:-.5s; animation-duration:.6s; }
#select .sanctuary .smoke { position:absolute; left:-2cqw; bottom:1cqw; width:4cqw; height:8cqw; border-radius:50%;
  background:radial-gradient(ellipse, #b5b2a125, transparent 65%); opacity:0; animation:select-smoke 7s linear infinite; }
#select .sanctuary .smoke.second { animation-delay:-3.5s; }
#select .sanctuary .ember { position:absolute; width:2px; height:3px; bottom:0; background:#ffd38b; border-radius:50%; opacity:0;
  animation:select-ember 3.6s linear infinite; animation-delay:var(--delay); --drift:1.2cqw; }
#select .sanctuary .ember:nth-of-type(even) { --drift:-1.6cqw; }
#select .sanctuary .foliage { position:absolute; left:0; bottom:-1%; width:100%; height:30%; object-fit:fill; opacity:.85;
  transform-origin:50% 100%; animation:select-foliage 6s ease-in-out infinite alternate; }
#select .sanctuary.paused *, #select .sanctuary:not(.ready) * { animation-play-state:paused !important; }
#select .sanctuary.static .ember, #select .sanctuary.static .smoke { display:none; }
#select .sanctuary.static .flame { animation:none; }
@keyframes select-cloud { from { transform:translateX(-4%); } to { transform:translateX(6%); } }
@keyframes select-glow { from { opacity:.55; transform:scale(.92); } to { opacity:1; transform:scale(1.08); } }
@keyframes select-flame { from { transform:scale(.8,.85) rotate(-7deg); } to { transform:scale(1.1,1.15) rotate(8deg); } }
@keyframes select-smoke { 0% { transform:translate(0,0) scale(.7); opacity:0; } 25% { opacity:.7; } 100% { transform:translate(2cqw,-9cqw) scale(2); opacity:0; } }
@keyframes select-ember { 0% { opacity:0; transform:translate(0,0); } 12% { opacity:.8; } 100% { opacity:0; transform:translate(var(--drift),-8cqw); } }
@keyframes select-foliage { from { transform:rotate(-.45deg) skewX(-.35deg); } to { transform:rotate(.45deg) skewX(.35deg); } }
@media (max-aspect-ratio:1/1) {
  #select .sanctuary-plate { width:max(100%, 56.25vh); height:max(100%, 177.778vw); }
  #select .sanctuary .brazier { left:88.5%; top:59.8%; }
  #select .sanctuary .flame { width:3cqw; height:8cqw; left:-1.5cqw; }
  #select .sanctuary .flame:nth-child(2) { left:-2cqw; height:6cqw; }
  #select .sanctuary .flame:nth-child(3) { left:0; height:7cqw; }
}
@media (prefers-reduced-motion:reduce) { #select .sanctuary * { animation:none !important; transition:none; } }
`;

export class SelectBackdrop {
  private readonly el = document.createElement('div');
  private readonly style = document.createElement('style');
  private readonly art = document.createElement('img');

  constructor(host: HTMLElement) {
    this.style.textContent = CSS;
    document.head.append(this.style);
    this.el.className = 'sanctuary';
    this.el.setAttribute('aria-hidden', 'true');
    const plate = document.createElement('div');
    plate.className = 'sanctuary-plate';
    this.art.className = 'sanctuary-art';
    this.art.alt = '';
    this.art.draggable = false;
    this.art.onload = () => { this.art.style.display = ''; this.el.classList.add('ready'); };
    this.art.onerror = () => { this.el.classList.remove('ready'); this.art.style.display = 'none'; };
    const picture = document.createElement('picture');
    const portrait = document.createElement('source');
    portrait.media = '(max-aspect-ratio: 1/1)';
    portrait.srcset = `${import.meta.env.BASE_URL}art/select/sanctuary-portrait.webp`;
    picture.append(portrait, this.art);
    this.art.src = `${import.meta.env.BASE_URL}art/select/sanctuary.webp`;
    plate.append(picture);
    const fx = document.createElement('div');
    fx.className = 'sanctuary-fx';
    fx.innerHTML = `<div class="cloud"></div><div class="cloud low"></div>
      <div class="brazier"><div class="fire-glow"></div><div class="flame"></div><div class="flame"></div><div class="flame"></div>
      <div class="smoke"></div><div class="smoke second"></div>
      ${Array.from({ length: 10 }, (_, i) => `<i class="ember" style="--delay:-${i * .37}s;left:${(i % 3 - 1) * .3}cqw"></i>`).join('')}</div>
      <img class="foliage" src="${import.meta.env.BASE_URL}art/select/ivy.webp" alt="" draggable="false">`;
    const foliage = fx.querySelector('img')!;
    foliage.onerror = () => { foliage.style.display = 'none'; };
    plate.append(fx);
    this.el.append(plate);
    host.prepend(this.el);
  }

  pause(paused: boolean, reduced: boolean): void {
    this.el.classList.toggle('paused', paused);
    this.el.classList.toggle('static', reduced);
  }

  dispose(): void {
    for (const image of this.el.querySelectorAll('img')) {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
    }
    this.el.querySelector('source')?.removeAttribute('srcset');
    this.el.replaceChildren();
    this.el.remove();
    this.style.remove();
  }
}
