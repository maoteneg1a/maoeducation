import { apiClient, getNativeAttachment } from './api-client'
import { Capacitor, registerPlugin } from '@capacitor/core'

const attachments = registerPlugin<{
  open(options: { data: string; mime: string; name: string; share: boolean }): Promise<void>
}>('AulekaAttachments')

/**
 * Abre (o descarga) un adjunto privado pasando por la API autenticada.
 * La pestaña se abre de inmediato (antes del await) para que el navegador no
 * la bloquee como popup; luego se le asigna el blob descargado.
 */
export async function openProtectedFile(path: string, fileName?: string, opts?: { download?: boolean }) {
  const endpoint = path.replace(/^\/?(api\/v1\/)?/, '')
  if (Capacitor.getPlatform() === 'android') {
    const file = await getNativeAttachment(endpoint)
    await attachments.open({ ...file, name: fileName ?? 'adjunto', share: !!opts?.download })
    return
  }
  const win = opts?.download ? null : window.open('', '_blank')
  try {
    const blob = await apiClient.get(endpoint).blob()
    const url = URL.createObjectURL(blob)
    if (win) {
      win.location.href = url
    } else {
      const a = document.createElement('a')
      a.href = url
      if (fileName) a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    win?.close()
    throw err
  }
}
