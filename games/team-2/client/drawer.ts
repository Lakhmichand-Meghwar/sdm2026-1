/** Wooden drawer sound, synthesized with the Web Audio API so no audio files ship with the game. */
import { audio, noiseBuffer } from "./footsteps.ts";

const slideSeconds = 0.32;

/** Wood rubbing on wood: band-passed noise that judders as the drawer slides out. */
function slide(context: AudioContext, at: number, out: AudioNode) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, slideSeconds);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2.5;
  filter.frequency.setValueAtTime(650, at);
  filter.frequency.linearRampToValueAtTime(1100, at + slideSeconds);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.04);
  gain.gain.setValueAtTime(0.5, at + slideSeconds - 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + slideSeconds);
  // A fast wobble on the level makes the scrape stick and slip like dry runners.
  const judder = context.createOscillator();
  judder.frequency.value = 38;
  const depth = context.createGain();
  depth.gain.value = 0.25;
  judder.connect(depth).connect(gain.gain);
  noise.connect(filter).connect(gain).connect(out);
  noise.start(at);
  judder.start(at);
  noise.stop(at + slideSeconds);
  judder.stop(at + slideSeconds);
}

/** The drawer hitting its stop: a hollow knock made of two short wooden partials and a click. */
function knock(context: AudioContext, at: number, out: AudioNode) {
  for (const [frequency, level] of [
    [190, 0.7],
    [470, 0.35],
  ] as const) {
    const tone = context.createOscillator();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(frequency, at);
    tone.frequency.exponentialRampToValueAtTime(frequency * 0.85, at + 0.12);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + 0.15);
  }
  const click = context.createBufferSource();
  click.buffer = noiseBuffer(context, 0.03);
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2500;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.4, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
  click.connect(filter).connect(gain).connect(out);
  click.start(at);
}

/** A wooden drawer sliding open and knocking against its stop. */
export function playDrawer() {
  const context = audio();
  if (!context) return;
  const out = context.createGain();
  out.gain.value = 0.6;
  out.connect(context.destination);
  const now = context.currentTime;
  slide(context, now, out);
  knock(context, now + slideSeconds - 0.02, out);
}
