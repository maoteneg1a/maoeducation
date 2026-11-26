import { beforeEach, describe, expect, it, vi } from 'vitest'
const db=vi.hoisted(()=>({user:{findMany:vi.fn()},parallel:{findFirst:vi.fn(),findMany:vi.fn()},preparatoryProgram:{findFirst:vi.fn(),findMany:vi.fn(),updateMany:vi.fn(),update:vi.fn(),upsert:vi.fn()},studentEnrollment:{findMany:vi.fn(),count:vi.fn()},preparatoryValue:{findMany:vi.fn(),count:vi.fn(),upsert:vi.fn()},preparatoryComment:{findMany:vi.fn(),upsert:vi.fn()},auditLog:{create:vi.fn()},$executeRaw:vi.fn(),$transaction:vi.fn()}))
vi.mock('../../../shared/infrastructure/database/prisma',()=>({prisma:db}))
import { preparatoryContext, preparatoryOptions, selectPeriodLearning, savePreparatoryValues, configureProgram, prepareProgram, preparatoryReport, type PrepActor } from './preparatoria.service'
import { AMBITS, CATALOG, scaleFor, valuesSchema } from '../domain/preparatoria-policy'
const teacher={sub:'teacher',institutionId:'school',roles:['teacher'],permissions:['grades:read:own','grades:write:own']} as PrepActor
const item=CATALOG.items[0]
function program(){return {id:'program',parallelId:'parallel',institutionId:'school',academicYearId:'year',revision:3,enabled:true,catalogVersion:CATALOG.version,scaleVersion:'2026-00082A',catalog:CATALOG.items,selections:{p1:[item.key]},ambitTeachers:Object.fromEntries(AMBITS.map(a=>[a.id,'teacher']))}}
function parallel(){return {id:'parallel',name:'A',institutionId:'school',institution:{code:'SCHOOL'},academicYearId:'year',tutorId:'teacher',level:{code:'1B',name:'Primero',subnivel:'preparatoria'},academicYear:{id:'year',name:'2026',academicPeriods:[{id:'p1',name:'Primero',isActive:true,isClosed:false},{id:'p2',name:'Segundo',isActive:false,isClosed:false}]},tutor:{id:'teacher',profile:{firstName:'Docente',lastName:'Prueba'}},courseAssignments:[{teacherId:'teacher',teacher:{id:'teacher',isActive:true,profile:{firstName:'Docente',lastName:'Prueba'}}}]}}
beforeEach(()=>{
 vi.resetAllMocks();db.user.findMany.mockResolvedValue([{id:'teacher',profile:{firstName:'Docente',lastName:'Prueba'}}]);db.parallel.findFirst.mockResolvedValue(parallel());db.preparatoryProgram.findFirst.mockResolvedValue(program());db.preparatoryProgram.updateMany.mockResolvedValue({count:1});db.studentEnrollment.count.mockResolvedValue(1);db.studentEnrollment.findMany.mockResolvedValue([{student:{id:'student',profile:{firstName:'Ana',lastName:'Prueba',dni:'E001'}}}]);db.preparatoryValue.findMany.mockResolvedValue([]);db.preparatoryComment.findMany.mockResolvedValue([]);db.preparatoryValue.count.mockResolvedValue(0);db.$transaction.mockImplementation(async(fn:any)=>fn(db))
})
describe('ámbito, matrícula y aislamiento de Preparatoria',()=>{
 it('consulta con institución y verifica asignación real, incluso con permiso all',async()=>{
  await expect(preparatoryContext({...teacher,sub:'other',permissions:['grades:write:all']},'parallel')).rejects.toThrow()
  expect(db.parallel.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'parallel',institutionId:'school'}}))
  expect(db.preparatoryValue.findMany).not.toHaveBeenCalled()
 })
 it('no da opciones a estudiantes y rechaza paralelos numéricos',async()=>{
  expect(await preparatoryOptions({...teacher,roles:['student']})).toEqual({parallels:[]})
  db.parallel.findFirst.mockResolvedValue({...parallel(),level:{code:'2B',subnivel:'elemental'}})
  await expect(preparatoryContext(teacher,'parallel')).rejects.toThrow('no encontrado')
 })
 it.each(['2B','3B','4B','5B','6B','7B','8B','9B','10B','1BGU'])('no activa ni reemplaza el boletín de %s aunque esté mal etiquetado como preparatoria',async(code)=>{
  db.parallel.findFirst.mockResolvedValue({...parallel(),level:{code,subnivel:'preparatoria'}})
  await expect(preparatoryContext({...teacher,roles:['admin']},'parallel')).rejects.toThrow('no encontrado')
  expect(await preparatoryReport('school','parallel','year','student')).toBeNull()
  expect(db.preparatoryProgram.findFirst).not.toHaveBeenCalled()
 })
 it('precarga los siete ámbitos y sus indicadores sin guardar calificaciones ni activar automáticamente',async()=>{
  db.preparatoryProgram.findFirst.mockResolvedValue(null)
  await prepareProgram({...teacher,roles:['admin']},'parallel')
  expect(db.preparatoryProgram.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({catalog:CATALOG.items,ambitTeachers:Object.fromEntries(AMBITS.map(a=>[a.id,'teacher']))})}))
  expect(db.preparatoryValue.upsert).not.toHaveBeenCalled()
  await expect(prepareProgram(teacher,'parallel')).rejects.toThrow('autoridad')
 })
 it('permite ámbitos directos sin materias y solo ofrece docentes activos de la institución a la autoridad',async()=>{
  db.parallel.findFirst.mockResolvedValue({...parallel(),tutorId:'other',courseAssignments:[]})
  expect((await preparatoryContext(teacher,'parallel')).editableAmbits).toHaveLength(7)
  expect(db.user.findMany).not.toHaveBeenCalled()
  await preparatoryContext({...teacher,roles:['admin']},'parallel')
  expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{institutionId:'school',isActive:true,userRoles:{some:{role:{institutionId:'school',name:'teacher'}}}}}))
  db.preparatoryProgram.findFirst.mockResolvedValue({...program(),enabled:false})
  await expect(preparatoryContext(teacher,'parallel')).rejects.toThrow()
 })
 it('respeta el cierre del período tanto al seleccionar como al valorar',async()=>{
  const course=parallel();course.academicYear.academicPeriods[0].isClosed=true
  db.parallel.findFirst.mockResolvedValue(course)
  await expect(selectPeriodLearning(teacher,'parallel','p1',{expectedRevision:3,itemKeys:[item.key]})).rejects.toThrow('cerrado')
  await expect(savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:3,values:[]})).rejects.toThrow('cerrado')
  expect(db.$transaction).not.toHaveBeenCalled()
 })
 it('rechaza períodos de otros años antes de leer las valoraciones',async()=>{
  await expect(savePreparatoryValues(teacher,'parallel','foreign',{expectedRevision:3,values:[]})).rejects.toThrow('no pertenece')
  expect(db.$transaction).not.toHaveBeenCalled()
 })
 it('no permite valorar ámbitos de otro docente',async()=>{
  db.preparatoryProgram.findFirst.mockResolvedValue({...program(),ambitTeachers:{[item.ambit]:'other'}})
  await expect(savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:3,values:[{studentId:'student',itemKey:item.key,code:'A+'}]})).rejects.toThrow('otro docente')
  expect(db.$transaction).not.toHaveBeenCalled()
 })
 it('rechaza estudiantes ajenos a la matrícula activa dentro de la transacción',async()=>{
  db.studentEnrollment.count.mockResolvedValue(0)
  await expect(savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:3,values:[{studentId:'foreign',itemKey:item.key,code:'A+'}]})).rejects.toThrow('matrícula activa')
  expect(db.preparatoryValue.upsert).not.toHaveBeenCalled();expect(db.auditLog.create).not.toHaveBeenCalled()
 })
 it('distingue NE, NULL y notas, y guarda con auditoría en la misma transacción',async()=>{
  await savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:3,values:[{studentId:'student',itemKey:item.key,code:'NE',notes:' No trabajado '}],comments:[{studentId:'student',text:'Recomendación'}]})
  expect(db.preparatoryValue.upsert).toHaveBeenCalledWith(expect.objectContaining({update:{code:'NE',notes:'No trabajado',recordedBy:'teacher'}}))
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({institutionId:'school',userId:'teacher',action:'preparatoria.values'})}))
  expect(valuesSchema.parse({expectedRevision:3,values:[{studentId:'s',itemKey:'k',code:null}]}).values[0].code).toBeNull()
 })
 it('protege versiones anteriores y conflictos simultáneos sin sobrescribir datos',async()=>{
  await expect(savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:2,values:[]})).rejects.toThrow('otra sesión')
  expect(db.$transaction).not.toHaveBeenCalled()
  db.preparatoryProgram.updateMany.mockResolvedValue({count:0})
  await expect(savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:3,values:[]})).rejects.toThrow('otra sesión')
  expect(db.preparatoryValue.upsert).not.toHaveBeenCalled()
 })
 it('copia solo la selección y preserva los datos al retirar un indicador',async()=>{
  await selectPeriodLearning(teacher,'parallel','p2',{expectedRevision:3,itemKeys:[item.key]})
  expect(db.preparatoryProgram.update).toHaveBeenCalledWith(expect.objectContaining({data:{selections:{p1:[item.key],p2:[item.key]}}}))
  expect(db.preparatoryValue.upsert).not.toHaveBeenCalled()
  await selectPeriodLearning(teacher,'parallel','p1',{expectedRevision:3,itemKeys:[]})
  expect(db.preparatoryValue.upsert).not.toHaveBeenCalled()
 })
 it('conserva en el informe indicadores históricos retirados de la selección',async()=>{
  db.preparatoryProgram.findFirst.mockResolvedValue({...program(),selections:{}})
  db.preparatoryValue.findMany.mockResolvedValue([{studentId:'student',itemKey:item.key,periodId:'p1',code:'B-',notes:'Logro histórico'}])
  const report=await preparatoryReport('school','parallel','year','student')
  expect(report?.rows[0].periods.p1).toEqual({selected:false,code:'B-',notes:'Logro histórico'})
  expect(db.preparatoryProgram.findFirst).toHaveBeenCalledWith({where:{institutionId:'school',parallelId:'parallel',academicYearId:'year',enabled:true}})
 })
 it('aplica la plantilla de UEEU del año lectivo y conserva los permisos del ámbito curricular', async () => {
  const course = parallel()
  db.parallel.findFirst.mockResolvedValue({ ...course, institution: { code: 'UEEU' }, academicYear: { ...course.academicYear, name: '2026-2027' } })
  const workbookKeys = ['I.CI.1.13.1', 'I.CI.1.13.2', 'I.CI.1.13.4', 'I.CI.1.7.2', 'I.CI.1.12.1', 'I.CI.0.9.26', 'I.CI.1.10.1']
  const unlistedMathKey = 'I.CI.1.13.3'
  const mathTeacher = { ...teacher, sub: 'specialist' }
  db.preparatoryProgram.findFirst.mockResolvedValue({
   ...program(), selections: { p1: [...workbookKeys, unlistedMathKey] }, ambitTeachers: { math: 'specialist', environment: 'teacher' },
  })
  db.preparatoryValue.findMany.mockResolvedValue([{ itemKey: workbookKeys[0], periodId: 'p1', code: 'B+', notes: 'Observación conservada' }])
  const report = await preparatoryReport('school', 'parallel', 'year', 'student')
  const groups = Object.fromEntries(report!.rows.map(row => [row.key, row.ambit]))
  expect(workbookKeys.map(key => groups[key])).toEqual(['personal', 'personal', 'personal', 'discovery', 'discovery', 'discovery', 'expression'])
  expect(groups[unlistedMathKey]).toBe('discovery')
  expect(report!.ambits.map(ambit => ambit.name)).toEqual([
   'Ámbito 1 · Personal Social y Cultural',
   'Ámbito 2 · Descubrimiento del Medio Natural',
   'Ámbito 3 · Expresión y Comunicación',
  ])
  expect(report!.rows.find(row => row.key === workbookKeys[0])?.periods.p1).toEqual({ selected: true, code: 'B+', notes: 'Observación conservada' })
  const restricted = await preparatoryReport('school', 'parallel', 'year', 'student', mathTeacher)
  expect(restricted!.rows.map(row => row.key)).toEqual(expect.arrayContaining([...workbookKeys.slice(0, 4), unlistedMathKey]))
  expect(restricted!.rows).toHaveLength(5)
  const context = await preparatoryContext(mathTeacher, 'parallel')
  expect(context.editableAmbits).toEqual(['math'])
  expect(context.program?.catalog.find(item => item.key === workbookKeys[0])?.ambit).toBe('math')
  expect(db.preparatoryProgram.update).not.toHaveBeenCalled()
  expect(db.preparatoryValue.upsert).not.toHaveBeenCalled()
  db.parallel.findFirst.mockResolvedValueOnce({ ...course, institution: { code: 'UEEU' } }).mockResolvedValueOnce(course)
  for (let i = 0; i < 2; i++) {
   const standard = await preparatoryReport('school', 'parallel', 'year', 'student')
   expect(standard!.ambits).toEqual(AMBITS)
   expect(standard!.rows.find(row => row.key === workbookKeys[0])?.ambit).toBe('math')
  }
 })
 it('impide redefinir catálogo o escala cuando ya hay valoraciones',async()=>{
  db.preparatoryValue.count.mockResolvedValue(1)
  await expect(configureProgram({...teacher,roles:['admin']},'parallel',{expectedRevision:3,enabled:true,reviewed:true,scaleVersion:'2025-INSTRUCTIVO',ambitTeachers:program().ambitTeachers,distribution:CATALOG.items.map(i=>({key:i.key,ambit:i.ambit}))})).rejects.toThrow('históricas')
  expect(db.preparatoryProgram.update).not.toHaveBeenCalled()
 })
 it('exige códigos válidos y sin campos arbitrarios',()=>{
  expect(valuesSchema.safeParse({expectedRevision:3,values:[{studentId:'s',itemKey:'i',code:'9.8'}]}).success).toBe(false)
  expect(valuesSchema.safeParse({expectedRevision:3,values:[{studentId:'s',itemKey:'i',code:'A+',institutionId:'other'}]}).success).toBe(false)
  expect(new Set(CATALOG.items.map(i=>i.key)).size).toBe(CATALOG.items.length)
  expect(scaleFor('2026-00082A').find(i=>i.code==='B-')?.label).toBe('Aprendizaje alcanzado')
  expect(scaleFor('2025-INSTRUCTIVO').find(i=>i.code==='B-')?.label).toBe('Aprendizaje en proceso de desarrollo')
 })
 it('propaga fallos de auditoría para que la transacción no confirme cambios',async()=>{
  db.studentEnrollment.count.mockResolvedValue(0)
  db.auditLog.create.mockRejectedValue(new Error('audit unavailable'))
  await expect(savePreparatoryValues(teacher,'parallel','p1',{expectedRevision:3,values:[]})).rejects.toThrow('audit unavailable')
 })
})
