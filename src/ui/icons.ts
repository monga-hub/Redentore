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
  // bone spear piercing a violet sigil
  strike: icon('strike', '#7a2a9a', '#10041a', `
    <circle cx="40" cy="24" r="12" fill="none" stroke="#c48bff" stroke-width="2" opacity=".8"/>
    <path d="M10 54 L46 18" stroke="#efe6d2" stroke-width="5"/>
    <path d="M46 18 l10 -10 -3 13 z" fill="#fff6e0" stroke="#fff6e0" stroke-width="1.5"/>
    <path d="M14 46 l-6 -2 M18 42 l-2 -6 M10 50 l-4 4" stroke="#a45cff" stroke-width="2.5"/>`),
  // shards bursting out of a ring
  nova: icon('nova', '#5d2a9a', '#0e0518', `
    <circle cx="32" cy="32" r="9" fill="#2a1240" stroke="#e9e1f5" stroke-width="2"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#c48bff" stroke-width="2" opacity=".7"/>
    <path d="M32 6 v8 M32 50 v8 M6 32 h8 M50 32 h8 M14 14 l6 6 M44 44 l6 6 M50 14 l-6 6 M14 50 l6 -6" stroke="#efe6d2" stroke-width="3.5"/>`),
  // gilded tombstone shield
  ward: icon('ward', '#9a6a1a', '#1a0e02', `
    <path d="M32 8 L52 16 V32 C52 44 43 52 32 57 C21 52 12 44 12 32 V16 Z" fill="#3a2a10" stroke="#ffe2a0" stroke-width="2.5"/>
    <path d="M32 18 v26 M24 26 h16" stroke="#ffc85a" stroke-width="4"/>
    <path d="M6 58 q26 -8 52 0" stroke="#ffc85a" stroke-width="2" fill="none" opacity=".6"/>`),
  // corked vial of green grave-sap
  // a votive candle burning with grave-light, a halo of souls round its flame
  mend: icon('mend', '#2f6a4a', '#03100a', `
    <circle cx="32" cy="20" r="13" fill="none" stroke="#58ff9a" stroke-width="1.5" opacity=".55"/>
    <path d="M32 6 C37 13 38 19 32 26 C26 19 27 13 32 6 z" fill="#b8ffd4" stroke="#58ff9a" stroke-width="1.5"/>
    <path d="M32 14 C34 18 34 21 32 24 C30 21 30 18 32 14 z" fill="#ffffff"/>
    <path d="M32 26 v4" stroke="#2a1a10" stroke-width="2"/>
    <path d="M24 30 h16 v22 h-16 z" fill="#e6dcc2" stroke="#efe6d2" stroke-width="1.5"/>
    <path d="M27 33 v12 q0 3 -2 4" stroke="#bfb293" stroke-width="2" fill="none"/>
    <path d="M18 52 h28 l-3 6 h-22 z" fill="#5a4630" stroke="#c8a870" stroke-width="1.5"/>
    <path d="M14 22 q2 -3 5 -2 M50 22 q-2 -3 -5 -2" stroke="#d8ffe4" stroke-width="1.5" fill="none" opacity=".7"/>`),
  potion: icon('potion', '#2a6a3a', '#04120a', `
    <path d="M27 10 h10 v5 h-10 z" fill="#8a6a44" stroke="#e6d2a8" stroke-width="1.5"/>
    <path d="M28 15 v9 C18 28 14 36 16 44 C18 52 25 56 32 56 C39 56 46 52 48 44 C50 36 46 28 36 24 V15 z" fill="#123a1c" stroke="#d8ffe4" stroke-width="2"/>
    <path d="M19 40 C24 37 40 43 45 39 C46 47 40 53 32 53 C24 53 18 48 19 40 z" fill="#58ff9a" opacity=".85"/>
    <circle cx="27" cy="45" r="2" fill="#d8ffe4"/><circle cx="36" cy="48" r="1.4" fill="#d8ffe4"/>
    <path d="M22 32 q2 -4 6 -5" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>`),

  // --- fire, frost, lightning ---
  // a roaring ball of candle-fire with a votive candle's drip
  pyre: icon('pyre', '#b8460a', '#1a0402', `
    <path d="M30 56 C16 54 10 42 14 32 C16 26 20 24 20 18 C26 22 26 28 26 30 C28 22 34 16 34 8 C42 16 46 24 46 32 C48 28 48 24 46 20 C54 28 56 40 50 48 C46 54 38 57 30 56 Z" fill="#ff7a1a" stroke="#ffd890" stroke-width="2"/>
    <path d="M31 50 C24 49 21 43 23 37 C25 33 28 32 28 28 C32 31 33 35 33 37 C35 33 38 31 38 27 C42 32 43 38 41 43 C39 47 35 50 31 50 Z" fill="#fff0b0"/>
    <path d="M8 12 l4 6 M56 10 l-3 6 M58 30 l-5 1" stroke="#ffc060" stroke-width="2.5"/>`),
  // a dart of ice trailing rime
  frost: icon('frost', '#2a6aaa', '#030c1a', `
    <path d="M10 54 L40 24" stroke="#9fe8ff" stroke-width="4" opacity=".6"/>
    <path d="M36 28 L54 10 L50 30 Z M36 28 L54 10 L34 14 Z" fill="#e8fbff" stroke="#ffffff" stroke-width="1.5"/>
    <path d="M14 42 l-6 2 M20 48 l-1 7 M22 36 l-7 -3 M28 44 l2 7" stroke="#d8f4ff" stroke-width="2"/>
    <circle cx="16" cy="50" r="2" fill="#ffffff"/><circle cx="26" cy="40" r="1.5" fill="#ffffff"/>`),
  // a holy-water font frozen over, rime bursting out of it
  font: icon('font', '#3a7ab8', '#04101e', `
    <path d="M32 6 v12 M32 6 l-4 4 M32 6 l4 4 M12 14 l8 8 M52 14 l-8 8 M6 34 h10 M58 34 h-10" stroke="#e8fbff" stroke-width="2.5"/>
    <path d="M14 30 H50 C50 42 42 48 32 48 C22 48 14 42 14 30 Z" fill="#1a3a5a" stroke="#cfeaff" stroke-width="2.2"/>
    <path d="M26 48 h12 l2 8 h-16 z" fill="#1a3a5a" stroke="#cfeaff" stroke-width="2"/>
    <path d="M18 31 l4 -6 3 6 4 -9 4 9 3 -7 4 7 4 -5 2 5" fill="#e8fbff" stroke="#ffffff" stroke-width="1.2"/>`),
  // a Venetian stiletto of ice
  lance: icon('lance', '#4a8ac0', '#040c18', `
    <path d="M50 10 L22 38 L26 42 Z" fill="#e8fbff" stroke="#ffffff" stroke-width="1.5"/>
    <path d="M16 38 l10 10 M20 42 l-8 8" stroke="#9fc4e8" stroke-width="4"/>
    <circle cx="11" cy="53" r="3" fill="#9fc4e8"/>
    <path d="M44 22 l8 4 M38 18 l4 -8 M50 30 l6 -2" stroke="#9fe8ff" stroke-width="2" opacity=".8"/>`),
  // a forked bolt jumping between three skulls' eyes
  chain: icon('chain', '#3a3aa8', '#05051a', `
    <path d="M10 14 L24 26 L18 30 L34 40 L28 44 L52 56" fill="none" stroke="#dfe8ff" stroke-width="3.5"/>
    <path d="M10 14 L24 26 L18 30 L34 40 L28 44 L52 56" fill="none" stroke="#8ab4ff" stroke-width="8" opacity=".35"/>
    <circle cx="10" cy="14" r="4" fill="#ffffff"/><circle cx="34" cy="40" r="4" fill="#ffffff"/><circle cx="52" cy="56" r="4" fill="#ffffff"/>
    <path d="M24 26 L40 16 L36 12 M34 40 L50 30" stroke="#dfe8ff" stroke-width="2" fill="none"/>`),
  // a bell struck by lightning
  toll: icon('toll', '#4a4a9a', '#06061a', `
    <path d="M20 46 C20 30 22 20 32 18 C42 20 44 30 44 46 L48 50 H16 Z" fill="#6a5a2a" stroke="#ffe2a0" stroke-width="2"/>
    <circle cx="32" cy="54" r="3.5" fill="#ffe2a0"/>
    <path d="M36 2 L28 14 L34 15 L26 28" fill="none" stroke="#ffffff" stroke-width="3"/>
    <path d="M36 2 L28 14 L34 15 L26 28" fill="none" stroke="#8ab4ff" stroke-width="7" opacity=".4"/>
    <path d="M8 40 q-2 6 2 10 M56 40 q2 6 -2 10" stroke="#dfe8ff" stroke-width="2" fill="none" opacity=".7"/>`),
  // --- the new blows ---
  // a figure in mid-leap over cracked ground
  leap: icon('leap', '#6a4a8a', '#0c0612', `
    <path d="M8 54 h48" stroke="#4a4038" stroke-width="3"/>
    <path d="M24 54 l4 -6 4 4 4 -7 3 9" stroke="#a45cff" stroke-width="2" fill="none"/>
    <path d="M14 34 q12 -26 34 -18" stroke="#efe6d2" stroke-width="2" stroke-dasharray="3 4" fill="none" opacity=".7"/>
    <circle cx="44" cy="14" r="5" fill="#cfc2a6"/>
    <path d="M44 19 l-2 12 -8 6 M42 25 l-9 -2 M42 25 l8 6 M42 31 l6 8" stroke="#cfc2a6" stroke-width="3.5"/>
    <path d="M33 23 l-4 -12" stroke="#efe6d2" stroke-width="4"/>`),
  // the club whirling in a ring of bone shards
  whirl: icon('whirl', '#5a4a3a', '#0c0806', `
    <path d="M32 10 A22 22 0 1 1 10 32" fill="none" stroke="#efe6d2" stroke-width="4"/>
    <path d="M32 18 A14 14 0 1 0 46 32" fill="none" stroke="#a45cff" stroke-width="3" opacity=".8"/>
    <path d="M10 32 l-4 -6 M10 32 l6 -4" stroke="#efe6d2" stroke-width="3"/>
    <path d="M32 32 L52 14" stroke="#cfc2a6" stroke-width="5"/>
    <circle cx="53" cy="13" r="4.5" fill="#efe6d2"/>`),
  // an executioner's two-handed blow and a drop of blood
  grace: icon('grace', '#7a1a1a', '#140303', `
    <path d="M12 52 C18 30 34 14 56 10 C42 20 30 34 24 54 Z" fill="#efe6d2" fill-opacity=".9" stroke="#fff6e0" stroke-width="1.5"/>
    <path d="M8 58 L20 46" stroke="#8a6a44" stroke-width="5"/>
    <path d="M44 38 C40 44 40 48 44 50 C48 48 48 44 44 38 Z" fill="#c0202a"/>
    <path d="M50 46 C48 50 48 52 50 53 C52 52 52 50 50 46 Z" fill="#c0202a"/>`),
  // a skull rushing head-down, shadow streaming behind
  charge: icon('charge', '#4a2a6a', '#08040e', `
    <path d="M6 22 h16 M4 32 h18 M6 42 h16" stroke="#a45cff" stroke-width="3" opacity=".75"/>
    <path d="M28 24 C30 16 44 14 50 20 C56 26 56 36 50 40 L48 46 H36 L34 40 C28 36 26 30 28 24 Z" fill="#cfc2a6" stroke="#efe6d2" stroke-width="1.5"/>
    <path d="M38 26 q4 -2 6 2 q-2 4 -6 2 z M48 28 q2 0 2 3 q-2 2 -3 0 z" fill="#120a06"/>
    <path d="M38 46 v4 M42 46 v5 M46 46 v4" stroke="#3a2a1c" stroke-width="1.5"/>
    <path d="M56 30 l4 -2 M56 34 l5 1" stroke="#efe6d2" stroke-width="2"/>`),

  // --- level-up passives (player/levels.ts) ---
  // a cracked bone over a red glow
  dmg: icon('dmg', '#8a2a1a', '#140403', `
    <path d="M16 50 L46 18" stroke="#efe6d2" stroke-width="7"/>
    <circle cx="13" cy="47" r="5" fill="#efe6d2"/><circle cx="19" cy="53" r="5" fill="#efe6d2"/>
    <circle cx="45" cy="13" r="5" fill="#efe6d2"/><circle cx="51" cy="19" r="5" fill="#efe6d2"/>
    <path d="M28 36 l4 -2 -1 5 4 -1" stroke="#ff5a3a" stroke-width="2" fill="none"/>`),
  // a dark heart stitched up
  hp: icon('hp', '#8a1a1a', '#160303', `
    <path d="M32 54 C14 42 8 32 10 23 C12 14 24 12 32 22 C40 12 52 14 54 23 C56 32 50 42 32 54 Z" fill="#7a0e08" stroke="#ff8a7a" stroke-width="2.2"/>
    <path d="M24 28 l16 12 M28 25 l-4 6 M33 29 l-4 6 M38 33 l-4 6" stroke="#efe6d2" stroke-width="2"/>`),
  // a tombstone as a shield
  armor: icon('armor', '#5a5a62', '#0c0c10', `
    <path d="M16 56 V26 a16 16 0 0 1 32 0 V56 Z" fill="#3a3a44" stroke="#dcdce6" stroke-width="2.5"/>
    <path d="M32 26 v20 M25 33 h14" stroke="#a8a8b8" stroke-width="3.5"/>
    <path d="M10 58 h44" stroke="#dcdce6" stroke-width="2"/>`),
  // a well of blue souls
  mana: icon('mana', '#1a3a8a', '#03081a', `
    <ellipse cx="32" cy="44" rx="18" ry="7" fill="#0b1a40" stroke="#9fc4ff" stroke-width="2"/>
    <path d="M14 44 V52 a18 7 0 0 0 36 0 V44" fill="none" stroke="#9fc4ff" stroke-width="2"/>
    <path d="M26 40 q-4 -10 2 -18 q2 8 4 2 q2 -8 6 -10 q-2 8 2 12 q4 6 -2 14" fill="#6ab4ff" fill-opacity=".6" stroke="#d8ecff" stroke-width="1.5"/>`),
  // a black drop with a rising swirl
  regen: icon('regen', '#2a2a6a', '#05050f', `
    <path d="M32 10 C40 24 46 32 46 40 a14 14 0 0 1 -28 0 C18 32 24 24 32 10 Z" fill="#0b0b1a" stroke="#b8b8ff" stroke-width="2.2"/>
    <path d="M26 42 a6 6 0 1 0 6 -6" stroke="#6ab4ff" stroke-width="2.5" fill="none"/>
    <path d="M32 36 l3 -3 M32 36 l3 3" stroke="#6ab4ff" stroke-width="2.5"/>`),
  // a skeletal foot with speed lines
  speed: icon('speed', '#4a5a3a', '#080c05', `
    <path d="M30 14 C38 14 40 26 38 36 C36 46 40 50 46 52 H24 C20 44 22 30 24 22 C25 17 27 14 30 14 Z" fill="#cfc2a6" stroke="#efe6d2" stroke-width="1.8"/>
    <path d="M26 52 v4 M32 52 v5 M38 52 v4 M44 52 v3" stroke="#efe6d2" stroke-width="2.5"/>
    <path d="M8 26 h10 M6 34 h12 M8 42 h10" stroke="#c8ff7a" stroke-width="2.5" opacity=".8"/>`),
  // an hourglass in frost
  cdr: icon('cdr', '#2a6a8a', '#03101a', `
    <path d="M20 10 h24 M20 54 h24" stroke="#dff4ff" stroke-width="3"/>
    <path d="M22 12 C22 26 42 26 42 32 C42 38 22 38 22 52 M42 12 C42 26 22 26 22 32 C22 38 42 38 42 52" fill="none" stroke="#9fe0ff" stroke-width="2.2"/>
    <path d="M27 48 h10 l-5 -6 z" fill="#dff4ff"/>
    <path d="M10 18 l4 4 M54 18 l-4 4 M10 46 l4 -4 M54 46 l-4 -4" stroke="#dff4ff" stroke-width="2" opacity=".7"/>`),
  // a fanged mouth drinking a soul
  leech: icon('leech', '#6a1a4a', '#12030c', `
    <path d="M12 26 C22 18 42 18 52 26 C46 40 18 40 12 26 Z" fill="#2a0618" stroke="#ff9ad0" stroke-width="2"/>
    <path d="M20 26 l3 8 3 -7 M38 27 l3 7 3 -8" fill="#efe6d2" stroke="#efe6d2" stroke-width="1.2"/>
    <path d="M32 58 C24 52 26 46 32 42 C38 46 40 52 32 58 Z" fill="#58ff9a" opacity=".8"/>
    <path d="M32 42 v-6" stroke="#58ff9a" stroke-width="2.5"/>`),
  // a red half-ring, the fury bar, flaring
  fury: icon('fury', '#8a2a0a', '#160502', `
    <path d="M10 44 A22 22 0 0 1 54 44" fill="none" stroke="#2a0a04" stroke-width="8" stroke-linecap="round"/>
    <path d="M10 44 A22 22 0 0 1 48 28" fill="none" stroke="#ff5a2a" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 50 C26 44 28 36 32 30 C34 36 38 38 36 44 C40 42 40 38 40 36 C44 42 40 50 32 50 Z" fill="#ffc85a"/>`),
  // Fra' Bortolo's blessing: a sprig of rue, the herb of grace, with a gold glint
  ruta: icon('ruta', '#3a8a3a', '#041206', `
    <path d="M32 58 C31 44 30 30 34 12" fill="none" stroke="#c8f0a0" stroke-width="2.5"/>
    <path d="M32 46 C24 46 18 40 18 34 C24 34 30 38 32 46 Z M32 40 C40 40 46 34 46 28 C40 28 34 32 32 40 Z M33 30 C26 29 22 23 23 18 C28 19 32 24 33 30 Z M33 24 C39 22 42 16 41 11 C36 13 33 18 33 24 Z" fill="#58c85a" stroke="#d8ffb8" stroke-width="1.2"/>
    <circle cx="44" cy="46" r="2.2" fill="#ffd75e"/><path d="M44 40 v12 M38 46 h12" stroke="#ffd75e" stroke-width="1.2" opacity=".8"/>`),
};
