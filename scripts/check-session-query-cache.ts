import assert from 'node:assert/strict'
import { queryClient } from '../apps/web/src/shared/lib/query-client'
import { useAuthStore, type AuthUser } from '../apps/web/src/store/auth.store'

async function check() {
  const teacher = { id: 'teacher', institutionId: 'school' } as AuthUser
  const rector = { id: 'rector', institutionId: 'school' } as AuthUser
  useAuthStore.getState().setAuth(teacher, 'token-a')
  queryClient.setQueryData(['formal-report', 'report'], { canReceive: false })
  useAuthStore.getState().setAccessToken('token-a-refreshed')
  assert.deepEqual(queryClient.getQueryData(['formal-report', 'report']), { canReceive: false })
  const teacherClient = queryClient
  useAuthStore.getState().setAuth(rector, 'token-b')
  teacherClient.setQueryData(['late-mutation-report'], 'old-teacher-response')
  assert.equal(queryClient.getQueryData(['late-mutation-report']), undefined)
  assert.equal(queryClient.getQueryData(['formal-report', 'report']), undefined)
  queryClient.setQueryData(['formal-reports', 'inbox'], ['rector-only'])
  useAuthStore.getState().setAuth({ ...rector, institutionId: 'other-school' }, 'token-c')
  assert.equal(queryClient.getQueryData(['formal-reports', 'inbox']), undefined)
  queryClient.setQueryData(['student'], 'student-a')
  useAuthStore.getState().setGuardianStudentId('student-b')
  assert.equal(queryClient.getQueryData(['student']), undefined)
  queryClient.setQueryData(['private'], 'data')
  useAuthStore.getState().clearAuth()
  assert.equal(queryClient.getQueryData(['private']), undefined)
  useAuthStore.getState().setAuth(teacher, 'token-a')
  let finish!: (value: string) => void
  const oldRequest = queryClient.fetchQuery({ queryKey: ['late-report'], queryFn: () => new Promise<string>((resolve) => { finish = resolve }) }).catch(() => undefined)
  useAuthStore.getState().setAuth(rector, 'token-b')
  finish('teacher-data')
  await oldRequest
  assert.equal(queryClient.getQueryData(['late-report']), undefined)
  console.log('PASS: cambio de usuario, institución, alumno, cierre de sesión y respuesta tardía limpian el caché; renovar token lo conserva.')
}
check().catch((error) => { console.error(error); process.exitCode = 1 })
