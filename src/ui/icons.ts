// Ability icons, drawn by hand as inline SVG (64×64): a lit radial backdrop plus a pale glyph.
// Our own art, no game assets.

const icon = (id: string, from: string, to: string, glyph: string) => `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg-${id}" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>
    <filter id="gl-${id}"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="64" height="64" fill="url(#bg-${id})"/>
  <g filter="url(#gl-${id})" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;

export const ICONS: Record<string, string> = {
  // hooded figure dissolving into chevrons
  step: icon('step', '#6b3fa8', '#12081f', `
    <path d="M24 50 C22 38 24 26 30 18 C34 13 40 14 42 20 C44 27 41 36 40 50 Z" fill="#1a0f24" stroke="#d6b8ff" stroke-width="2"/>
    <path d="M30 25 q4 -2 8 0" stroke="#c48bff" stroke-width="2" fill="none"/>
    <path d="M8 22 l7 8 -7 8 M14 18 l9 12 -9 12" stroke="#c48bff" stroke-width="3" fill="none" opacity=".8"/>
    <path d="M46 30 h12 M48 38 h8" stroke="#e8d4ff" stroke-width="2.5" opacity=".7"/>`),
  // billowing cloud with dripping bile
  plague: icon('plague', '#5e8f1c', '#0f1a05', `
    <path d="M14 38 a9 9 0 0 1 4-16 a12 12 0 0 1 22-4 a10 10 0 0 1 12 12 a8 8 0 0 1-2 15 H18 a7 7 0 0 1-4-7z" fill="#2d4a0e" stroke="#c8ff7a" stroke-width="2.2"/>
    <circle cx="26" cy="32" r="3" fill="#b6ff5a"/><circle cx="38" cy="30" r="3" fill="#b6ff5a"/>
    <path d="M24 46 v6 M34 46 v9 M44 46 v5" stroke="#b6ff5a" stroke-width="3"/>`),
  // floating flame-orb with a ghostly tail
  wisp: icon('wisp', '#1f8a7a', '#04161a', `
    <path d="M32 12 C40 20 46 28 44 38 C42 47 36 52 32 52 C26 52 20 46 21 37 C22 30 27 26 28 18 C30 22 31 24 32 12 Z" fill="#8dffe0" opacity=".35"/>
    <circle cx="32" cy="38" r="9" fill="#d8fff5" stroke="#8dffe0" stroke-width="2"/>
    <path d="M14 50 q6 -6 4 -14 M50 50 q-6 -6 -4 -14" stroke="#8dffe0" stroke-width="2" fill="none" opacity=".7"/>`),
  // gnawed bone over a blood drop
  feast: icon('feast', '#8a1420', '#1a0306', `
    <path d="M30 8 C40 18 44 26 44 32 a12 12 0 0 1-24 0 C20 26 24 18 30 8 Z" fill="#5a0a12" stroke="#ff6b78" stroke-width="2"/>
    <g transform="rotate(-35 32 40)">
      <rect x="18" y="37" width="28" height="6" rx="3" fill="#efe6d2"/>
      <circle cx="17" cy="37" r="4" fill="#efe6d2"/><circle cx="17" cy="43" r="4" fill="#efe6d2"/>
      <circle cx="47" cy="37" r="4" fill="#efe6d2"/><circle cx="47" cy="43" r="4" fill="#efe6d2"/>
    </g>`),
  // skull with a breaking chain
  will: icon('will', '#5d2a9a', '#0e0518', `
    <path d="M20 30 a12 13 0 0 1 24 0 v6 l-3 3 v6 h-18 v-6 l-3 -3 z" fill="#e9e1f5" stroke="#c48bff" stroke-width="1.5"/>
    <ellipse cx="27" cy="31" rx="3.5" ry="4" fill="#2a1240"/><ellipse cx="37" cy="31" rx="3.5" ry="4" fill="#2a1240"/>
    <path d="M32 36 l-2 4 h4 z" fill="#2a1240"/>
    <path d="M28 45 v-3 M32 45 v-3 M36 45 v-3" stroke="#2a1240" stroke-width="1.5"/>
    <path d="M6 54 l8 -4 M58 54 l-8 -4 M16 49 l4 -2 M48 49 l-4 -2" stroke="#c48bff" stroke-width="3"/>`),
  // translucent ghost
  veil: icon('veil', '#4a6aa0', '#081020', `
    <path d="M18 54 V30 a14 14 0 0 1 28 0 V54 l-5 -5 -4 5 -5 -5 -5 5 -4 -5 z" fill="#dbe8ff" fill-opacity=".45" stroke="#e8f0ff" stroke-width="2"/>
    <ellipse cx="27" cy="31" rx="3" ry="4" fill="#0b1630"/><ellipse cx="37" cy="31" rx="3" ry="4" fill="#0b1630"/>
    <path d="M8 22 q6 4 2 10 M56 22 q-6 4 -2 10" stroke="#9fc4ff" stroke-width="2" fill="none" opacity=".7"/>`),
  // crescent slash of bone shards
  fall: icon('fall', '#6a5a48', '#0e0b08', `
    <path d="M12 48 C20 26 36 14 54 12 C40 20 28 32 22 50 Z" fill="#efe6d2" fill-opacity=".85" stroke="#fff6e0" stroke-width="1.5"/>
    <path d="M18 44 l-6 2 M24 34 l-7 -1 M32 25 l-5 -5 M42 18 l-2 -6" stroke="#efe6d2" stroke-width="3"/>
    <path d="M30 54 C36 40 46 30 58 26" stroke="#a45cff" stroke-width="2" fill="none" opacity=".7"/>`),
  // tombstone with a glowing rune
  hearth: icon('hearth', '#1f7a45', '#03140a', `
    <path d="M18 54 V24 a14 14 0 0 1 28 0 V54 z" fill="#3b4a40" stroke="#bfe8cc" stroke-width="2"/>
    <path d="M32 26 v18 M26 32 l6 -6 6 6 M27 40 h10" stroke="#58ff9a" stroke-width="3" fill="none"/>
    <path d="M10 56 h44" stroke="#58ff9a" stroke-width="2" opacity=".6"/>`),
  // corked vial of green grave-sap
  potion: icon('potion', '#2a6a3a', '#04120a', `
    <path d="M27 10 h10 v5 h-10 z" fill="#8a6a44" stroke="#e6d2a8" stroke-width="1.5"/>
    <path d="M28 15 v9 C18 28 14 36 16 44 C18 52 25 56 32 56 C39 56 46 52 48 44 C50 36 46 28 36 24 V15 z" fill="#123a1c" stroke="#d8ffe4" stroke-width="2"/>
    <path d="M19 40 C24 37 40 43 45 39 C46 47 40 53 32 53 C24 53 18 48 19 40 z" fill="#58ff9a" opacity=".85"/>
    <circle cx="27" cy="45" r="2" fill="#d8ffe4"/><circle cx="36" cy="48" r="1.4" fill="#d8ffe4"/>
    <path d="M22 32 q2 -4 6 -5" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>`),
};
