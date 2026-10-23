'use client'

import { useSyncExternalStore } from 'react'
import { DEMO_DECK_ID } from './demo-data'

/**
 * Browser-only state of the tutorial's demo deck. The demo is only listed while
 * the guided tour is running and disappears as soon as it ends. Every (re)start
 * of the tour begins with the demo deck locked again.
 */

export type DemoState = { active: boolean; unlocked: boolean; codeSent: boolean }

const INITIAL: DemoState = { active: false, unlocked: false, codeSent: false }

let state: DemoState = INITIAL
const listeners = new Set<() => void>()

function emit(next: DemoState) {
  state = next
  listeners.forEach((listener) => listener())
}

function clearDemoProgress() {
  try {
    localStorage.removeItem(`sammaa-progress-${DEMO_DECK_ID}`)
  } catch {
    // storage can be unavailable (private mode); nothing to clear then
  }
}

export function startDemo() {
  clearDemoProgress()
  emit({ active: true, unlocked: false, codeSent: false })
}

export function endDemo() {
  clearDemoProgress()
  emit(INITIAL)
}

export function patchDemo(patch: Partial<DemoState>) {
  emit({ ...state, ...patch })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL)
}
