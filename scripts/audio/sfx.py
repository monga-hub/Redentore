"""Every sound effect, voice and world one-shot of the game. Each entry of SOUNDS is
(bank, variants, loop, maker): `maker(i)` returns variant i as a mono array (loops: exactly one
seamless period). The body of every sound is a real recording (sources.py: Kenney, OpenGameArt
and Freesound, all CC0), cut, pitched, layered and put in a room here; the undead speak with
real voices slowed and roughened. Code-made layers are kept only for the magic's sparkle."""
from dsp import *

REC = None  # set by build.py: (key, stereo=False) -> array at SR, the recordings of sources.py


def r(key, rate=1.0, a=0.0, d=None):
    """A recording from `a` s, played `rate` times faster (below 1: deeper and slower), `d` s of the result."""
    x = REC(key)[n_(a):n_(a + d * rate) if d else None]
    if a or d:
        x = fade(x, 0.004, 0.004)  # no click where it was cut
    return resample(x, rate) if rate != 1 else x


k = r  # Kenney's sounds go by their bare names


def tail(x, t=0.3):
    """A cut-off stretch of a long recording, let go gently instead of stopping dead."""
    return fade(x, 0.004, min(t, len(x) / SR / 2))


GUST = 44.0  # s into `gusts`: one strong gust swelling in and dying away


def gust(rate=1.0, a=0.0, d=3.8):
    """A real gust of wind (the mic's rumble taken off)."""
    return hp(r('gusts', rate, GUST + a, d), 120)


def events(x, n, gap=0.25):
    """Onsets (s) of the `n` loudest separate events of a recording, loudest first."""
    hop = n_(0.01)
    e = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, 'same'))[::hop]
    left = e.copy()
    out = []
    for _ in range(n):
        i = int(np.argmax(left))
        if left[i] <= 0:
            break
        j = i
        while j > 0 and e[j - 1] > e[i] * 0.1 and i - j < 30:
            j -= 1
        m = i
        while m < len(e) - 1 and e[m + 1] > e[i] * 0.1:
            m += 1
        out.append(j * hop / SR)
        left[max(0, j - int(gap * 100)):m + int(gap * 100)] = 0
    return out


def ev(key, i, d, rate=1.0, gap=0.25, pre=0.01):
    """The `i`-th loudest event of a recording, `d` s of it from its onset."""
    x = REC(key)
    t = events(x, i + 1, gap)[i]
    y = x[max(0, n_(t - pre)):n_(t - pre + d)]
    return fade(resample(y, rate) if rate != 1 else y, 0.003, d * 0.3)


def xloop(x, L, X=0.25):
    """`x` (at least L + X s long) -> exactly L s that loop seamlessly (equal-power crossfade of the overrun)."""
    n, m = n_(L), n_(X)
    y = x[:n].copy()
    a = np.sqrt(np.linspace(0, 1, m))
    if x.ndim == 2:
        a = a[:, None]
    y[:m] = x[:m] * a + x[n:n + m] * np.sqrt(1 - a ** 2)
    return y


def tile(parts, d, X=0.08):
    """Pieces laid end to end with short crossfades until `d` s: a continuous sound out of bursts."""
    out, i = np.zeros(0), 0
    while len(out) < n_(d):
        p = parts[i % len(parts)]
        i += 1
        if not len(out):
            out = p.copy()
            continue
        m = min(n_(X), len(p), len(out))
        a = np.sqrt(np.linspace(0, 1, m))
        out[-m:] = out[-m:] * np.sqrt(1 - a ** 2) + p[:m] * a
        out = np.concatenate([out, p[m:]])
    return out[:n_(d)]


def loud_parts(x, d=0.4, keep=0.5):
    """The louder `keep` share of a recording's `d`-s slices (a bee's flight without its pauses)."""
    s = [x[j:j + n_(d)] for j in range(0, len(x) - n_(d), n_(d))]
    lv = np.array([np.sqrt(np.mean(p ** 2)) for p in s])
    return [p for p, v in zip(s, lv) if v >= np.quantile(lv, 1 - keep)]


def wet(x, rt=1.2, w=0.25, damp=5000):
    return mono(reverb(x, rt, w, damp=damp))


def dist(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def undead(x, rate=0.82, drive=1.8, rt=0.9, w=0.15):
    """A real voice made dead: slowed and lowered, roughened, heard in stone."""
    y = dist(norm(resample(x, rate)), drive)
    return norm(wet(hp(y, 60), rt, w, damp=4500))


def bowl(rate=1.0, a=0.0, d=2.5):
    """The brass singing bowl struck: its warm body, the whistling upper partials taken off."""
    return fade(lp(r('singing_bowl', rate, a, d), 1800, 4), 0.002, d * 0.5)


def sparkle(d, notes, rate=10, tau=0.25):
    """The magic's glitter (the one code-made layer): sine pings kept low and below 4 kHz."""
    return lp(shimmer(d, [m for m in notes if m <= 95], rate, tau), 4000)


SOUNDS = {}


def sound(name, bank, variants=1, loop=0.0):
    def reg(f):
        SOUNDS[name] = (bank, variants, loop, f)
        return f
    return reg


# ================================================================ UI (core): paper, leather, wood

@sound('ui_click', 'core', 3)
def _(i):  # a soft tap of leather and paper, no electronic tick
    tap = lp(k(['bookPlace1', 'bookPlace2', 'bookPlace3'][i], 1.15)[:n_(0.09)], 5000)
    return fade(mix(tap, (k(['handleSmallLeather', 'handleSmallLeather2', 'handleSmallLeather'][i])[:n_(0.07)], 0, 0.4)), 0.001, 0.03)


@sound('ui_hover', 'core', 2)
def _(i):  # a page edge brushed
    return fade(lp(k(['bookFlip1', 'bookFlip2'][i], 1.3)[:n_(0.05)], 4000), 0.002, 0.03)


@sound('ui_open', 'core')
def _(i):
    return lp(mix(k('bookOpen'), (k('bookFlip2'), 0.12, 0.6)), 10000)


@sound('ui_close', 'core')
def _(i):
    return lp(k('bookClose'), 10000)


@sound('ui_page', 'core', 2)
def _(i):
    return lp(k(['bookFlip1', 'bookFlip3'][i]), 10000)


@sound('ui_error', 'core')
def _(i):  # a dull knock on wood instead of a buzzer
    return lp(mix(k('impactWood_light_001', 0.8), (k('impactWood_light_003', 0.75), 0.11, 0.7)), 3500)


@sound('quest', 'core')
def _(i):  # objective updated: the book set down and a brass bowl struck twice
    return norm(mix(k('bookPlace2') * 0.6, (bowl(1.0, 0, 2.6), 0.05, 0.8), (bowl(1.335, 0, 2.4), 0.3, 0.55)))


# ================================================================ the hero (core)

for surf, src in [('stone', 'footstep_concrete'), ('grass', 'footstep_grass'), ('wood', 'footstep_wood')]:
    def make(i, src=src, surf=surf):
        x = lp(trim(k(f'{src}_00{i}')), 9000)
        if surf == 'wood':  # the pontile's planks: a hollow knock under the step
            x = mix(x, k(f'impactPlank_medium_00{i % 5}', 0.8) * 0.2)
        return fade(x, 0.001, 0.03)
    sound(f'step_{surf}', 'core', 5)(make)


@sound('step_gravel', 'core', 5)
def _(i):  # real gravel underfoot
    return fade(hp(ev('gravel_steps', i + 2, 0.32, gap=0.3), 80), 0.001, 0.06)


@sound('land', 'core', 2)
def _(i):
    return mix(k('impactSoft_heavy_00%d' % (i + 1), 0.8) * 0.8, k(['cloth2', 'cloth4'][i]) * 0.7, k('impactSoft_medium_00%d' % (i + 1)) * 0.6)


@sound('jump', 'core', 2)
def _(i):  # cloth and a short breath
    return mix(k(['cloth1', 'cloth3'][i]), lp(r('creature:breath', 1.1), 3000) * 0.25)


@sound('swing', 'core', 3)
def _(i):  # the bone club through the air: a stick's whoosh made heavier
    w = [r('woosh_stick', 0.8), r('bamboo4', 0.72), r('bamboo5', 0.7)][i]
    return norm(lp(trim(w, -45), 6000))


@sound('hit_flesh', 'core', 4)
def _(i):  # the club in flesh: a punch and something wet
    return norm(mix(k(f'impactPunch_heavy_00{i}'), (lp(r(f'mud:mud_{[3, 7, 12, 18][i]:02d}'), 3000) * 0.45, 0.005)))


def bone(i, rate=1.0):
    return [r('bone_break', rate), r('bone_break2', rate), r('bone_crack', rate), r('bone_crack2', rate), r('celery', rate)][i % 5]


@sound('hit_bone', 'core', 4)
def _(i):  # bone and gristle cracking under the blow
    return norm(mix(k(f'impactPunch_medium_00{i}', 0.85) * 0.8, (bone(i, 0.85) * 0.8, 0.005)))


@sound('hit_big', 'core', 2)
def _(i):  # the overhead smash: the floor cracks and gives
    debris = tail(r(['debris', 'debris_big'][i], 0.85, 0, 1.4), 0.6)
    return norm(mix(k(f'impactMining_00{i}', 0.7) * 0.8, tail(lp(r('debris_big', 0.5, 0, 1.0), 400), 0.5) * 0.7, (debris * 0.6, 0.02), (bone(i + 2, 0.7) * 0.5, 0.01)))


@sound('hit_player', 'core', 3)
def _(i):
    return norm(mix(k(f'impactPunch_medium_00{i + 2}'), k(['cloth2', 'clothBelt', 'cloth4'][i]) * 0.5))


@sound('player_hurt', 'core', 4)
def _(i):  # the Forsaken grunts: a real voice, lowered and dried out
    return undead(ev('grunts_unfa', [0, 2, 4, 6][i], 0.55, gap=0.6), 0.86, 1.6, 0.6, 0.08)


@sound('player_death', 'core')
def _(i):
    groan = undead(r('zombie_dying', 0.85, 6.0, 3.0), 1.0, 1.5, 1.4, 0.25)
    return norm(mix(fade(groan, 0.01, 1.2), (k('impactSoft_heavy_002', 0.8), 1.6, 0.9), (bone(1, 0.8) * 0.4, 1.62)))


@sound('player_revive', 'core')
def _(i):  # he gets up again: a breath drawn backwards and a low bowl
    breath = reverse(lp(r('ghost_breath', 1.0, 0, 1.6), 3000))
    return norm(mix(fade(breath, 0.3, 0.05) * 0.8, (bowl(0.75, 0, 3.0), len(breath) / SR - 0.05)))


# ---------------------------------------------------------------- abilities: real elements, layered

@sound('plague_cast', 'core')
def _(i):  # a retch of rot thrown forward
    return norm(mix(r('creature:burble_01', 0.8) * 0.8, (r('swoosh_low', 1.1) * 0.6, 0.05), (lp(r('water:bubble_02'), 2500) * 0.5, 0.1)))


@sound('plague_hit', 'core')
def _(i):
    hiss = bp(gust(1.4, 0, 1.2), 1500, 6000) * env(1.2, [(0, 0), (0.05, 1), (1.2, 0)]) * 0.3
    return norm(mix(r('water:splash_04', 0.8), (r('mud:mud_21', 0.8) * 0.8, 0.02), (lp(r('water:bubble_01'), 2000) * 0.5, 0.15), (hiss, 0.05)))


@sound('plague_cloud', 'core')
def _(i):  # the cloud stews for 8 s
    d = 7.6
    stew = lp(tile([r('water:loop_bubbles_1'), r('water:loop_bubbles_02')], d, 0.3), 1500)
    gas = bp(tile([gust(0.6)], d, 0.5), 200, 1200) * 0.35
    return norm((stew + gas) * env(d, [(0, 0), (0.4, 1), (d - 1.5, 1), (d, 0)]))


@sound('wisp_cast', 'core')
def _(i):  # 1.5 s cast: flame drawn up into the raised hands
    d = 1.6
    fire = fit(reverse(r('rpg:spell_fire_03', 0.9)), d)
    rise = (t_(d) / d) ** 1.5
    return norm(mix(fire * 0.9, r('fire_roar', 1.2, 2, d) * rise * 0.5, sparkle(d, [74, 77, 81, 86], 10) * rise * 0.25))


@sound('wisp_summon', 'core')
def _(i):
    flare = r('rpg:spell_fire_06')
    return norm(mix(flare, (r('torch', 1.1, 3.3, 0.9) * 0.7, 0.02), (bowl(1.5, 0, 1.6) * 0.3, 0.05), (sparkle(1.2, [74, 81, 86], 14) * expdec(1.2, 0.5) * 0.3, 0.05)))


@sound('wisp_loop', 'core', loop=3.0)
def _(i):  # the wisp's flame: a soft real fire, no hum
    return norm(xloop(lp(r('fire', 1.0, 10, 3.4), 6000) + lp(r('fire_roar', 1.0, 6, 3.4), 900) * 0.25, 3.0, 0.4))


@sound('wisp_end', 'core')
def _(i):  # the flame gutters out
    return norm(mix(fade(r('torch', 1.2, 3.4, 0.7), 0.01, 0.5), (bowl(1.5, 0, 1.4) * 0.25, 0.04)))


@sound('veil', 'core')
def _(i):  # Velo spettrale: a gust rushing in, whispers drawn backwards, a ghost's moan
    whisper = reverse(wet(r('whispers', 1.0, 2.0, 1.2), 1.2, 0.6))
    moan = lp(r('ghost:qubodup-GhostMoan05', 1.1), 2500)
    return norm(mix(tail(gust(1.15), 0.8), (whisper * 0.6, 0.1), (tail(moan, 0.6) * 0.5, 0.35)))


@sound('blink', 'core')
def _(i):  # Passo d'ombra: sucked out, popped back in
    out = reverse(r('woosh_stick', 0.9))
    pop = mix(k('impactSoft_medium_002', 1.2), (k('cloth3')[:n_(0.12)] * 0.5, 0))
    return norm(mix(out, (pop, len(out) / SR - 0.02, 1), (tail(lp(gust(1.6, 0.3, 0.6), 3000)) * 0.4, len(out) / SR)))


@sound('strike_cast', 'core')
def _(i):  # Sentenza del sepolcro: the leap and the club swung down
    return norm(mix(r('swoosh_low', 0.75), (tail(gust(1.3, 0.2, 0.5)) * 0.4, 0)))


@sound('strike_hit', 'core')
def _(i):  # the bone spear bursting out of the floor
    spikes = mix(*[(bone(j, rate), t, 0.8) for j, (t, rate) in enumerate([(0, 0.8), (0.05, 0.95), (0.09, 0.7), (0.15, 0.85)])])
    return norm(mix(tail(r('debris_big', 0.75, 0, 1.6), 0.6), (spikes, 0.01), (lp(k('impactMining_002', 0.5), 500), 0)))


@sound('nova', 'core')
def _(i):  # Lamento della cripta: the slam, the blast of air and rings of bone spikes
    ring = mix(*[(bone(j, 0.7 + 0.04 * (j % 5)) * 0.6, 0.06 + j * 0.025, 1) for j in range(10)])
    return norm(mix(tail(lp(r('debris_big', 0.5, 0, 2.6), 1200), 1.0), (tail(r('debris', 0.8, 0, 2.0), 0.8) * 0.6, 0.03), (tail(gust(0.9), 0.8) * 0.6, 0.02), (ring, 0.05, 0.8)))


@sound('ward', 'core')
def _(i):  # Patto della tomba: a grave bowl struck low, a ghost's breath, faint glitter
    d = 3.5
    return norm(wet(mix(bowl(0.5, 0, d), (lp(r('ghost_breath', 1.0, 0, 2.0), 2500) * 0.5, 0.05), (sparkle(d, [74, 78, 81, 86], 8) * expdec(d, 1.5) * 0.3, 0)), 2.0, 0.3))


@sound('potion', 'core')
def _(i):  # the stopper, three gulps, a sigh of glitter
    gulp = lambda rate: lp(r('gulp', rate), 3000)
    return norm(mix(r('cork'), (gulp(1.0), 0.18), (gulp(0.95), 0.42), (gulp(1.05), 0.66), (sparkle(1.0, [74, 77, 81], 6) * expdec(1.0, 0.3) * 0.15, 0.85)))


@sound('charge_ready', 'core')
def _(i):  # the fury bar is full: the bowl struck, a fifth above it answering
    return norm(wet(mix(bowl(0.75, 0, 2.5), (bowl(1.12, 0, 2.2) * 0.6, 0.12)), 1.8, 0.3))


@sound('loot', 'core')
def _(i):  # a drop: leather and coins, a little glitter
    return norm(mix(k('dropLeather') * 0.8, (r('rpg:item_coins_02') * 0.6, 0.04), (sparkle(1.4, [81, 86, 89, 93], 10) * expdec(1.4, 0.5) * 0.2, 0.05)))


# ---------------------------------------------------------------- quest: chest, key, gates, doors

@sound('chest_open', 'core')
def _(i):
    return norm(mix(k('metalLatch'), (lp(k('creak1', 0.75), 3000, 4), 0.18, 0.9), (k('impactWood_light_002', 0.8), 0.95, 0.8),
                    (sparkle(1.4, [74, 78, 81, 86], 10) * expdec(1.4, 0.6) * 0.2, 0.5)))


@sound('key', 'core')
def _(i):  # the key lifted from the chest: real keys and a click
    return norm(mix(r('keys', 0.9, 1.0, 1.4) * fade(np.ones(n_(1.4)), 0.02, 0.6), (k('metalClick', 0.8) * 0.5, 0.05), (bowl(1.5, 0, 2.0) * 0.3, 0.15)))


@sound('grate_open', 'core')
def _(i):  # an iron grate hauled up into the wall (1.6 s): chains, rattling bars, the stop
    d = 1.7
    chains = r('chains', 0.85, 1.0, d) * env(d, [(0, 0), (0.1, 1), (1.5, 1), (d, 0)])
    rattle = r('gate_rattle', 0.8, 15.5, d) * 0.6
    return norm(mix(chains, rattle, (ev('iron_gate', 0, 0.6, 0.8), 1.5, 0.9), (k('impactMetal_heavy_001', 0.7) * 0.5, 1.55)))


@sound('grate_close', 'core')
def _(i):
    d = 1.4
    chains = r('chains', 0.8, 5.0, d) * env(d, [(0, 0), (0.1, 1), (1.2, 1), (d, 0)])
    return norm(mix(chains, (ev('iron_gate', 1, 0.6, 0.75), 1.22, 1), (k('impactMetal_heavy_003', 0.6), 1.25, 0.8)))


@sound('door_open', 'core')
def _(i):  # the heavy church doors swinging in
    return norm(wet(lp(mix(k('doorOpen_2', 0.65), (k('creak2', 0.55), 0.15, 0.9)), 3000, 4), 1.8, 0.3))


@sound('door_close', 'core')
def _(i):  # ...and slamming shut (the portone in the intro)
    slam = mix(lp(k('creak3', 0.6), 3000, 4) * 0.6, (k('doorClose_4', 0.6), 0.35, 1), (k('impactWood_heavy_001', 0.7), 0.38, 1), (lp(k('impactWood_heavy_002', 0.45), 400) * 0.8, 0.37))
    return norm(wet(slam, 2.5, 0.35))


@sound('locked', 'core')
def _(i):
    return norm(lp(mix(k('metalLatch', 0.9), (k('metalLatch', 0.85), 0.16, 0.8), (k('impactMetal_light_002', 0.7) * 0.5, 0.18)), 4000))


# ================================================================ enemies (mobs): real voices, made dead

@sound('friar_aggro', 'mobs', 3)
def _(i):
    return undead(ev('zombie_growls', [0, 3, 6][i], 1.4, gap=0.6), [0.85, 0.8, 0.9][i])


@sound('friar_hurt', 'mobs', 3)
def _(i):
    return undead(ev('grunts', [1, 4, 7][i], 0.4, gap=0.2), [0.8, 0.76, 0.84][i], 2.0, 0.6, 0.08)


@sound('friar_death', 'mobs', 3)
def _(i):
    moan = undead(ev('zombie_moan', [0, 2, 4][i], 2.0, gap=0.8), 0.92, 1.4, 1.0, 0.2)
    return norm(mix(fade(moan, 0.01, 0.8), (bone(i, 0.85) * 0.35, 0.9), (k(f'impactSoft_heavy_00{i}', 0.85) * 0.8, 1.0)))


@sound('friar_swing', 'mobs', 2)
def _(i):  # the hoe through the air
    return norm(trim(r(['bamboo3', 'bamboo5'][i], 0.78), -45))


@sound('friar_hit', 'mobs', 2)
def _(i):  # the hoe bites
    return norm(mix(k(f'impactPunch_heavy_00{i + 1}'), k(f'impactMetal_light_00{i}', 0.6) * 0.4))


@sound('hoe', 'mobs', 3)
def _(i):  # a friar at work: the blade in the earth, quiet
    return norm(lp(mix(r(f'mud:mud_{[2, 9, 15][i]:02d}', 0.9), k(f'impactSoft_medium_00{i}', 0.9) * 0.5, k(f'footstep_snow_00{i}', 0.8) * 0.4), 5000))


@sound('priest_aggro', 'mobs', 2)
def _(i):  # a hissed curse and a ghost's moan behind it
    hiss = r('whisper_demon', 0.95, [0.0, 2.0][i], 1.8)
    moan = lp(r('ghost:qubodup-GhostMoan0%d' % [1, 4][i], 1.05, 0, 1.8), 3000)
    return norm(wet(mix(fade(hiss, 0.01, 0.5), (moan * 0.6, 0.15)), 1.2, 0.3))


@sound('priest_cast', 'mobs')
def _(i):  # the shadow bolt gathering in the crystal (1.6 s; sacerdoti and the boss play it slower)
    d = 1.6
    rise = (t_(d) / d) ** 1.5
    whisper = r('whispers', 0.9, 4.0, d)
    return norm(mix(whisper * 0.6, r('fire_roar', 0.7, 4, d) * rise * 0.8, reverse(fit(r('rpg:spell_fire_04'), d)) * 0.6))


@sound('bolt_cast', 'mobs', 2)
def _(i):  # the bolt let fly: a torch whooshing past
    return norm(fade(r('torch', [1.0, 1.1][i], [0.2, 1.8][i], 0.55), 0.005, 0.25))


@sound('bolt_hit', 'mobs', 2)
def _(i):
    return norm(mix(r(['rpg:spell_fire_06', 'rpg:spell_fire_03'][i], 0.85, 0, 0.9), k('impactSoft_heavy_00%d' % (i + 2), 0.8) * 0.6, (r('rpg:stones_0%d' % (i + 1), 0.9) * 0.3, 0.02)))


@sound('bolt_fizzle', 'mobs')
def _(i):
    return norm(fade(hp(r('rpg:spell_fire_07', 1.1), 600), 0.003, 0.2))


@sound('priest_hurt', 'mobs', 2)
def _(i):
    return undead(ev('grunts', [2, 9][i], 0.4, gap=0.2), [0.95, 0.9][i], 1.3, 0.7, 0.12)


@sound('priest_death', 'mobs', 2)
def _(i):  # a wail of agony, in stone, and the body falling
    wail = lp(undead(r('agony', 0.9, [3.65, 5.0][i], [1.2, 2.0][i]), 0.95, 1.2, 2.0, 0.4), 6000)
    return norm(mix(fade(wail, 0.01, 0.6), (k(f'impactSoft_heavy_00{i + 3}', 0.9) * 0.6, 0.9)))


@sound('pray', 'mobs', loop=6.0)
def _(i):  # a group at prayer: real whispers, murmured low
    w = r('whispers', 0.8)
    return norm(xloop(lp(tile([w, reverse(w)], 6.6, 0.4), 2200), 6.0, 0.6))


@sound('sacerdote_aggro', 'mobs')
def _(i):
    return norm(wet(lp(dist(norm(fade(r('demon_roar', 0.9, 0.8, 2.4), 0.05, 0.6)), 1.5), 5000), 1.6, 0.3))


@sound('heavy_swing', 'mobs', 2)
def _(i):
    return norm(trim(r(['swoosh_low', 'woosh_stick'][i], [0.7, 0.62][i]), -45))


@sound('heavy_hit', 'mobs', 2)
def _(i):
    return norm(mix(k(f'impactPunch_heavy_00{i + 2}'), lp(k(f'impactMetal_heavy_00{i}', 0.7), 2500) * 0.6, (bone(i + 1, 0.75) * 0.3, 0.005)))


@sound('sacerdote_hurt', 'mobs', 2)
def _(i):
    return undead(ev('grunts_unfa', [1, 3][i], 0.7, gap=0.6), 0.7, 2.0, 1.0, 0.15)


@sound('sacerdote_death', 'mobs')
def _(i):
    cry = undead(r('zombie_dying', 0.75, 0, 3.0), 1.0, 1.4, 2.0, 0.35)
    return norm(mix(fade(cry, 0.01, 1.0), (k('impactMetal_medium_002', 0.7) * 0.6, 1.6), (k('impactSoft_heavy_001', 0.8), 1.75)))


def flight(key, rate):
    """A bee's buzz without its pauses, at `rate` (lower: a bigger insect)."""
    return resample(tile(loud_parts(REC(key), 0.35, 0.25), 3.0, 0.1), rate)


@sound('bee_queen', 'mobs', loop=2.0)
def _(i):  # the giant: a bumblebee's flight, slowed to a drone
    return norm(xloop(lp(flight('bumblebee', 0.62), 4000), 2.0, 0.4))


@sound('bee_worker', 'mobs', loop=2.0)
def _(i):
    return norm(xloop(lp(flight('bumblebee', 1.15), 6000), 2.0, 0.4))


@sound('bee_sting', 'mobs', 2)
def _(i):  # the dive: a bee passing close and the sting going in
    dive = r('bee_pass', [0.75, 0.85][i])
    return norm(mix(dive, (k('impactPunch_medium_00%d' % i, 1.3) * 0.4, 0.45)))


@sound('bee_swarm_cast', 'mobs')
def _(i):  # the poison swarm gathering (1.8 s)
    d = 1.9
    return norm(r('beehive_close', 1.15, 3, d) * (t_(d) / d) ** 1.2)


@sound('bee_swarm', 'mobs')
def _(i):
    d = 1.6
    return norm(mix(r('beehive_close', 1.25, 8, d) * expdec(d, 0.6), tail(gust(1.2, 0.2, 0.8)) * 0.5, (lp(r('water:bubble_03'), 2000) * 0.4, 0.05)))


@sound('bee_hurt', 'mobs', 2)
def _(i):
    stutter = flight('bumblebee', [1.0, 1.25][i])[:n_(0.3)] * (np.sin(2 * np.pi * 18 * t_(0.3)) > 0)
    return norm(mix(bone(i + 2, 1.3) * 0.6, lp(stutter, 5000) * 0.6))


@sound('bee_death', 'mobs', 2)
def _(i):  # wings failing, a fall into the grass
    d = 0.8
    wings = flight('bumblebee', [1.1, 0.8][i])[:n_(d)]
    rate = np.exp(-t_(d) / 0.5)  # the buzz slowing as it falls
    idx = np.cumsum(0.4 + 0.6 * rate)
    fall = np.interp(idx[idx < len(wings) - 1], np.arange(len(wings)), wings)
    return norm(mix(tail(fall * expdec(len(fall) / SR, 0.35), 0.2), (bone(i, 1.2) * 0.5, 0.5), (k('footstep_grass_00%d' % i) * 0.6, 0.6)))


# ================================================================ the Reverendissimo (boss)

def lich(x, rate=0.7, room=3.0):
    """His voice: a real one slowed far down, doubled an octave below, a whisper over it, in the church."""
    v = dist(norm(resample(x, rate)), 2.0)
    o = dist(norm(resample(x, rate / 2)), 2.0)[:len(v)]
    y = mix(v, o * 0.5)
    return norm(wet(lp(y, 5000), room, 0.35, damp=3500))


@sound('boss_aggro', 'boss')
def _(i):  # he rises from prayer: a moan, a whispered curse, a roar
    moan = lich(r('ghost:qubodup-GhostMoan02', 1.0), 0.8)
    return norm(mix(moan, (lich(r('whisper_demon', 1.0, 0, 2.0), 0.8) * 0.6, 1.0), (boss_roar(0), 2.7, 0.9)))


@sound('boss_line', 'boss', 3)
def _(i):  # his taunts: words long past understanding
    src = [r('ghost:qubodup-GhostMoan01', 1.0), r('ghost:qubodup-GhostMoan04', 1.0, 0, 3.0), r('ghost:qubodup-GhostMoan03', 1.0, 0.5, 3.0)][i]
    return norm(mix(lich(src, [0.85, 0.8, 0.9][i]), lp(r('whisper_demon', 0.9, i * 0.8, 2.6), 4000) * 0.3))


def boss_roar(i):
    x = [ev('troll_roars', 0, 1.7, 0.8, gap=0.5), ev('monster_growls', 1, 3.0, gap=1.0)][i]
    return norm(wet(lp(dist(norm(trim(x, -40)), 1.6), 5000), 3.0, 0.35, damp=3500))


@sound('boss_roar', 'boss', 2)
def _(i):
    return boss_roar(i)


@sound('boss_hurt', 'boss', 3)
def _(i):
    return lich(ev('grunts_unfa', [5, 7, 1][i], 0.7, gap=0.6), [0.62, 0.58, 0.66][i], 2.5)


@sound('boss_nova_cast', 'boss')
def _(i):  # 2.6 s: whispers gathering into a howl of wind and fire
    d = 2.7
    rise = (t_(d) / d) ** 1.5
    whispers = lich(r('whispers', 0.9, 0, d), 0.95, 2.0)
    return norm(mix(fit(whispers, d) * 0.8, r('fire_roar', 0.6, 8, d) * rise, fit(reverse(gust(0.7)), d) * 0.6))


@sound('boss_nova', 'boss')
def _(i):
    return norm(mix(tail(lp(r('debris_big', 0.45, 0, 3.0), 900), 1.2), (r('debris_big', 0.8) * 0.5, 0.02), (tail(gust(0.8), 0.8) * 0.7, 0.01), (lich(r('ghost:qubodup-GhostMoan05', 1.0), 0.7) * 0.4, 0.1)))


@sound('boss_swing', 'boss', 2)
def _(i):
    return norm(mix(trim(r(['swoosh_low', 'bamboo4'][i], [0.55, 0.5][i]), -45), tail(lp(gust(1.4, 0.3, 0.7), 600)) * 0.4))


@sound('boss_hit', 'boss', 2)
def _(i):
    return norm(mix(k(f'impactPunch_heavy_00{i}', 0.6), (tail(lp(r('debris', 0.6, 0, 1.0), 2500), 0.5) * 0.6, 0.01), (bone(i, 0.6) * 0.4, 0.01)))


@sound('boss_step', 'boss', 3)
def _(i):  # a tread that shakes the floor
    return norm(mix(lp(k(f'impactWood_heavy_00{i}', 0.45), 500), k(f'footstep_concrete_00{i}', 0.5) * 0.6))


@sound('boss_death', 'boss')
def _(i):  # the Reverendissimo falls: a long moan that sinks into the floor
    moan = lich(r('ghost:qubodup-GhostMoan03', 1.0), 0.7, 4.0)
    collapse = mix(lp(r('debris_big', 0.5), 1500), (r('debris', 0.7) * 0.6, 0.1))
    return norm(mix(moan, (collapse, 2.6, 1.0)))


@sound('boss_laugh', 'boss')
def _(i):
    return lich(mix(r('laugh_deep', 0.9), (r('evil_laugh', 0.85) * 0.4, 0.05)), 0.85, 2.5)


# ================================================================ world: ambient one-shots and emitters

@sound('gull', 'world', 3)
def _(i):  # yellow-legged gulls over the lagoon
    a, d = [(3.1, 2.2), (5.6, 1.8), (8.0, 1.6)][i]
    return norm(wet(hp(fade(r('gulls', 1.0, a, d), 0.03, 0.4), 300), 1.0, 0.15))


@sound('bell_far', 'world', 2)
def _(i):  # the bell towers across the Giudecca
    x = r('bells_italy', 1.0, [30, 62][i], 8.5)
    return norm(lp(fade(x, 0.8, 3.0), [2600, 2200][i]))


@sound('owl', 'world', 2)
def _(i):  # a tawny owl in the gardens
    x = [r('owl', 1.0, 0, 1.8), r('owl', 1.0, 4.6, 2.4)][i]
    return norm(wet(lp(fade(x, 0.02, 0.3), 3000), 1.6, 0.3))


@sound('frog', 'world', 3)
def _(i):  # a frog in the vasca
    return norm(lp(fade(ev('frog', [1, 5, 9][i], 0.2, [1.0, 0.94, 1.06][i], gap=0.5), 0.002, 0.08), 5000))  # the croak only: the pond's hum behind it stays out


@sound('chant_far', 'world', 3)
def _(i):  # plainchant from deep in the church
    x = [r('chant_spain', 1.0, 0.5, 10), r('chant_rome', 1.0, 2, 10), r('chant_rome', 1.0, 22, 10)][i]
    return norm(lp(mono(reverb(fade(x, 1.5, 3.0), 3.5, 0.5, dry=0.7, damp=3000)), 2200))


@sound('creak', 'world', 2)
def _(i):
    return norm(wet(lp(k(['creak2', 'creak3'][i], 0.7), 2500, 4), 2.5, 0.4))


@sound('fire', 'world', loop=6.0)
def _(i):  # a torch or brazier: real crackle, its roar low under it
    return norm(xloop(lp(r('fire', 1.0, 20, 6.5), 7000) + lp(r('fire_roar', 1.0, 10, 6.5), 500) * 0.3, 6.0, 0.4))


@sound('hives', 'world', loop=6.0)
def _(i):
    return norm(xloop(lp(r('beehive', 1.0, 5, 6.6), 5000), 6.0, 0.5))


@sound('glint', 'world', loop=4.0)
def _(i):  # the chest's gold glint: now and then coins settling, faint; never a hum or a ring
    d = 4.5
    y = mix(*[(lp(r(f'rpg:item_coins_0{j}', 1.1), 4000) * g, t, 1) for j, t, g in ((1, 0.4, 0.6), (3, 2.5, 0.4))], d=d)
    return norm(xloop(y, 4.0, 0.5))
