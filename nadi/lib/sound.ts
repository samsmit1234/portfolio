"use client";

import type { AlertSound } from "./types";

/**
 * All sounds are synthesized with Web Audio — no audio files to ship, and
 * once the AudioContext has been resumed inside a user gesture it can play
 * freely for the rest of the page's life (autoplay unlock).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
const audioListeners = new Set<() => void>();

/** For useSyncExternalStore: notified when the AudioContext starts or stops running. */
export function subscribeAudio(listener: () => void) {
  audioListeners.add(listener);
  return () => {
    audioListeners.delete(listener);
  };
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    ctx.addEventListener("statechange", () => audioListeners.forEach((l) => l()));
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function isAudioUnlocked() {
  return ctx?.state === "running";
}

/** Must be called synchronously inside a user gesture (tap). */
export function unlockAudio() {
  const c = getCtx();
  if (!c || !master) return;
  void c.resume();
  // Short, very quiet blip: makes iOS treat audio as user-initiated.
  const osc = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.001;
  osc.frequency.value = 440;
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(c.currentTime + 0.05);
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol = 0.6) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  return osc;
}

/** Plays one pattern; returns its duration in seconds. */
function playPattern(sound: AlertSound): number {
  const c = getCtx();
  if (!c || !master) return 1;
  const t0 = c.currentTime + 0.02;
  switch (sound) {
    case "beep":
      for (let i = 0; i < 4; i++) tone(c, 1760, t0 + i * 0.22, 0.14, "square", 0.35);
      return 1.4;
    case "siren": {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(700, t0);
      osc.frequency.linearRampToValueAtTime(1500, t0 + 0.6);
      osc.frequency.linearRampToValueAtTime(700, t0 + 1.2);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.05);
      g.gain.setValueAtTime(0.3, t0 + 1.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 1.25);
      return 1.4;
    }
    case "chime":
    default:
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(c, f, t0 + i * 0.16, 0.7, "triangle", 0.55));
      return 1.6;
  }
}

/** Play the pattern once (settings preview). */
export function previewSound(sound: AlertSound) {
  unlockAudio();
  playPattern(sound);
}

export function startAlarm(sound: AlertSound) {
  stopAlarm();
  const c = getCtx();
  if (c && c.state !== "running") void c.resume();
  const loop = () => {
    const dur = playPattern(sound);
    if ("vibrate" in navigator) navigator.vibrate([400, 150, 400, 150, 400]);
    loopTimer = setTimeout(loop, (dur + 0.6) * 1000);
  };
  loop();
}

export function stopAlarm() {
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = null;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(0);
}
