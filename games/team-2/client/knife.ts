/** Metallic knife pickup sound, synthesized with the Web Audio API so no audio files ship with the game. */
import type { EscapeSnapshot } from "../shared/escape.ts";
import { audio, noiseBuffer } from "./footsteps.ts";

/** True when the knife entered the shared inventory within the same attempt (not on join or restart). */
export function knifeTaken(previous: EscapeSnapshot | undefined, next: EscapeSnapshot): boolean {
  return (
    previous !== undefined &&
    previous.attempt === next.attempt &&
    !previous.inventory.includes("knife") &&
    next.inventory.includes("knife")
  );
}

/** Steel sliding over steel: a bright noise scrape that rises in pitch, like a blade drawn out. */
function scrape(context: AudioContext, at: number, out: AudioNode) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, 0.22);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(2500, at);
  filter.frequency.exponentialRampToValueAtTime(7000, at + 0.2);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  noise.connect(filter).connect(gain).connect(out);
  noise.start(at);
  noise.stop(at + 0.22);
}

/** The blade ringing as it leaves the drawer: inharmonic partials that fade at different speeds. */
function ring(context: AudioContext, at: number, out: AudioNode) {
  for (const [frequency, level, seconds] of [
    [2093, 0.22, 0.9],
    [3271, 0.14, 0.7],
    [4870, 0.09, 0.5],
    [6620, 0.05, 0.35],
  ] as const) {
    const tone = context.createOscillator();
    tone.type = "sine";
    tone.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + seconds);
  }
}

/** A knife scraped out of the drawer, ringing like steel. */
export function playKnife() {
  const context = audio();
  if (!context) return;
  const out = context.createGain();
  out.gain.value = 0.5;
  out.connect(context.destination);
  const now = context.currentTime;
  scrape(context, now, out);
  ring(context, now + 0.15, out);
}
