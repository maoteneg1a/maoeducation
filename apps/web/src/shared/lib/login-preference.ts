export type LoginType = 'institution' | 'personal'

const STORAGE_KEY = 'auleka-login-type'
const INSTITUTION_CODE_KEY = 'auleka-institution-code'

export function getLoginTypePreference(): LoginType {
  return localStorage.getItem(STORAGE_KEY) === 'personal' ? 'personal' : 'institution'
}

export function setLoginTypePreference(type: LoginType): void {
  localStorage.setItem(STORAGE_KEY, type)
}

export function getRememberedInstitutionCode(): string {
  return localStorage.getItem(INSTITUTION_CODE_KEY) ?? ''
}

export function rememberInstitutionCode(code: string): void {
  localStorage.setItem(INSTITUTION_CODE_KEY, code.trim().toUpperCase())
}
