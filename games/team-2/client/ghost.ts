/** Spooky ghost ambience, synthesized with the Web Audio API so no audio files ship with the game. */
import type { EscapeSnapshot } from "../shared/escape.ts";
import { audio, noiseBuffer } from "./footsteps.ts";

/** True while the ghost blocks the ward. */
export function ghostPresent(state: EscapeSnapshot | undefined): boolean {
  return state !== undefined && state.ghostSeconds !== null;
}

type Ambience = { output: GainNode; sources: AudioScheduledSourceNode[] };

let playing: Ambience | undefined;

const fadeInSeconds = 1.2;
const fadeOutSeconds = 0.8;

/** A slow wobble that pushes `param` up and down by `depth`, `rate` times a second. */
function wobble(context: AudioContext, param: AudioParam, rate: number, depth: number) {
  const lfo = context.createOscillator();
  lfo.frequency.value = rate;
  const amount = context.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  return lfo;
}

/** Uneasy low drone: two detuned tones a few hertz apart beat against each other. */
function drone(context: AudioContext, out: AudioNode) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  const level = context.createGain();
  level.gain.value = 0.35;
  filter.connect(level).connect(out);
  const tones = [55, 58.3, 82.4].map((frequency) => {
    const tone = context.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.value = frequency;
    tone.connect(filter);
    return tone;
  });
  return [...tones, wobble(context, filter.frequency, 0.15, 120)];
}

/** Ghostly wail: a thin tone that slides up and down slowly, with a shaky vibrato. */
function wail(context: AudioContext, out: AudioNode) {
  const voice = context.createOscillator();
  voice.type = "sine";
  voice.frequency.value = 640;
  const level = context.createGain();
  level.gain.value = 0.06;
  voice.connect(level).connect(out);
  return [
    voice,
    wobble(context, voice.frequency, 0.23, 180),
    wobble(context, voice.frequency, 6.5, 9),
    wobble(context, level.gain, 0.4, 0.05),
  ];
}

/** Breathy whispers: looping noise in the voice range that swells and fades like breathing. */
function whispers(context: AudioContext, out: AudioNode) {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context, 2);
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 4;
  filter.frequency.value = 1800;
  const level = context.createGain();
  level.gain.value = 0.12;
  noise.connect(filter).connect(level).connect(out);
  return [noise, wobble(context, filter.frequency, 0.31, 700), wobble(context, level.gain, 0.55, 0.11)];
}

function start(context: AudioContext): Ambience {
  const output = context.createGain();
  const now = context.currentTime;
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.6, now + fadeInSeconds);
  output.connect(context.destination);
  const sources = [...drone(context, output), ...wail(context, output), ...whispers(context, output)];
  for (const source of sources) source.start(now);
  return { output, sources };
}

function stop(context: AudioContext, ambience: Ambience) {
  const now = context.currentTime;
  ambience.output.gain.cancelScheduledValues(now);
  ambience.output.gain.setValueAtTime(Math.max(ambience.output.gain.value, 0.0001), now);
  ambience.output.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutSeconds);
  for (const source of ambience.sources) source.stop(now + fadeOutSeconds);
}

/** Keeps the ghost ambience playing exactly while `present` is true: starts it once, fades it out once. */
export function setGhostPresence(present: boolean) {
  const context = audio();
  if (!context) return;
  if (present && !playing) playing = start(context);
  else if (!present && playing) {
    stop(context, playing);
    playing = undefined;
  }
}
