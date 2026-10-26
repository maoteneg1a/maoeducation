import { REINFORCEMENT_ANNEXES } from '../../../../shared/domain/reinforcement-annexes'
import type { FormalReportPdfData } from './formal-report-pdf.service'

/** Datos ficticios para revisar los formatos sin consultar expedientes reales. */
export function sampleReinforcementAnnexes(): FormalReportPdfData[] {
  return REINFORCEMENT_ANNEXES.map((t) => ({
    institutionName: 'Institución educativa de ejemplo', title: t.pdfTitle, pdfTemplate: t.pdfTemplate,
    folio: null, status: 'DRAFT', typeLabel: t.label,
    authorName: 'Docente de ejemplo', recipientLabel: t.to === 'representante' ? 'Representante legal' : 'Subdirección / autoridades',
    recipientNames: [], sentAt: null, receivedAt: null, receivedByName: null,
    fields: t.fields, signatures: t.signatures, attachments: [],
    content: {
      lugar: 'Ciudad de ejemplo', fecha_documento: '2026-10-23', jornada: 'Matutina', momento: 'Mitad del periodo',
      representante: 'Representante de ejemplo', horario: 'Matemática · martes y jueves · 13:00 a 13:40',
      autorizacion: 'Autorizo la asistencia de mi representado al horario de refuerzo señalado.',
      compromisos_representante: 'Acompañar el estudio en casa, garantizar asistencia, preparar materiales, justificar ausencias y asistir a reuniones. Coordinar el ingreso y salida del estudiante.',
      compromisos_estudiante: 'Asistir y realizar las actividades acordadas.', compromisos_docente: 'Aplicar estrategias de apoyo y comunicar los avances a la familia.',
      docente_refuerzo: 'Docente de ejemplo', modalidad: 'Dentro del aula · individual', entorno: 'Dentro del aula', agrupacion: 'Individual', lugar_fecha: 'Cuenca, 23 de octubre de 2026', horario_asignaturas: 'Matemática', horario_dias: 'Martes y jueves', horario_horas: '13:00 a 13:40', duracion: 'Dos semanas', fecha_inicio: '2026-10-26',
      objetivo: 'Resolver sumas y restas mediante materiales concretos.', competencia: 'Resolución de problemas matemáticos',
      indicador: 'Resuelve problemas de suma y resta.', saberes: 'Adición y sustracción con números naturales', estrategias: 'Modelado, práctica guiada y retroalimentación individual.',
      recursos: 'Material concreto y tarjetas', evaluacion: 'Resolución de problemas y registro de evidencias',
      logros: 'Identifica la operación y explica el procedimiento.', dificultades: 'Requiere apoyo para revisar sus resultados.', sugerencias: 'Practicar con situaciones cotidianas.',
      competencia_saberes: 'Resolución de problemas · adición y sustracción', observaciones: 'Documento de ejemplo para revisar el formato. No corresponde a un estudiante real.',
    },
    snapshot: {
      academicYear: { name: '2026–2027' }, framework: 'MINEDEC-2026-00082-A',
      student: t.scope === 'student' ? { name: 'Estudiante de ejemplo', dni: null } : null,
      parallel: { name: 'Sexto A', grade: 'Sexto', section: 'A', tutor: 'Tutor de ejemplo' }, subject: { name: 'Matemática', teacher: 'Docente de ejemplo' }, period: { name: 'Primer trimestre' },
      ...(t.snapshot === 'early_alerts' ? { alertRoster: [{ student: 'Estudiante de ejemplo', result: '5.50' }, { student: 'Segundo estudiante de ejemplo', result: '6.25' }] } : {}),
      ...(t.snapshot === 'reinforcement_case' ? { reinforcementCase: {
        caseStatus: 'EVALUATED', attendedClasses: 1, learningTarget: 'Resolución de problemas', detection: { initialResult: '5.50' },
        proposal: { objective: 'Resolver sumas y restas.', strategy: 'Práctica guiada', activity: 'Problemas cotidianos', resource: 'Tarjetas', evaluation: 'Ejercicios', durationFrequency: 'Dos semanas' },
        commitments: [], followUps: [], sessions: [],
        reevaluations: [{ date: '2026-10-30', evaluation: 'Actividad de refuerzo', initialResult: '5.50', subsequentResult: '6.75', decision: 'Continuar acompañamiento' }],
      } } : {}),
      ...(t.snapshot === 'reinforcement_sessions' ? { sessions: [{ date: '2026-10-27', title: 'Práctica guiada', attendance: [
        { student: 'Estudiante de ejemplo', status: 'present', observation: null },
        { student: 'Segundo estudiante de ejemplo', status: 'absent', observation: 'Contactar a la familia' },
      ] }] } : {}),
    },
  }))
}
