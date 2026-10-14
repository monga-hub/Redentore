"""Every sound effect, voice and world one-shot of the game, as code. Each entry of SOUNDS is
(bank, variants, loop, maker): `maker(i)` returns variant i as a mono array (loops: exactly one
seamless period). Recorded layers come from Kenney's CC0 packs via `kenney()` (see build.py)."""
from dsp import *

KENNEY = None  # set by build.py: name -> mono array at SR


def k(name, rate=1.0):
    x = KENNEY(name)
    return resample(x, rate) if rate != 1 else x


def xloop(x, L, X=0.25):
    """`x` (at least L + X s long) -> exactly L s that loop seamlessly (equal-power crossfade of the overrun)."""
    n, m = n_(L), n_(X)
    y = x[:n].copy()
    a = np.sqrt(np.linspace(0, 1, m))
    y[:m] = x[:m] * a + x[n:n + m] * np.sqrt(1 - a ** 2)
    return y


def wet(x, rt=1.2, w=0.25, damp=5000):
    return mono(reverb(x, rt, w, damp=damp))


def dist(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


V = lambda *ph: list(ph)  # phones: (phone, dur, pitch)

SOUNDS = {}


def sound(name, bank, variants=1, loop=0.0):
    def reg(f):
        SOUNDS[name] = (bank, variants, loop, f)
        return f
    return reg


# ================================================================ UI (core)

@sound('ui_click', 'core', 3)
def _(i):
    return mix((k(['click_002', 'click_003', 'click_004'][i]), 0, 0.8), (k('bookPlace1', 1.4)[:n_(0.08)], 0, 0.3))


@sound('ui_hover', 'core', 2)
def _(i):
    return k(['tick_001', 'tick_002'][i], 0.9)


@sound('ui_open', 'core')
def _(i):
    return mix(k('bookOpen'), (k('bookFlip2'), 0.12, 0.6))


@sound('ui_close', 'core')
def _(i):
    return k('bookClose')


@sound('ui_page', 'core', 2)
def _(i):
    return k(['bookFlip1', 'bookFlip3'][i])


@sound('ui_error', 'core')
def _(i):
    return k('error_004', 0.85) * 0.7


@sound('quest', 'core')
def _(i):  # objective updated: a soft pluck and two bells
    return mix(k('confirmation_002', 0.9) * 0.6, (wet(chime(74, 2.0) + chime(81, 2.0) * 0.6, 1.5, 0.3), 0.05, 0.8))


# ================================================================ hero (core)

for surf, src in [('stone', 'footstep_concrete'), ('gravel', 'footstep_snow'), ('grass', 'footstep_grass'), ('wood', 'footstep_wood')]:
    def make(i, src=src, surf=surf):
        x = trim(k(f'{src}_00{i}'))
        if surf == 'wood':  # the pontile's planks: a hollower knock under the step
            x = mix(x, thump(110, 0.2, 0.05) * 0.25)
        if surf == 'gravel':
            x = mix(x, hp(k(f'footstep_concrete_00{i}'), 2000) * 0.3)
        return fade(x, 0.001, 0.03)
    sound(f'step_{surf}', 'core', 5)(make)


@sound('land', 'core', 2)
def _(i):
    return mix(thump(65, 0.4, 0.09), k(['cloth2', 'cloth4'][i]) * 0.7, k('impactSoft_medium_00%d' % (i + 1)) * 0.6)


@sound('jump', 'core', 2)
def _(i):
    return mix(k(['cloth1', 'cloth3'][i]), speak(V(('h', 0.06, 1), ('u', 0.1, 1.1), ('h', 0.08, 0.9)), 120, 'bass', whisper=True) * 0.5)


@sound('swing', 'core', 3)
def _(i):  # the bone club: a heavy whoosh with a rattle of bone
    d = [0.3, 0.32, 0.45][i]
    w = whoosh(d, [260, 240, 140][i], [1500, 1300, 900][i], 400, peak=0.5, q=1.4)
    rattle = crack(d, 2500, 7000, 0.004, 3) * 0.08
    return norm(w + rattle)


@sound('hit_flesh', 'core', 4)
def _(i):
    p = k(f'impactPunch_heavy_00{i}')
    return norm(mix(p, crack(0.15, 900, 3000, 0.01, 1) * 0.25, thump(85, 0.25, 0.05) * 0.5, bubbles(0.15, 60, 200, 500) * 0.2))


@sound('hit_bone', 'core', 4)
def _(i):
    p = k(f'impactPunch_medium_00{i}', 0.85)
    return norm(mix(p * 0.8, crack(0.2, 1200, 5000, 0.01, 4) * 0.6, thump(70, 0.3, 0.06) * 0.5))


@sound('hit_big', 'core', 2)
def _(i):  # the overhead smash and other heavy blows: a cracking floor under the blow
    return norm(mix(boom(1.2, 48, 0.3) * 0.8, crack(0.4, 600, 4000, 0.02, 6), k(f'impactMining_00{i}', 0.7) * 0.7))


@sound('hit_player', 'core', 3)
def _(i):
    return norm(mix(k(f'impactPunch_medium_00{i + 2}'), k(['cloth2', 'clothBelt', 'cloth4'][i]) * 0.5, thump(90, 0.2, 0.04) * 0.4))


def undead(phones, f0, rasp=0.7, sub=0.35, reg='bass'):
    return norm(dist(speak(phones, f0, reg, rasp=rasp, breath=0.08, sub=sub) * 1.5, 1.5))


@sound('player_hurt', 'core', 4)
def _(i):
    v = 'auoa'[i]
    return undead(V(('h', 0.03, 1.0), (v, [0.18, 0.22, 0.16, 0.25][i], 1.05), ('h', 0.07, 0.8)), [108, 100, 115, 96][i])


@sound('player_death', 'core')
def _(i):
    v = undead(V(('h', 0.05, 1), ('o', 0.45, 1.05), ('a', 0.9, 0.85), ('h', 0.5, 0.6)), 98, 0.9, 0.5)
    return norm(mix(wet(v, 1.5, 0.3), (k('impactSoft_heavy_002', 0.8), 1.1, 0.9), (crack(0.5, 1500, 6000, 0.01, 8) * 0.3, 1.15)))


@sound('player_revive', 'core')
def _(i):  # the Forsaken gets up again: a breath drawn backwards and a grave chime
    swell = reverse(mono(reverb(white(0.4) * expdec(0.4, 0.05), 0.8, 1.0, dry=0)))
    return norm(mix(lp(swell, 3000) * 0.6, (wet(chime(62, 2.0, 0.8) + chime(69, 2.0, 0.8) * 0.5, 1.5, 0.3), len(swell) / SR - 0.05)))


# ---------------------------------------------------------------- abilities

@sound('plague_cast', 'core')
def _(i):
    gurgle = formant(glottal(np.full(n_(0.35), 70.0), 0.9, 0.3) * expdec(0.35, 0.12), 'o', 'bass')
    return norm(mix(whoosh(0.35, 200, 900, 300, 0.5, 1.2), bubbles(0.4, 70, 250, 900) * 0.8, gurgle * 0.5))


@sound('plague_hit', 'core')
def _(i):
    splat = lp(white(0.3), 1400) * expdec(0.3, 0.05)
    hiss = bp(white(1.2), 2000, 7000) * expdec(1.2, 0.35) * 0.25
    return norm(mix(splat, thump(55, 0.4, 0.08) * 0.7, bubbles(0.9, 60, 200, 800) * 0.8, hiss))


@sound('plague_cloud', 'core')
def _(i):  # the cloud stews for 8 s
    d = 7.6
    bed = bp(pink(d), 150, 900) * 0.5 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.6 * t_(d)))
    y = bed + bubbles(d, 18, 120, 600) + hp(white(d), 3000) * 0.04
    return norm(y * env(d, [(0, 0), (0.4, 1), (d - 1.5, 1), (d, 0)]))


@sound('wisp_cast', 'core')
def _(i):  # 1.5 s cast: motes spiral up into the raised hands
    d = 1.6
    rise = sum(osc(mtof(m) * (1 + 0.5 * t_(d) / d), d, 'sine', rng.uniform()) for m in (62, 69, 74)) * (t_(d) / d) ** 1.5 * 0.3
    return norm(mix(rise, shimmer(d, [74, 77, 81, 86], 18) * (t_(d) / d), riser(d, 300, 4000, 3) * 0.6))


@sound('wisp_summon', 'core')
def _(i):
    flare = whoosh(0.5, 400, 3000, 2000, 0.3, 2)
    return norm(mix(flare * 0.7, *[(chime(m, 2.0, 0.7) * 0.6, t, 1) for m, t in ((74, 0), (81, 0.06), (86, 0.12))], (crackle(1.2, 40, 3500) * expdec(1.2, 0.5), 0.05, 0.6)))


@sound('wisp_loop', 'core', loop=3.0)
def _(i):  # the wisp's flame: a soft crackle and a ghostly hum
    d = 3.4
    hum = (osc(293.7, d) + osc(440.5, d) * 0.6 + osc(587.0, d) * 0.3) * (0.7 + 0.3 * np.sin(2 * np.pi * 1.0 * t_(d)))
    return norm(xloop(crackle(d, 25, 2800) * 1.5 + hum * 0.12 + bp(pink(d), 300, 1500) * 0.15, 3.0, 0.4))


@sound('wisp_end', 'core')
def _(i):
    return norm(mix(whoosh(0.4, 1500, 2500, 300, 0.2, 1.5) * 0.6, chime(81, 1.5, 0.4) * 0.5, (chime(74, 1.5, 0.4) * 0.4, 0.08)))


@sound('veil', 'core')
def _(i):  # Velo spettrale: the shroud rushing in, a whisper drawn backwards, a sour choir
    swirl = whoosh(0.9, 300, 2200, 600, 0.6, 3)
    whisper = reverse(mono(reverb(speak(V(('h', 0.1, 1), ('u', 0.25, 1), ('s', 0.2, 1)), 160, 'tenor', whisper=True), 1.2, 0.8)))
    ghost = choir([(0.1, 0.8, 74, 1), (0.1, 0.8, 75, 0.7), (0.1, 0.8, 81, 0.6)], 'u', 'soprano', voices=3, attack=0.15, release=0.5)
    return norm(mix(swirl, whisper * 0.6, mono(ghost) * 0.7))


@sound('blink', 'core')
def _(i):  # Passo d'ombra: sucked out, popped back in
    out = reverse(whoosh(0.3, 400, 2500, 1200, 0.3, 2))
    pop = mix(thump(80, 0.3, 0.05), (crack(0.1, 3000, 8000, 0.006, 2), 0, 0.4))
    return norm(mix(out, (pop, 0.28, 1), (shimmer(0.6, [79, 82, 86], 30) * expdec(0.6, 0.2), 0.28, 0.5)))


@sound('strike_cast', 'core')
def _(i):  # Sentenza del sepolcro: the leap and the club hammering the floor toward the mark
    return norm(mix(whoosh(0.45, 150, 900, 300, 0.6, 1.2), (riser(0.4, 60, 400, 2) * 0.6, 0)))


@sound('strike_hit', 'core')
def _(i):  # the bone spear bursting out of the floor
    spikes = mix(*[(crack(0.25, 800, 5000, 0.015, 3), t, 1) for t in (0, 0.05, 0.09, 0.15)])
    return norm(mix(boom(1.6, 45, 0.45), spikes * 0.9, (crackle(0.8, 90, 2000) * expdec(0.8, 0.25) * 2, 0.05)))


@sound('nova', 'core')
def _(i):  # Lamento della cripta: the slam, the wave and two rings of bone spikes
    ring = mix(*[(crack(0.2, 700, 4500, 0.012, 2), 0.06 + j * 0.025, 1) for j in range(10)])
    wave = whoosh(0.7, 120, 2500, 300, 0.25, 1.0)
    return norm(mix(boom(2.6, 38, 0.7) * 1.1, (wave, 0.02, 0.8), (ring, 0.05, 0.7), taiko(45, 1.5, 0.4) * 0.6))


@sound('ward', 'core')
def _(i):  # Patto della tomba: a grave gong and a bright sour-sweet chord
    d = 3.5
    gong = sum(osc(110 * r, d, 'sine', rng.uniform()) * a * expdec(d, tau) for r, a, tau in
               ((1, 1, 2.2), (1.47, 0.6, 1.6), (2.09, 0.5, 1.2), (2.56, 0.35, 0.9), (3.0, 0.3, 0.7), (3.7, 0.2, 0.5)))
    gong += bp(white(d), 200, 2000) * expdec(d, 0.04) * 0.5
    ch = mono(choir([(0.05, 1.4, m, 1) for m in (62, 66, 69, 74)], 'a', 'soprano', voices=3, attack=0.2, release=1.0))
    return norm(wet(mix((gong, 0, 0.5), (ch, 0, 0.8), (shimmer(d, [74, 78, 81, 86], 10) * expdec(d, 1.5), 0, 0.5)), 2.0, 0.3))


@sound('potion', 'core')
def _(i):
    t = t_(0.06)
    pop = osc(900 * np.exp(-t / 0.02) + 300, kind='sine') * expdec(0.06, 0.015) + crack(0.06, 2000, 6000, 0.003) * 0.5
    gulp = lambda: lp(formant(glottal(np.full(n_(0.16), 90.0), 0.2, 0.4), 'o', 'bass') * env(0.16, [(0, 0), (0.03, 1), (0.16, 0)]), 1200) + bubbles(0.16, 60, 150, 400)
    heal = mix(*[(chime(m, 1.2, 0.5), j * 0.07, 1) for j, m in enumerate((62, 65, 69, 74, 77))])
    return norm(mix(pop, (gulp(), 0.18, 0.7), (gulp(), 0.4, 0.7), (gulp(), 0.62, 0.6), (wet(heal, 1.5, 0.3) * 0.5, 0.75), (shimmer(1.0, [74, 77, 81], 20) * expdec(1.0, 0.4), 0.8, 0.5)))


@sound('charge_ready', 'core')
def _(i):  # the fury bar is full: the specials are unlocked
    bells = mix(*[(bell(m, 2.5, 0.8), j * 0.09, 1) for j, m in enumerate((62, 69, 74, 81))])
    return norm(wet(mix(bells, (shimmer(1.5, [81, 86, 89], 14) * expdec(1.5, 0.6), 0, 0.5)), 1.8, 0.3))


@sound('loot', 'core')
def _(i):  # a loot beam, Diablo's legendary drop
    d = 2.2
    pillar = sum(osc(mtof(m), d, 'sine', rng.uniform()) * a for m, a in ((74, 1), (81, 0.7), (86, 0.5), (90, 0.3))) * env(d, [(0, 0), (0.05, 1), (0.6, 0.6), (d, 0)]) * 0.25
    return norm(mix(k('dropLeather') * 0.7, (wet(pillar + shimmer(d, [86, 89, 93], 16) * expdec(d, 0.8), 2.0, 0.35), 0.03)))


# ---------------------------------------------------------------- quest: chest, key, gates, doors

@sound('chest_open', 'core')
def _(i):
    return norm(mix(k('metalLatch'), (k('creak1', 0.75), 0.18, 0.9), (k('impactWood_light_002', 0.8), 0.95, 0.8),
                    (wet(shimmer(1.4, [74, 78, 81, 86], 16) * expdec(1.4, 0.6), 1.5, 0.3), 0.5, 0.5)))


@sound('key', 'core')
def _(i):
    return norm(mix(k('handleCoins', 1.1) * 0.7, (k('metalClick', 0.8), 0.05, 0.6), (wet(bell(86, 2.5, 0.8) + bell(93, 2.5, 0.6) * 0.5, 1.8, 0.3), 0.12, 0.9)))


def grind(d, lo=300, hi=1100, rate=14):
    t = t_(d)
    return bp(white(d), lo, hi) * (0.6 + 0.4 * np.abs(np.sin(np.pi * rate * t))) * 0.5


@sound('grate_open', 'core')
def _(i):  # an iron grate sliding up into the wall (1.6 s)
    d = 1.7
    clinks = mix(*[(k(f'impactMetal_light_00{j % 5}', rng.uniform(0.8, 1.1)) * 0.5, t, 1) for j, t in enumerate(np.cumsum(rng.uniform(0.08, 0.16, 12)))], d=d)
    return norm(mix(grind(d) * env(d, [(0, 0), (0.1, 1), (1.5, 1), (d, 0)]), clinks, (k('impactMetal_heavy_001', 0.8), 1.55, 0.9)))


@sound('grate_close', 'core')
def _(i):
    d = 1.4
    return norm(mix(grind(d, 250, 900) * env(d, [(0, 0), (0.1, 1), (1.2, 1), (d, 0)]), (k('impactMetal_heavy_003', 0.7), 1.25, 1), (thump(70, 0.4, 0.1) * 0.6, 1.27)))


@sound('door_open', 'core')
def _(i):  # the heavy church doors swinging in
    return norm(wet(mix(k('doorOpen_2', 0.65), (k('creak2', 0.55), 0.15, 0.9), (lp(white(1.6), 300) * env(1.6, [(0, 0), (0.3, 1), (1.6, 0)]) * 0.4, 0)), 1.8, 0.3))


@sound('door_close', 'core')
def _(i):  # ...and slamming shut (the portone in the intro)
    return norm(mix(wet(mix(k('creak3', 0.6) * 0.6, (k('doorClose_4', 0.6), 0.35, 1), (k('impactWood_heavy_001', 0.7), 0.38, 1)), 2.5, 0.35), (boom(2.5, 50, 0.6) * 0.8, 0.37)))


@sound('locked', 'core')
def _(i):
    return norm(mix(k('metalLatch', 0.9), (k('metalLatch', 0.85), 0.16, 0.8), (k('impactMetal_light_002', 0.7) * 0.5, 0.18)))


# ================================================================ enemies (mobs)

@sound('friar_aggro', 'mobs', 3)
def _(i):
    ph = [V(('h', 0.08, 0.9), ('u', 0.3, 1.0), ('a', 0.35, 1.15), ('h', 0.1, 0.8)),
          V(('r', 0.12, 0.9), ('a', 0.45, 1.1), ('u', 0.2, 0.8)),
          V(('h', 0.05, 1), ('o', 0.25, 1.2), ('a', 0.4, 1.0), ('r', 0.15, 0.8))][i]
    return undead(ph, [88, 95, 82][i], 0.9, 0.5)


@sound('friar_hurt', 'mobs', 3)
def _(i):
    return undead(V(('h', 0.02, 1), ('uoe'[i], 0.16, 1.1), ('h', 0.05, 0.8)), [92, 100, 86][i], 0.8, 0.4)


@sound('friar_death', 'mobs', 3)
def _(i):
    moan = undead(V(('o', 0.3, 1.1), ('a', 0.6, 0.85), ('u', 0.4, 0.6), ('h', 0.3, 0.5)), [90, 84, 96][i], 1.0, 0.5)
    return norm(mix(moan, (crack(0.4, 1500, 6000, 0.01, 7) * 0.4, 0.9), (k(f'impactSoft_heavy_00{i}', 0.85) * 0.8, 1.0)))


@sound('friar_swing', 'mobs', 2)
def _(i):
    return norm(whoosh(0.42, 180, 1000, 300, 0.55, 1.3))


@sound('friar_hit', 'mobs', 2)
def _(i):  # the hoe bites
    return norm(mix(k(f'impactPunch_heavy_00{i + 1}'), k(f'impactMetal_light_00{i}', 0.6) * 0.5, thump(80, 0.25, 0.05) * 0.5))


@sound('hoe', 'mobs', 3)
def _(i):  # a friar at work: the hoe in the earth
    return norm(mix(k(f'impactSoft_medium_00{i}', 0.9), k(f'footstep_snow_00{i}', 0.8) * 0.6, k(f'impactMetal_light_00{i + 1}', 0.5) * 0.15))


@sound('priest_aggro', 'mobs', 2)
def _(i):
    ph = [V(('a', 0.3, 1.0), ('m', 0.14, 0.95), ('e', 0.4, 0.9), ('n', 0.2, 0.85)),
          V(('m', 0.08, 1.0), ('i', 0.18, 1.05), ('s', 0.1, 1), ('e', 0.22, 1.0), ('r', 0.06, 1), ('e', 0.4, 0.9))][i]
    voiced = speak(ph, 150, 'tenor', rasp=0.3, breath=0.1)
    hiss = speak(ph, 150, 'tenor', whisper=True)
    return norm(wet(voiced * 0.7 + hiss * 0.6, 1.2, 0.3))


@sound('priest_cast', 'mobs')
def _(i):  # the shadow bolt gathering in the crystal (1.6 s; sacerdoti and the boss play it slower)
    d = 1.6
    f = mtof(38) * (1 + 0.5 * (t_(d) / d) ** 2)
    drone = sum(osc(f * r * (1 + rng.uniform(-0.01, 0.01)), kind='saw') for r in (1, 1.5, 2.01)) / 3
    drone = sweep_lp(drone, 200 + 2500 * (t_(d) / d) ** 2) * (t_(d) / d)
    whisper = speak(V(('s', 0.2, 1), ('i', 0.6, 1), ('h', 0.4, 1), ('a', 0.4, 1)), 170, 'tenor', whisper=True)
    return norm(mix(drone, whisper * 0.4, crackle(d, 20, 3000) * (t_(d) / d) * 0.8))


@sound('bolt_cast', 'mobs', 2)
def _(i):
    return norm(mix(whoosh(0.55, 150, 900, 250, 0.3, 1.4), lp(white(0.4), 600) * expdec(0.4, 0.08) * 0.6, crackle(0.5, 40, 2500) * expdec(0.5, 0.2)))


@sound('bolt_hit', 'mobs', 2)
def _(i):
    d = 0.9
    sour = (osc(mtof(50), d) + osc(mtof(51), d)) * expdec(d, 0.25) * 0.4
    return norm(mix(boom(d, 70, 0.15) * 0.8, crackle(d, 80, 2500) * expdec(d, 0.2) * 1.5, sour))


@sound('bolt_fizzle', 'mobs')
def _(i):
    return norm(bp(white(0.4), 1500, 6000) * expdec(0.4, 0.1) + crackle(0.4, 40, 3000) * expdec(0.4, 0.15))


@sound('priest_hurt', 'mobs', 2)
def _(i):
    return norm(speak(V(('h', 0.04, 1), ('ae'[i], 0.14, 1.2), ('h', 0.06, 0.9)), [150, 165][i], 'tenor', rasp=0.4, breath=0.15))


@sound('priest_death', 'mobs', 2)
def _(i):
    wail = speak(V(('a', 0.4, 1.0), ('i', 0.6, 1.5), ('h', 0.5, 1.4)), [155, 140][i], 'tenor', rasp=0.3, breath=0.15)
    return norm(mix(wet(wail, 2.0, 0.45), (whoosh(0.8, 300, 2500, 3000, 0.7, 2) * 0.3, 0.6), (k(f'impactSoft_heavy_00{i + 3}', 0.9) * 0.6, 0.9)))


@sound('pray', 'mobs', loop=6.0)
def _(i):  # a group at prayer: three voices murmuring a psalm tone
    d = 6.6
    out = np.zeros(n_(d))
    for v in range(3):
        ph, t = [], 0.0
        while t < d:
            dur = rng.uniform(0.12, 0.3)
            ph.append(('aeoum'[rng.integers(0, 5)], dur, 1.0 if rng.random() < 0.8 else 0.94))
            t += dur
        y = speak(ph, [118, 124, 112][v], 'tenor', breath=0.2)
        out += fit(y, d) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.3 * t_(d) + v))
    return norm(xloop(lp(out, 2500), 6.0, 0.6))


@sound('sacerdote_aggro', 'mobs')
def _(i):
    shout = speak(V(('h', 0.06, 1), ('a', 0.75, 1.0), ('h', 0.15, 0.85)), 128, 'bass', rasp=0.6, sub=0.2)
    low = speak(V(('h', 0.06, 1), ('a', 0.75, 1.0), ('h', 0.15, 0.85)), 64, 'bass', rasp=0.6)
    return norm(wet(dist(shout + low * 0.6, 2.5), 1.6, 0.3))


@sound('heavy_swing', 'mobs', 2)
def _(i):
    return norm(whoosh(0.5, 130, 700, 250, 0.55, 1.2))


@sound('heavy_hit', 'mobs', 2)
def _(i):
    return norm(mix(k(f'impactPunch_heavy_00{i + 2}'), k(f'impactMetal_heavy_00{i}', 0.7) * 0.6, thump(60, 0.4, 0.08) * 0.7))


@sound('sacerdote_hurt', 'mobs', 2)
def _(i):
    return undead(V(('h', 0.03, 1), ('uo'[i], 0.2, 1.05), ('h', 0.06, 0.8)), 118, 0.5, 0.2)


@sound('sacerdote_death', 'mobs')
def _(i):
    cry = undead(V(('a', 0.5, 1.15), ('o', 0.7, 0.8), ('h', 0.4, 0.6)), 120, 0.6, 0.3)
    return norm(mix(wet(cry, 2.0, 0.35), (k('impactMetal_medium_002', 0.7) * 0.6, 1.0), (k('impactSoft_heavy_001', 0.8), 1.15)))


def bee_wings(f, d):
    return buzz(f, d) + buzz(f * 1.01, d) * 0.6


@sound('bee_queen', 'mobs', loop=2.0)
def _(i):
    return norm(xloop(bee_wings(118, 2.4), 2.0, 0.4))


@sound('bee_worker', 'mobs', loop=2.0)
def _(i):
    return norm(xloop(bee_wings(215, 2.4), 2.0, 0.4))


@sound('bee_sting', 'mobs', 2)
def _(i):
    surge = bee_wings(160, 0.6) * env(0.6, [(0, 0.3), (0.35, 1), (0.6, 0)])
    return norm(mix(surge, (whoosh(0.3, 400, 2500, 800, 0.6, 2), 0.2, 0.6), (crack(0.08, 3000, 9000, 0.004, 2) * 0.8, 0.45)))


@sound('bee_swarm_cast', 'mobs')
def _(i):  # the poison swarm gathering (1.8 s)
    d = 1.9
    y = sum(buzz(rng.uniform(150, 320) * (1 + 0.4 * t_(d) / d), d) * rng.uniform(0.3, 1) for _ in range(8))
    return norm(y * (t_(d) / d) ** 1.2)


@sound('bee_swarm', 'mobs')
def _(i):
    d = 1.6
    y = sum(buzz(rng.uniform(180, 380), d) for _ in range(8)) * expdec(d, 0.5)
    return norm(mix(y, whoosh(0.6, 200, 2500, 400, 0.2, 1) * 0.7, (bubbles(0.6, 60, 200, 700) * 0.6, 0.05)))


@sound('bee_hurt', 'mobs', 2)
def _(i):
    stutter = bee_wings([150, 230][i], 0.3) * (np.sin(2 * np.pi * 18 * t_(0.3)) > 0)
    return norm(mix(crack(0.12, 1500, 6000, 0.006, 3), stutter * 0.6))


@sound('bee_death', 'mobs', 2)
def _(i):
    d = 0.8
    f = [140, 230][i] * np.exp(-t_(d) / 0.35)
    fall = bp(osc(np.maximum(f, 30), kind='saw'), 100, 3000) * expdec(d, 0.35)
    return norm(mix(fall, (crack(0.2, 1200, 5000, 0.01, 4) * 0.6, 0.55), (lp(white(0.2), 1000) * expdec(0.2, 0.04), 0.6, 0.6)))


# ================================================================ the Reverendissimo (boss)

def lich(phones, f0=66):
    """The boss's voice: a low voice, the same an octave down, and a whisper, in the church."""
    v = speak(phones, f0, 'bass', rasp=0.5, breath=0.06, sub=0.3)
    o = speak(phones, f0 / 2, 'bass', rasp=0.8)
    w = speak(phones, f0, 'bass', whisper=True)
    return norm(wet(dist(v + o * 0.7, 2.0) + w * 0.5, 3.0, 0.35, damp=3500))


LINES = [  # Latin, the only language he still speaks
    V(('m', 0.12, 1.1), ('o', 0.2, 1.1), ('r', 0.07, 1.05), ('i', 0.12, 1.0), ('e', 0.18, 1.0), ('r', 0.07, 0.95), ('i', 0.15, 0.9), ('s', 0.25, 0.85)),  # morieris
    V(('r', 0.08, 1.1), ('e', 0.14, 1.1), ('k', 0.08, 1), ('u', 0.1, 1.05), ('i', 0.12, 1.0), ('e', 0.25, 0.95), ('m', 0.35, 0.85)),  # requiem
    V(('i', 0.12, 1.0), ('n', 0.08, 1.0), ('t', 0.06, 1), ('e', 0.18, 1.1), ('n', 0.08, 1.05), ('e', 0.14, 1.0), ('b', 0.06, 1), ('r', 0.06, 0.95), ('i', 0.14, 0.9), ('s', 0.3, 0.85)),  # in tenebris
    V(('v', 0.01, 1), ('e', 0.25, 1.15), ('n', 0.1, 1.05), ('i', 0.55, 0.85)),  # veni
]


@sound('boss_aggro', 'boss')
def _(i):  # "Veni... morieris." and a roar
    return norm(mix(lich(LINES[3], 70), (lich(LINES[0], 64), 1.25, 1.0), (boss_roar(1.6), 2.7, 0.9)))


@sound('boss_line', 'boss', 3)
def _(i):
    return lich(LINES[i], [64, 62, 66][i])


def boss_roar(d=1.4, f0=58):
    ph = V(('h', 0.1, 0.9), ('a', d * 0.6, 1.1), ('o', d * 0.3, 0.8))
    r = speak(ph, f0, 'bass', rasp=1.0, sub=0.6) + speak(ph, f0 * 0.5, 'bass', rasp=1.0)
    growl = lp(white(d + 0.1), 600) * env(d + 0.1, [(0, 0), (0.15, 1), (d, 0.5), (d + 0.1, 0)]) * 0.4
    return norm(wet(dist(fit(r, d + 0.1) + growl, 3.0), 3.0, 0.35, damp=3500))


@sound('boss_roar', 'boss', 2)
def _(i):
    return boss_roar([1.4, 1.0][i], [58, 64][i])


@sound('boss_hurt', 'boss', 3)
def _(i):
    return lich(V(('h', 0.05, 1), ('auo'[i], 0.25, 1.1), ('h', 0.1, 0.8)), [70, 64, 74][i])


@sound('boss_nova_cast', 'boss')
def _(i):  # 2.6 s: "Dies irae" chanted as the shadow gathers
    chant = lich(V(('d', 0.08, 1), ('i', 0.3, 1.0), ('e', 0.35, 1.0), ('s', 0.2, 1), ('i', 0.3, 1.06), ('r', 0.08, 1.0), ('a', 0.35, 0.95), ('e', 0.5, 0.9)), 66)
    d = 2.7
    return norm(mix(chant, riser(d, 80, 1500, 2.5) * 1.2, sweep_lp(osc(mtof(26) * (1 + 0.3 * t_(d) / d), kind='saw'), 100 + 1000 * t_(d) / d) * (t_(d) / d) * 0.6))


@sound('boss_nova', 'boss')
def _(i):
    ch = mono(choir([(0, 0.4, m, 1) for m in (50, 51, 57, 62)], 'a', 'bass', voices=3, attack=0.02, release=1.5))
    return norm(mix(boom(3.0, 34, 0.9) * 1.2, whoosh(0.8, 100, 3000, 300, 0.2, 1), ch * 0.5, crackle(1.5, 60, 2000) * expdec(1.5, 0.6)))


@sound('boss_swing', 'boss', 2)
def _(i):
    return norm(whoosh(0.7, 80, 500, 150, 0.6, 1.0) + lp(white(0.7), 120) * env(0.7, [(0, 0), (0.4, 1), (0.7, 0)]) * 0.5)


@sound('boss_hit', 'boss', 2)
def _(i):
    return norm(mix(boom(1.0, 55, 0.2), k(f'impactPunch_heavy_00{i}', 0.6), crack(0.3, 600, 3000, 0.02, 4) * 0.5))


@sound('boss_step', 'boss', 3)
def _(i):
    return norm(mix(thump(42, 0.5, 0.12), k(f'footstep_concrete_00{i}', 0.5) * 0.6))


@sound('boss_death', 'boss')
def _(i):  # the Reverendissimo falls: a scream that sinks into the floor
    d = 3.5
    ph = V(('a', d * 0.5, 1.4), ('o', d * 0.3, 0.9), ('h', d * 0.2, 0.5))
    scream = speak(ph, 80, 'bass', rasp=1.0, sub=0.5) + speak(ph, 40, 'bass', rasp=1.0) * 0.6
    collapse = mix(boom(3.0, 36, 1.0), (crack(0.6, 800, 4000, 0.02, 10), 0.05, 0.6))
    return norm(mix(wet(dist(scream, 2.5), 4.0, 0.4, damp=3500), (collapse, 2.6, 1.0)))


@sound('boss_laugh', 'boss')
def _(i):
    ph = []
    for j in range(4):
        ph += [('h', 0.06, 1.0 - j * 0.05), ('a', 0.16, 1.0 - j * 0.06), ('h', 0.05, 0.9 - j * 0.06)]
    return lich(ph, 72)


# ================================================================ world: ambient one-shots and emitters

def gull_call(d, f0, rise=1.6, rasp=0.5):
    t = t_(d)
    k_ = t / d
    f = f0 * np.where(k_ < 0.25, 1 + (rise - 1) * k_ / 0.25, rise * (1 / rise) ** ((k_ - 0.25) / 0.75) * 0.85 + 0.15 * rise)
    src = osc(f, kind='saw') + 0.6 * osc(f * 2, kind='saw')
    src *= 1 + rasp * lp(rng.standard_normal(len(t)), 120) * 8
    y = bp(src, 900, 4500) * env(d, [(0, 0), (0.02, 1), (d * 0.6, 0.7), (d, 0)])
    return y


@sound('gull', 'world', 3)
def _(i):
    calls = [[(0, 0.35, 1100), (0.45, 0.3, 1200), (0.85, 0.12, 1300), (1.0, 0.12, 1300), (1.15, 0.12, 1250)],
             [(0, 0.45, 1000), (0.6, 0.4, 1050)],
             [(0, 0.2, 1250), (0.26, 0.2, 1300), (0.5, 0.5, 1050)]][i]
    y = mix(*[(gull_call(d, f), t, 1) for t, d, f in calls])
    return norm(wet(y, 1.0, 0.2))


@sound('bell_far', 'world', 2)
def _(i):  # the bell tower across the Giudecca
    b = bell([50, 45][i], 7.0, 3.5)
    return norm(lp(mono(reverb(b, 3.0, 0.6, damp=3000)), 2500))


@sound('owl', 'world', 2)
def _(i):
    def hoot(d, f):
        t = t_(d)
        return osc(f * (1 - 0.06 * t / d) * (1 + 0.01 * np.sin(2 * np.pi * 9 * t)), kind='sine') * env(d, [(0, 0), (0.05, 1), (d * 0.7, 0.8), (d, 0)]) + lp(white(d), 900) * 0.04
    y = mix((hoot(0.45, 400), 0), (hoot(0.18, 380), 1.1), (hoot(0.7, 390), 1.4)) if i == 0 else mix((hoot(0.6, 420), 0), (hoot(0.25, 400), 0.9))
    return norm(wet(y, 1.6, 0.35))


@sound('frog', 'world', 3)
def _(i):
    d = [0.35, 0.5, 0.25][i]
    t = t_(d)
    y = osc(np.full(len(t), [110.0, 95.0, 130.0][i]), kind='saw') * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * [28, 22, 34][i] * t)))
    y = reson(y, 600, 4) + reson(y, 1300, 6) * 0.4
    return norm(y * env(d, [(0, 0), (0.02, 1), (d * 0.8, 0.8), (d, 0)]))


def chant_phrase(seed, f0=130, d=7.0):
    """A line of plainchant, four voices in unison, sung far off in a stone space."""
    r = np.random.default_rng(seed)
    scale = [0, 2, 3, 5, 7, 8, 10, 12]  # D aeolian, around the reciting tone
    out = np.zeros(n_(d + 0.5))
    notes, t, deg = [], 0.0, 4
    while t < d - 0.6:
        deg = int(np.clip(deg + r.choice([-1, 0, 0, 1, 1, -2]), 0, 7))
        dur = r.choice([0.35, 0.5, 0.5, 0.7, 1.0])
        notes.append((r.choice(list('aaeiou')), dur, 2 ** (scale[deg] / 12)))
        t += dur
    notes[-1] = (notes[-1][0], 1.2, 1.0)
    for v in range(4):
        y = speak([(ph, dur, pm) for ph, dur, pm in notes], f0 * 2 ** (r.uniform(-8, 8) / 1200), 'tenor', breath=0.08)
        out[:len(y)] += y[:len(out)]
    return out


@sound('chant_far', 'world', 3)
def _(i):
    y = chant_phrase(10 + i, [123, 131, 116][i])
    return norm(lp(mono(reverb(y, 3.5, 0.9, dry=0.3, damp=3000)), 2200))


@sound('creak', 'world', 2)
def _(i):
    return norm(wet(k(['creak2', 'creak3'][i], 0.7), 2.5, 0.4))


@sound('fire', 'world', loop=3.0)
def _(i):
    return norm(xloop(crackle(3.4, 35, 2600) + lp(brown(3.4), 400) * 0.3, 3.0, 0.4))


@sound('hives', 'world', loop=4.0)
def _(i):
    y = sum(buzz(rng.uniform(190, 260), 4.5, drift=0.04) * rng.uniform(0.2, 0.6) for _ in range(10))
    return norm(xloop(y, 4.0, 0.5))


@sound('glint', 'world', loop=4.0)
def _(i):  # the chest's gold glint: a faint magic hum
    d = 4.5
    hum = (osc(587.3, d) + osc(880.0, d) * 0.5 + osc(1174.7, d) * 0.25) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * t_(d)))
    return norm(xloop(hum * 0.3 + shimmer(d, [86, 89, 93, 98], 6), 4.0, 0.5))
