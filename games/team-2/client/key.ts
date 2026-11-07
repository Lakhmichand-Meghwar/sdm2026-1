/** Rusted key turning in the cabinet lock, synthesized with the Web Audio API so no audio files ship with the game. */
import { audio, noiseBuffer } from "./footsteps.ts";

const insertSeconds = 0.16;
const turnSeconds = 0.36;
/** How long the whole unlock takes, so the cabinet door can creak open right after it. */
export const keyUnlockSeconds = insertSeconds + turnSeconds + 0.12;

/** A short burst of filtered noise: the building block for scrapes and clicks. */
function burst(
  context: AudioContext,
  out: AudioNode,
  at: number,
  seconds: number,
  type: BiquadFilterType,
  frequency: number,
  level: number,
) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, seconds);
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = type === "bandpass" ? 5 : 0.7;
  const gain = context.createGain();
  gain.gain.setValueAtTime(level, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  noise.connect(filter).connect(gain).connect(out);
  noise.start(at);
  noise.stop(at + seconds);
}

/** The key sliding into the keyhole: a thin metal scrape with the lock pins ticking past. */
function insert(context: AudioContext, at: number, out: AudioNode) {
  burst(context, out, at, insertSeconds, "bandpass", 4200, 0.25);
  for (const offset of [0.04, 0.08, 0.12]) burst(context, out, at + offset, 0.02, "highpass", 5000, 0.35);
}

/** The rusty mechanism resisting the turn: an uneven grinding buzz rung through small metal parts. */
function turn(context: AudioContext, at: number, out: AudioNode) {
  const grind = context.createOscillator();
  grind.type = "sawtooth";
  grind.frequency.setValueAtTime(70, at);
  grind.frequency.linearRampToValueAtTime(110, at + turnSeconds * 0.4);
  grind.frequency.linearRampToValueAtTime(55, at + turnSeconds * 0.7);
  grind.frequency.linearRampToValueAtTime(95, at + turnSeconds);
  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(0.45, at + 0.04);
  level.gain.setValueAtTime(0.45, at + turnSeconds - 0.05);
  level.gain.exponentialRampToValueAtTime(0.0001, at + turnSeconds);
  grind.connect(level);
  for (const frequency of [1250, 2600]) {
    const ring = context.createBiquadFilter();
    ring.type = "bandpass";
    ring.frequency.value = frequency;
    ring.Q.value = 14;
    level.connect(ring).connect(out);
  }
  grind.start(at);
  grind.stop(at + turnSeconds);
  burst(context, out, at, turnSeconds, "bandpass", 3000, 0.08);
}

/** The bolt snapping back: a dull thud, a sharp click and a brief metallic ring. */
function clunk(context: AudioContext, at: number, out: AudioNode) {
  const thud = context.createOscillator();
  thud.type = "triangle";
  thud.frequency.setValueAtTime(150, at);
  thud.frequency.exponentialRampToValueAtTime(80, at + 0.12);
  const thudLevel = context.createGain();
  thudLevel.gain.setValueAtTime(0.0001, at);
  thudLevel.gain.exponentialRampToValueAtTime(0.7, at + 0.004);
  thudLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
  thud.connect(thudLevel).connect(out);
  thud.start(at);
  thud.stop(at + 0.16);

  burst(context, out, at, 0.03, "highpass", 3500, 0.5);

  const ring = context.createOscillator();
  ring.type = "sine";
  ring.frequency.value = 1900;
  const ringLevel = context.createGain();
  ringLevel.gain.setValueAtTime(0.0001, at);
  ringLevel.gain.exponentialRampToValueAtTime(0.12, at + 0.005);
  ringLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  ring.connect(ringLevel).connect(out);
  ring.start(at);
  ring.stop(at + 0.3);
}

/** A rusted key pushed into the lock, forced round and the bolt clunking open. */
export function playKeyUnlock() {
  const context = audio();
  if (!context) return;
  const out = context.createGain();
  out.gain.value = 0.6;
  out.connect(context.destination);
  const now = context.currentTime;
  insert(context, now, out);
  turn(context, now + insertSeconds, out);
  clunk(context, now + insertSeconds + turnSeconds, out);
}
