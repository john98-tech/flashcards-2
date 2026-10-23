'use client'

import { useSyncExternalStore } from 'react'

export type SoundSettings = { muted: boolean; sfx: boolean; music: boolean; volume: number }

export const DEFAULT_SOUND: SoundSettings = { muted: false, sfx: true, music: true, volume: 0.7 }

const STORAGE_KEY = 'sammaa-sound-v1'
let settings = DEFAULT_SOUND
let loaded = false
const listeners = new Set<() => void>()

export function getSoundSettings() {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true
    try {
      settings = { ...DEFAULT_SOUND, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
    } catch {}
  }
  return settings
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateSoundSettings(patch: Partial<SoundSettings>) {
  settings = { ...getSoundSettings(), ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
  applyMix()
  refreshMusic()
  for (const l of listeners) l()
}

export function useSoundSettings() {
  return useSyncExternalStore(subscribe, getSoundSettings, () => DEFAULT_SOUND)
}

let ctx: AudioContext | null = null
let master: GainNode
let sfxBus: GainNode
let musicBus: GainNode
let noiseBuffer: AudioBuffer
let unlocked = false

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.connect(master)
    musicBus = ctx.createGain()
    musicBus.connect(master)

    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.42
    const feedback = ctx.createGain()
    feedback.gain.value = 0.38
    const wet = ctx.createGain()
    wet.gain.value = 0.35
    musicBus.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(master)

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    applyMix()
  }
  return ctx
}

function applyMix() {
  if (!ctx) return
  const s = getSoundSettings()
  const t = ctx.currentTime
  master.gain.setTargetAtTime(s.muted ? 0 : s.volume, t, 0.05)
  sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, t, 0.05)
  musicBus.gain.setTargetAtTime(s.music ? 0.55 : 0, t, 0.4)
}

export function unlockAudio() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  unlocked = true
  refreshMusic()
}

function canPlaySfx() {
  const s = getSoundSettings()
  return !!ctx && unlocked && !s.muted && s.sfx
}

type ToneOptions = {
  freq: number
  to?: number
  type?: OscillatorType
  dur?: number
  gain?: number
  attack?: number
  delay?: number
}

function tone({ freq, to, type = 'sine', dur = 0.15, gain = 0.2, attack = 0.005, delay = 0 }: ToneOptions) {
  if (!canPlaySfx() || !ctx) return
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(gain, start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(env)
  env.connect(sfxBus)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function noise(dur: number, gain: number, from: number, to: number, delay = 0) {
  if (!canPlaySfx() || !ctx) return
  const start = ctx.currentTime + delay
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(from, start)
  filter.frequency.exponentialRampToValueAtTime(to, start + dur)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(gain, start + dur * 0.3)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter)
  filter.connect(env)
  env.connect(sfxBus)
  src.start(start)
  src.stop(start + dur + 0.05)
}

const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98]

export const sfx = {
  click: () => tone({ freq: 1500, to: 900, type: 'triangle', dur: 0.06, gain: 0.07 }),
  hover: () => tone({ freq: 2400, type: 'sine', dur: 0.035, gain: 0.018 }),
  toggle: () => {
    tone({ freq: 880, type: 'sine', dur: 0.08, gain: 0.08 })
    tone({ freq: 1320, type: 'sine', dur: 0.1, gain: 0.06, delay: 0.05 })
  },
  flip: () => {
    noise(0.22, 0.16, 600, 3200)
    tone({ freq: 260, to: 480, type: 'sine', dur: 0.14, gain: 0.05 })
  },
  reveal: (index = 0) => {
    const f = SCALE[index % SCALE.length]
    tone({ freq: f, type: 'sine', dur: 0.4, gain: 0.13 })
    tone({ freq: f * 2, type: 'triangle', dur: 0.18, gain: 0.03, delay: 0.01 })
  },
  revealAll: () => {
    ;[0, 2, 4, 5, 7].forEach((n, k) => tone({ freq: SCALE[n], dur: 0.45, gain: 0.09, delay: k * 0.045 }))
  },
  correct: () => {
    tone({ freq: 659.25, dur: 0.18, gain: 0.13 })
    tone({ freq: 987.77, dur: 0.32, gain: 0.13, delay: 0.09 })
  },
  wrong: () => {
    tone({ freq: 233, to: 155, type: 'triangle', dur: 0.28, gain: 0.12 })
  },
  success: () => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.38, gain: 0.11, delay: i * 0.07 }))
  },
  fanfare: () => {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((f, i) =>
      tone({ freq: f, dur: 0.6, gain: 0.1, delay: i * 0.09 }),
    )
    noise(0.8, 0.04, 4000, 9000, 0.4)
  },
  unlock: () => {
    noise(0.4, 0.05, 2000, 8000)
    ;[783.99, 1046.5, 1318.51, 1567.98].forEach((f, i) => tone({ freq: f, dur: 0.5, gain: 0.09, delay: 0.05 + i * 0.06 }))
  },
  whoosh: () => noise(0.4, 0.07, 400, 2400),
}

const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [130.81, 196, 261.63, 329.63],
  [196, 246.94, 293.66],
]
const BAR_SECONDS = 8
let musicOn = false
let musicTimer: number | null = null
let chordIndex = 0

function pad(freq: number, start: number, dur: number, peak = 0.035) {
  if (!ctx) return
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1100
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + 2.5)
  env.gain.setValueAtTime(peak, start + dur - 2.5)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  filter.connect(env)
  env.connect(musicBus)
  for (const detune of [-7, 7]) {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc.detune.value = detune
    osc.connect(filter)
    osc.start(start)
    osc.stop(start + dur + 0.1)
  }
}

function pluck(freq: number, start: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(0.03, start + 0.02)
  env.gain.exponentialRampToValueAtTime(0.0001, start + 1.6)
  osc.connect(env)
  env.connect(musicBus)
  osc.start(start)
  osc.stop(start + 1.7)
}

function scheduleBar() {
  if (!musicOn || !ctx) return
  const start = ctx.currentTime + 0.05
  const chord = CHORDS[chordIndex++ % CHORDS.length]
  for (const f of chord) pad(f, start, BAR_SECONDS + 2.5)
  pad(chord[0] / 2, start, BAR_SECONDS + 2.5, 0.045)
  const notes = [...chord.map((f) => f * 2), chord[0] * 4]
  for (let beat = 0; beat < BAR_SECONDS; beat++) {
    if (Math.random() < 0.65) pluck(notes[Math.floor(Math.random() * notes.length)], start + beat + Math.random() * 0.4)
  }
  musicTimer = window.setTimeout(scheduleBar, BAR_SECONDS * 1000)
}

export function refreshMusic() {
  if (typeof document === 'undefined') return
  const s = getSoundSettings()
  const want = unlocked && s.music && !s.muted && document.visibilityState === 'visible'
  if (want && !musicOn) {
    musicOn = true
    scheduleBar()
  } else if (!want && musicOn) {
    musicOn = false
    if (musicTimer) window.clearTimeout(musicTimer)
    musicTimer = null
  }
}
