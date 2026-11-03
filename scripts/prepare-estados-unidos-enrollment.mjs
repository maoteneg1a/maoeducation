/** Local preparation only. Usage: node scripts/prepare-estados-unidos-enrollment.mjs analysis.json output-dir */
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const XLSX = require('xlsx')
const [input, destination] = process.argv.slice(2)
if (!input || !destination) throw new Error('Provide analysis.json and an output directory')
const analysis = JSON.parse(await readFile(input, 'utf8'))
await mkdir(path.join(destination, 'matriculas'), { recursive: true })
const duplicateDocuments = new Set(analysis.duplicates.flat().map(row => row.dni))
const validDocument = value => /^(?:\d{10}|(?=[A-Z0-9]{6,20}$)(?=.*[A-Z])(?=.*\d)[A-Z0-9]+)$/.test(value)
const pending = []
const nameReviews = []
const manifest = []
const allRows = []
const addSheet = (book, name, rows, columns) => {
  const sheet = XLSX.utils.json_to_sheet(rows, columns ? { header: columns } : undefined)
  sheet['!cols'] = (columns ?? Object.keys(rows[0] ?? {})).map(key => ({ wch: /nombre|apellido|motivo|fuente/.test(key) ? 40 : 22 }))
  XLSX.utils.book_append_sheet(book, sheet, name)
}

for (const group of analysis.groups) {
  const sourceRows = analysis.students.filter(row => row.group === group.code).sort((a, b) => a.number - b.number)
  const accepted = []
  const trace = []
  for (const row of sourceRows) {
    const parts = row.fullName.split(/\s+/)
    const reasons = []
    if (duplicateDocuments.has(row.dni)) reasons.push('Caso especial: aparece en dos grados; confirmar destino')
    if (!validDocument(row.dni)) reasons.push(`Documento numérico de ${row.dni.length} dígitos: confirmar, sin completar ni truncar`)
    if (parts.length < 3) reasons.push('Nombre y apellidos unidos en origen: confirmar separación')
    const record = {
      grupo: group.code, documento: row.dni, nombre_original: row.fullName,
      fuente: row.source.replace(/^(Mat|Vesp)_/, '').replace(/\.txt$/, ''), fila_pdf: row.number,
      estado: reasons.length ? 'PENDIENTE' : 'PREPARADO', motivo: reasons.join('; '),
    }
    trace.push(record)
    allRows.push(record)
    if (reasons.length) {
      pending.push(record)
      continue
    }
    const student = { cedula: row.dni, nombres: parts.slice(2).join(' '), apellidos: parts.slice(0, 2).join(' '), fecha_nacimiento: '' }
    accepted.push(student)
    if (parts.length > 4 || parts.slice(0, 3).some(part => ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA'].includes(part))) {
      nameReviews.push({ ...record, apellidos_propuestos: student.apellidos, nombres_propuestos: student.nombres, observacion: 'Revisar separación propuesta antes de importar; se conserva texto completo en trazabilidad' })
    }
  }
  const shift = group.shift === 'Mat' ? 'Matutina' : 'Vespertina'
  const filename = `${group.code}_2026-2027.xlsx`
  const book = XLSX.utils.book_new()
  addSheet(book, 'Estudiantes', accepted, ['cedula', 'nombres', 'apellidos', 'fecha_nacimiento'])
  addSheet(book, 'Trazabilidad', trace)
  addSheet(book, 'Destino', [{ institucion: '01H00761', anio: '2026-2027', grado: `${group.grade} EGB`, jornada: shift, paralelo_fuente: group.parallel, nombre_paralelo_propuesto: `${group.parallel}-${group.shift === 'Mat' ? 'M' : 'V'}`, filas_pdf: sourceRows.length, filas_preparadas: accepted.length, pendientes: sourceRows.length - accepted.length }])
  XLSX.writeFile(book, path.join(destination, 'matriculas', filename), { compression: true })
  manifest.push({ grupo: group.code, jornada: shift, grado: group.grade, paralelo: group.parallel, paralelo_propuesto: `${group.parallel}-${group.shift === 'Mat' ? 'M' : 'V'}`, archivo: `matriculas/${filename}`, filas_pdf: sourceRows.length, filas_excel_origen: group.excel, diferencia: group.difference, filas_preparadas: accepted.length, pendientes: sourceRows.length - accepted.length })
}

const summary = {
  filas_fuentes: analysis.student_count,
  personas_segun_documento: analysis.unique_dni,
  archivos: manifest.length,
  filas_preparadas: manifest.reduce((sum, group) => sum + group.filas_preparadas, 0),
  filas_pendientes: pending.length,
  documentos_alfanumericos_preparados: allRows.filter(row => row.estado === 'PREPARADO' && /[A-Z]/.test(row.documento)).length,
  nombres_con_revision_adicional: nameReviews.length,
  importado: false,
}
const novelties = XLSX.utils.book_new()
addSheet(novelties, 'Resumen', [summary])
addSheet(novelties, 'Manifiesto', manifest)
addSheet(novelties, 'Pendientes', pending)
addSheet(novelties, 'Revision_nombres', nameReviews)
addSheet(novelties, 'Registro_completo', allRows)
XLSX.writeFile(novelties, path.join(destination, 'NOVEDADES_Y_RESUMEN.xlsx'), { compression: true })
await writeFile(path.join(destination, 'manifiesto.json'), JSON.stringify({ summary, groups: manifest }, null, 2)+'\n')

const duplicateDescription = analysis.duplicates.map(rows => `- Documento **${rows[0].dni}**, ${rows[0].fullName}: ${rows.map(row => `${row.group}, fila ${row.number}`).join(' y ')}. **Caso especial registrado; sin matrícula automática en ninguno de los dos destinos.** No se creó todavía el usuario en Auleka.`).join('\n')
const documentPending = pending.filter(row => !validDocument(row.documento))
const text = `# Novedades y resumen — Estados Unidos, 2026-2027

Preparación del 3 de noviembre de 2026. No se ha ejecutado ninguna importación ni se han modificado los originales.

## Novedades

### Códigos de extranjeros

Se conservan íntegros como texto, incluyendo letras y ceros iniciales. Se prepararon ${summary.documentos_alfanumericos_preparados} registros alfanuméricos; otro permanece pendiente por nombre unido en el PDF. El código de matrícula fue adaptado para cédulas numéricas de diez dígitos o códigos alfanuméricos de 6 a 20 caracteres con letras y números, sin espacios internos ni signos. Requiere desplegar el cambio antes de importar. La regla es de formato; no certifica el tipo o validez oficial del documento.

### Caso especial: estudiante duplicado

${duplicateDescription}

### Documentos numéricos pendientes

${documentPending.map(row => `- ${row.grupo}, fila ${row.fila_pdf}: **${row.documento}**. ${row.motivo}.`).join('\n')}

### Nombre pendiente

${pending.filter(row => row.motivo.includes('unidos')).map(row => `- ${row.grupo}, fila ${row.fila_pdf}: documento ${row.documento}, texto original **${row.nombre_original}**. Confirmar nombres y apellidos; el documento alfanumérico sí es admisible.`).join('\n')}

### Separación propuesta de nombres

Los PDF presentan nombres completos con apellidos primero. Se propone separar los dos primeros términos como apellidos y el resto como nombres, conservando el original en la segunda hoja. Revisar antes de importar; hay ${nameReviews.length} casos marcados para revisión adicional en la hoja Revision_nombres de NOVEDADES_Y_RESUMEN.xlsx. Las filas de revisión adicional permanecen en sus lotes preparados; una revisión no equivale a una corrección confirmada.

### Personal y clases pendientes

- NN, documento 0: marcador sin persona identificada, no crear usuario. Tiene ECA en 8AV y 8BV (dos períodos en cada grupo), y Orientación vocacional en 9AV y 9BV (uno en cada grupo). Falta confirmar quién dará esas clases.
- Docente generalista: un profesor cubre varias materias del mismo grupo. Las 20 horas agrupadas deben traducirse a materias reales y sus horas antes de configurar calificaciones.
- 24 grupos difieren en cantidad entre el Excel de planificación y los PDF; el manifiesto conserva ambas cantidades.

## Resumen

- 40 archivos Excel, uno por grado, paralelo y jornada.
- ${summary.filas_fuentes} filas en las fuentes y ${summary.personas_segun_documento} documentos distintos.
- **${summary.filas_preparadas} filas preparadas** en la primera hoja de los Excel.
- **${summary.filas_pendientes} filas apartadas**, correspondientes a cuatro personas: las dos apariciones del duplicado, dos documentos numéricos y un nombre unido.
- El detalle completo de las ${summary.filas_fuentes} filas se conserva en Registro_completo. No hay omisiones silenciosas.
- Sin fechas de nacimiento inventadas ni correos usados como documento.

## Cómo utilizar los archivos

1. Revisar novedades, separación de nombres y cantidades del manifiesto.
2. Aplicar la adaptación de identificadores en el entorno donde se hará la carga.
3. Crear o verificar los cuarenta grupos distinguiendo la jornada. Destinos propuestos con el modelo actual: A-M/B-M para mañana y A-V/B-V para tarde. Es una propuesta, todavía no aplicada.
4. En Matrículas → Importar Excel, elegir año 2026-2027 y el grado/paralelo/jornada del archivo; activar Matricular después de importar.
5. Cargar el archivo correspondiente y comprobar creados, matriculados y omitidos. El importador solo lee la primera hoja Estudiantes; las hojas Trazabilidad y Destino son para revisión.
6. Resolver los pendientes por separado, sin matricular el duplicado por orden de carga.

Estos archivos contienen datos personales reales: mantenerlos en el ámbito autorizado de la institución. La carpeta local de entrega está ignorada por Git.
`
await writeFile(path.join(destination, 'NOVEDADES_Y_RESUMEN.md'), text)
await writeFile(path.join(destination, 'CONFIGURACION_PROPUESTA.json'), JSON.stringify({
  estado: 'Propuesta documental; no aplicada. No es un payload directo de API.',
  destino: { institutionId: null, academicYearId: null, entorno: null },
  institucion: { nombre: 'UNIDAD EDUCATIVA ESTADOS UNIDOS DE NORTE AMÉRICA', amie: '01H00761', regimen: 'SIERRA_AMAZONIA' },
  anio: { nombre: '2026-2027', inicio_clases: '2026-09-02', fin_clases: '2027-06-25', fin_administrativo: null },
  trimestres: [
    { numero: 1, inicio: '2026-09-02', fin: '2026-12-01' },
    { numero: 2, inicio: '2026-12-02', fin: '2027-03-15' },
    { numero: 3, inicio: '2027-03-16', fin: '2027-06-25' },
  ],
  grados: Array.from({ length: 10 }, (_, i) => ({ codigo: `${i+1}B`, subnivel: i === 0 ? 'preparatoria' : i < 4 ? 'elemental' : i < 7 ? 'media' : 'superior' })),
  grupos: manifest.map(group => ({ codigo_fuente: group.grupo, grado: `${group.grado}B`, jornada: group.jornada, paralelo_propuesto: group.paralelo_propuesto })),
  pendientes: ['Identificar institución, año y entorno de destino, y conciliar registros existentes', 'Verificar los nombres de paralelo con jornada antes de crearlos', 'Definir fin administrativo del año', 'Convertir logo PDF a imagen compatible', 'Confirmar asignaturas de generalistas y docentes para las cuatro asignaciones NN', 'Resolver las cinco filas apartadas y revisar nombres propuestos'],
}, null, 2)+'\n')
console.log(JSON.stringify(summary, null, 2))
