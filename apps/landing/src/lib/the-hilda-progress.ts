// Estado del truco: qué pasos están desbloqueados y si ya se llegó a la revelación/final.
// Vive en localStorage. Sin backend, sin base de datos.

import { THE_HILDA_STEPS, type PlayStep } from '../data/the-hilda'

const STORAGE_KEY = 'the-hilda:progress'

export interface StoredProgress {
  unlockedStepIds: string[]
  revealed: boolean
  finalUnlocked: boolean
}

export interface UnlockResult {
  progress: StoredProgress
  newlyUnlockedStepIds: string[]
  revealedNow: boolean
}

function emptyProgress(): StoredProgress {
  return { unlockedStepIds: [], revealed: false, finalUnlocked: false }
}

export function loadProgress(): StoredProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyProgress()
    const parsed = JSON.parse(raw)
    return {
      unlockedStepIds: Array.isArray(parsed.unlockedStepIds) ? parsed.unlockedStepIds : [],
      revealed: Boolean(parsed.revealed),
      finalUnlocked: Boolean(parsed.finalUnlocked),
    }
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(progress: StoredProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // localStorage puede fallar en modo privado; el truco sigue funcionando sin persistencia.
  }
}

function stepShouldUnlock(step: PlayStep, params: URLSearchParams, now: Date): boolean {
  const rule = step.unlockRule
  if (rule.type === 'initial') return true
  if (rule.type === 'query') return params.get(rule.parameter) === rule.value
  if (rule.type === 'datetime') return now >= new Date(rule.unlockAt)
  return false
}

/** Combina el progreso guardado con los parámetros de la URL actual y persiste el resultado. */
export function evaluateUnlocks(params: URLSearchParams, now: Date = new Date()): UnlockResult {
  const stored = loadProgress()
  const unlockedSet = new Set(stored.unlockedStepIds)
  const newlyUnlockedStepIds: string[] = []

  for (const step of THE_HILDA_STEPS) {
    if (unlockedSet.has(step.id)) continue
    if (stepShouldUnlock(step, params, now)) {
      unlockedSet.add(step.id)
      newlyUnlockedStepIds.push(step.id)
    }
  }

  const revealedNow = !stored.revealed && params.get('revelacion') === 'true'
  const progress: StoredProgress = {
    unlockedStepIds: Array.from(unlockedSet),
    revealed: stored.revealed || revealedNow,
    finalUnlocked: stored.finalUnlocked,
  }

  saveProgress(progress)

  return { progress, newlyUnlockedStepIds, revealedNow }
}

export function isStepUnlocked(step: PlayStep, progress: StoredProgress): boolean {
  return progress.unlockedStepIds.includes(step.id)
}

export function unlockFinal(): StoredProgress {
  const progress = { ...loadProgress(), finalUnlocked: true }
  saveProgress(progress)
  return progress
}
