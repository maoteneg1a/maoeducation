import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/domain/errors/app.errors'
import { applyCommand, commandSchema, createGame, joinGame, LETTERS, nameSchema, publicGame, type GameState } from './stop-game.engine'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const joinSchema = z.object({ name: nameSchema }).strict()
const codeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/)
class RetryMutation extends Error {}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new BadRequestError(result.error.issues[0]?.message ?? 'Datos inválidos')
  return result.data
}
function roomCode(req: FastifyRequest) { return parse(codeSchema, (req.params as { code: string }).code.toUpperCase()) }
async function findRoom(code: string) {
  const room = await prisma.stopGameRoom.findUnique({ where: { code } })
  if (!room || room.expiresAt <= new Date()) throw new NotFoundError('La sala no existe o ya terminó su disponibilidad')
  return room
}
async function guest(req: FastifyRequest, code: string) {
  const token = req.headers.authorization?.match(/^Bearer (sg_[a-f0-9]{64})$/)?.[1]
  if (!token) throw new UnauthorizedError('Entra a la sala con tu nombre')
  const player = await prisma.stopGameGuest.findUnique({ where: { tokenHash: hash(token) } })
  const room = await findRoom(code)
  if (!player || player.roomId !== room.id) throw new UnauthorizedError('Tu acceso no corresponde a esta sala')
  if (!(room.state as unknown as GameState).players.some(p => p.id === player.id && !p.left)) throw new ForbiddenError('Ya no formas parte de esta sala')
  if (Date.now() - player.lastSeen.getTime() > 10_000) await prisma.stopGameGuest.update({ where: { id: player.id }, data: { lastSeen: new Date() } })
  return { room, player }
}
async function presence(roomId: string, currentId: string) {
  const players = await prisma.stopGameGuest.findMany({ where: { roomId }, select: { id: true, lastSeen: true } })
  return { offlineIds: players.filter(p => p.id !== currentId && Date.now() - p.lastSeen.getTime() > 60_000).map(p => p.id) }
}
export default async function stopGameRoutes(app: FastifyInstance) {
  app.addHook('onSend', async (_req, reply) => { reply.header('Cache-Control', 'no-store') })
  app.post('/games/stop/rooms', { config: { rateLimit: { max: 12, timeWindow: '1 hour' } }, bodyLimit: 2048 }, async req => {
    const { name } = parse(joinSchema, req.body)
    const id = randomUUID(), token = `sg_${randomBytes(32).toString('hex')}`
    // Las salas caducadas no conservan nombres ni respuestas indefinidamente.
    await prisma.stopGameRoom.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    for (let attempt = 0; attempt < 5; attempt++) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
      try {
        await prisma.stopGameRoom.create({ data: { code, state: json(createGame({ id, name })), expiresAt: new Date(Date.now() + 86_400_000), guests: { create: { id, tokenHash: hash(token) } } } })
        return { code, playerId: id, token }
      } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error }
    }
    throw new ConflictError('No se pudo crear la sala. Intenta otra vez.')
  })
  app.post('/games/stop/rooms/:code/join', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, bodyLimit: 2048 }, async req => {
    const code = roomCode(req), { name } = parse(joinSchema, req.body)
    const id = randomUUID(), token = `sg_${randomBytes(32).toString('hex')}`
    for (let attempt = 0; attempt < 8; attempt++) {
      const room = await findRoom(code), state = joinGame(room.state as unknown as GameState, { id, name })
      try {
        await prisma.$transaction(async tx => {
          const locked = await tx.stopGameRoom.updateMany({ where: { id: room.id, revision: room.revision }, data: { state: json(state), revision: { increment: 1 } } })
          if (!locked.count) throw new RetryMutation()
          await tx.stopGameGuest.create({ data: { id, roomId: room.id, tokenHash: hash(token) } })
        })
        return { code, playerId: id, token }
      } catch (error) { if (!(error instanceof RetryMutation)) throw error }
    }
    throw new ConflictError('La sala está ocupada guardando cambios. Vuelve a intentar.')
  })
  app.get('/games/stop/rooms/:code', { config: { rateLimit: { max: 2400, timeWindow: '1 minute' } } }, async req => {
    const code = roomCode(req), { room, player } = await guest(req, code)
    return { code, playerId: player.id, revision: room.revision, ...await presence(room.id, player.id), state: publicGame(room.state as unknown as GameState, player.id) }
  })
  app.post('/games/stop/rooms/:code/commands', { config: { rateLimit: { max: 1200, timeWindow: '1 minute' } }, bodyLimit: 8192 }, async req => {
    const code = roomCode(req), command = parse(commandSchema, req.body), auth = await guest(req, code)
    const { offlineIds } = await presence(auth.room.id, auth.player.id)
    for (let attempt = 0; attempt < 8; attempt++) {
      const room = attempt ? await findRoom(code) : auth.room
      const old = room.state as unknown as GameState
      const letters = LETTERS.filter(letter => !old.usedLetters.includes(letter))
      const state = applyCommand(old, auth.player.id, command, { roundId: randomUUID(), letter: letters[randomInt(Math.max(1, letters.length))], now: new Date().toISOString(), offlineIds })
      const saved = await prisma.stopGameRoom.updateMany({ where: { id: room.id, revision: room.revision }, data: { state: json(state), revision: { increment: 1 } } })
      if (saved.count) return { code, playerId: auth.player.id, revision: room.revision + 1, offlineIds, state: publicGame(state, auth.player.id) }
    }
    throw new ConflictError('Hay varios cambios a la vez. Intenta de nuevo.')
  })
}
