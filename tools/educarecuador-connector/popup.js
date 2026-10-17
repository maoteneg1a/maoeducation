const fileInput = document.querySelector('#file')
const summary = document.querySelector('#summary')
const results = document.querySelector('#results')
const scanButton = document.querySelector('#scan')
const applyButton = document.querySelector('#apply')
const status = document.querySelector('#status')
let payload = null
let preview = null

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url?.startsWith('https://academico.educarecuador.gob.ec/')) {
    throw new Error('Abre primero Educar Ecuador en esta pestaña')
  }
  return tab
}

fileInput.addEventListener('change', async () => {
  try {
    payload = JSON.parse(await fileInput.files[0].text())
    if (payload?.format !== 'auleka-educarecuador-grades' || !Array.isArray(payload.grades)) {
      throw new Error('El archivo no fue generado por Auleka')
    }
    summary.hidden = false
    if (payload.gradeType !== 'trimester_final_average') throw new Error('El archivo no contiene promedios finales del trimestre')
    summary.innerHTML = `<strong>${payload.subject}</strong><br>Grado: ${payload.level}<br>Paralelo: ${payload.parallel}<br>${payload.grades.length} promedios finales del trimestre`
    scanButton.disabled = false
    applyButton.disabled = true
    results.hidden = true
    status.textContent = ''
  } catch (error) {
    payload = null
    scanButton.disabled = true
    status.textContent = error.message
  }
})

scanButton.addEventListener('click', async () => {
  try {
    status.textContent = 'Buscando estudiantes en todas las páginas…'
    const tab = await activeTab()
    preview = await chrome.tabs.sendMessage(tab.id, { type: 'AULEKA_PREVIEW', payload })
    if (!preview?.ok) throw new Error(preview?.error || 'No se pudo revisar la página')
    results.hidden = false
    results.innerHTML = `<strong>Contexto verificado</strong><br>${preview.academicContext.subjectHeading}<br><span class="warn">Confirma visualmente el paralelo ${payload.parallel}.</span><br><br><strong>Previsualización</strong><ul>
      <li class="ok">${preview.matches.length} encontrados y editables</li>
      <li class="warn">${preview.unchanged.length} ya tienen la misma nota</li>
      <li class="bad">${preview.blocked.length} campos bloqueados</li>
      <li class="bad">${preview.missing.length} no encontrados</li>
    </ul>`
    applyButton.disabled = preview.matches.length === 0
    status.textContent = 'Revisa el resumen antes de confirmar.'
  } catch (error) {
    status.textContent = error.message
  }
})

applyButton.addEventListener('click', async () => {
  if (!confirm(`Se escribirán ${preview.matches.length} notas. ¿Continuar?`)) return
  try {
    applyButton.disabled = true
    status.textContent = 'Cargando y verificando notas…'
    const tab = await activeTab()
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AULEKA_APPLY', payload })
    if (!response?.ok) throw new Error(response?.error || 'La carga no pudo completarse')
    status.textContent = `Listo: ${response.saved} notas procesadas y ${response.failed} con novedad.`
  } catch (error) {
    status.textContent = error.message
    applyButton.disabled = false
  }
})
