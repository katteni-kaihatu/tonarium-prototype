#!/usr/bin/env python3
"""Compose and render the original Antimatter Arcade loop, then import as OGG.

Requirements: Python 3, numpy, ffmpeg (libvorbis).
Run from any directory: python3 scripts/generate-ad-lab-music.py
No samples, external music, soundfonts, or runtime synthesizers are required.
All note/percussion synthesis and the arrangement are authored here. Effect
tails wrap around the exact 32-bar boundary, allowing gapless AudioBuffer loops.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import subprocess
import tempfile
import wave

import numpy as np


RATE = 44100
BPM = 144
BEAT = 60 / BPM
BARS = 32
SAMPLES = round(BARS * 4 * BEAT * RATE)
RNG = np.random.default_rng(20261025)


def frequency(note: float) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def envelope(t: np.ndarray, duration: float, attack: float, decay: float) -> np.ndarray:
    return np.minimum(t / attack, 1) * np.exp(-t / decay) * np.minimum(
        np.maximum(duration - t, 0) / 0.025, 1
    )


def voice(note: int, length: float, instrument: str) -> np.ndarray:
    duration = length * BEAT
    t = np.arange(round(duration * RATE), dtype=np.float64) / RATE
    f = frequency(note)
    if instrument == "bass":
        # Warm short acid bass: resonant attack over a stable sub fundamental.
        p = 2 * np.pi * f * t
        sample = np.sin(p) * 0.76
        for h in range(2, 9):
            sample += np.sin(p * h + 0.08 * np.sin(2 * np.pi * 5 * t)) * (
                0.24 / h * np.exp(-t / (0.024 + 0.16 / h))
            )
        sample *= envelope(t, duration, 0.004, 0.31)
    elif instrument == "lead":
        # Rounded pulse lead, restrained upper harmonics, slight pitch drift.
        p = 2 * np.pi * f * t + 0.014 * np.sin(2 * np.pi * 5.3 * t)
        sample = sum(np.sin(p * h) / h ** 1.35 for h in (1, 3, 5, 7))
        sample += 0.16 * np.sin(p * 2.002)
        sample *= envelope(t, duration, 0.008, 0.24)
    elif instrument == "arp":
        p = 2 * np.pi * f * t
        sample = np.sin(p + 1.5 * np.sin(p * 2) * np.exp(-t / 0.025))
        sample += 0.24 * np.sin(p * 2) + 0.09 * np.sin(p * 3)
        sample *= envelope(t, duration, 0.002, 0.072)
    elif instrument == "bell":
        p = 2 * np.pi * f * t
        sample = np.sin(p + 2.2 * np.sin(p * 3) * np.exp(-t / 0.11))
        sample += 0.16 * np.sin(p * 2.001)
        sample *= envelope(t, duration, 0.003, 0.26)
    else:  # Stereo chord stabs with controlled, band-limited saw harmonics.
        sample = np.zeros_like(t)
        for detune in (0.9975, 1.0025):
            p = 2 * np.pi * f * detune * t
            for h in range(1, min(10, int(RATE / (f * 2)))):
                sample += np.sin(p * h) / h ** 1.7 * 0.5
        sample *= envelope(t, duration, 0.014, 0.19)
    return sample.astype(np.float32)


def percussion(kind: str) -> np.ndarray:
    duration = {"kick": 0.38, "snare": 0.25, "hat": 0.07,
                "open": 0.22, "clap": 0.20, "tom": 0.20,
                "crash": 0.85}[kind]
    t = np.arange(round(duration * RATE)) / RATE
    noise = RNG.standard_normal(len(t))
    high = noise - np.convolve(noise, np.ones(7) / 7, mode="same")
    if kind == "kick":
        phase = 2 * np.pi * (47 * t + 5.8 * (1 - np.exp(-t / 0.025)))
        sample = np.sin(phase) * np.exp(-t / 0.10)
        sample += 0.22 * high * np.exp(-t / 0.0035)
        sample *= np.minimum(t / 0.001, 1)
    elif kind in ("snare", "clap"):
        if kind == "snare":
            sample = 0.65 * high * np.exp(-t / 0.047)
            sample += 0.38 * np.sin(2 * np.pi * 178 * t) * np.exp(-t / 0.035)
            sample += 0.13 * np.sin(2 * np.pi * 321 * t) * np.exp(-t / 0.02)
        else:
            env = sum(np.where(t >= d, np.exp(-np.maximum(t-d, 0) / 0.018), 0)
                      for d in (0, 0.009, 0.021))
            sample = high * env * 0.3
        sample *= np.minimum(t / 0.001, 1)
    elif kind == "tom":
        sample = np.sin(2 * np.pi * (110 * t + 2 * (1 - np.exp(-t/0.04))))
        sample *= np.exp(-t / 0.045)
    else:
        metallic = sum(np.sin(2*np.pi*f*t) for f in (3743, 4971, 6359, 7823)) / 4
        decay = {"hat": 0.018, "open": 0.067, "crash": 0.24}[kind]
        sample = (0.72 * high + 0.28 * metallic) * np.exp(-t / decay)
        sample *= np.minimum(t / 0.0006, 1)
    sample *= np.minimum((duration-t) / 0.006, 1)
    return sample.astype(np.float32)


def add(bus: np.ndarray, sample: np.ndarray, beat: float, gain: float, pan: float = 0):
    """Place an equal-power panned event, wrapping any tail at the loop edge."""
    start = round(beat * BEAT * RATE) % SAMPLES
    stereo = sample[:, None] * np.array(
        [math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)], dtype=np.float32
    ) * gain
    first = min(len(sample), SAMPLES - start)
    bus[start:start+first] += stereo[:first]
    if first < len(sample):
        bus[:len(sample)-first] += stereo[first:]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1]
                        / "client/public/audio/ad-lab-reactor.ogg")
    parser.add_argument("--preview-wav", type=Path)
    args = parser.parse_args()
    buses = {name: np.zeros((SAMPLES, 2), dtype=np.float32)
             for name in ("drums", "bass", "chords", "arp", "lead", "fx")}
    drum_samples = {name: percussion(name) for name in
                    ("kick", "snare", "hat", "open", "clap", "tom", "crash")}
    cache = {}

    def note(bus, pitch, at, length, gain, pan=0, instrument=None):
        instrument = instrument or bus
        key = (pitch, length, instrument)
        if key not in cache:
            cache[key] = voice(pitch, length, instrument)
        add(buses[bus], cache[key], at, gain, pan)

    def drum(kind, at, gain, pan=0):
        add(buses["drums"], drum_samples[kind], at, gain, pan)

    # Dm9, Bbmaj9, Fmaj9, Cadd9, Dm9, Gm9, Bbmaj9, A7.
    harmony = [
        (38, [62, 65, 69, 72, 76]), (34, [62, 65, 69, 72, 74]),
        (41, [60, 64, 67, 69, 72]), (36, [60, 64, 67, 72, 74]),
        (38, [62, 65, 69, 72, 76]), (43, [62, 65, 67, 69, 74]),
        (34, [62, 65, 69, 72, 74]), (33, [61, 64, 67, 69, 73]),
    ]
    # Four-bar call and response. Positions are sixteenth-note indices.
    motifs = [
        [(0,74,2),(3,77,1),(4,81,2),(7,79,1),(8,77,2),(11,76,1),(12,74,3)],
        [(1,77,2),(4,81,2),(7,84,1),(8,81,2),(11,79,1),(12,77,2),(15,74,1)],
        [(0,76,2),(3,79,1),(4,81,2),(6,79,1),(8,76,2),(11,72,1),(12,74,2)],
        [(0,76,3),(4,79,2),(7,74,1),(8,72,2),(11,74,1),(12,76,2),(15,73,1)],
    ]
    kicks = []
    for bar in range(BARS):
        origin = bar * 4
        section = bar // 8
        local = bar % 8
        root, chord = harmony[local]
        breakdown = section == 2
        # Broken four-to-the-floor with occasional double kicks and pickups.
        kick_steps = [0, 6, 8, 14] if breakdown else [0, 4, 8, 10, 14]
        if local % 2 == 1:
            kick_steps = [0, 4, 7, 10, 12] if not breakdown else [0, 7, 10]
        if local == 7:
            kick_steps += [15]
        for step in kick_steps:
            at = origin + step/4
            drum("kick", at, 0.81)
            kicks.append(at)
        for step in (4, 12):
            drum("snare", origin+step/4, 0.44 if breakdown else 0.57)
            drum("clap", origin+step/4+0.012, 0.19, 0.12)
        if bar % 2 == 1:
            drum("snare", origin+2.75, 0.12, -0.22)
        for step in range(16):
            if breakdown and step % 2:
                continue
            # Accents and a few open hats make a moving, mechanical groove.
            is_open = step in (2, 10) and not breakdown
            drum("open" if is_open else "hat", origin+step/4+0.007*(step%2),
                 (0.13 if is_open else (0.105 if step%2 == 0 else 0.055)),
                 0.30 if step%2 == 0 else -0.35)
        if bar in (0, 8, 24):
            drum("crash", origin, 0.17, -0.4)
        if local in (3, 7):
            for index, step in enumerate((13, 14, 14.5, 15, 15.5)):
                drum("snare" if index < 3 else "tom", origin+step/4,
                     0.12+index*0.04, -0.28+index*0.14)

        bassline = [(0,0,0.60),(3,0,0.45),(6,12,0.55),(8,0,0.65),
                    (10,0,0.40),(12,7,0.45),(14,12,0.42)]
        if breakdown:
            bassline = [(0,0,1.10),(6,12,0.60),(10,0,0.65),(14,7,0.40)]
        for step, interval, length in bassline:
            note("bass", root+interval, origin+step/4, length, 0.41)

        for step, strength in ((2,0.060),(7,0.046),(10,0.056),(14,0.037)):
            if breakdown and step in (7,14):
                continue
            for idx, pitch in enumerate(chord[:4]):
                note("chords", pitch, origin+step/4, 0.65 if step != 10 else 0.90,
                     strength, (idx-1.5)*0.30, "chord")

        arp_pattern = [0,2,1,3,2,4,3,1,0,3,2,4,1,3,4,2]
        for step in range(16):
            if breakdown and step % 2 == 0:
                continue
            pitch = chord[arp_pattern[(step + local*2) % 16]] + 12
            note("arp", pitch, origin+step/4, 0.42,
                 0.050 if step%4 == 0 else 0.037,
                 -0.62 if step%2 == 0 else 0.62)

        if breakdown:
            # A new, spacious bell response keeps the middle eight musical.
            for step, index in ((0,0),(3,2),(6,4),(10,3),(13,1)):
                note("lead", chord[index]+12, origin+step/4, 1.1, 0.083,
                     -0.15 if step%2 else 0.15, "bell")
        else:
            for step, pitch, length in motifs[bar % 4]:
                if local == 7 and pitch in (74,77):
                    pitch -= 1 if pitch == 74 else 0
                if section == 1 and step in (7,11,15):
                    pitch += 12
                # Final chorus is voiced one octave down in the responses.
                note("lead", pitch, origin+step/4, length/4*0.91,
                     0.112 if section != 3 else 0.124, -0.08)
                if section == 3 and step in (0,4,8):
                    note("lead", pitch-12, origin+step/4, length/4*0.82,
                         0.035, 0.2)

        if local == 7:
            # Short rising digital fill lands on the following section/downbeat.
            scale = [74,76,77,79,81,84,85,88]
            for index, pitch in enumerate(scale):
                note("fx", pitch, origin+3+index/8, 0.28, 0.032+index*0.003,
                     -0.7+index*0.2, "arp")

    # Musically timed stereo delays and sparse reflections. np.roll wraps all
    # tails, so the final cadence already has its room sound at the loop start.
    wet = np.zeros((SAMPLES, 2), dtype=np.float32)
    for name, amount in (("lead",0.27),("arp",0.22),("chords",0.16),("fx",0.35)):
        source = buses[name]
        for beat_delay, gain in ((0.75,1.0),(1.5,0.43),(2.25,0.18)):
            wet += np.roll(source[:,::-1], round(beat_delay*BEAT*RATE), axis=0) * amount*gain
        for seconds, gain in ((0.047,0.13),(0.079,0.09),(0.113,0.07),
                              (0.173,0.05),(0.229,0.04)):
            wet += np.roll(source[:,::-1], round(seconds*RATE), axis=0) * gain

    duck = np.ones(SAMPLES, dtype=np.float32)
    length = round(0.15*RATE)
    recovery = 1 - 0.36*np.exp(-np.arange(length)/RATE/0.047)
    for beat in kicks:
        start = round(beat*BEAT*RATE) % SAMPLES
        indices = (start+np.arange(length)) % SAMPLES
        duck[indices] = np.minimum(duck[indices], recovery)
    music = sum(buses[name] for name in ("bass","chords","arp","lead","fx")) + wet
    mix = buses["drums"] + music * duck[:, None]
    mix -= mix.mean(axis=0)
    # Gentle saturation glues drums/synths; normalize with true-peak headroom
    # for the subsequent lossy Vorbis encoding.
    mix = np.tanh(mix * 1.23)
    mix *= 10**(-2.7/20) / np.max(np.abs(mix))
    pcm = np.rint(np.clip(mix, -1, 1) * 32767).astype("<i2")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ad-lab-music-") as temp:
        wav_path = args.preview_wav or Path(temp)/"ad-lab-reactor.wav"
        with wave.open(str(wav_path), "wb") as file:
            file.setnchannels(2)
            file.setsampwidth(2)
            file.setframerate(RATE)
            file.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav_path),
                        "-c:a", "libvorbis", "-q:a", "3", "-map_metadata", "-1",
                        "-metadata", "title=Antimatter Arcade",
                        "-metadata", "artist=Tonarium Original Soundtrack",
                        "-metadata", "comment=Original synthesized loop; 144 BPM; D minor; 32 bars",
                        str(args.output)], check=True)
    rms = float(np.sqrt(np.mean(mix**2)))
    print(f"Antimatter Arcade | {BPM} BPM | {BARS} bars | {SAMPLES/RATE:.6f}s")
    print(f"Stereo {RATE} Hz | peak {20*math.log10(float(np.max(np.abs(mix)))):.2f} dBFS"
          f" | RMS {20*math.log10(rms):.2f} dBFS")
    print(f"{args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
