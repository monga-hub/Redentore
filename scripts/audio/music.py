"""The score and the ambience beds, written as code. D minor throughout: the Redentore's theme
(a horn call rising D-A, falling back through G F E) appears on the celesta over the lagoon, on
the horns over the orto, in the low brass as the Reverendissimo's motif turned Phrygian (D-Eb),
and in D major, at last, when he falls.

The intro cue is laid out on the flythrough's clock (camera/intro.ts, 74.35 s): lagoon 0-5,
pontile and gardens 5-11, sale espositive 11-16, the orto sweep 16-26.5, corridor and cloisters
26.5-42.4 (the grate at 35.35), the choir door at 42.45, the orbit round the boss 47.5-57.75, back
down the nave to the portone (63.45; the game slams it ~66 s), the fondamenta 66.8 to the end."""
from dsp import *
import sfx

# Chords: midi notes, mid register.
DM, BB, GM, A_, C_, EB, F_ = [50, 53, 57, 62], [46, 50, 53, 58], [43, 50, 55, 58], [45, 52, 57, 61], [48, 52, 55, 60], [51, 55, 58, 63], [41, 48, 53, 57]
D2, A1, EB2 = 38, 33, 39


def chord(c, t, d, g=1.0, oct=0):
    return [(t, d, m + 12 * oct, g) for m in c]


def hall(x, rt=3.0, w=0.35, damp=5000, dry=1.0):
    return reverb(x, rt, w, dry=dry, damp=damp)


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


def place(parts, d):
    """parts: (stereo or mono signal, start s, gain) -> stereo bus of `d` s."""
    return mix(*[(st(x), t, g) for x, t, g in parts], d=d)


def drums(hits, d, f=58, tau=0.35):
    return place([(taiko(f, 1.6, tau, hard), t, g) for t, g, hard in hits], d)


def master(x, peak=-1.0):
    x = softclip(norm(x, 1.5), 1.0)
    return norm(x, peak)


# ================================================================ intro (74.35 s take, 78 s cue)

def intro():
    D = 78.0
    q = 0.857  # crotchet at 70 bpm
    e = q / 2
    bus = []

    # A. The lagoon: a low pedal, a far bell, a soft choir, the theme on the celesta.
    bus.append((strings([(0, 16.5, 26, 0.5), (0, 16.5, 38, 0.6)], attack=3, release=3, cutoff=900), 0, 1.0))
    bus.append((choir(chord(DM, 0.5, 5.6, 0.5) + chord(BB, 5.8, 5.2, 0.5) + chord(GM, 10.8, 5.8, 0.5), 'u', 'soprano', attack=2.0, release=2.0), 0, 0.9))
    for t in (0.8, 5.6, 10.4):
        bus.append((lp(mono(reverb(bell(50, 7, 3.5), 4.0, 0.8, dry=0.2, damp=2500)), 2500), t, 0.6))
    theme_cel = [(81, 1), (86, 1), (88, 1), (89, 2), (88, 1), (86, 1), (85, 1), (86, 3)]
    t = 6.0
    for m, b in theme_cel:
        bus.append((chime(m, 3.0, 1.0), t, 0.35))
        t += b * e
    t = 11.6
    for m, b in [(81, 1), (86, 1), (88, 1), (89, 3), (91, 1), (89, 1), (88, 4)]:
        bus.append((chime(m, 3.0, 1.0), t, 0.3))
        t += b * e

    # B. The orto from above: strings and horns take the theme, taiko on the bar.
    bus.append((cymbal(2.2, swell=True), 13.9, 0.8))
    bus.append((riser(2.2, 200, 4000, 3) * 0.5, 13.9, 1))
    harm = [(DM, 16.1), (BB, 18.7), (C_, 21.3), (A_, 23.9)]
    for c, t0 in harm:
        bus.append((strings(chord(c, t0, 2.7, 0.8) + chord(c, t0, 2.7, 0.5, 1), attack=0.5, release=1.2), 0, 0.9))
        bus.append((choir(chord(c, t0, 2.6, 0.6), 'a', 'tenor', attack=0.4, release=1.0), 0, 0.6))
        bus.append((strings([(t0, 2.7, c[0] - 12, 0.9)], attack=0.2, release=1.0, cutoff=800), 0, 0.9))
    theme = [(62, 2), (69, 3), (67, 1), (65, 1), (64, 1), (65, 2), (67, 2), (69, 4), (70, 2), (69, 2), (67, 2), (64, 2)]
    t = 16.3
    hn = []
    for m, b in theme:
        hn.append((t, b * e * 0.95, m, 1.0))
        hn.append((t, b * e * 0.95, m - 12, 0.6))
        t += b * e
    bus.append((brass(hn, voices=3, bright=5), 0, 0.55))
    bus.append((drums([(16.15, 1.0, 1), (19.6, 0.9, 1), (23.05, 0.9, 1), (25.65, 0.5, 0.6), (25.95, 0.6, 0.7), (26.25, 0.8, 0.9)], D), 0, 1.0))

    # C. Corridor and cloisters: an organ drone, plainchant, a low pulse.
    bus.append((organ([(26.5, 16.0, 38, 0.6), (26.5, 16.0, 45, 0.5)], 'soft', attack=2.0, release=2.0), 0, 0.8))
    bus.append((lp(mono(reverb(chant_phrase(3, 128, 7.0), 3.5, 0.6, dry=0.6, damp=3500)), 3500), 27.2, 0.45))
    bus.append((lp(mono(reverb(chant_phrase(4, 128, 6.5), 3.5, 0.6, dry=0.6, damp=3500)), 3500), 34.6, 0.45))
    roots = [(38, 27.4), (38, 30.83), (34, 34.26), (33, 37.69)]
    pulse = []
    for r, t0 in roots:
        for j in range(8):
            pulse.append((t0 + j * e, 0.22, r + (12 if j % 4 == 2 else 0), 0.6 + 0.1 * (j % 2 == 0)))
    for j in range(3):
        pulse.append((41.12 + j * e, 0.22, 33, 0.7))
    bus.append((strings(pulse, voices=4, attack=0.02, release=0.15, cutoff=1400), 0, 0.7))
    hits = []
    for r, t0 in roots:
        hits += [(t0, 0.55, 0.8), (t0 + 2 * q, 0.45, 0.7), (t0 + 3.5 * q, 0.35, 0.6)]
    bus.append((drums(hits, D, 52, 0.3), 0, 1.0))
    bus.append((timpani(38, 3, 1.2), 35.3, 0.9))
    bus.append((cymbal(2.5, 1.0), 35.3, 0.35))
    bus.append((strings(chord(A_, 37.69, 4.7, 0.4), attack=1.0, release=1.0), 0, 0.6))

    # D. The church: the full organ, the whole choir, and the boss's Phrygian motif.
    cuts = [(DM, 42.45, 5.05), (EB, 47.5, 3.4), (DM, 50.9, 3.4), (A_, 54.3, 3.45)]
    for c, t0, d in cuts:
        bus.append((organ(chord(c, t0, d, 0.7) + [(t0, d, c[0] - 12, 0.9), (t0, d, c[0] - 24, 0.8)], 'full', attack=0.08, release=1.5), 0, 0.9))
        bus.append((choir(chord(c, t0, d, 0.8), 'a', 'bass', attack=0.25, release=1.4), 0, 0.7))
        bus.append((choir(chord(c, t0, d, 0.6, 1), 'a', 'soprano', voices=4, attack=0.4, release=1.4), 0, 0.45))
    motif = []
    for k, t0 in enumerate((47.5, 50.9, 54.3)):
        o = 12 if k == 2 else 0
        for m, b in [(D2, 2), (EB2, 2), (D2, 4), (A1, 4)]:
            motif.append((t0, b * e * 0.9, m + o, 1.0))
            t0 += b * e
    bus.append((brass(motif, voices=4, bright=3, register=0.6), 0, 0.8))
    roll = [(45.0 + j * 0.07, 0.15 + 0.85 * (j / 35) ** 2, 0.5) for j in range(36)]
    bus.append((place([(timpani(38, 1.2, 0.5, h), t, g) for t, g, h in roll], D), 0, 0.7))
    bus.append((boom(4.0, 40, 1.0), 47.5, 0.8))
    beats = [(47.5 + j * q, (0.5 + 0.5 * j / 12) * (1.2 if j % 4 == 0 else 0.8), 1) for j in range(12)]
    bus.append((drums(beats, D, 50, 0.4), 0, 1.0))
    bus.append((timpani(38, 3, 1.2), 50.9, 0.7))
    bus.append((timpani(33, 3, 1.2), 54.3, 0.8))

    # E. Backing down the nave: a chromatic climb, drums doubling, the choir rising.
    climb = [(38, 57.75), (39, 59.2), (40, 60.6), (41, 62.0)]
    bus.append((strings([(t0, 1.5, m + 12, 0.8) for m, t0 in climb] + [(t0, 1.5, m + 24, 0.6) for m, t0 in climb], attack=0.1, release=0.6, trem=7), 0, 0.8))
    bus.append((choir([(57.75, 6.2, 62, 0.6), (59.2, 4.8, 63, 0.5), (60.6, 3.4, 69, 0.5)], 'a', 'tenor', attack=1.5, release=0.8), 0, 0.6))
    bus.append((drums([(57.75 + j * e * (1 if j < 8 else 0.5), 0.4 + 0.6 * j / 20, 0.9) for j in range(20)], D, 60, 0.25), 0, 1.0))
    bus.append((riser(5.7, 100, 3000, 2.5) * 0.4, 57.75, 1))
    bus.append((cymbal(1.5, swell=True), 62.6, 0.5))
    bus.append((timpani(38, 4, 1.8), 64.0, 1.0))  # the doors begin to close; the game slams them into the silence after

    # G. The fondamenta: the theme's last phrase, a bell, the choir settling on D.
    bus.append((choir([(66.8, 7.0, m, 0.5) for m in (50, 57, 64, 65)], 'u', 'soprano', attack=2.5, release=4.0), 0, 0.8))
    bus.append((strings([(66.8, 7.5, 26, 0.5), (66.8, 7.5, 38, 0.5)], attack=2.5, release=3.5, cutoff=800), 0, 0.9))
    for t in (67.5, 71.6):
        bus.append((lp(mono(reverb(bell(50, 7, 3.5), 4.0, 0.8, dry=0.2, damp=2500)), 2500), t, 0.55))
    t = 69.2
    for m, b in [(81, 1), (86, 1), (88, 1), (89, 2), (88, 1), (86, 4)]:
        bus.append((chime(m, 3.0, 1.2), t, 0.3))
        t += b * e

    x = place(bus, D)
    x = hall(x, 3.2, 0.3, damp=4500)[:n_(D)]
    x *= env(D, [(0, 1), (D - 3, 1), (D, 0)])[:, None]
    return master(x)


# ================================================================ loops: exploration, combat layer, boss

BAR = 3.2  # 75 bpm, 4/4
LOOP = 12 * BAR  # 38.4 s
PROG = [DM, BB, GM, A_, DM, C_]  # one chord per two bars; the last turns to A over its second bar


def explore():
    bus = []
    for k, c in enumerate(PROG):
        t0 = k * 2 * BAR
        cs = [(c, t0, 2 * BAR)] if k < 5 else [(C_, t0, BAR), (A_, t0 + BAR, BAR)]
        for cc, tt, d in cs:
            bus.append((strings([(tt, d, cc[0] - 12, 0.6), (tt, d, cc[2] - 12, 0.4)], attack=1.5, release=1.5, cutoff=1100), 0, 0.9))
            bus.append((choir(chord(cc, tt, d, 0.45), 'u', 'soprano', voices=4, attack=1.8, release=1.8), 0, 0.7))
    e = 0.4
    for t0, line in [(4 * BAR, [(81, 2), (86, 2), (88, 2), (89, 4), (88, 2), (86, 4)]), (10 * BAR, [(81, 2), (84, 2), (86, 2), (85, 6)])]:
        t = t0
        for m, b in line:
            bus.append((chime(m, 3.0, 1.0), t, 0.3))
            t += b * e
    x = place(bus, LOOP + 8)
    x = hall(x, 3.0, 0.35, damp=4500)
    return loop_fold(x, n_(LOOP))


def combat():
    """Laid over explore() in sync: the same chords, with drums, a string ostinato and horn stabs."""
    bus = []
    e = 0.4
    for k, c in enumerate(PROG):
        for half in range(2):
            t0 = (2 * k + half) * BAR
            cc = A_ if (k == 5 and half == 1) else (C_ if k == 5 else c)
            r = cc[0] - 12 if cc[0] - 12 >= 33 else cc[0]
            notes = [(t0 + j * e, 0.2, r + (12 if j in (2, 6) else 0), 0.8 if j % 2 == 0 else 0.6) for j in range(8)]
            bus.append((strings(notes, voices=4, attack=0.01, release=0.12, cutoff=1800), 0, 0.8))
            pat = [(0, 1.0, 1), (2, 0.5, 0.7), (3, 0.4, 0.6), (4, 0.9, 1), (5, 0.5, 0.7), (7, 0.6, 0.8)]
            bus.append((drums([(t0 + j * e, g, h) for j, g, h in pat], LOOP + 8, 55, 0.32), 0, 1.0))
            if (2 * k + half) % 4 == 3:
                bus.append((drums([(t0 + 6 * e, 0.6, 1), (t0 + 6.5 * e, 0.7, 1), (t0 + 7 * e, 0.8, 1), (t0 + 7.5 * e, 0.9, 1)], LOOP + 8, 95, 0.15), 0, 0.7))
            if half == 0:
                bus.append((brass(chord(cc, t0, 0.7, 0.8) + [(t0 + 7.5 * e, 0.2, cc[0], 0.5)], voices=3, bright=5, attack=0.03), 0, 0.5))
                bus.append((cymbal(1.6, swell=True), t0 + 2 * BAR - 1.6, 0.35))
    x = place(bus, LOOP + 8)
    x = hall(x, 2.2, 0.25)
    return loop_fold(x, n_(LOOP))


BOSS_BAR = 3.0  # 80 bpm
BOSS_LOOP = 12 * BOSS_BAR


def boss():
    bus = []
    e = BOSS_BAR / 8
    s = e / 2
    prog = [DM, EB, DM, [46, 49, 53, 58], A_, EB]  # Dm, Eb, Dm, Bbm, A, Eb (back to Dm)
    for k, c in enumerate(prog):
        t0 = 2 * k * BOSS_BAR
        d = 2 * BOSS_BAR
        bus.append((organ(chord(c, t0, d, 0.5) + [(t0, d, c[0] - 12, 0.8)], 'full', attack=0.05, release=1.0), 0, 0.6))
        arp = [c[0] + 12, c[2] + 12, c[3] + 12, c[1] + 12 + 12, c[3] + 12, c[2] + 12, c[0] + 12, c[2]]
        bus.append((organ([(t0 + j * e, e * 0.9, arp[j % 8] - 12, 0.5) for j in range(16)], 'soft', attack=0.01, release=0.1), 0, 0.6))
        bus.append((choir(chord(c, t0, d * 0.9, 0.7), 'a', 'bass', voices=4, attack=0.15, release=1.0), 0, 0.6))
        bus.append((choir([(t0, d, c[3] + 12, 0.5), (t0, d, c[3] + 13, 0.3)], 'a', 'soprano', voices=3, attack=0.8, release=1.0), 0, 0.35))
        for b in range(2):
            tb = t0 + b * BOSS_BAR
            pat = [(0, 1.0), (3, 0.6), (4, 0.8), (6, 0.7), (7, 0.5), (10, 0.6), (11, 0.7), (12, 0.9), (14, 0.6), (15, 0.8)]
            bus.append((drums([(tb + j * s, g, 1) for j, g in pat], BOSS_LOOP + 8, 52, 0.3), 0, 1.0))
            bus.append((timpani(c[0] - 12, 2.0, 0.8), tb, 0.6))
        mot = []
        tm = t0
        for m, b in [(D2, 2), (EB2, 2), (D2, 4), (A1, 8)]:
            mot.append((tm, b * e * 0.9, m + (c[0] - 50 if k in (3, 4) else 0), 1.0))
            tm += b * e
        bus.append((brass(mot, voices=4, bright=3, register=0.6), 0, 0.7))
    x = place(bus, BOSS_LOOP + 8)
    x = hall(x, 3.5, 0.32, damp=4000)
    return loop_fold(x, n_(BOSS_LOOP))


def victory():
    D = 11.0
    bus = []
    bus.append((place([(timpani(38, 1.0, 0.4, 0.5), j * 0.06, 0.2 + 0.8 * j / 25) for j in range(26)], D), 0, 0.7))
    bus.append((boom(4, 45, 1.0), 1.6, 0.7))
    fan = [(1.6, 0.35, 62), (1.95, 0.35, 66), (2.3, 0.35, 69), (2.65, 3.5, 74)]
    bus.append((brass([(t, d, m, 1.0) for t, d, m in fan] + [(t, d, m - 12, 0.6) for t, d, m in fan], voices=3, bright=6), 0, 0.7))
    bus.append((choir(chord([50, 54, 57, 62], 2.65, 5.0, 0.8), 'a', 'tenor', attack=0.3, release=3.0), 0, 0.8))
    bus.append((choir(chord([62, 66, 69, 74], 2.65, 5.0, 0.6), 'a', 'soprano', voices=4, attack=0.6, release=3.0), 0, 0.6))
    bus.append((strings(chord([38, 50, 54, 57], 2.65, 5.5, 0.7), attack=0.3, release=3.0), 0, 0.8))
    for j, m in enumerate((74, 69, 66, 62, 74, 69, 66, 62)):
        bus.append((bell(m, 5, 2.0), 2.65 + j * 0.3, 0.25))
    x = place(bus, D)
    x = hall(x, 3.5, 0.35)[:n_(D)]
    return master(x * env(D, [(0, 1), (D - 2, 1), (D, 0)])[:, None])


def death():
    D = 8.0
    bus = []
    bus.append((boom(5, 34, 1.5), 0, 0.8))
    bus.append((choir([(0.1, 3.0, 62, 0.6), (0.1, 1.5, 65, 0.5), (1.6, 1.5, 63, 0.5), (0.1, 3.0, 57, 0.5), (3.1, 2.5, 50, 0.6), (3.1, 2.5, 53, 0.5), (3.1, 2.5, 58, 0.45)], 'o', 'tenor', attack=0.5, release=2.5), 0, 0.8))
    bus.append((strings([(0, 5.5, 26, 0.6), (0, 5.5, 38, 0.5)], attack=0.2, release=2.5, cutoff=700), 0, 0.9))
    bus.append((lp(mono(reverb(bell(38, 7, 3.0), 4.0, 0.7, dry=0.3, damp=2000)), 2000), 0.4, 0.8))
    x = place(bus, D)
    x = hall(x, 3.5, 0.35)[:n_(D)]
    return master(x * env(D, [(0, 1), (D - 2.5, 1), (D, 0)])[:, None])


# ================================================================ ambience beds (24 s loops)

# ---------------------------------------------------------------- ambience beds: field recordings

AMB = 30.0  # s, one seamless period of a bed


def xloop2(x, L, X=1.5):
    n, m = n_(L), n_(X)
    y = x[:n].copy()
    a = np.sqrt(np.linspace(0, 1, m))[:, None]
    y[:m] = x[:m] * a + x[n:n + m] * np.sqrt(1 - a ** 2)
    return y


def take(key, a, d, X=1.0):
    """`d` s of a stereo recording from `a` s, its own start crossfaded on when it runs short."""
    x = sfx.REC(key, stereo=True)
    y = x[n_(a):n_(a + d)]
    while len(y) < n_(d):
        m = n_(X)
        nxt = x[:n_(d) - len(y) + m]
        f = np.sqrt(np.linspace(0, 1, m))[:, None]
        y = np.concatenate([y[:-m], y[-m:] * np.sqrt(1 - f ** 2) + nxt[:m] * f, nxt[m:]])
    return y


def level(x, db):
    """A bed at an RMS level (dBFS), its peaks kept under -1 dBFS."""
    x = x * 10 ** ((db - rms_db(x)) / 20)
    return norm(x, -1.0) if np.abs(x).max() > 10 ** (-1 / 20) else x


def amb_laguna():  # water burbling against the fondamenta, boats knocking at their moorings, a breeze
    d = AMB + 1.5
    water = take('venice_canal', 4, d)
    boats = take('gondolas', 60, d) * 0.45
    air = lp(take('leaves_gusts', 0, d), 700) * 0.4
    return level(xloop2(water + boats + air, AMB), -23)


def amb_orto():  # wind in the orchard's leaves, the lagoon beyond the wall; no insects
    d = AMB + 1.5
    leaves = take('breeze_tree', 2, d)
    gusts = take('leaves_gusts', 0, d) * 0.6
    lagoon = lp(take('venice_canal', 30, d), 500) * 0.25
    return level(xloop2(leaves + gusts + lagoon, AMB), -27)


def amb_chiostro():  # the cloister well's fountain, stone all round, the garden's air over the roofs
    d = AMB + 1.5
    fountain = take('fountain', 0, d)
    air = lp(take('breeze_tree', 12, d), 1500) * 0.35
    x = fountain + air
    return level(xloop2(hall(x, 1.8, 0.25)[:len(x)], AMB), -27)


def amb_chiesa():  # the empty church: its own room tone, nothing else
    d = AMB + 1.5
    a, b, m = take('cathedral', 5, 24.5), take('cathedral', 33, d - 23.5), n_(1.0)  # two quiet stretches, crossed
    f = np.sqrt(np.linspace(0, 1, m))[:, None]
    room = np.concatenate([a[:-m], a[-m:] * np.sqrt(1 - f ** 2) + b[:m] * f, b[m:]])
    return level(xloop2(room, AMB), -34)
