import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { applyCommand, commandSchema, configSchema, createGame, disputeKey, joinGame, normalizeWord, publicGame, type Command, type GameState } from './stop-game.engine'
const a=randomUUID(),b=randomUUID(),c=randomUUID()
const context={roundId:randomUUID(),letter:'A',now:new Date().toISOString(),offlineIds:[] as string[]}
const run=(state:GameState,actor:string,command:Command)=>applyCommand(state,actor,command,context)
function lobby(n=3){let state=createGame({id:a,name:'Ana'});state=joinGame(state,{id:b,name:'Bea'});if(n===3)state=joinGame(state,{id:c,name:'Carlos'});state.config={categories:['Nombre','País','Color'],rounds:2,uniquePoints:10,repeatedPoints:5};return state}
function playing(n=3){return run(lobby(n),a,{type:'start'})}
function draft(state:GameState,id:string,words:string[],sequence=1){return run(state,id,{type:'draft',roundId:state.round!.id,sequence,words})}
function stop(state:GameState){return run(state,a,{type:'stop',roundId:state.round!.id,sequence:2,words:['Ana','Argentina','Azul']})}
function ready(state:GameState){for(const id of state.round!.participants.filter(id=>!state.players.find(p=>p.id===id)!.left)){state=run(state,id,{type:'ready',roundId:state.round!.id})}return state}
describe('Párame la mano: reglas y estados del servidor',()=>{
 it('valida categorías, puntos y nombres sin duplicar a los invitados',()=>{
  expect(configSchema.safeParse({...lobby().config,categories:['Color','COLOR','País']}).success).toBe(false)
  expect(configSchema.safeParse({...lobby().config,repeatedPoints:11}).success).toBe(false)
  expect(()=>joinGame(lobby(),{id:randomUUID(),name:' ANA '})).toThrow('nombre')
  expect(normalizeWord('  ángel ')).toBe('ANGEL');expect(normalizeWord('Ñandú')).toBe('ÑANDU')
 })
 it('solo el anfitrión inicia con dos personas y nadie cambia ajustes durante la ronda',()=>{
  expect(()=>run(lobby(),b,{type:'start'})).toThrow('organiza')
  expect(()=>run(createGame({id:a,name:'Ana'}),a,{type:'start'})).toThrow('dos')
  expect(()=>run(playing(),a,{type:'configure',config:lobby().config})).toThrow('cambió')
  expect(()=>joinGame(playing(),{id:randomUUID(),name:'Nuevo'})).toThrow('empezó')
 })
 it('oculta las respuestas de los otros jugadores hasta STOP y conserva las propias al recargar',()=>{
  let state=draft(playing(),a,['Ana','Argentina','Azul']);state=draft(state,b,['Ana','Alemania','Amarillo'])
  expect(Object.keys(publicGame(state,a).round!.drafts)).toEqual([a])
  expect(state.round!.drafts[b].words[1]).toBe('Alemania')
  const review=stop(state);expect(Object.keys(publicGame(review,a).round!.drafts)).toHaveLength(2)
 })
 it('STOP exige terminar con la letra correcta y congela las respuestas en el servidor',()=>{
  const state=playing()
  for(const words of [['Ana','','Azul'],['Ana','Brasil','Azul']])expect(()=>run(state,a,{type:'stop',roundId:state.round!.id,sequence:1,words})).toThrow('completa')
  const review=stop(state)
  expect(()=>draft(review,b,['Cambio','Cambio','Cambio'])).toThrow('cambió')
  expect(review.phase).toBe('review')
 })
 it('ignora borradores antiguos y no deja que un STOP antiguo reemplace uno más reciente',()=>{
  const state=draft(playing(),a,['Alicia','Argentina','Azul'],5)
  expect(draft(state,a,['Ana','Argentina','Azul'],2).round!.drafts[a].words[0]).toBe('Alicia')
  expect(()=>stop(state)).toThrow('cambiaron')
 })
 it('puntúa iguales, únicas, vacías y otra letra con ajustes de la sala',()=>{
  let state=draft(playing(),b,['ANA','Alemania','amarillo']);state=draft(state,c,['Ángela','','Rojo']);state=stop(state)
  expect(run(state,a,{type:'ready',roundId:state.round!.id}).phase).toBe('review')
  state=ready(state)
  expect(state.round!.points[a]).toEqual([5,10,10]);expect(state.round!.points[b]).toEqual([5,10,10]);expect(state.round!.points[c]).toEqual([10,0,0])
  expect(state.players.find(p=>p.id===a)!.score).toBe(25);expect(state.history).toHaveLength(1)
 })
 it('vota solo conflictos, aplica una votación a palabras repetidas y decide por mayoría',()=>{
  let state=draft(playing(),b,['Ana','Alemania','Amarillo']);state=stop(state)
  expect(()=>run(state,a,{type:'vote',roundId:state.round!.id,key:'inexistente',value:true})).toThrow('votación')
  state=run(state,c,{type:'dispute',roundId:state.round!.id,playerId:a,category:0})
  const key=disputeKey(0,'ANA')
  state=run(state,a,{type:'vote',roundId:state.round!.id,key,value:true})
  expect(state.round!.disputes[key].verdict).toBeNull()
  state=run(state,b,{type:'vote',roundId:state.round!.id,key,value:true})
  expect(state.round!.disputes[key].verdict).toBe(true)
  state=ready(state);expect(state.round!.points[a][0]).toBe(5);expect(state.round!.points[b][0]).toBe(5)
 })
 it('una mayoría contraria invalida la respuesta y los demás puntos se conservan',()=>{
  let state=stop(playing()),key=disputeKey(1,'Argentina')
  state=run(state,b,{type:'dispute',roundId:state.round!.id,playerId:a,category:1})
  state=run(state,c,{type:'vote',roundId:state.round!.id,key,value:false})
  state=ready(state);expect(state.round!.points[a]).toEqual([10,0,10])
 })
 it('el empate no suma y la revisión no finaliza mientras haya conflictos pendientes',()=>{
  let state=stop(playing(2)),key=disputeKey(1,'Argentina')
  state=run(state,b,{type:'dispute',roundId:state.round!.id,playerId:a,category:1})
  state=ready(state);expect(state.phase).toBe('review')
  state=run(state,a,{type:'vote',roundId:state.round!.id,key,value:true})
  expect(state.phase).toBe('results');expect(state.round!.points[a][1]).toBe(0)
 })
 it('abrir un conflicto nuevo exige revisar de nuevo y no vota respuestas vacías o de otra letra',()=>{
  let state=stop(playing())
  state=run(state,a,{type:'ready',roundId:state.round!.id})
  state=run(state,b,{type:'dispute',roundId:state.round!.id,playerId:a,category:0})
  expect(state.round!.ready).toEqual([])
  expect(()=>run(state,c,{type:'dispute',roundId:state.round!.id,playerId:c,category:0})).toThrow('vacías')
 })
 it('la siguiente ronda usa otra letra, rechaza acciones antiguas y acumula puntos hasta el final',()=>{
  let state=ready(stop(playing(2)));const oldId=state.round!.id
  expect(()=>run(state,a,{type:'next',roundId:oldId})).toThrow('utilizó')
  state=applyCommand(state,a,{type:'next',roundId:oldId},{...context,roundId:randomUUID(),letter:'B'})
  expect(()=>run(state,a,{type:'draft',roundId:oldId,sequence:5,words:['Ana','Argentina','Azul']})).toThrow('otra ronda')
  state=run(state,a,{type:'stop',roundId:state.round!.id,sequence:1,words:['Bea','Brasil','Blanco']})
  state=ready(state);expect(state.phase).toBe('finished');expect(state.players.find(p=>p.id===a)!.score).toBe(60)
  expect(state.history).toHaveLength(2)
 })
 it('cambia anfitrión al salir y solo permite recuperar o retirar tras desconexión comprobada',()=>{
  const state=lobby()
  expect(run(state,a,{type:'leave'}).hostId).toBe(b)
  expect(()=>run(playing(),a,{type:'remove',playerId:b})).toThrow('desconectados')
  expect(()=>run(state,b,{type:'claimHost'})).toThrow('organiza')
  expect(applyCommand(state,b,{type:'claimHost'},{...context,offlineIds:[a]}).hostId).toBe(b)
  expect(()=>run(state,randomUUID(),{type:'ready',roundId:context.roundId})).toThrow('formas parte')
 })
 it('las órdenes no aceptan puntos, votos ajenos ni propiedades arbitrarias',()=>{
  expect(commandSchema.safeParse({type:'ready',roundId:context.roundId,score:100}).success).toBe(false)
  expect(commandSchema.safeParse({type:'vote',roundId:context.roundId,key:'0:ANA',value:true,playerId:a}).success).toBe(false)
 })
})
