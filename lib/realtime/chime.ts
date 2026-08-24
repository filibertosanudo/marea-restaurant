"use client";

// A synthesized two-note chime (Web Audio oscillator) — no audio asset to
// ship or license, and it's easy to keep short and non-jarring for a
// kitchen that hears it many times a shift.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call from inside a real click handler — browsers block audio until a user gesture resumes the context once. */
export function primeAudio(): void {
  const audioCtx = getContext();
  if (audioCtx?.state === "suspended") {
    void audioCtx.resume();
  }
}

function tone(audioCtx: AudioContext, frequency: number, startAt: number, durationSec: number) {
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.2, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec);
}

export function playChime(): void {
  const audioCtx = getContext();
  if (!audioCtx || audioCtx.state !== "running") return;
  const now = audioCtx.currentTime;
  tone(audioCtx, 880, now, 0.18);
  tone(audioCtx, 1174.66, now + 0.16, 0.22);
}
