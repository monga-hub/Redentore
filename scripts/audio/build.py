#!/usr/bin/env python3
"""Builds every sound file of the game into public/audio/ and its index, src/audio/manifest.ts.

    python3 -m venv .venv && .venv/bin/pip install numpy scipy soundfile
    .venv/bin/python scripts/audio/build.py            # everything
    .venv/bin/python scripts/audio/build.py sfx        # only the effect banks (or: music, amb)

Music, ambiences, voices and most effects are synthesised here (dsp.py, sfx.py, music.py);
footsteps, impacts, doors, creaks and UI clicks are layered from Kenney's CC0 packs, downloaded
once into node_modules/.cache/kenney. Effects are packed per bank into one mono MP3 "sprite"
each (a calibration click at MARK s lets the game find the decoder's offset); loops carry a
copy of their own head and tail around them so they stay seamless whatever the decoder trims."""
import io
import json
import os
import pathlib
import sys
import urllib.request
import zipfile

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
import dsp  # noqa: E402
from dsp import SR, n_, norm, resample  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'audio'
MANIFEST = ROOT / 'src' / 'audio' / 'manifest.ts'
CACHE = pathlib.Path(os.environ.get('KENNEY_CACHE', ROOT / 'node_modules' / '.cache' / 'kenney'))
KENNEY_PACKS = {  # CC0, https://kenney.nl
    'impact-sounds': 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    'rpg-audio': 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
    'interface-sounds': 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
}

MARK = 0.1  # s: calibration click at the head of each bank
GAP = 0.08  # s of silence between sounds in a bank
WRAP = 0.05  # s of a loop's own tail/head kept around it
PAD = 0.5  # s, the same for music and ambience loops (whole files)


def kenney_index():
    CACHE.mkdir(parents=True, exist_ok=True)
    files = {}
    for pack, url in KENNEY_PACKS.items():
        z = CACHE / f'{pack}.zip'
        if not z.exists():
            print('downloading', url)
            urllib.request.urlretrieve(url, z)
        with zipfile.ZipFile(z) as zf:
            for name in zf.namelist():
                if name.endswith('.ogg'):
                    files[pathlib.Path(name).stem] = (z, name)
    cache = {}

    def load(stem):
        if stem not in cache:
            z, name = files[stem]
            with zipfile.ZipFile(z) as zf:
                x, sr = sf.read(io.BytesIO(zf.read(name)), dtype='float64')
            if x.ndim == 2:
                x = x.mean(1)
            if sr != SR:
                x = resample(x, sr / SR)
            cache[stem] = x
        return cache[stem].copy()
    return load


def mp3(path, x, quality):
    """VBR MP3; `quality` 0 (best) .. 1 (smallest)."""
    sf.write(path, np.clip(x, -1, 1).astype(np.float32), SR, format='MP3', bitrate_mode='VARIABLE', compression_level=quality)
    return os.path.getsize(path)


def build_sfx():
    import sfx
    sfx.KENNEY = kenney_index()
    banks = {}
    for name, (bank, variants, loop, make) in sfx.SOUNDS.items():
        banks.setdefault(bank, []).append((name, variants, loop, make))
    sounds = {}
    sizes = {}
    for bank, entries in banks.items():
        buf = [np.zeros(n_(0.3))]
        buf[0][n_(MARK):n_(MARK) + n_(0.002)] = 0.9 * np.sin(2 * np.pi * 1000 * np.arange(n_(0.002)) / SR)
        cursor = len(buf[0])
        for name, variants, loop, make in entries:
            spans = []
            for i in range(variants):
                x = make(i)
                if x.ndim == 2:
                    x = x.mean(1)
                assert np.all(np.isfinite(x)), name
                x = norm(x, -1.0)
                if loop:
                    assert abs(len(x) - n_(loop)) <= 1, (name, len(x), n_(loop))
                    w = n_(WRAP)
                    x = np.concatenate([x[-w:], x, x[:w]])
                    spans.append([round((cursor + w) / SR, 5), round(n_(loop) / SR, 5)])
                else:
                    x = dsp.fade(dsp.trim(x, -55), 0.001, 0.005)
                    spans.append([round(cursor / SR, 5), round(len(x) / SR, 5)])
                buf.append(x)
                buf.append(np.zeros(n_(GAP)))
                cursor += len(x) + n_(GAP)
            sounds[name] = {'bank': bank, 'v': spans, **({'loop': True} if loop else {})}
            print(f'  {bank:5} {name:18} x{variants} {spans[0][1]:.2f}s')
        data = np.concatenate(buf)
        sizes[bank] = mp3(OUT / f'sfx-{bank}.mp3', data, 0.55)
        print(f'sfx-{bank}.mp3: {len(data) / SR:.1f} s, {sizes[bank] / 1024:.0f} KB')
    return sounds, {b: f'sfx-{b}.mp3' for b in banks}


def build_tracks(which):
    import music
    tracks = {}
    spec = {
        'music': [('intro', music.intro, False), ('explore', music.explore, True), ('combat', music.combat, True),
                  ('boss', music.boss, True), ('victory', music.victory, False), ('death', music.death, False)],
        'amb': [('laguna', music.amb_laguna, True), ('orto', music.amb_orto, True), ('chiostro', music.amb_chiostro, True),
                ('chiesa', music.amb_chiesa, True)],
    }
    for kind in which:
        for name, make, loop in spec[kind]:
            x = make()
            assert np.all(np.isfinite(x)), name
            if kind == 'amb':
                x = norm(x, -3.0)
            file = f'{"mus" if kind == "music" else "amb"}-{name}.mp3'
            entry = {'file': file}
            if loop:
                p = n_(PAD)
                L = len(x)
                x = np.concatenate([x[-p:], x, x[:p]])
                entry['loop'] = [PAD, round(L / SR, 5)]
            else:
                entry['dur'] = round(len(x) / SR, 3)
            size = mp3(OUT / file, x, 0.6 if kind == 'music' else 0.7)
            print(f'{file}: {len(x) / SR:.1f} s, {size / 1024:.0f} KB')
            tracks[name] = entry
    return tracks


def write_manifest(sounds, banks, tracks):
    old = {}
    if MANIFEST.exists():  # partial builds keep the other parts
        txt = MANIFEST.read_text()
        for key in ('BANKS', 'SOUNDS', 'MUSIC', 'AMBIENCE'):
            s = txt.index(f'export const {key}')
            s = txt.index('= ', s) + 2
            e = txt.index(' as const;', s)
            old[key] = json.loads(txt[s:e])
    music = {k: v for k, v in tracks.items() if v['file'].startswith('mus-')} or old.get('MUSIC', {})
    amb = {k: v for k, v in tracks.items() if v['file'].startswith('amb-')} or old.get('AMBIENCE', {})
    sounds = sounds or old.get('SOUNDS', {})
    banks = banks or old.get('BANKS', {})
    j = lambda o: json.dumps(o, separators=(',', ':'))
    MANIFEST.write_text(
        '// Generated by scripts/audio/build.py: where every sound sits in public/audio. Do not edit by hand.\n'
        f'export const MARK = {MARK}; // s: the calibration click at the head of every bank\n'
        f'export const BANKS = {j(banks)} as const;\n'
        '/** Sound -> bank and its variants as [start, duration] s in the bank (loops: the seamless period). */\n'
        f'export const SOUNDS = {j(sounds)} as const;\n'
        '/** Music cues: one-shots carry their duration, loops [start, period] s in the file. */\n'
        f'export const MUSIC = {j(music)} as const;\n'
        f'export const AMBIENCE = {j(amb)} as const;\n')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    parts = sys.argv[1:] or ['sfx', 'music', 'amb']
    sounds, banks = build_sfx() if 'sfx' in parts else ({}, {})
    tracks = build_tracks([p for p in parts if p in ('music', 'amb')])
    write_manifest(sounds, banks, tracks)
    total = sum(f.stat().st_size for f in OUT.glob('*.mp3'))
    print(f'public/audio: {total / 1024 / 1024:.2f} MB')
