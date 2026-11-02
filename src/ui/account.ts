import type { CloudSync, Status } from '../core/cloud.ts';

// The account line on the squad screen (ui/select.ts) and in the game menu (ui/menu.ts): logged out, a link to the
// hub's login that comes back here; logged in, the email and how the cloud copy stands (core/cloud.ts). Nothing at
// all without the hub (local dev, offline): the runs are on the device as ever.

const CSS = `
.account { font: 13px/1.3 system-ui, sans-serif; color: #c9b48a; text-shadow: 0 1px 2px #000; overflow-wrap: anywhere; }
.account:empty { display: none; }
.account a { color: #ffd75e; }
.account .cloud { white-space: nowrap; }
.account .cloud.error { color: #ffb27a; }
`;

const STATE: Record<Exclude<Status, 'none' | 'out'>, string> = { sync: '☁ Sincronizzo…', ok: '☁ Salvato nel cloud', error: '☁ Cloud non raggiungibile: salvato sul dispositivo' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let styled = false;

/** A live account line: it follows `sync` while it is on the page. */
export function accountLine(sync: CloudSync): HTMLElement {
  if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); }
  const el = document.createElement('p');
  el.className = 'account';
  el.setAttribute('role', 'status');
  const draw = () => {
    const s = sync.status;
    el.innerHTML = s === 'none' ? ''
      : s === 'out' ? `<a href="/accedi.html?next=${encodeURIComponent(location.pathname)}">Accedi per salvare nel cloud</a>`
      : `${esc(sync.email)} · <span class="cloud ${s}">${STATE[s]}</span>`;
  };
  draw();
  sync.on(() => { if (!el.isConnected) return false; draw(); });
  return el;
}
