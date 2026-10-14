"""Small offline DSP kit for the game's audio (scripts/audio/build.py): oscillators, filters,
envelopes, a formant voice, convolution reverb, and the instruments the score is played on.
Everything is synthesised from scratch with numpy/scipy; the only recorded material comes from
Kenney's CC0 packs (see build.py). Mono signals are 1-D arrays, stereo ones (n, 2)."""
import numpy as np
import scipy.signal as ss

SR = 44100
rng = np.random.default_rng(1591)  # the Redentore's first stone: same seed, same files


def n_(d):
    return max(1, int(round(d * SR)))


def t_(d):
    return np.arange(n_(d)) / SR


def white(d):
    return rng.standard_normal(n_(d))


def pink(d):
    x = np.fft.rfft(rng.standard_normal(n_(d)))
    f = np.fft.rfftfreq(n_(d), 1 / SR)
    x /= np.sqrt(np.maximum(f, 20))
    y = np.fft.irfft(x, n_(d))
    return y / (np.abs(y).max() + 1e-9)


def brown(d):
    y = np.cumsum(rng.standard_normal(n_(d)))
    y = hp(y, 20)
    return y / (np.abs(y).max() + 1e-9)


# ---------------------------------------------------------------- filters

def _sos(kind, f, order=2):
    if kind == 'band':
        lo, hi = f
        return ss.butter(order, [max(lo, 10), min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos')
    return ss.butter(order, min(max(f, 10), SR / 2 - 100), kind, fs=SR, output='sos')


def lp(x, f, order=2):
    return ss.sosfilt(_sos('low', f, order), x, axis=0)


def hp(x, f, order=2):
    return ss.sosfilt(_sos('high', f, order), x, axis=0)


def bp(x, lo, hi, order=2):
    return ss.sosfilt(_sos('band', (lo, hi), order), x, axis=0)


def _reson_ba(f, q):
    w = 2 * np.pi * min(f, SR / 2 - 200) / SR
    al = np.sin(w) / (2 * q)
    return np.array([al, 0, -al]), np.array([1 + al, -2 * np.cos(w), 1 - al])


def reson(x, f, q):
    """Band-pass resonator, 0 dB at its peak (RBJ)."""
    b, a = _reson_ba(f, q)
    return ss.lfilter(b, a, x)


def _lp_ba(f, q=0.707):
    w = 2 * np.pi * min(max(f, 20), SR / 2 - 200) / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    return np.array([(1 - c) / 2, 1 - c, (1 - c) / 2]), np.array([1 + al, -2 * c, 1 - al])


BLOCK = 128


def tv(x, coef, track):
    """Time-varying biquad: `track` gives a parameter tuple per BLOCK samples, `coef(*p)` -> (b, a)."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), BLOCK):
        b, a = coef(*track[min(i // BLOCK, len(track) - 1)])
        b, a = b / a[0], a / a[0]
        y[i:i + BLOCK], zi = ss.lfilter(b, a, x[i:i + BLOCK], zi=zi)
    return y


def blocks(f, n):
    """Sample a per-sample array (or callable of time) once per BLOCK."""
    idx = np.arange(0, n, BLOCK)
    if callable(f):
        return f(idx / SR)
    return np.asarray(f)[np.minimum(idx, len(f) - 1)]


def sweep_lp(x, f, q=0.707):
    fs = blocks(f, len(x))
    return tv(x, _lp_ba, [(v, q) for v in fs])


def sweep_bp(x, f, q):
    fs = blocks(f, len(x))
    qs = blocks(q, len(x)) if (callable(q) or np.ndim(q)) else np.full(len(fs), q)
    return tv(x, _reson_ba, list(zip(fs, qs)))


# ---------------------------------------------------------------- envelopes, oscillators

def env(d, pts, curve=1.0):
    """Piecewise-linear envelope through (t, v) points over `d` s; `curve` > 1 bends it exponential-ish."""
    t = t_(d)
    ts, vs = zip(*pts)
    e = np.interp(t, ts, vs)
    return e ** curve if curve != 1 else e


def expdec(d, tau, a=0.002):
    t = t_(d)
    return np.minimum(t / a, 1) * np.exp(-t / tau)


def phase(freq):
    return np.cumsum(freq) / SR


def osc(freq, d=None, kind='sine', ph=0.0):
    if np.ndim(freq) == 0:
        freq = np.full(n_(d), float(freq))
    p = phase(freq) + ph
    if kind == 'sine':
        return np.sin(2 * np.pi * p)
    if kind == 'saw':
        return 2 * (p % 1) - 1
    if kind == 'square':
        return np.sign(np.sin(2 * np.pi * p))
    if kind == 'tri':
        return 2 * np.abs(2 * (p % 1) - 1) - 1
    raise ValueError(kind)


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m) - 69) / 12)


def vibrato(d, f0, rate=5.5, depth=0.006, delay=0.3, drift=0.003):
    t = t_(d)
    v = depth * np.sin(2 * np.pi * rate * t + rng.uniform(0, 6.28)) * np.clip((t - delay) / 0.6, 0, 1)
    w = lp(rng.standard_normal(len(t)), 3) * 60 * drift
    return f0 * (1 + v + w)


# ---------------------------------------------------------------- mixing

def pan(x, p=0.0):
    """Mono -> stereo, equal power; p -1 (left) .. 1 (right)."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def st(x):
    return x if x.ndim == 2 else pan(x)


def mono(x):
    return x if x.ndim == 1 else x.mean(1)


def mix(*parts, d=None):
    """Sum (signal, start_s, gain) or signals; mono and stereo mixed as stereo if any is."""
    items = [(p + (1,) if len(p) == 2 else p) if isinstance(p, tuple) else (p, 0, 1) for p in parts]
    items = [(x, t, g) for x, t, g in items if x is not None]
    stereo = any(x.ndim == 2 for x, _, _ in items)
    n = n_(d) if d else max(n_(t) + len(x) for x, t, _ in items)
    out = np.zeros((n, 2) if stereo else n)
    for x, t, g in items:
        x = st(x) if stereo else x
        i = n_(t) if t > 0 else 0
        k = min(len(x), n - i)
        if k > 0:
            out[i:i + k] += x[:k] * g
    return out


def fit(x, d):
    n = n_(d)
    if len(x) >= n:
        return x[:n]
    pad = np.zeros((n - len(x),) + x.shape[1:])
    return np.concatenate([x, pad])


def fade(x, a=0.002, r=0.01):
    x = x.copy()
    na, nr = min(n_(a), len(x)), min(n_(r), len(x))
    ea = np.linspace(0, 1, na)
    er = np.linspace(1, 0, nr)
    if x.ndim == 2:
        ea, er = ea[:, None], er[:, None]
    x[:na] *= ea
    x[len(x) - nr:] *= er
    return x


def norm(x, peak=-1.0):
    m = np.abs(x).max()
    return x * (10 ** (peak / 20) / m) if m > 0 else x


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12)


def loud(x, db):
    """Scale to an RMS level (dBFS), then keep the peak under -0.5 dBFS with a soft clip."""
    x = x * 10 ** ((db - rms_db(x)) / 20)
    return softclip(x, 0.95)


def softclip(x, ceil=0.95):
    return np.tanh(x / ceil) * ceil


def trim(x, thresh=-50, pad=0.005):
    """Drop leading and trailing near-silence."""
    a = np.abs(mono(x))
    on = np.where(a > 10 ** (thresh / 20) * a.max())[0]
    if not len(on):
        return x
    return x[max(0, on[0] - n_(pad)):on[-1] + n_(pad)]


def resample(x, ratio):
    """Play `x` `ratio` times faster (pitch and speed), by polyphase resampling."""
    from fractions import Fraction
    fr = Fraction(ratio).limit_denominator(200)
    return ss.resample_poly(x, fr.denominator, fr.numerator, axis=0)


def reverse(x):
    return x[::-1].copy()


# ---------------------------------------------------------------- reverb

_irs = {}


def ir(rt60, damp=5000, pre=0.015, width=1.0, er=6):
    key = (rt60, damp, pre, width, er)
    if key in _irs:
        return _irs[key]
    d = rt60 * 1.1
    t = t_(d)
    out = []
    for ch in range(2):
        n = rng.standard_normal(len(t))
        lo = lp(n, damp) * np.exp(-6.9 * t / rt60)
        hi = hp(n, damp) * np.exp(-6.9 * t / (rt60 * 0.35))
        y = lo + hi * 0.5
        y *= np.minimum(t / 0.03, 1)  # diffuse onset
        for _ in range(er):  # early reflections
            k = n_(rng.uniform(0.008, 0.07))
            y[k] += rng.uniform(-1, 1) * 2.5
        out.append(np.concatenate([np.zeros(n_(pre)), y]))
    L, R = out
    m, s = (L + R) / 2, (L - R) / 2 * width
    r = np.stack([m + s, m - s], 1)
    r /= np.sqrt(np.sum(r ** 2) / 2)
    _irs[key] = r
    return r


def reverb(x, rt60=2.0, wet=0.3, dry=1.0, damp=5000, pre=0.015, width=1.0, tail=True):
    """Stereo out: `x` dry (centred if mono) plus its convolution with a synthetic hall."""
    h = ir(rt60, damp, pre, width)
    xm = mono(x)
    w = np.stack([ss.oaconvolve(xm, h[:, 0]), ss.oaconvolve(xm, h[:, 1])], 1)
    if not tail:
        w = w[:len(x)]
    out = np.zeros((len(w), 2))
    out[:len(x)] += st(x) * dry
    out += w * wet
    return out


def loop_fold(x, n):
    """Wrap everything past `n` samples (reverb tails) back onto the start: a seamless loop of length n."""
    y = x[:n].copy()
    k = n
    while k < len(x):
        part = x[k:k + n]
        y[:len(part)] += part
        k += n
    return y


# ---------------------------------------------------------------- voice

# Formants: frequency, bandwidth (Hz) and level (dB) of F1..F5 per vowel and register
# (after the classic Csound/IRCAM tables). 'm'/'n' are nasal murmurs.
FORMANTS = {
    'bass': {
        'a': ([600, 1040, 2250, 2450, 2750], [60, 70, 110, 120, 130], [0, -7, -9, -9, -20]),
        'e': ([400, 1620, 2400, 2800, 3100], [40, 80, 100, 120, 120], [0, -12, -9, -12, -18]),
        'i': ([250, 1750, 2600, 3050, 3340], [60, 90, 100, 120, 120], [0, -30, -16, -22, -28]),
        'o': ([400, 750, 2400, 2600, 2900], [40, 80, 100, 120, 120], [0, -11, -21, -20, -40]),
        'u': ([350, 600, 2400, 2675, 2950], [40, 80, 100, 120, 120], [0, -20, -32, -28, -36]),
        'm': ([250, 1100, 2300, 2700, 3200], [60, 200, 200, 250, 250], [0, -25, -30, -35, -40]),
        'n': ([250, 1700, 2500, 2900, 3300], [60, 200, 200, 250, 250], [0, -22, -28, -34, -40]),
    },
    'tenor': {
        'a': ([650, 1080, 2650, 2900, 3250], [80, 90, 120, 130, 140], [0, -6, -7, -8, -22]),
        'e': ([400, 1700, 2600, 3200, 3580], [70, 80, 100, 120, 120], [0, -14, -12, -14, -20]),
        'i': ([290, 1870, 2800, 3250, 3540], [40, 90, 100, 120, 120], [0, -15, -18, -20, -30]),
        'o': ([400, 800, 2600, 2800, 3000], [40, 80, 100, 120, 120], [0, -10, -12, -12, -26]),
        'u': ([350, 600, 2700, 2900, 3300], [40, 60, 100, 120, 120], [0, -20, -17, -14, -26]),
        'm': ([280, 1150, 2400, 2800, 3300], [60, 200, 200, 250, 250], [0, -25, -30, -35, -40]),
        'n': ([280, 1750, 2600, 3000, 3400], [60, 200, 200, 250, 250], [0, -22, -28, -34, -40]),
    },
    'soprano': {
        'a': ([800, 1150, 2900, 3900, 4950], [80, 90, 120, 130, 140], [0, -6, -32, -20, -50]),
        'e': ([350, 2000, 2800, 3600, 4950], [60, 100, 120, 150, 200], [0, -20, -15, -40, -56]),
        'i': ([270, 2140, 2950, 3900, 4950], [60, 90, 100, 120, 120], [0, -12, -26, -26, -44]),
        'o': ([450, 800, 2830, 3800, 4950], [70, 80, 100, 130, 135], [0, -11, -22, -22, -50]),
        'u': ([325, 700, 2700, 3800, 4950], [50, 60, 170, 180, 200], [0, -16, -35, -40, -60]),
        'm': ([300, 1200, 2700, 3600, 4500], [60, 200, 200, 250, 250], [0, -25, -30, -35, -40]),
        'n': ([300, 1800, 2700, 3600, 4500], [60, 200, 200, 250, 250], [0, -22, -28, -34, -40]),
    },
}


def glottal(f0, rasp=0.0, breath=0.03, sub=0.0):
    """Voice source at the per-sample pitch `f0`: a tilted saw with jitter, rasp (rough amplitude
    flutter), breath noise and an optional subharmonic (the undead's period-doubled growl)."""
    n = len(f0)
    jit = 1 + lp(rng.standard_normal(n), 40) * 0.6 * (0.01 + rasp * 0.05)
    p = phase(f0 * jit)
    src = 2 * (p % 1) - 1
    src = lp(src, 1800 + 0 * rasp, 1)  # spectral tilt
    if sub:
        src = src * (1 - sub) + sub * (2 * ((p / 2) % 1) - 1) * np.sign(np.sin(np.pi * p))
    if rasp:
        flutter = 1 + rasp * lp(rng.standard_normal(n), 90) * 6
        src = src * np.clip(flutter, 0, 3)
    src = src + breath * rng.standard_normal(n)
    return src


def formant(src, vowel, register='bass'):
    fs, bws, dbs = FORMANTS[register][vowel]
    return sum(reson(src, f, f / bw) * 10 ** (db / 20) for f, bw, db in zip(fs, bws, dbs))


def formant_track(src, track, register='bass'):
    """`track`: per-block list of (vowel_a, vowel_b, mix) -> five time-varying resonators."""
    out = np.zeros_like(src)
    tab = FORMANTS[register]
    for k in range(5):
        params, gains = [], []
        for va, vb, m in track:
            fa, ba, da = (tab[va][0][k], tab[va][1][k], tab[va][2][k])
            fb, bb, db = (tab[vb][0][k], tab[vb][1][k], tab[vb][2][k])
            f = fa + (fb - fa) * m
            params.append((f, f / (ba + (bb - ba) * m)))
            gains.append(10 ** ((da + (db - da) * m) / 20))
        g = np.repeat(gains, BLOCK)[:len(src)]
        out += tv(src, _reson_ba, params) * g
    return out


VOWELS = 'aeioumn'


def speak(phones, f0, register='bass', rasp=0.0, breath=0.04, sub=0.0, whisper=False):
    """A tiny formant speech synth. `phones`: list of (phone, dur_s, pitch_mult). Vowels and nasals
    are voiced through formants that glide between targets; 'r' flutters, 'h' breathes, 's' hisses,
    'k'/'t'/'p' are a closure and a burst. The pitch contour glides between the given multipliers."""
    n = sum(n_(d) for _, d, _ in phones)
    pitch = np.zeros(n)
    voiced = np.zeros(n)
    asp = np.zeros(n)
    extra = np.zeros(n)
    targets = []  # per sample-run: vowel used for formants
    i = 0
    prev_v = next((p for p, _, _ in phones if p in VOWELS), 'a')
    for k, (ph, d, pm) in enumerate(phones):
        m = n_(d)
        nxt = phones[k + 1][2] if k + 1 < len(phones) else pm
        pitch[i:i + m] = np.linspace(pm, (pm + nxt) / 2 if ph in VOWELS else pm, m)
        if ph in VOWELS:
            voiced[i:i + m] = 1 if ph not in 'mn' else 0.55
            v = ph
            prev_v = ph if ph not in 'mn' else prev_v
        elif ph == 'r':
            voiced[i:i + m] = 0.7 * (0.6 + 0.4 * np.sin(2 * np.pi * 26 * np.arange(m) / SR))
            v = prev_v
        elif ph == 'l':
            voiced[i:i + m] = 0.7
            v = 'u'
        elif ph == 'h':
            asp[i:i + m] = np.linspace(0.6, 0.3, m)
            v = next((p for p, _, _ in phones[k + 1:] if p in 'aeiou'), prev_v)
        elif ph in 'sf':
            src = hp(rng.standard_normal(m), 4000 if ph == 's' else 1500) * (0.1 if ph == 's' else 0.05)
            extra[i:i + m] += src * np.sin(np.linspace(0, np.pi, m))
            v = prev_v
        elif ph in 'ktpbdg':
            c = n_(0.035)
            burst = rng.standard_normal(max(m - c, 1)) * np.exp(-np.arange(max(m - c, 1)) / n_(0.012))
            band = {'k': (1200, 3200), 'g': (900, 2500), 't': (3000, 7000), 'd': (2500, 6000), 'p': (300, 1400), 'b': (200, 1000)}[ph]
            extra[i + c:i + m] += bp(burst, *band) * 0.4
            if ph in 'bdg':
                voiced[i:i + c] = 0.25
            v = prev_v
        else:
            v = prev_v
        targets += [v] * m
        i += m
    # Smooth voicing edges (no clicks), then build the formant glide per block.
    voiced = lp(voiced, 40)
    asp = lp(asp, 60)
    track = []
    nb = (n + BLOCK - 1) // BLOCK
    glide = n_(0.05)
    for b in range(nb):
        s = b * BLOCK
        cur = targets[min(s, n - 1)]
        ahead = targets[min(s + glide, n - 1)]
        if ahead != cur:
            j = s
            while j < n and targets[j] == cur:
                j += 1
            m = 1 - min(1, (j - s) / glide)
            track.append((cur, ahead, m * 0.5))
        else:
            track.append((cur, cur, 0.0))
    f = f0 * lp(pitch, 12)
    src = glottal(np.maximum(f, 20), rasp, breath, sub) * voiced * (0 if whisper else 1)
    src += rng.standard_normal(n) * (asp + (0.35 * voiced if whisper else 0))
    y = formant_track(src, track, register)
    y += extra
    return y


# ---------------------------------------------------------------- instruments (score)

def choir(notes, vowel='a', register='bass', voices=5, attack=0.6, release=1.2, vib=0.007, breath=0.06, d=None, seed_detune=8):
    """A section singing `notes` [(t, dur, midi, gain)] on one vowel: detuned voices with their
    own vibrato, summed before one formant filter (linear, so it is the same and much cheaper)."""
    end = d or max(t + dur + release for t, dur, _, _ in notes) + 0.1
    out = []
    for ch in range(2):
        src = np.zeros(n_(end))
        for t, dur, m, g in notes:
            L = dur + release
            e = env(L, [(0, 0), (attack, 1), (dur, 0.9), (L, 0)])
            for v in range(voices):
                cents = rng.uniform(-seed_detune, seed_detune)
                f = vibrato(L, mtof(m) * 2 ** (cents / 1200), rate=rng.uniform(4.8, 6.0), depth=vib)
                s = glottal(f, 0.0, breath) * e * g
                i = n_(t)
                k = min(len(s), len(src) - i)
                src[i:i + k] += s[:k]
        out.append(formant(src, vowel, register))
    return np.stack(out, 1) / max(voices, 1)


ORGAN_STOPS = {  # harmonic: level  (16', 8', 4', 2 2/3', 2', 1 3/5', 1')
    'full': {0.5: 0.6, 1: 1, 2: 0.7, 3: 0.35, 4: 0.45, 5: 0.15, 6: 0.2, 8: 0.25},
    'soft': {0.5: 0.35, 1: 1, 2: 0.25, 4: 0.08},
    'pedal': {0.5: 1, 1: 0.6, 2: 0.2},
}


def organ(notes, stop='full', attack=0.06, release=0.35, d=None):
    end = d or max(t + dur + release for t, dur, _, _ in notes) + 0.1
    out = np.zeros((n_(end), 2))
    for t, dur, m, g in notes:
        L = dur + release
        e = env(L, [(0, 0), (attack, 1), (dur, 1), (L, 0)])
        f0 = mtof(m)
        sig = np.zeros((n_(L), 2))
        for h, a in ORGAN_STOPS[stop].items():
            if f0 * h > 9000:
                continue
            for c, det in ((0, -0.7), (1, 0.7)):
                sig[:, c] += osc(f0 * h + det * h * 0.3, L, 'sine', rng.uniform()) * a
        ch = bp(white(L), f0 * 2, f0 * 6) * expdec(L, 0.05) * 0.15  # chiff
        sig += pan(ch)
        sig *= e[:, None] * g
        i = n_(t)
        out[i:i + len(sig)] += sig[:len(out) - i]
    return out * 0.25


def brass(notes, voices=3, bright=6.0, attack=0.12, release=0.4, d=None, register=1.0):
    """Horn section: detuned saws through a low-pass that opens with the note's swell."""
    end = d or max(t + dur + release for t, dur, _, _ in notes) + 0.1
    out = np.zeros((n_(end), 2))
    for t, dur, m, g in notes:
        L = dur + release
        e = env(L, [(0, 0), (attack, 1), (min(attack + 0.25, dur), 0.8), (dur, 0.75), (L, 0)])
        f0 = mtof(m)
        sig = np.zeros((n_(L), 2))
        for v in range(voices):
            f = vibrato(L, f0 * 2 ** (rng.uniform(-6, 6) / 1200), rate=5, depth=0.004, delay=0.5)
            s = osc(f, kind='saw', ph=rng.uniform())
            cut = f0 * (1.2 + bright * e * register)
            s = sweep_lp(s, np.minimum(cut, 9000), 0.9)
            sig += pan(s, rng.uniform(-0.5, 0.5))
        sig *= (e * g)[:, None] / voices
        i = n_(t)
        out[i:i + len(sig)] += sig[:len(out) - i]
    return out


def strings(notes, voices=6, cutoff=2600, attack=0.5, release=0.9, d=None, trem=0.0):
    end = d or max(t + dur + release for t, dur, _, _ in notes) + 0.1
    out = np.zeros((n_(end), 2))
    for t, dur, m, g in notes:
        L = dur + release
        e = env(L, [(0, 0), (min(attack, dur), 1), (dur, 0.9), (L, 0)])
        if trem:
            e = e * (0.75 + 0.25 * np.sin(2 * np.pi * trem * t_(L)) ** 2)
        f0 = mtof(m)
        sig = np.zeros((n_(L), 2))
        for v in range(voices):
            f = vibrato(L, f0 * 2 ** (rng.uniform(-10, 10) / 1200), rate=rng.uniform(4.5, 6), depth=0.004)
            sig += pan(osc(f, kind='saw', ph=rng.uniform()), rng.uniform(-0.8, 0.8))
        sig = hp(lp(sig, min(cutoff, f0 * 12), 2), 90)
        sig *= (e * g)[:, None] / voices
        i = n_(t)
        out[i:i + len(sig)] += sig[:len(out) - i]
    return out


BELL = [(0.5, 1.0, 1.0), (1.0, 0.8, 0.8), (1.19, 0.6, 0.5), (1.5, 0.45, 0.45), (2.0, 0.55, 0.38), (2.51, 0.3, 0.25),
        (2.66, 0.22, 0.22), (3.01, 0.25, 0.18), (4.17, 0.14, 0.12), (5.43, 0.08, 0.08)]  # ratio, level, decay share


def bell(m, d=6.0, tau=3.0, bright=1.0):
    f0 = mtof(m)
    y = np.zeros(n_(d))
    for r, a, k in BELL:
        if f0 * r > 12000:
            continue
        y += osc(f0 * r * (1 + rng.uniform(-0.002, 0.002)), d, 'sine', rng.uniform()) * a * (bright if r > 2 else 1) * expdec(d, tau * k + 0.05, 0.001)
    y += bp(white(d), f0 * 2, f0 * 8) * expdec(d, 0.02) * 0.3
    return y * 0.3


def chime(m, d=2.5, tau=0.8):
    """Celesta / music-box tone."""
    f0 = mtof(m)
    y = osc(f0, d) * expdec(d, tau) + osc(f0 * 4, d) * expdec(d, tau * 0.25) * 0.35 + osc(f0 * 3, d) * expdec(d, tau * 0.4) * 0.15
    return y * 0.5


def taiko(f=58, d=1.6, tau=0.35, hard=1.0):
    t = t_(d)
    pitch = f * (1 + 1.4 * np.exp(-t / 0.035))
    body = osc(pitch, kind='sine') * np.exp(-t / tau)
    skin = lp(white(d), 900) * np.exp(-t / 0.03) * 0.8 * hard
    slap = bp(white(d), 1500, 4000) * np.exp(-t / 0.008) * 0.25 * hard
    return (body + skin + slap) * 0.6


def timpani(m, d=3.0, tau=1.2, hard=1.0):
    f0 = mtof(m)
    y = sum(osc(f0 * r, d, 'sine', rng.uniform()) * a * expdec(d, tau * k) for r, a, k in
            [(1, 1, 1), (1.504, 0.5, 0.7), (1.742, 0.3, 0.6), (2.0, 0.25, 0.5), (2.245, 0.15, 0.4)])
    y += lp(white(d), 1200) * expdec(d, 0.025) * 0.6 * hard
    return y * 0.45


def boom(d=4.0, f=42, tau=1.2):
    t = t_(d)
    sub = osc(f * (1 + 1.5 * np.exp(-t / 0.08)), kind='sine') * np.exp(-t / tau)
    rumble = lp(white(d), 160, 2) * np.exp(-t / (tau * 0.7)) * 1.4
    crack = bp(white(d), 200, 2500) * np.exp(-t / 0.04) * 0.6
    return (sub + rumble + crack) * 0.7


def cymbal(d=3.0, tau=1.2, swell=False):
    t = t_(d)
    y = hp(white(d), 3500, 2) + bp(white(d), 5000, 9000) * 0.5
    e = (t / d) ** 2.5 if swell else np.exp(-t / tau) * np.minimum(t / 0.002, 1)
    return y * e * 0.25


def riser(d=3.0, lo=200, hi=3000, q=4.0):
    f = lambda tt: lo * (hi / lo) ** np.clip(tt / d, 0, 1)
    y = sweep_bp(white(d), f, q) * (t_(d) / d) ** 1.8
    return y * 0.8


def whoosh(d=0.35, lo=300, hi=1600, end=500, peak=0.45, q=1.6, gain=1.0):
    """A swung object: band-passed noise sweeping up then down, loudest at `peak` of its length."""
    t = t_(d)
    k = t / d
    f = np.where(k < peak, lo * (hi / lo) ** (k / peak), hi * (end / hi) ** ((k - peak) / (1 - peak)))
    a = np.where(k < peak, (k / peak) ** 2, ((1 - k) / (1 - peak)) ** 1.5)
    y = sweep_bp(white(d), f, q) * a
    y += lp(white(d), 250) * a * 0.4
    return y * gain


def crack(d=0.12, lo=1500, hi=6000, tau=0.012, n=1):
    """Bone or wood snapping: a few clicks through bright resonances."""
    y = np.zeros(n_(d))
    for i in range(n):
        k = n_(rng.uniform(0, d * 0.3)) if i else 0
        b = bp(white(d), lo, hi) * expdec(d, tau * rng.uniform(0.6, 1.4), 0.0005)
        y[k:] += b[:len(y) - k] * rng.uniform(0.5, 1)
        for f in rng.uniform(700, 2500, 2):
            y[k:] += reson(white(d) * expdec(d, 0.004), f, 12)[:len(y) - k] * 2
    return y


def thump(f=70, d=0.35, tau=0.08):
    t = t_(d)
    return osc(f * (1 + 0.8 * np.exp(-t / 0.02)), kind='sine') * np.exp(-t / tau) + lp(white(d), 400) * np.exp(-t / 0.015) * 0.5


def bubbles(d, rate=25, lo=300, hi=1200, size=1.0):
    """Wet bubbling: short rising sine chirps at random times."""
    y = np.zeros(n_(d))
    for s in rng.uniform(0, d, int(d * rate)):
        L = rng.uniform(0.01, 0.05) * size
        f0 = rng.uniform(lo, hi)
        tt = t_(L)
        ch = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 3 * tt / L)) / SR) * np.exp(-tt / (L * 0.4))
        i = n_(s)
        k = min(len(ch), len(y) - i)
        y[i:i + k] += ch[:k] * rng.uniform(0.3, 1)
    return y * 0.5


def crackle(d, rate=30, tone=3000):
    """Fire: a hiss bed and random pops."""
    y = lp(pink(d), 1200) * 0.15
    for s in rng.uniform(0, d, int(d * rate)):
        L = rng.uniform(0.002, 0.012)
        p = bp(white(L), tone * 0.5, tone * 2.2) * expdec(L, L / 3, 0.0003)
        i = n_(s)
        k = min(len(p), len(y) - i)
        y[i:i + k] += p[:k] * rng.uniform(0.2, 1) ** 2
    return y


def shimmer(d, notes, rate=14, tau=0.25):
    """Sparkle: a cloud of quick high sine pings drawn from `notes` (midi)."""
    y = np.zeros(n_(d))
    for s in rng.uniform(0, d, int(d * rate)):
        m = rng.choice(notes) + 12 * rng.integers(0, 2)
        L = tau * 4
        p = osc(mtof(m), L) * expdec(L, tau * rng.uniform(0.5, 1.2), 0.002)
        i = n_(s)
        k = min(len(p), len(y) - i)
        y[i:i + k] += p[:k] * rng.uniform(0.2, 0.6)
    return y * 0.4


def buzz(f, d, wing=1.0, drift=0.02):
    """Insect wings: a pulse train at `f` Hz, its pitch wobbling, through a nasal band."""
    t = t_(d)
    ff = f * (1 + drift * np.sin(2 * np.pi * 0.7 * t + rng.uniform(0, 6)) + drift * 0.5 * lp(rng.standard_normal(len(t)), 4) * 30)
    y = osc(ff, kind='saw') + 0.5 * osc(ff * 2, kind='saw')
    fb = float(np.mean(f))
    y = bp(y, fb * 1.5, fb * 12) * (1 + 0.3 * np.sin(2 * np.pi * fb / 8 * t)) * wing
    return y * 0.4
