export interface GameConfig { categories: string[]; rounds: number; uniquePoints: number; repeatedPoints: number }
export interface GuestSession { code: string; playerId: string; token: string }
export interface GameState {
 hostId: string; phase: 'lobby'|'playing'|'review'|'results'|'finished'; config: GameConfig
 players: { id: string; name: string; left: boolean; score: number }[]
 round: null | { id: string; number: number; letter: string; participants: string[]; drafts: Record<string,{words:string[];sequence:number}>; disputes: Record<string,{key:string;category:number;word:string;votes:Record<string,boolean>;verdict:boolean|null}>; ready: string[]; stoppedBy: string | null; points: Record<string,number[]>; startedAt: string }
 history: { number:number;letter:string;totals:Record<string,number> }[]; message: string | null
}
export interface RoomView { code:string;playerId:string;revision:number;offlineIds:string[];state:GameState }
const base = `${import.meta.env.VITE_API_URL ?? ''}/api/v1/games/stop/rooms`
export async function gameRequest<T>(path:string, session?:GuestSession, body?:unknown, signal?:AbortSignal):Promise<T> {
 const response = await fetch(base+path,{method:body===undefined?'GET':'POST',credentials:'omit',headers:{...(session?{Authorization:`Bearer ${session.token}`}:{ }),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal})
 const result=await response.json()
 if(!response.ok)throw Object.assign(new Error(result.error?.message??result.message??'No se pudo conectar con la sala'),{status:response.status})
 return result
}
export const sessionKey=(code:string)=>`auleka-stop:${code}`
export function loadGuest(code:string):GuestSession|null {
 try {const value=JSON.parse(localStorage.getItem(sessionKey(code))??'null');return value?.code===code&&typeof value.token==='string'&&typeof value.playerId==='string'?value:null}catch{return null}
}
export const normalizeWord=(text:string)=>text.trim().toLocaleUpperCase('es').replace(/Ñ/g,'\u0000').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0000/g,'Ñ').replace(/\s+/g,' ')
