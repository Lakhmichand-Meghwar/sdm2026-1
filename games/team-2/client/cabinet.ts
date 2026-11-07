/** Creaking metal cabinet door, synthesized with the Web Audio API so no audio files ship with the game. */
import type { EscapeSnapshot } from "../shared/escape.ts";
import { audio } from "./footsteps.ts";

/** True when the cabinet went from locked to open within the same attempt (not on join or restart). */
export function cabinetOpened(previous: EscapeSnapshot | undefined, next: EscapeSnapshot): boolean {
  return (
    previous !== undefined && previous.attempt === next.attempt && !previous.cabinetOpen && next.cabinetOpen
  );
}

const creakSeconds = 1.2;

/** A rough curve that wanders between `low` and `high`, so the hinge sticks and slips unevenly. */
function wander(low: number, high: number, points: number) {
  const curve = new Float32Array(points);
  let value = low;
  for (let i = 0; i < points; i += 1) {
    value += (Math.random() - 0.4) * (high - low) * 0.5;
    value = Math.min(high, Math.max(low, value));
    curve[i] = value;
  }
  return curve;
}

/** Rusty hinge: a stick-slip buzz rung through metal resonances, with a thin squeal on top. */
function creak(context: AudioContext, at: number, out: AudioNode) {
  const buzz = context.createOscillator();
  buzz.type = "sawtooth";
  buzz.frequency.setValueCurveAtTime(wander(45, 150, 24), at, creakSeconds);
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.5, at + 0.08);
  level.gain.setValueAtTime(0.5, at + creakSeconds - 0.25);
  level.gain.exponentialRampToValueAtTime(0.0001, at + creakSeconds);
  buzz.connect(level);
  for (const frequency of [780, 1460, 2350]) {
    const ring = context.createBiquadFilter();
    ring.type = "bandpass";
    ring.frequency.value = frequency;
    ring.Q.value = 18;
    level.connect(ring).connect(out);
  }
  buzz.start(at);
  buzz.stop(at + creakSeconds);

  const squeal = context.createOscillator();
  squeal.type = "sine";
  squeal.frequency.setValueCurveAtTime(wander(1050, 1500, 12), at, creakSeconds);
  const vibrato = context.createOscillator();
  vibrato.frequency.value = 7;
  const vibratoDepth = context.createGain();
  vibratoDepth.gain.value = 25;
  vibrato.connect(vibratoDepth).connect(squeal.frequency);
  const squealLevel = context.createGain();
  squealLevel.gain.setValueAtTime(0.0001, at);
  squealLevel.gain.exponentialRampToValueAtTime(0.05, at + 0.2);
  squealLevel.gain.exponentialRampToValueAtTime(0.0001, at + creakSeconds);
  squeal.connect(squealLevel).connect(out);
  squeal.start(at);
  vibrato.start(at);
  squeal.stop(at + creakSeconds);
  vibrato.stop(at + creakSeconds);
}

/** The door swinging against its frame: a short metallic clank. */
function clank(context: AudioContext, at: number, out: AudioNode) {
  for (const [frequency, peak] of [
    [620, 0.4],
    [1630, 0.2],
  ] as const) {
    const tone = context.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + 0.36);
  }
}

/** A metal cabinet door creaking open on rusty hinges and knocking to a stop, `delay` seconds from now. */
export function playCabinet(delay = 0) {
  const context = audio();
  if (!context) return;
  const out = context.createGain();
  out.gain.value = 0.5;
  out.connect(context.destination);
  const now = context.currentTime + delay;
  creak(context, now, out);
  clank(context, now + creakSeconds - 0.05, out);
}
