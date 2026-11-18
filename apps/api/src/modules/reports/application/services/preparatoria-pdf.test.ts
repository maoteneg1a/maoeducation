import PDFDocument from 'pdfkit'
import { describe, expect, it } from 'vitest'
import type { BulletinPdfData } from './bulletin-pdf.service'
import { drawPreparatoryBulletin } from './preparatoria-pdf'
import { AMBITS, CATALOG, scaleFor } from '../../../preparatoria/domain/preparatoria-policy'

describe('preparatoria PDF layout',()=>{
 it('preserves long recommendations and all students without overlaps or automatic footer pages',()=>{
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:24,bufferPages:true});doc.on('data',()=>{})
  const boxes:Array<{page:unknown;x:number;y:number;width:number;height:number;text:string}>=[]
  const original=doc.text.bind(doc)
  doc.text=((value:string,x:number,y:number,options:PDFKit.Mixins.TextOptions)=>{boxes.push({page:doc.page,x,y,width:options.width!,height:doc.heightOfString(value,options),text:value});return original(value,x,y,options)}) as typeof doc.text
  const data={institutionName:'Escuela de ejemplo con nombre institucional extenso',title:'Informe de aprendizajes',studentName:'APELLIDOS COMPUESTOS NOMBRES DEL ESTUDIANTE',studentDni:'EJEMPLO',levelName:'Primero de Básica',parallelName:'A',yearName:'2026-2027',tutorName:'Apellidos Nombres',periods:[{id:'p1',name:'Primer trimestre'},{id:'p2',name:'Segundo trimestre'},{id:'p3',name:'Tercer trimestre'}],attendanceByPeriod:[],behaviorByPeriod:[],recommendations:[],directorName:'Autoridad de ejemplo',preparatoria:{catalogVersion:CATALOG.version,scaleVersion:'2026-00082A',scale:scaleFor('2026-00082A'),ambits:AMBITS,rows:CATALOG.items.slice(0,20).map(i=>({...i,periods:{p1:{selected:true,code:'NE',notes:''}}})),comments:[{periodId:'p1',text:('Observación y recomendaciones de seguimiento.\n\n').repeat(120)+'FIN_RECOMENDACIONES'}]}} as unknown as BulletinPdfData
  drawPreparatoryBulletin(doc,data,null)
  expect(doc.bufferedPageRange().count).toBeGreaterThan(3)
  expect(boxes.map(b=>b.text).join('')).toContain('FIN_RECOMENDACIONES')
  for(const box of boxes){expect(box.y).toBeGreaterThanOrEqual(24);expect(box.y+box.height,box.text.slice(0,60)).toBeLessThanOrEqual(box.text.startsWith('Auleka')?595.28:595.28-42+0.1)}
  boxes.forEach((a,index)=>{for(const b of boxes.slice(index+1)){
   if(a.page!==b.page)continue
   const intersects=a.x<b.x+b.width-0.1&&b.x<a.x+a.width-0.1&&a.y<b.y+b.height-0.1&&b.y<a.y+a.height-0.1
   expect(intersects,`Overlap: ${a.text.slice(0,35)} / ${b.text.slice(0,35)}`).toBe(false)
  }})
  doc.end()
 })
})
