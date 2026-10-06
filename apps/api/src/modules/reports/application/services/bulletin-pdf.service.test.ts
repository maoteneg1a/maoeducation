import { describe, expect, it } from 'vitest'
import { buildBulletinPdf, type BulletinPdfData } from './bulletin-pdf.service'

const DATA: BulletinPdfData = {
  institutionName: 'Institución educativa',
  title: 'Boletín',
  logoUrl: null,
  directorName: 'Director de prueba',
  directorRole: 'DIRECTOR/A',
  teacherLabel: 'DOCENTE TUTOR/A',
  studentName: 'Estudiante de prueba',
  studentDni: '0000000000',
  studentCode: '0000000000',
  parallelName: 'A',
  levelName: 'Sexto',
  tutorName: 'Docente de prueba',
  yearName: '2026–2027',
  periods: [{ id: 'p1', name: 'Primer trimestre' }],
  subjects: [{
    subjectName: 'Lengua y Literatura',
    isQualitative: false,
    periodGrades: [{ periodId: 'p1', regularAvg: 8, examenAvg: 9, proyectoAvg: null, total: 8.3, code: null }],
    supletorio: null,
    promFinal: 8.3,
    finalCode: null,
  }],
  qualitativeSubjects: [],
  overallAverage: 8.3,
  attendanceByPeriod: [{ periodId: 'p1', justifiedAbsences: 0, unjustifiedAbsences: 0, attendedDays: 20, lateCount: 0 }],
  behaviorByPeriod: [{ periodId: 'p1', code: 'A', notes: null }],
  qualitativeScale: [],
  qualitativeValueScale: [],
}

describe('buildBulletinPdf', () => {
  it('mantiene el boletín y las firmas en una sola página', async () => {
    const pdf = await buildBulletinPdf(DATA)
    const pageObjects = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []

    expect(pageObjects).toHaveLength(1)
  })
})
