// Estado del truco: qué pasos están desbloqueados y si ya se llegó a la revelación/final.
// Vive en localStorage. Sin backend, sin base de datos.

import type { PlayStep } from '../data/the-hilda'

const STORAGE_KEY = 'the-hilda:progress'

export interface StoredProgress {
  unlockedStepIds: string[]
  revealed: boolean
  finalUnlocked: boolean
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

function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}

export interface CodeUnlockResult {
  success: boolean
  progress: StoredProgress
}

/** Verifica el código escrito contra el del paso; si acierta, desbloquea (y persiste) el paso. */
export function unlockStepByCode(step: PlayStep, code: string): CodeUnlockResult {
  const stored = loadProgress()
  if (step.unlockRule.type !== 'code' || normalizeCode(code) !== normalizeCode(step.unlockRule.code)) {
    return { success: false, progress: stored }
  }

  const unlockedSet = new Set(stored.unlockedStepIds)
  unlockedSet.add(step.id)
  const progress: StoredProgress = {
    unlockedStepIds: Array.from(unlockedSet),
    revealed: stored.revealed || Boolean(step.revealsFinale),
    finalUnlocked: stored.finalUnlocked,
  }
  saveProgress(progress)
  return { success: true, progress }
}

export function isStepUnlocked(step: PlayStep, progress: StoredProgress): boolean {
  return progress.unlockedStepIds.includes(step.id)
}

export function unlockFinal(): StoredProgress {
  const progress = { ...loadProgress(), finalUnlocked: true }
  saveProgress(progress)
  return progress
}
