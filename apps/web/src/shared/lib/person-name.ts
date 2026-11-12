const nameCollator = new Intl.Collator('es', { sensitivity: 'base' })

export function comparePersonNames(
  a: { lastName: string; firstName: string },
  b: { lastName: string; firstName: string },
): number {
  return nameCollator.compare(a.lastName.trim(), b.lastName.trim())
    || nameCollator.compare(a.firstName.trim(), b.firstName.trim())
}
