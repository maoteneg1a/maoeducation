import { apiGet, apiPost, apiClient } from '@/shared/lib/api-client'

export interface MessageAttachment {
  id: string
  fileName: string
  storedName: string
  mimeType: string
  fileSize: number
  createdAt: string
}

export interface MessageSender {
  id: string
  profile: { firstName: string; lastName: string }
}

export interface MessageRecipient {
  recipientId: string
  isRead: boolean
  recipient: MessageSender
}

export interface Message {
  id: string
  body: string
  sentAt: string
  sender: MessageSender
  recipients: MessageRecipient[]
  attachments: MessageAttachment[]
}

export interface MessageThread {
  id: string
  subject: string
  createdAt: string
  firstMessageId?: string
  creator: MessageSender
  messages: Message[]
}

export interface UserOption {
  id: string
  fullName: string
  email: string
  roles: string[]
}

export function listThreads() {
  return apiGet<MessageThread[]>('messages/threads')
}

export function getThread(id: string) {
  return apiGet<MessageThread>(`messages/threads/${id}`)
}

export function createThread(data: { subject: string; recipientIds: string[]; body: string }) {
  return apiPost<MessageThread>('messages/threads', data)
}

export function replyToThread(threadId: string, data: { body: string; recipientIds?: string[] }) {
  return apiPost<Message>(`messages/threads/${threadId}/reply`, data)
}

export function getUnreadCount() {
  return apiGet<{ count: number }>('messages/unread-count')
}

export function getRecipients(q?: string) {
  return apiGet<UserOption[]>('messages/recipients', q ? { q } : undefined)
}

export function uploadMessageAttachment(messageId: string, file: File): Promise<MessageAttachment> {
  const form = new FormData()
  form.append('file', file)
  return apiClient.post(`messages/${messageId}/attachments`, { body: form }).json<MessageAttachment>()
}


/** Ruta autenticada del adjunto (se descarga con openProtectedFile). */
export function getMessageAttachmentUrl(storedName: string) {
  return `files/messages/${storedName}`
}
