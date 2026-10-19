/**
 * Etiquetas legibles (es-EC) para los roles de sistema. Coinciden con los
 * `label` que siembra el backend en la tabla `roles`.
 */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  rector: 'Rector/Autoridad',
  teacher: 'Profesor',
  inspector: 'Inspector',
  dece: 'DECE',
  student: 'Alumno',
  guardian: 'Padre/Representante',
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}
