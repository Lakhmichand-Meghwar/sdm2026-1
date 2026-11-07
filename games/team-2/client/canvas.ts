/** Canvas slash sound, synthesized with the Web Audio API so no audio files ship with the game. */
import type { EscapeSnapshot } from "../shared/escape.ts";
import { audio, noiseBuffer } from "./footsteps.ts";

/** True when the painting went from intact to cut within the same attempt (not on join or restart). */
export function canvasSlashed(previous: EscapeSnapshot | undefined, next: EscapeSnapshot): boolean {
  return (
    previous !== undefined && previous.attempt === next.attempt && !previous.paintingCut && next.paintingCut
  );
}

const swishSeconds = 0.12;
const ripSeconds = 0.5;

/** The blade cutting the air: noise swept quickly upwards through a band-pass. */
function swish(context: AudioContext, at: number, out: AudioNode) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, swishSeconds);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(600, at);
  filter.frequency.exponentialRampToValueAtTime(4500, at + swishSeconds);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + swishSeconds * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + swishSeconds);
  noise.connect(filter).connect(gain).connect(out);
  noise.start(at);
  noise.stop(at + swishSeconds);
}

/** Threads snapping one after another: a crackle of short random bursts that thins out as the tear ends. */
function crackle(points: number) {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i += 1) {
    const fade = 1 - i / points;
    curve[i] = Math.random() < 0.55 * fade + 0.15 ? (0.4 + Math.random() * 0.6) * fade : 0;
  }
  return curve;
}

/** Fabric tearing: band-limited noise chopped into a dry, rough rip that drops slightly in pitch. */
function rip(context: AudioContext, at: number, out: AudioNode) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, ripSeconds);
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 900;
  const body = context.createBiquadFilter();
  body.type = "bandpass";
  body.Q.value = 0.9;
  body.frequency.setValueAtTime(2600, at);
  body.frequency.exponentialRampToValueAtTime(1500, at + ripSeconds);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.setValueCurveAtTime(crackle(180), at, ripSeconds);
  noise.connect(highpass).connect(body).connect(gain).connect(out);
  noise.start(at);
  noise.stop(at + ripSeconds);
}

/** A knife slashing through the painting: a swish of the blade, then the canvas ripping open. */
export function playCanvasSlash() {
  const context = audio();
  if (!context) return;
  const out = context.createGain();
  out.gain.value = 0.7;
  out.connect(context.destination);
  const now = context.currentTime;
  swish(context, now, out);
  rip(context, now + swishSeconds * 0.8, out);
}
