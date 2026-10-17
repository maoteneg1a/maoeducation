const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const visible = (element) => !!element && element.getClientRects().length > 0
const buttons = () => [...document.querySelectorAll('button, input[type="button"], input[type="submit"]')]
const buttonNamed = (name) => buttons().find((button) => visible(button) && button.textContent.trim().toLowerCase().includes(name))
const disabled = (element) => element.disabled || element.getAttribute('aria-disabled') === 'true'
const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase()

function gradeNumber(value) {
  const normalized = normalize(value)
  const numeric = normalized.match(/\b(\d{1,2})(?:RO|DO|TO|MO|VO)?\b/)
  if (numeric) return Number(numeric[1])
  const words = {
    PRIMERO: 1, SEGUNDO: 2, TERCERO: 3, CUARTO: 4, QUINTO: 5,
    SEXTO: 6, SEPTIMO: 7, OCTAVO: 8, NOVENO: 9, DECIMO: 10,
  }
  const match = Object.entries(words).find(([word]) => normalized.includes(word))
  return match?.[1] ?? null
}

function validateAcademicContext(payload) {
  const expectedSubject = normalize(payload.subject)
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, legend')]
    .filter(visible)
    .map((element) => normalize(element.textContent))
  const subjectHeading = headings.find((heading) => heading.includes(expectedSubject))
  if (!subjectHeading) {
    throw new Error(`La página abierta no corresponde a la materia ${payload.subject}`)
  }
  const expectedGrade = gradeNumber(payload.level)
  const visibleGrade = gradeNumber(subjectHeading)
  if (!expectedGrade || !visibleGrade) {
    throw new Error('No se pudo verificar el grado en el encabezado de Educar Ecuador')
  }
  if (expectedGrade !== visibleGrade) {
    throw new Error(`Grado incorrecto: Auleka preparó ${payload.level}, pero Educar Ecuador muestra ${subjectHeading}`)
  }
  return { subjectHeading, expectedGrade }
}

async function goFirstPage() {
  for (let count = 0; count < 30; count += 1) {
    const previous = buttonNamed('anterior')
    if (!previous || disabled(previous)) break
    previous.click()
    await wait(650)
  }
}

function currentRows() {
  return [...document.querySelectorAll('tr')].filter(visible)
}

async function collect(payload, apply) {
  const academicContext = validateAcademicContext(payload)
  const wanted = new Map(payload.grades.map((item) => [String(item.dni), item]))
  const found = new Map()
  const saved = []
  const failed = []
  await goFirstPage()

  for (let page = 1; page <= 40; page += 1) {
    for (const row of currentRows()) {
      const text = row.textContent.replace(/\s+/g, ' ').trim()
      const item = [...wanted.values()].find((grade) => text.includes(String(grade.dni)))
      if (!item || found.has(item.dni)) continue
      const input = row.querySelector('input[type="number"], input:not([type]), input[type="text"]')
      const current = input?.value?.trim() ?? ''
      const isBlocked = !input || disabled(input) || input.readOnly
      const same = Number(current) === Number(item.grade)
      found.set(item.dni, { dni: item.dni, name: item.name, grade: item.grade, current, blocked: isBlocked, same, page })

      if (apply && !isBlocked && !same) {
        try {
          input.focus()
          input.value = String(item.grade)
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(item.grade) }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
          input.blur()
          await wait(500)
          saved.push(item.dni)
        } catch (error) {
          failed.push({ dni: item.dni, reason: error.message })
        }
      }
    }
    if (found.size === wanted.size) break
    const next = buttonNamed('siguiente')
    if (!next || disabled(next)) break
    next.click()
    await wait(650)
  }

  const rows = [...found.values()]
  return {
    academicContext,
    matches: rows.filter((row) => !row.blocked && !row.same),
    unchanged: rows.filter((row) => row.same),
    blocked: rows.filter((row) => row.blocked),
    missing: payload.grades.filter((item) => !found.has(item.dni)),
    saved: saved.length,
    failed: failed.length,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!['AULEKA_PREVIEW', 'AULEKA_APPLY'].includes(message.type)) return
  collect(message.payload, message.type === 'AULEKA_APPLY')
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }))
  return true
})
