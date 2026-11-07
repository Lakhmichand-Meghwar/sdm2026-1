/** Squishy footstep sounds, synthesized with the Web Audio API so no audio files ship with the game. */
import type { EscapeSnapshot } from "../shared/escape.ts";

type Patients = EscapeSnapshot["patients"];

/**
 * Ids of the patients who walked to a new station between two snapshots.
 * A patient who just joined, or who was sent back to spawn by a restart, did not walk.
 */
export function walkers(previous: Patients | undefined, next: Patients): string[] {
  if (!previous) return [];
  return next
    .filter((patient) => {
      const before = previous.find((entry) => entry.id === patient.id);
      return before !== undefined && patient.station !== null && patient.station !== before.station;
    })
    .map((patient) => patient.id);
}

let context: AudioContext | undefined;

/** Browsers only allow audio after a user gesture, so create or resume the context on one. */
export function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
}

/** The shared audio context, once a user gesture has created it. */
export function audio() {
  return context;
}

export function noiseBuffer(audio: AudioContext, seconds: number) {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** One wet squelch: a falling low-pass noise slap over a short pitch-dropping blob. */
function squelch(audio: AudioContext, at: number, volume: number) {
  const variation = 0.85 + Math.random() * 0.3;
  const out = audio.createGain();
  out.gain.value = volume;
  out.connect(audio.destination);

  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer(audio, 0.25);
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 8;
  filter.frequency.setValueAtTime(1400 * variation, at);
  filter.frequency.exponentialRampToValueAtTime(180, at + 0.18);
  const slap = audio.createGain();
  slap.gain.setValueAtTime(0.0001, at);
  slap.gain.exponentialRampToValueAtTime(0.9, at + 0.012);
  slap.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  noise.connect(filter).connect(slap).connect(out);
  noise.start(at);
  noise.stop(at + 0.25);

  const blob = audio.createOscillator();
  blob.type = "sine";
  blob.frequency.setValueAtTime(220 * variation, at);
  blob.frequency.exponentialRampToValueAtTime(60, at + 0.14);
  const body = audio.createGain();
  body.gain.setValueAtTime(0.0001, at);
  body.gain.exponentialRampToValueAtTime(0.6, at + 0.01);
  body.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  blob.connect(body).connect(out);
  blob.start(at);
  blob.stop(at + 0.18);
}

/** Two squishy steps. The partner's steps are quieter than the local player's. */
export function playFootsteps(local: boolean) {
  if (!context || context.state !== "running") return;
  const volume = local ? 0.5 : 0.3;
  const now = context.currentTime;
  squelch(context, now, volume);
  squelch(context, now + 0.22, volume * 0.85);
}
