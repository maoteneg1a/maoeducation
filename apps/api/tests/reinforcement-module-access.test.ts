import { describe, expect, it } from 'vitest'
import { isModuleEnabled, PERSONAL_DEFAULT_MODULES, REINFORCEMENT_CASE_MODULES } from '../../web/src/shared/lib/modules'

describe('shared reinforcement case workspace', () => {
  it('opens institutional cases without requiring the separate planning module', () => {
    expect(isModuleEnabled(['academic', 'grades', 'pedagogic_recovery'], REINFORCEMENT_CASE_MODULES)).toBe(true)
  })
  it('keeps access for personal teachers using the planning modules', () => {
    expect(isModuleEnabled(PERSONAL_DEFAULT_MODULES, REINFORCEMENT_CASE_MODULES)).toBe(true)
    expect(isModuleEnabled(['reinforcement_plans'], REINFORCEMENT_CASE_MODULES)).toBe(true)
  })
  it('does not expose the workspace when neither module is enabled', () => {
    expect(isModuleEnabled(['academic', 'grades'], REINFORCEMENT_CASE_MODULES)).toBe(false)
    expect(isModuleEnabled([], REINFORCEMENT_CASE_MODULES)).toBe(false)
  })
  it('preserves unrestricted institutions and existing single-module guards', () => {
    expect(isModuleEnabled(null, REINFORCEMENT_CASE_MODULES)).toBe(true)
    expect(isModuleEnabled(['academic'], 'academic')).toBe(true)
    expect(isModuleEnabled(['academic'], 'planning')).toBe(false)
  })
})
