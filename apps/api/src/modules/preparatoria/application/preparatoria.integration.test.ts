import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrepActor } from './preparatoria.service'

vi.mock('../../../shared/infrastructure/database/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client')
  const url = process.env.PREPARATORIA_TEST_DATABASE_URL || 'postgresql://juntas:juntas-test-only@127.0.0.1:55439/juntas_test'
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || parsed.pathname !== '/juntas_test') throw new Error('Preparatoria integration tests require the disposable local database')
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) }
})
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { buildApp } from '../../../app'
import { tokenService } from '../../../shared/infrastructure/services/token.service'
import * as prep from './preparatoria.service'
import { AMBITS, CATALOG } from '../domain/preparatoria-policy'

const suite = process.env.PREPARATORIA_TEST_DATABASE_URL ? describe : describe.skip
suite('Preparatoria and preservation of regular grades with PostgreSQL', () => {
  const db = prisma as PrismaClient
  let school: string, year: string, first: string, second: string, p1: string, p2: string, child: string, otherChild: string, subject: string
  let admin: PrepActor, tutor: PrepActor, specialist: PrepActor, outsider: PrepActor
  const app = buildApp()
  beforeEach(async () => {
    school = (await db.institution.create({ data: { name: 'Escuela ficticia Preparatoria', code: `PREP_${randomUUID()}` } })).id
    const makeUser = async (firstName: string) => db.user.create({ data: { institutionId: school, email: `${randomUUID()}@example.test`, passwordHash: 'unused-test', profile: { create: { firstName, lastName: 'Prueba' } } } })
    const [a,t,s,o,c,d] = await Promise.all(['Autoridad','Tutora','Especialista','Otro','Ana','Luis'].map(makeUser))
    const actor = (id: string): PrepActor => ({ sub:id, institutionId:school, roles:['teacher'], permissions:['grades:read:own','grades:write:own','reports:read:all'] })
    admin={...actor(a.id),roles:['admin']};tutor=actor(t.id);specialist=actor(s.id);outsider=actor(o.id);child=c.id;otherChild=d.id
    year=(await db.academicYear.create({ data:{ institutionId:school,name:'2026-2027',startDate:new Date('2026-09-01'),endDate:new Date('2027-07-31'),isActive:true } })).id
    const scheme=await db.academicPeriodScheme.create({data:{institutionId:school,name:'Trimestres',code:'trimestres',periodsCount:3}})
    const periods=await Promise.all([1,2,3].map(n=>db.academicPeriod.create({data:{academicYearId:year,schemeId:scheme.id,periodNumber:n,name:`Trimestre ${n}`,startDate:new Date('2026-09-01'),endDate:new Date('2027-07-31'),isActive:n===1}})))
    p1=periods[0].id;p2=periods[1].id
    const [l1,l2]=await Promise.all([db.level.create({data:{institutionId:school,code:'1B',name:'Primero',sortOrder:1,subnivel:'preparatoria'}}),db.level.create({data:{institutionId:school,code:'2B',name:'Segundo',sortOrder:2,subnivel:'preparatoria'}})])
    first=(await db.parallel.create({data:{institutionId:school,academicYearId:year,levelId:l1.id,name:'A',tutorId:t.id}})).id
    second=(await db.parallel.create({data:{institutionId:school,academicYearId:year,levelId:l2.id,name:'A',tutorId:t.id}})).id
    subject=(await db.subject.create({data:{institutionId:school,name:'Matemática compartida',isQualitative:false}})).id
    const assignments=await Promise.all([first,second].map(parallelId=>db.courseAssignment.create({data:{institutionId:school,academicYearId:year,parallelId,subjectId:subject,teacherId:t.id,examWeight:0}})))
    const art=await db.subject.create({data:{institutionId:school,name:'Expresión artística'}})
    await db.courseAssignment.create({data:{institutionId:school,academicYearId:year,parallelId:first,subjectId:art.id,teacherId:s.id,examWeight:0}})
    await Promise.all([[first,child],[second,otherChild]].map(([parallelId,studentId])=>db.studentEnrollment.create({data:{institutionId:school,academicYearId:year,parallelId,studentId}})))
    for(let i=0;i<assignments.length;i++){
      const insumo=await db.insumo.create({data:{institutionId:school,courseAssignmentId:assignments[i].id,academicPeriodId:p1,name:'Nota histórica',createdBy:t.id}})
      await db.manualInsumoAverage.create({data:{institutionId:school,studentId:i===0?child:otherChild,insumoId:insumo.id,score:i===0?8.5:7.75,recordedBy:t.id}})
    }
  },30000)
  afterAll(async()=>{await app.close();await db.$disconnect()})
  async function enable() {
    const ctx=await prep.prepareProgram(admin,first)
    return prep.configureProgram(admin,first,{expectedRevision:ctx.program!.revision,enabled:true,reviewed:true,scaleVersion:'2026-00082A',ambitTeachers:{...ctx.program!.ambitTeachers as Record<string,string>,artistic:specialist.sub},distribution:CATALOG.items.map(item=>({key:item.key,ambit:item.ambit}))})
  }
  const token=()=>tokenService.signAccess(admin)
  async function bulletin(parallelId:string,studentId:string,pdf=false){
    return app.inject({method:'GET',url:`/api/v1/reports/bulletin${pdf?'/pdf':''}?${new URLSearchParams({yearId:year,parallelId,studentId})}`,headers:{authorization:`Bearer ${token()}`}})
  }
  it('preloads all seven ambits and 101 indicators but does not activate, grade, or alter shared subjects',async()=>{
    const options=await prep.preparatoryOptions(admin)
    expect(options.parallels.map(p=>p.id)).toEqual([first])
    const ctx=await prep.prepareProgram(admin,first)
    expect(ctx.program).toMatchObject({enabled:false,catalogVersion:CATALOG.version})
    expect(ctx.program!.catalog).toHaveLength(101)
    expect(Object.keys(ctx.program!.ambitTeachers as object)).toHaveLength(7)
    expect(ctx.ambits).toEqual(AMBITS)
    expect(await db.preparatoryValue.count({where:{institutionId:school}})).toBe(0)
    expect((await db.subject.findUniqueOrThrow({where:{id:subject}})).isQualitative).toBe(false)
    expect((await db.manualInsumoAverage.findMany({where:{institutionId:school},orderBy:{score:'asc'}})).map(v=>Number(v.score))).toEqual([7.75,8.5])
    await expect(prep.prepareProgram(admin,second)).rejects.toMatchObject({statusCode:404})
  })
  it('keeps pending, explicit NE and the following trimester independent and audits changes',async()=>{
    await enable()
    const items=CATALOG.items.filter(i=>i.ambit==='identity').slice(0,2)
    let ctx=await prep.preparatoryContext(tutor,first)
    const selected=await prep.selectPeriodLearning(tutor,first,p1,{expectedRevision:ctx.program!.revision,itemKeys:items.map(i=>i.key)})
    const saved=await prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:items[0].key,code:'NE'}],comments:[{studentId:child,text:'Avances observados'}]})
    expect(saved.values).toHaveLength(1);expect(saved.values[0].code).toBe('NE')
    expect((await prep.preparatorySheet(tutor,first,p2)).values).toEqual([])
    await prep.selectPeriodLearning(tutor,first,p2,{expectedRevision:saved.revision,itemKeys:items.map(i=>i.key)})
    expect((await prep.preparatorySheet(tutor,first,p2)).values).toEqual([])
    expect(await db.auditLog.count({where:{institutionId:school,action:'preparatoria.values'}})).toBe(1)
  })
  it('enforces authorized ambits, enrolled students and institution boundaries',async()=>{
    const ctx=await enable(),art=CATALOG.items.find(i=>i.ambit==='artistic')!,math=CATALOG.items.find(i=>i.ambit==='math')!
    const selected=await prep.selectPeriodLearning(admin,first,p1,{expectedRevision:ctx.program!.revision,itemKeys:[art.key,math.key]})
    await expect(prep.savePreparatoryValues(specialist,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:math.key,code:'A+'}]})).rejects.toMatchObject({statusCode:403})
    await expect(prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:selected.revision,values:[{studentId:otherChild,itemKey:math.key,code:'A+'}]})).rejects.toMatchObject({statusCode:400})
    await expect(prep.preparatoryContext(outsider,first)).rejects.toMatchObject({statusCode:403})
    await expect(prep.preparatoryContext({...admin,institutionId:randomUUID()},first)).rejects.toMatchObject({statusCode:404})
    const saved=await prep.savePreparatoryValues(specialist,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:art.key,code:'B+'}]})
    expect(saved.values[0].code).toBe('B+')
    const completed=await prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:saved.revision,values:[{studentId:child,itemKey:math.key,code:'A+'}],comments:[{studentId:child,text:'Observación general del tutor'}]})
    const specialistSheet=await prep.preparatorySheet(specialist,first,p1)
    expect(specialistSheet.values.map(v=>v.itemKey)).toEqual([art.key])
    expect(specialistSheet.comments).toEqual([])
    const specialistReport=await prep.preparatoryReport(school,first,year,child,specialist)
    expect(specialistReport?.rows.map(row=>row.key)).toEqual([art.key])
    expect(specialistReport?.comments).toEqual([])
    expect((await prep.preparatoryReport(school,first,year,child,tutor))?.rows).toHaveLength(2)
    await expect(prep.savePreparatoryValues(specialist,first,p1,{expectedRevision:completed.revision,values:[],comments:[{studentId:child,text:'General'}]})).rejects.toMatchObject({statusCode:403})
  })
  it('respects closed periods and revision conflicts without overwriting',async()=>{
    const ctx=await enable(),item=CATALOG.items[0]
    const selected=await prep.selectPeriodLearning(tutor,first,p1,{expectedRevision:ctx.program!.revision,itemKeys:[item.key]})
    const saved=await prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:item.key,code:'A-'}]})
    await expect(prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:item.key,code:'C+'}]})).rejects.toMatchObject({statusCode:409})
    await db.academicPeriod.update({where:{id:p1},data:{isClosed:true}})
    await expect(prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:saved.revision,values:[]})).rejects.toMatchObject({statusCode:409})
    expect((await db.preparatoryValue.findFirstOrThrow({where:{institutionId:school}})).code).toBe('A-')
  })
  it('changes only the enabled first-grade report, preserving numeric grades and the second-grade bulletin',async()=>{
    const before=await bulletin(second,otherChild);expect(before.statusCode).toBe(200)
    const ctx=await enable(),item=CATALOG.items[0]
    const selected=await prep.selectPeriodLearning(tutor,first,p1,{expectedRevision:ctx.program!.revision,itemKeys:[item.key]})
    await prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:item.key,code:'B+'}]})
    const firstReport=await bulletin(first,child);expect(firstReport.statusCode).toBe(200)
    expect(firstReport.json()).toMatchObject({subjects:[],qualitativeSubjects:[],overallAverage:null,preparatoria:{rows:[{key:item.key,periods:{[p1]:{code:'B+'}}}]}})
    const after=await bulletin(second,otherChild);expect(after.statusCode).toBe(200)
    expect(after.json().subjects).toEqual(before.json().subjects)
    expect(after.json().overallAverage).toEqual(before.json().overallAverage)
    expect(after.json().preparatoria).toBeNull()
    for(const [course,student] of [[first,child],[second,otherChild]]){const pdf=await bulletin(course,student,true);expect(pdf.statusCode).toBe(200);expect(pdf.rawPayload.subarray(0,5).toString()).toBe('%PDF-')}
    expect((await db.subject.findUniqueOrThrow({where:{id:subject}})).isQualitative).toBe(false)
    expect((await db.manualInsumoAverage.findMany({where:{institutionId:school},orderBy:{score:'asc'}})).map(v=>Number(v.score))).toEqual([7.75,8.5])
  })
  it('ignores a wrongly enabled program for another grade and preserves values after disabling first grade',async()=>{
    const ctx=await enable(),item=CATALOG.items[0]
    await db.preparatoryProgram.create({data:{institutionId:school,parallelId:second,academicYearId:year,enabled:true,catalogVersion:'invalid',catalog:[]}})
    expect(await prep.preparatoryReport(school,second,year,otherChild)).toBeNull()
    const selected=await prep.selectPeriodLearning(tutor,first,p1,{expectedRevision:ctx.program!.revision,itemKeys:[item.key]})
    const saved=await prep.savePreparatoryValues(tutor,first,p1,{expectedRevision:selected.revision,values:[{studentId:child,itemKey:item.key,code:'A+'}]})
    const current=await prep.preparatoryContext(admin,first)
    await prep.configureProgram(admin,first,{expectedRevision:saved.revision,enabled:false,reviewed:true,scaleVersion:'2026-00082A',ambitTeachers:current.program!.ambitTeachers,distribution:CATALOG.items.map(i=>({key:i.key,ambit:i.ambit}))})
    expect(await prep.preparatoryReport(school,first,year,child)).toBeNull()
    expect(await db.preparatoryValue.count({where:{institutionId:school}})).toBe(1)
  })
})
