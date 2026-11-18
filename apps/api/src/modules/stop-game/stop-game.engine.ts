import { z } from 'zod'
import { BadRequestError, ConflictError, ForbiddenError } from '../../shared/domain/errors/app.errors'

export const DEFAULT_CATEGORIES = ['Nombre', 'Apellido', 'Animal', 'Color', 'País', 'Ciudad', 'Fruta', 'Cosa u objeto']
export const LETTERS = [...'ABCDEFGHIJLMNOPRSTUV']
export const normalizeWord = (text: string) => text.trim().toLocaleUpperCase('es').replace(/Ñ/g, '\u0000').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0000/g, 'Ñ').replace(/\s+/g, ' ')
export const nameSchema = z.string().trim().min(2).max(25).refine(s => !/[\u0000-\u001f\u007f]/.test(s), 'Nombre inválido')
export const configSchema = z.object({
  categories: z.array(z.string().trim().min(2).max(30)).min(3).max(12).refine(v => new Set(v.map(normalizeWord)).size === v.length, 'No repitas categorías'),
  rounds: z.number().int().min(1).max(10),
  uniquePoints: z.number().int().min(1).max(100),
  repeatedPoints: z.number().int().min(0).max(100),
}).strict().refine(v => v.repeatedPoints <= v.uniquePoints, 'La respuesta repetida no puede valer más que la única')
export type GameConfig = z.infer<typeof configSchema>
export const DEFAULT_CONFIG: GameConfig = { categories: DEFAULT_CATEGORIES, rounds: 5, uniquePoints: 10, repeatedPoints: 5 }
export interface Player { id: string; name: string; left: boolean; score: number }
export interface Draft { words: string[]; sequence: number }
export interface Dispute { key: string; category: number; word: string; votes: Record<string, boolean>; verdict: boolean | null }
export interface Round {
  id: string; number: number; letter: string; participants: string[]; drafts: Record<string, Draft>
  disputes: Record<string, Dispute>; ready: string[]; stoppedBy: string | null
  points: Record<string, number[]>; startedAt: string
}
export interface GameState {
  hostId: string; phase: 'lobby' | 'playing' | 'review' | 'results' | 'finished'
  config: GameConfig; players: Player[]; round: Round | null; usedLetters: string[]
  history: { number: number; letter: string; totals: Record<string, number> }[]; message: string | null
}
const wordsSchema = z.array(z.string().max(80)).max(12)
const roundIdSchema = z.string().uuid()
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('configure'), config: configSchema }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('remove'), playerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('claimHost') }).strict(),
  z.object({ type: z.literal('draft'), roundId: roundIdSchema, sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), words: wordsSchema }).strict(),
  z.object({ type: z.literal('stop'), roundId: roundIdSchema, sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), words: wordsSchema }).strict(),
  z.object({ type: z.literal('ready'), roundId: roundIdSchema }).strict(),
  z.object({ type: z.literal('vote'), roundId: roundIdSchema, key: z.string().min(1).max(512), value: z.boolean() }).strict(),
  z.object({ type: z.literal('dispute'), roundId: roundIdSchema, playerId: z.string().uuid(), category: z.number().int().min(0).max(11) }).strict(),
  z.object({ type: z.literal('next'), roundId: roundIdSchema }).strict(),
])
export type Command = z.infer<typeof commandSchema>
export const disputeKey = (category: number, word: string) => `${category}:${normalizeWord(word)}`
export const startsWithLetter = (word: string, letter: string) => normalizeWord(word).startsWith(letter)
export function createGame(player: { id: string; name: string }): GameState {
  return { hostId: player.id, phase: 'lobby', config: structuredClone(DEFAULT_CONFIG), players: [{ ...player, left: false, score: 0 }], round: null, usedLetters: [], history: [], message: null }
}
export function joinGame(input: GameState, player: { id: string; name: string }) {
  const state = structuredClone(input)
  if (state.phase !== 'lobby') throw new ConflictError('La partida ya empezó. Puedes volver a entrar desde el navegador donde te uniste.')
  if (state.players.filter(p => !p.left).length >= 12 || state.players.length >= 40) throw new BadRequestError('La sala está completa')
  if (state.players.some(p => !p.left && normalizeWord(p.name) === normalizeWord(player.name))) throw new BadRequestError('Ese nombre ya está en la sala. Usa otro para distinguirte.')
  state.players.push({ ...player, left: false, score: 0 })
  return state
}
function active(state: GameState) { return state.players.filter(p => !p.left) }
function electorate(state: GameState) { return state.round!.participants.filter(id => state.players.some(p => p.id === id && !p.left)) }
function settleDisputes(state: GameState) {
  const voters = electorate(state)
  for (const dispute of Object.values(state.round!.disputes)) {
    const yes = voters.filter(id => dispute.votes[id] === true).length
    const no = voters.filter(id => dispute.votes[id] === false).length
    if (dispute.verdict === null) {
      if (yes > voters.length / 2) dispute.verdict = true
      else if (no > voters.length / 2 || yes + no === voters.length) dispute.verdict = false
    }
  }
}
function finishReview(state: GameState) {
  settleDisputes(state)
  const round = state.round!, voters = electorate(state)
  if (Object.values(round.disputes).some(d => d.verdict === null) || !voters.every(id => round.ready.includes(id))) return
  const valid = (id: string, category: number) => {
    const word = round.drafts[id]?.words[category] ?? ''
    return !!normalizeWord(word) && startsWithLetter(word, round.letter) && round.disputes[disputeKey(category, word)]?.verdict !== false
  }
  const totals: Record<string, number> = {}
  for (const id of round.participants) {
    round.points[id] = state.config.categories.map((_, category) => {
      if (!valid(id, category)) return 0
      const word = normalizeWord(round.drafts[id].words[category])
      const count = round.participants.filter(other => valid(other, category) && normalizeWord(round.drafts[other].words[category]) === word).length
      return count > 1 ? state.config.repeatedPoints : state.config.uniquePoints
    })
    totals[id] = round.points[id].reduce((a,b) => a+b, 0)
    state.players.find(p => p.id === id)!.score += totals[id]
  }
  state.history.push({ number: round.number, letter: round.letter, totals })
  state.phase = round.number >= state.config.rounds ? 'finished' : 'results'
}
export function applyCommand(input: GameState, actor: string, command: Command, context: { roundId: string; letter: string; now: string; offlineIds: string[] }): GameState {
  const state = structuredClone(input)
  if (!state.players.some(p => p.id === actor && !p.left)) throw new ForbiddenError('Ya no formas parte de esta sala')
  const hostOnly = () => { if (state.hostId !== actor) throw new ForbiddenError('Solo quien organiza puede hacer esto') }
  const inPhase = (phase: GameState['phase']) => { if (state.phase !== phase) throw new ConflictError('La partida cambió. Actualiza la sala para continuar.') }
  if ('roundId' in command && state.round?.id !== command.roundId) throw new ConflictError('Esta acción pertenece a otra ronda')
  switch (command.type) {
    case 'configure': hostOnly(); inPhase('lobby'); state.config = command.config; break
    case 'claimHost':
      if (!context.offlineIds.includes(state.hostId)) throw new ForbiddenError('Quien organiza sigue conectado')
      state.hostId = actor; break
    case 'leave': case 'remove': {
      const target = command.type === 'leave' ? actor : command.playerId
      if (command.type === 'remove') {
        hostOnly()
        if (target === actor) throw new BadRequestError('Usa Salir para abandonar la sala')
        if (state.phase !== 'lobby' && !context.offlineIds.includes(target)) throw new ForbiddenError('Solo puedes retirar jugadores desconectados')
      }
      const player = state.players.find(p => p.id === target && !p.left)
      if (!player) throw new BadRequestError('El jugador ya salió')
      player.left = true
      if (state.hostId === target) state.hostId = active(state)[0]?.id ?? actor
      if (state.phase !== 'lobby' && state.phase !== 'finished' && active(state).length < 2) {
        state.phase = 'finished'; state.message = 'La partida terminó porque quedan menos de dos jugadores.'
      } else if (state.phase === 'review') finishReview(state)
      break
    }
    case 'start': case 'next': {
      hostOnly(); inPhase(command.type === 'start' ? 'lobby' : 'results')
      if (active(state).length < 2) throw new BadRequestError('Necesitan al menos dos jugadores')
      if (!LETTERS.includes(context.letter) || state.usedLetters.includes(context.letter)) throw new ConflictError('La letra ya se utilizó')
      state.usedLetters.push(context.letter)
      state.round = { id: context.roundId, number: (state.round?.number ?? 0) + 1, letter: context.letter, participants: active(state).map(p => p.id), drafts: {}, disputes: {}, ready: [], stoppedBy: null, points: {}, startedAt: context.now }
      state.phase = 'playing'; break
    }
    case 'draft': case 'stop': {
      inPhase('playing')
      const round = state.round!
      if (command.words.length !== state.config.categories.length) throw new BadRequestError('Completa las categorías de esta sala')
      if (!round.participants.includes(actor)) throw new ForbiddenError()
      if (command.type === 'stop' && command.sequence <= (round.drafts[actor]?.sequence ?? 0)) throw new ConflictError('Tus respuestas cambiaron. Guarda y vuelve a hacer STOP.')
      if (command.type === 'stop' && command.words.some(word => !normalizeWord(word) || !startsWithLetter(word, round.letter))) throw new BadRequestError('Para hacer STOP completa todas las categorías con la letra de la ronda')
      if (command.sequence > (round.drafts[actor]?.sequence ?? 0)) round.drafts[actor] = { words: command.words.map(w => w.trim()), sequence: command.sequence }
      if (command.type === 'stop') { round.stoppedBy = actor; state.phase = 'review' }
      break
    }
    case 'ready': {
      inPhase('review')
      if (!state.round!.ready.includes(actor)) state.round!.ready.push(actor)
      finishReview(state); break
    }
    case 'vote': {
      inPhase('review')
      const dispute = state.round!.disputes[command.key]
      if (!dispute || dispute.verdict !== null) throw new ConflictError('Esta palabra ya no tiene una votación pendiente')
      if (dispute.votes[actor] !== undefined && dispute.votes[actor] !== command.value) throw new ConflictError('Tu voto ya fue registrado')
      dispute.votes[actor] = command.value
      finishReview(state); break
    }
    case 'dispute': {
      inPhase('review')
      const round = state.round!
      if (!round.participants.includes(command.playerId) || command.category >= state.config.categories.length) throw new BadRequestError('Respuesta no encontrada')
      const word = round.drafts[command.playerId]?.words[command.category] ?? ''
      if (!normalizeWord(word) || !startsWithLetter(word, round.letter)) throw new BadRequestError('Las respuestas vacías o con otra letra ya valen cero')
      const key = disputeKey(command.category, word)
      if (!round.disputes[key]) {
        round.disputes[key] = { key, category: command.category, word, votes: { [actor]: false }, verdict: null }
        round.ready = []
      }
      finishReview(state); break
    }
  }
  return state
}
/** Durante la ronda cada invitado recibe exclusivamente sus propias palabras. */
export function publicGame(state: GameState, actor: string) {
  const output = structuredClone(state)
  if (output.phase === 'playing' && output.round) output.round.drafts = output.round.drafts[actor] ? { [actor]: output.round.drafts[actor] } : {}
  return output
}
