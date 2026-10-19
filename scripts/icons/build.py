"""Painted icons for abilities, level-up cards, items, buffs and HUD buttons, classic-MMORPG style.

Each icon is a Meshy text-to-image painting (model nano-banana, 3 credits each) from the prompt
below, cached in node_modules/.cache/icons (never committed); a cached one is never paid for
again, so a single icon is redone by deleting its PNG. The packer crops the edges, sizes every
painting to TILE px, gives them the same vignette and packs them in one WebP atlas,
src/ui/icons.webp, with its order in src/ui/iconAtlas.ts (read by src/ui/icons.ts); the interface
art (ART: the panels' stone, the action bar's end caps) goes to src/ui/art/.

    python3 scripts/icons/build.py           # generate the missing paintings, then pack
    python3 scripts/icons/build.py --pack    # pack only (no API calls)

The key is read from MESHY_API_KEY, or from the file named by MESHY_ENV (KEY=value lines);
it is never printed.
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'node_modules/.cache/icons'
ATLAS = ROOT / 'src/ui/icons.webp'
ORDER = ROOT / 'src/ui/iconAtlas.ts'
TILE = 128
COLS = 8
API = 'https://api.meshy.ai/openapi/v1/text-to-image'
MODEL = 'nano-banana'

STYLE = ('Square fantasy RPG {kind} icon in the style of classic 2004-era MMORPG icons: hand-painted digital painting, '
         'thick painterly brush strokes, strong rim light, high contrast, saturated core colour against deep shadow, '
         'dark vignette at the corners, one bold central subject drawn large and filling most of the square, readable '
         'as a tiny thumbnail. Full-bleed artwork edge to edge, the dark background reaching all four edges of the canvas: '
         'no white margin, no rounded corners, no border, no frame, no text, no letters, no UI. Subject: ')

# id -> (kind, subject). Schools keep one palette: shadow violet and old bone, plague green, grave-light
# green for healing, gold for wards, fire orange, frost ice-blue, lightning white-indigo.
ICONS = {
    # --- Forsaken kit (abilities/forsaken.ts) ---
    'fall': ('ability', 'a curved crescent slash of white bone shards sweeping across the square, a violet shadow trail behind it, dark purple background'),
    'plague': ('ability', 'a billowing toxic green plague cloud with faint skull shapes in the fumes and drops of bile dripping from it, black-green background'),
    'mend': ('ability', 'a votive candle burning with a pale green grave-light flame, a soft halo of tiny souls around the flame, dark green background'),
    'potion': ('ability', 'a corked round glass flask full of glowing green healing sap, bubbles, cork tied with string, dark green background'),
    'step': ('ability', 'a hooded undead silhouette dissolving into violet shadow smoke as it steps forward, violet chevrons of motion, dark purple background'),
    'veil': ('ability', 'a translucent pale blue ghostly shroud with two dark hollow eyes, wisps of spectral mist, deep night blue background'),
    'wisp': ('ability', 'a floating will-o-the-wisp: a teal ghost flame orb with a long ghostly tail, sparks, dark teal background'),
    'strike': ('ability', 'a sharp bone spear piercing through a glowing violet arcane sigil ring, shards flying, dark purple background'),
    'nova': ('ability', 'an explosion of bone shards and violet shadow energy bursting outward in a ring from a dark center, dark purple background'),
    'ward': ('ability', 'a gilded tombstone-shaped shield with a golden cross, radiant golden light behind it, dark brown background'),
    'pyre': ('ability', 'a roaring ball of orange-gold fire with molten candle wax dripping from it, embers flying, dark red background'),
    'frost': ('ability', 'a jagged dart of blue ice flying diagonally, trailing frost rime and snow sparkles, dark navy background'),
    'font': ('ability', 'a stone holy-water font frozen solid, spikes of ice bursting out of the basin, cold blue light, dark navy background'),
    'lance': ('ability', 'a slim Venetian stiletto dagger made of clear blue ice, frost crystals around it, dark blue background'),
    'chain': ('ability', 'a forked bolt of white-blue chain lightning jumping between three glowing points, crackling, dark indigo background'),
    'toll': ('ability', 'a bronze church bell struck by a bolt of white lightning, sparks and shock rings, dark indigo background'),
    'leap': ('ability', 'an undead warrior with a bone club leaping high through the air, cracked glowing violet ground below, dusk purple background'),
    'whirl': ('ability', 'a bone club whirling in a spinning circle of motion blur and bone shards, violet energy ring, dark brown-purple background'),
    'grace': ('ability', 'an executioner two-handed overhead blow: a huge white bone blade slash with drops of dark red blood, dark crimson background'),
    'charge': ('ability', 'a horned skull rushing forward head-down, violet shadow streaming behind it like a comet, dark purple background'),
    # five a school: poison, the drain, fire, frost, lightning and holy
    'spit': ('ability', 'a glob of glowing green venom spat through the air from a skeletal jaw, dripping poison droplets, black-green background'),
    'untore': ('ability', 'a gloved plague-doctor hand smearing glowing green poison ointment from a small clay jar, toxic drips, black-green background'),
    'miasma': ('ability', 'a ring of green toxic miasma exploding outward from an open grave, faint skulls in the fumes, black-green background'),
    'fever': ('ability', 'a sickly green-violet swamp fever: a feverish skull sweating, wavering heat and marsh mist around it, dark olive-violet background'),
    'drain': ('ability', 'a violet stream of a tortured soul being pulled out of a body into a clawed undead hand, dark purple background'),
    'pillar': ('ability', 'a tall roaring column of orange fire erupting from a stone floor with burning runes around its base, dark red background'),
    'cero': ('ability', 'a tall funeral church candle with a fierce orange flame about to burst, wax cracking, sparks, dark red background'),
    'furnace': ('ability', 'a cone of roaring orange flame blasting from the mouth of a glassblower furnace of Murano, molten glass glow, dark red background'),
    'blizzard': ('ability', 'a howling icy storm of falling hail and ice shards swirling over a lagoon, cold blue wind streaks, dark navy background'),
    'orb': ('ability', 'a rolling sphere of jagged blue ice spinning and shedding ice shards in every direction, frost sparkles, dark navy background'),
    'shield': ('ability', 'three white-blue lightning orbs orbiting in a ring around a dark figure, crackling electric arcs, dark indigo background'),
    'rod': ('ability', 'an iron lightning rod on a bell tower tip struck by a bright white-blue lightning bolt, sparks, dark indigo stormy background'),
    'squall': ('ability', 'a thunderclap shock wave of white-blue lightning bursting outward in a ring, storm clouds and churning sea spray, dark indigo background'),
    'judge': ('ability', 'a radiant golden hammer made of holy light striking down with a blazing sunburst, golden rays, dark brown background'),
    'hallow': ('ability', 'consecrated ground: a glowing golden holy circle with a cross sigil on stone flagstones, golden light rising, dark brown background'),
    'hammer': ('ability', 'a heavy gilded war hammer with a cross on its head spinning through the air, golden motion trail, dark brown background'),
    'bubble': ('ability', 'a radiant golden halo dome of holy light shielding a kneeling hooded undead figure, golden rays, dark brown background'),
    # --- level-up passives and Fra' Bortolo's blessing (player/levels.ts, quest/view.ts) ---
    'dmg': ('talent', 'a skull split by a glowing red-hot crack, bone shards flying, red fury aura, dark red background'),
    'hp': ('talent', 'a dark red anatomical heart stitched together with bone needles and thread, dark red background'),
    'armor': ('talent', 'an old gray stone tombstone used as a heavy shield, iron rivets, cold gray light, dark background'),
    'mana': ('talent', 'a stone well brimming with glowing blue souls rising like mist, dark blue background'),
    'regen': ('talent', 'a black drop of ichor with a rising blue spiral of energy inside it, dark indigo background'),
    'speed': ('talent', 'a skeletal foot mid-stride with green wind speed lines, dark olive background'),
    'cdr': ('talent', 'an ornate brass hourglass coated in frost, blue sand falling, dark teal background'),
    'leech': ('talent', 'a fanged undead mouth drinking a glowing green soul wisp, dark magenta background'),
    'fury': ('talent', 'a blazing red-orange flaming fist surrounded by a half ring of fire, dark red background'),
    'ruta': ('talent', 'a sprig of green rue herb with small yellow flowers and a holy golden glint, dark green background'),
    # --- items (loot/bag.ts): flavour junk ---
    'rosary': ('item', 'a wooden prayer rosary with a small cross, beads in a loop, on a dark brown background'),
    'candle': ('item', 'a short half-melted tallow church candle with a small flame, wax drips, on a dark brown background'),
    'bone': ('item', 'a single engraved human finger bone with scratched letters, on a dark brown background'),
    'relic': ('item', 'an ornate silver reliquary box with a glass window and a cross on the lid, on a dark background'),
    'medal': ('item', 'a small round bronze saint medal on a ribbon, embossed figure, on a dark background'),
    'vial': ('item', 'a small glass ampoule of holy oil with a wax seal, golden liquid, on a dark background'),
    'skull': ('item', 'a pale wax votive skull with candle drips, on a dark background'),
    'nail': ('item', 'a large ancient iron crucifixion nail glowing faintly red hot, on a dark background'),
    # --- gear by slot (loot/gear.ts) ---
    'helm': ('item', 'a battered iron monk-cowl helmet with a hood of dark hemp cloth, on a dark brown background'),
    'shoulders': ('item', 'a pair of leather and iron pauldrons, shoulder armor, studded, on a dark brown background'),
    'chest': ('item', 'a monk robe chest armor of dark hemp cloth with a rope belt and a small iron cross, on a dark brown background'),
    'gloves': ('item', 'a pair of worn leather gauntlets with iron knuckles, on a dark brown background'),
    'legs': ('item', 'a pair of cloth leggings with leather knee guards, armor pants, on a dark brown background'),
    'boots': ('item', 'a pair of worn monk sandal boots of leather with straps, on a dark brown background'),
    'club': ('item', 'a crude heavy bone club weapon, a big femur knotted with leather, on a dark brown background'),
    'amulet': ('item', 'a gold amulet necklace with a dark red gem pendant, on a dark background'),
    'ring': ('item', 'a gold signet ring with a violet gem, on a dark background'),
    # --- HUD buttons ---
    'ui_bag': ('interface button', 'a brown leather satchel backpack with a buckle, on a dark background'),
    'ui_sheet': ('interface button', 'close-up of the hooded skull face of an undead monk with glowing eyes, dark red-brown hood, dark background filling the canvas'),
    'ui_map': ('interface button', 'a rolled-out old parchment map with a compass rose, on a dark background'),
    'ui_menu': ('interface button', 'a closed leather-bound book with a golden clasp, on a dark background'),
    'ui_jump': ('interface button', 'two stacked golden upward chevron arrows glowing bright, rising motion streaks and a puff of dust below, dark blue background'),
}
# Paintings that came back on a rounded card: cut deeper than the usual 6% of each edge.
CROP = {'ui_sheet': 0.09, 'ui_jump': 0.1, 'dmg': 0.09}

# Interface art beside the icons, each its own WebP in src/ui/art/: id -> (prompt, px wide, transparent).
ART = {
    'stone': ('Seamless texture of dark weathered carved granite stone slabs, top-down flat lighting, uniform, subtle cracks and '
              'chisel marks, desaturated grey-brown, game UI panel background, no objects, no text', 512, False),
    'cap': ('Golden winged lion of Saint Mark of Venice sitting upright in side profile facing right, one paw on a closed book, '
            'ornate gilded bronze statue, hand-painted fantasy game UI ornament, strong rim light, isolated on a plain white background', 256, True),
}


def env_key() -> str:
    if os.environ.get('MESHY_API_KEY'):
        return os.environ['MESHY_API_KEY']
    path = os.environ.get('MESHY_ENV', str(Path.home() / 'firstmate/.env'))
    for line in Path(path).read_text().splitlines():
        if line.startswith('MESHY_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('MESHY_API_KEY not found')


def call(url: str, key: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None,
                                 {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def generate() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    bodies = {i: {'prompt': STYLE.format(kind=kind) + subject} for i, (kind, subject) in ICONS.items()}
    bodies |= {i: {'prompt': prompt, 'remove_background': alpha} for i, (prompt, _, alpha) in ART.items()}
    todo = [i for i in bodies if not (CACHE / f'{i}.png').exists()]
    if not todo:
        return
    key = env_key()
    jobs = {i: call(API, key, {'ai_model': MODEL, 'aspect_ratio': '1:1', **bodies[i]})['result'] for i in todo}
    spent = 0
    for i, tid in jobs.items():
        while (t := call(f'{API}/{tid}', key))['status'] not in ('SUCCEEDED', 'FAILED', 'CANCELED'):
            time.sleep(3)
        spent += t.get('consumed_credits') or 0
        if t['status'] == 'SUCCEEDED':
            urllib.request.urlretrieve(t['image_urls'][0], CACHE / f'{i}.png')
        print(f'{i}: {t["status"]}')
    print(f'credits spent: {spent}')


def vignette() -> Image.Image:
    """A soft dark falloff toward the edges, the same on every icon."""
    m = Image.new('L', (TILE, TILE), 0)
    ImageDraw.Draw(m).ellipse((-TILE * 0.18, -TILE * 0.18, TILE * 1.18, TILE * 1.18), fill=255)
    return m.filter(ImageFilter.GaussianBlur(TILE * 0.12))


def pack() -> None:
    ids = list(ICONS)
    rows = -(-len(ids) // COLS)
    atlas = Image.new('RGB', (COLS * TILE, rows * TILE))
    v, black = vignette(), Image.new('RGB', (TILE, TILE))
    for n, i in enumerate(ids):
        im = Image.open(CACHE / f'{i}.png').convert('RGB')
        w, h = im.size
        c = round(min(w, h) * CROP.get(i, 0.06))  # the paintings' edges sometimes carry a stray frame
        im = im.crop((c, c, w - c, h - c)).resize((TILE, TILE), Image.LANCZOS)
        if max(sum(im.getpixel(p)) for p in ((1, 1), (TILE - 2, 1), (1, TILE - 2), (TILE - 2, TILE - 2))) > 450:
            print(f'{i}: a light corner, a framed painting? delete its PNG to redo it')
        im = ImageEnhance.Contrast(im).enhance(1.12)
        im = Image.composite(im, black, v.point(lambda p: 90 + p * 165 // 255))
        atlas.paste(im, ((n % COLS) * TILE, (n // COLS) * TILE))
    for i, (_, px, alpha) in ART.items():
        im = Image.open(CACHE / f'{i}.png').convert('RGBA' if alpha else 'RGB')
        if alpha:
            im = im.crop(im.getbbox())
        im.thumbnail((px, px), Image.LANCZOS)
        (ROOT / 'src/ui/art').mkdir(exist_ok=True)
        im.save(ROOT / f'src/ui/art/{i}.webp', 'WEBP', quality=80, method=6)
    atlas.save(ATLAS, 'WEBP', quality=82, method=6)
    ORDER.write_text('// Generated by scripts/icons/build.py: the icons in src/ui/icons.webp, row by row.\n'
                     f'export const COLS = {COLS};\nexport const ROWS = {rows};\n'
                     f'export const ATLAS = {json.dumps(ids)} as const;\n')
    print(f'{ATLAS.relative_to(ROOT)}: {len(ids)} icons, {ATLAS.stat().st_size // 1024} KB')


if __name__ == '__main__':
    if '--pack' not in sys.argv:
        generate()
    pack()
