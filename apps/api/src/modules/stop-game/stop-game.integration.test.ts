import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../shared/infrastructure/database/prisma',async()=>{
 const {PrismaClient}=await import('@prisma/client')
 const url=process.env.STOP_GAME_TEST_DATABASE_URL??'postgresql://games:games-test-only@127.0.0.1:55441/games_test?schema=game_validation'
 const parsed=new URL(url)
 if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55441'||parsed.pathname!=='/games_test')throw Error('Only the disposable game database is allowed')
 return {prisma:new PrismaClient({datasources:{db:{url}}})}
})
import {prisma} from '../../shared/infrastructure/database/prisma'
import {errorPlugin} from '../../shared/infrastructure/plugins/error.plugin'
import routes from './stop-game.routes'
import type {GameState} from './stop-game.engine'
const suite=process.env.STOP_GAME_TEST_DATABASE_URL?describe:describe.skip
suite('guest game with PostgreSQL and real HTTP routes',()=>{
 const app=Fastify({logger:false})
 app.register(rateLimit,{max:10000});app.register(errorPlugin);app.register(routes,{prefix:'/api/v1'})
 const base='/api/v1/games/stop/rooms'
 type Session={code:string;playerId:string;token:string}
 let a:Session,b:Session,c:Session
 const get=(s:Session,code=s.code)=>app.inject({method:'GET',url:`${base}/${code}`,headers:{authorization:`Bearer ${s.token}`}})
 const command=(s:Session,body:Record<string,unknown>)=>app.inject({method:'POST',url:`${base}/${s.code}/commands`,headers:{authorization:`Bearer ${s.token}`},payload:body})
 const join=async(code:string,name:string)=>{const r=await app.inject({method:'POST',url:`${base}/${code}/join`,payload:{name}});expect(r.statusCode).toBe(200);return r.json<Session>()}
 beforeEach(async()=>{
  const r=await app.inject({method:'POST',url:base,payload:{name:'Ana'}});expect(r.statusCode).toBe(200);a=r.json()
  b=await join(a.code,'Bea');c=await join(a.code,'Carlos')
 })
 afterAll(async()=>{await app.close();await prisma.$disconnect()})
 const start=async()=>{await command(a,{type:'configure',config:{categories:['Nombre','Apellido','Objeto'],rounds:1,uniquePoints:20,repeatedPoints:7}});const r=await command(a,{type:'start'});expect(r.statusCode).toBe(200);return r.json().state as GameState}
 it('creates guests without school login and never returns secrets, school IDs, or other rooms',async()=>{
  const response=await get(a);expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toBe('no-store')
  expect(response.body).not.toContain(a.token);expect(response.body).not.toContain('tokenHash');expect(response.body).not.toContain('institutionId')
  const saved=await prisma.stopGameGuest.findUniqueOrThrow({where:{id:a.playerId}});expect(saved.tokenHash).not.toBe(a.token);expect(saved.tokenHash).toHaveLength(64)
  expect((await app.inject({method:'GET',url:`${base}/${a.code}`})).statusCode).toBe(401)
  expect((await get({...a,token:`sg_${'a'.repeat(64)}`})).statusCode).toBe(401)
  const other=await app.inject({method:'POST',url:base,payload:{name:'Otro'}})
  expect((await get(a,other.json().code)).statusCode).toBe(401)
 })
 it('rejects duplicate names, forged scores, non-host commands, and changes after starting',async()=>{
  expect((await app.inject({method:'POST',url:`${base}/${a.code}/join`,payload:{name:' ána '}})).statusCode).toBe(400)
  expect((await command(b,{type:'start'})).statusCode).toBe(403)
  expect((await command(a,{type:'start',score:999})).statusCode).toBe(400)
  const state=await start()
  expect((await command(a,{type:'configure',config:state.config})).statusCode).toBe(409)
  expect((await app.inject({method:'POST',url:`${base}/${a.code}/join`,payload:{name:'Tarde'}})).statusCode).toBe(409)
 })
 it('preserves concurrent joins, drafts and votes, hides words, and settles scores exactly once',async()=>{
  const joined=await Promise.all(['Diego','Elena'].map(name=>join(a.code,name)))
  const state=await start(),roundId=state.round!.id,letter=state.round!.letter
  const sessions=[a,b,c,...joined]
  const saves=await Promise.all(sessions.map((s,i)=>command(s,{type:'draft',roundId,sequence:1,words:[`${letter}na`,`${letter}pellido${i}`,`${letter}bjeto${i}`]})))
  expect(saves.every(r=>r.statusCode===200)).toBe(true)
  const hidden=(await get(b)).json().state as GameState
  expect(Object.keys(hidden.round!.drafts)).toEqual([b.playerId]);expect(hidden.players).toHaveLength(5)
  const stops=await Promise.all([a,b].map(s=>command(s,{type:'stop',roundId,sequence:2,words:[`${letter}na`,`${letter}pellido`,`${letter}bjeto`]})))
  expect(stops.map(r=>r.statusCode).sort()).toEqual([200,409])
  const frozen=(await get(a)).json().state as GameState
  expect(frozen.phase).toBe('review');expect(Object.keys(frozen.round!.drafts)).toHaveLength(5)
  expect((await command(c,{type:'draft',roundId,sequence:2,words:[`${letter}nuevo`,'','']})).statusCode).toBe(409)
  const dispute=await command(c,{type:'dispute',roundId,playerId:a.playerId,category:0});expect(dispute.statusCode).toBe(200)
  const key=Object.keys(dispute.json().state.round.disputes)[0]
  expect((await command(a,{type:'vote',roundId,key,value:true,playerId:b.playerId})).statusCode).toBe(400)
  const votes=await Promise.all([a,b,joined[0]].map(s=>command(s,{type:'vote',roundId,key,value:true})))
  expect(votes.every(r=>r.statusCode===200)).toBe(true)
  expect((await get(a)).json().state.round.disputes[key].verdict).toBe(true)
  const reviews=await Promise.all(sessions.map(s=>command(s,{type:'ready',roundId})));expect(reviews.every(r=>r.statusCode===200)).toBe(true)
  const scored=(await get(a)).json().state as GameState
  expect(scored.phase).toBe('finished');expect(scored.history).toHaveLength(1)
  expect(scored.round!.points[c.playerId]).toEqual([7,20,20])
  expect(scored.players.find(p=>p.id===c.playerId)!.score).toBe(47)
  expect((await command(a,{type:'ready',roundId})).statusCode).toBe(409)
  expect((await get(a)).json().state.history).toHaveLength(1)
 })
 it('checks presence on the server before replacing the host or excluding a player',async()=>{
  const state=await start()
  expect((await command(b,{type:'claimHost'})).statusCode).toBe(403)
  expect((await command(a,{type:'remove',playerId:b.playerId})).statusCode).toBe(403)
  await prisma.stopGameGuest.update({where:{id:a.playerId},data:{lastSeen:new Date(Date.now()-65_000)}})
  expect((await get(b)).json().offlineIds).toContain(a.playerId)
  expect((await command(b,{type:'claimHost'})).statusCode).toBe(200)
  expect((await command(b,{type:'remove',playerId:a.playerId})).statusCode).toBe(200)
  expect((await get(a)).statusCode).toBe(403)
  expect((await command(c,{type:'ready',roundId:randomUUID()})).statusCode).toBe(409)
  expect((await get(b)).json().state.round.id).toBe(state.round!.id)
 })
 it('persists a reconnect and expires the room independently of guest or school accounts',async()=>{
  const state=await start(),roundId=state.round!.id,l=state.round!.letter
  await command(a,{type:'draft',roundId,sequence:1,words:[`${l}na`,'','']})
  expect((await get({...a})).json().state.round.drafts[a.playerId].words[0]).toBe(`${l}na`)
  await prisma.stopGameRoom.update({where:{code:a.code},data:{expiresAt:new Date(Date.now()-1)}})
  expect((await get(a)).statusCode).toBe(404)
  expect((await app.inject({method:'POST',url:`${base}/${a.code}/join`,payload:{name:'Nuevo'}})).statusCode).toBe(404)
 })
})
