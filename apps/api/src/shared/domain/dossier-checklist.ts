import type { DossierItem } from './reports-flow'

/** Lista de respaldo en caso de reprobar. Es independiente de los formatos de alertas tempranas. */
export const DOSSIER_CHECKLIST: DossierItem[] = [
  { key: 'd1', label: 'Actas de inicio del año de socialización de los criterios de evaluación.', source: 'formal_report', reportType: 'acta_socializacion_criterios', minCount: 1, perSubject: false, optional: false },
  { key: 'd2', label: 'Informe de rendimiento académico a los padres de familia y/o representantes legales.', source: 'formal_report', reportType: 'informe_familia', minCount: 1, perSubject: true, optional: false },
  { key: 'd3', label: 'Informe del plan de refuerzo pedagógico implementado en las calificaciones menores a siete.', source: 'formal_report', reportType: 'plan_refuerzo', minCount: 1, perSubject: true, optional: false },
  { key: 'd4', label: 'Reporte de resultados luego de la implementación del plan de refuerzo pedagógico.', source: 'formal_report', reportType: 'resultados_refuerzo', minCount: 1, perSubject: true, optional: false },
  { key: 'd5', label: 'Registro de asistencia al refuerzo pedagógico.', source: 'formal_report', reportType: 'asistencia_refuerzo', minCount: 1, perSubject: true, optional: false },
  { key: 'd6', label: 'Carta de compromiso firmada por el representante legal con el docente de asignatura con el que está perdiendo el año.', source: 'formal_report', reportType: 'carta_compromiso', minCount: 1, perSubject: true, optional: false, requiresSignature: true },
  { key: 'd7', label: 'Informe remitido al tutor de aula o grado por el bajo rendimiento (mínimo tres).', source: 'formal_report', reportType: 'bajo_rendimiento_tutor', minCount: 3, perSubject: true, optional: false },
  { key: 'd8', label: 'Ficha de detección remitida al DECE por encontrarse con bajas calificaciones.', source: 'formal_report', reportType: 'ficha_deteccion_dece', minCount: 1, perSubject: false, optional: false },
  { key: 'd9', label: 'Adaptaciones curriculares realizadas al estudiante.', source: 'formal_report', reportType: 'adaptaciones_curriculares', minCount: 1, perSubject: false, optional: true },
  { key: 'd10', label: 'Actas o informe de la socialización de los lineamientos sobre la mejora de calificaciones tanto a estudiantes como representantes legales.', source: 'formal_report', reportType: 'acta_socializacion_mejora', minCount: 1, perSubject: false, optional: false },
  { key: 'd11', label: 'Actas de reunión mantenidas con el representante.', source: 'parent_meetings', minCount: 1, perSubject: false, optional: false, requiresSignature: true },
  { key: 'd12', label: 'Actas de juntas donde consten las estrategias metodológicas con las que los docentes iban a trabajar con el estudiante.', source: 'formal_report', reportType: 'acta_junta', minCount: 1, perSubject: false, optional: false },
  { key: 'd13', label: 'Informe Técnico del DECE (si el caso ha sido reportado al Departamento de Consejería Estudiantil).', source: 'formal_report', reportType: 'informe_tecnico_dece', minCount: 1, perSubject: false, optional: true },
]

export function dossierStatus(complete: number, pending: number, minimum: number, notApplicable: boolean) {
  if (notApplicable) return 'na' as const
  if (complete >= minimum) return 'ok' as const
  return complete > 0 || pending > 0 ? 'partial' as const : 'missing' as const
}
