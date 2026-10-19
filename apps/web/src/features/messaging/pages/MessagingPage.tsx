import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Send, Plus, MessageSquare, Paperclip, X, FileText, Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import {
  listThreads,
  getThread,
  createThread,
  replyToThread,
  getRecipients,
  uploadMessageAttachment,
  getMessageAttachmentUrl,
  type MessageThread,
  type MessageAttachment,
  type UserOption,
} from '../api/messaging.api'
import { openProtectedFile } from '@/shared/lib/protected-file'

function formatDate(d: string) {
  return new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentChip({ a }: { a: MessageAttachment }) {
  return (
    <button
      type="button"
      onClick={() => openProtectedFile(getMessageAttachmentUrl(a.storedName), a.fileName).catch(() => toast.error('No se pudo abrir el archivo'))}
      className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background hover:bg-accent/60 text-xs transition-colors"
    >
      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate max-w-[160px]">{a.fileName}</span>
      <span className="text-muted-foreground shrink-0">({formatBytes(a.fileSize)})</span>
      <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  )
}

function FilePickerRow({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {files.map((f, i) => (
        <span
          key={i}
          className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-muted"
        >
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="max-w-[120px] truncate">{f.name}</span>
          <button type="button" onClick={() => remove(i)} className="ml-0.5 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-accent/60 transition-colors text-muted-foreground"
      >
        <Paperclip className="h-3 w-3" />
        Adjuntar
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onChange([...files, ...Array.from(e.target.files)])
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function MessagingPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const currentUserId = user?.id ?? ''
  const { hasAnyRole } = usePermissions()
  const isStudentOrGuardian = hasAnyRole('student', 'guardian')
  const canCompose = !isStudentOrGuardian

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [recipientSearch, setRecipientSearch] = useState('')
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: listThreads,
  })

  const { data: selectedThread, isLoading: threadLoading } = useQuery({
    queryKey: ['thread', selectedThreadId],
    queryFn: () => getThread(selectedThreadId!),
    enabled: !!selectedThreadId,
  })

  const { data: recipients } = useQuery({
    queryKey: ['message-recipients', recipientSearch],
    queryFn: () => getRecipients(recipientSearch || undefined),
    enabled: composeOpen,
  })

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selectedThread?.messages])

  function handleSelectThread(id: string) {
    setSelectedThreadId(id)
    setComposeOpen(false)
  }

  function handleOpenCompose() {
    setComposeOpen(true)
    setSelectedThreadId(null)
  }

  async function handleSendNewThread() {
    if (!newSubject.trim() || !newBody.trim() || selectedRecipients.length === 0) {
      toast.error('Completa todos los campos y selecciona al menos un destinatario')
      return
    }
    setSending(true)
    try {
      const thread = await createThread({
        subject: newSubject.trim(),
        body: newBody.trim(),
        recipientIds: selectedRecipients,
      })
      // Upload attachments to first message if any
      if (newFiles.length > 0 && thread.firstMessageId) {
        await Promise.all(newFiles.map((f) => uploadMessageAttachment(thread.firstMessageId!, f)))
      }
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      setComposeOpen(false)
      setNewSubject('')
      setNewBody('')
      setNewFiles([])
      setSelectedRecipients([])
      setRecipientSearch('')
      setSelectedThreadId(thread.id)
      toast.success('Mensaje enviado')
    } catch {
      toast.error('Error al enviar el mensaje')
    } finally {
      setSending(false)
    }
  }

  async function handleSendReply() {
    if (!replyBody.trim() && replyFiles.length === 0) return
    setSending(true)
    try {
      const message = await replyToThread(selectedThreadId!, { body: replyBody.trim() || '(adjunto)' })
      if (replyFiles.length > 0) {
        await Promise.all(replyFiles.map((f) => uploadMessageAttachment(message.id, f)))
      }
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      setReplyBody('')
      setReplyFiles([])
    } catch {
      toast.error('Error al enviar la respuesta')
    } finally {
      setSending(false)
    }
  }

  function toggleRecipient(userId: string) {
    setSelectedRecipients((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  function isThreadUnread(thread: MessageThread): boolean {
    if (!thread.messages || thread.messages.length === 0) return false
    const lastMessage = thread.messages[0]
    if (!lastMessage.recipients) return false
    return lastMessage.recipients.some((r) => !r.isRead)
  }

  const filteredUsers: UserOption[] = recipients ?? []

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left panel - thread list */}
      <div
        className={cn(
          'w-full flex-col border-r bg-background md:w-1/3',
          selectedThreadId || composeOpen ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="p-3 border-b flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-sm">Mensajes</h2>
          {canCompose && (
            <Button size="sm" onClick={handleOpenCompose} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nuevo Mensaje
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <PageLoader />
          ) : !threads || threads.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="Sin mensajes"
              description="Crea un nuevo mensaje para comenzar"
            />
          ) : (
            threads.map((thread) => {
              const lastMessage = thread.messages?.[0]
              const creatorName = thread.creator?.profile
                ? `${thread.creator.profile.firstName} ${thread.creator.profile.lastName}`
                : 'Usuario'
              const preview = lastMessage?.body?.slice(0, 60) ?? ''
              const unread = isThreadUnread(thread)

              return (
                <button
                  key={thread.id}
                  onClick={() => handleSelectThread(thread.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b hover:bg-accent/50 transition-colors',
                    selectedThreadId === thread.id && 'bg-accent',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn('text-sm font-medium truncate flex-1', unread && 'font-semibold')}>
                      {thread.subject}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {unread && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                      <span className="text-xs text-muted-foreground">{formatDate(thread.createdAt)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{creatorName}</p>
                  {preview && <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}</p>}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right panel */}
      <div
        className={cn(
          'flex-1 flex-col bg-muted/20',
          selectedThreadId || composeOpen ? 'flex' : 'hidden md:flex',
        )}
      >
        {composeOpen ? (
          /* Compose new thread */
          <div className="flex-1 flex flex-col p-6 gap-4 overflow-y-auto">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden -ml-2 gap-1.5 px-2"
                onClick={() => setComposeOpen(false)}
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
              <h3 className="font-semibold text-base">Nuevo Mensaje</h3>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Asunto</label>
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Asunto del mensaje"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Destinatarios</label>
              <Input
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                placeholder="Buscar usuarios..."
                className="mb-2"
              />
              <div className="border rounded-md bg-background">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">No se encontraron usuarios</p>
                ) : (
                  <>
                    <label className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 cursor-pointer hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedRecipients.includes(u.id))}
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              filteredUsers.some((u) => selectedRecipients.includes(u.id)) &&
                              !filteredUsers.every((u) => selectedRecipients.includes(u.id))
                        }}
                        onChange={() => {
                          const allSelected = filteredUsers.every((u) => selectedRecipients.includes(u.id))
                          if (allSelected) {
                            setSelectedRecipients((prev) => prev.filter((id) => !filteredUsers.some((u) => u.id === id)))
                          } else {
                            setSelectedRecipients((prev) => [...new Set([...prev, ...filteredUsers.map((u) => u.id)])])
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Seleccionar todos ({filteredUsers.length})</span>
                    </label>
                    <div className="max-h-40 overflow-y-auto">
                      {filteredUsers.map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRecipients.includes(u.id)}
                            onChange={() => toggleRecipient(u.id)}
                            className="rounded"
                          />
                          <span className="text-sm">{u.fullName}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{u.email}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {selectedRecipients.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedRecipients.length} destinatario(s) seleccionado(s)
                </p>
              )}
            </div>

            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Mensaje</label>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className="w-full min-h-[120px] border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Adjuntos</label>
              <FilePickerRow files={newFiles} onChange={setNewFiles} />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSendNewThread} disabled={sending} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                {sending ? 'Enviando...' : 'Enviar'}
              </Button>
              <Button variant="outline" onClick={() => setComposeOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : selectedThreadId ? (
          /* Thread view */
          <div className="flex-1 flex flex-col overflow-hidden">
            {threadLoading ? (
              <PageLoader />
            ) : selectedThread ? (
              <>
                {/* Header */}
                <div className="px-6 py-4 border-b bg-background shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden -ml-2 mb-1 gap-1.5 px-2"
                    onClick={() => setSelectedThreadId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                  </Button>
                  <h3 className="font-semibold text-base">{selectedThread.subject}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Creado por{' '}
                    {selectedThread.creator?.profile
                      ? `${selectedThread.creator.profile.firstName} ${selectedThread.creator.profile.lastName}`
                      : 'Usuario'}{' '}
                    · {formatDate(selectedThread.createdAt)}
                  </p>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {selectedThread.messages.map((message) => {
                    const isOwn = message.sender.id === currentUserId
                    const senderName = message.sender.profile
                      ? `${message.sender.profile.firstName} ${message.sender.profile.lastName}`
                      : 'Usuario'

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          'flex flex-col gap-1 max-w-[70%]',
                          isOwn ? 'ml-auto items-end' : 'items-start',
                        )}
                      >
                        <span className="text-xs text-muted-foreground">
                          {senderName} · {formatDate(message.sentAt)}
                        </span>
                        <div
                          className={cn(
                            'rounded-lg px-4 py-2.5 text-sm',
                            isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted',
                          )}
                        >
                          {message.body}
                        </div>
                        {message.attachments?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {message.attachments.map((a) => (
                              <AttachmentChip key={a.id} a={a} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply box */}
                <div className="px-6 py-4 border-t bg-background shrink-0 space-y-2">
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendReply()
                        }
                      }}
                      placeholder="Escribe una respuesta..."
                      className="flex-1 min-h-[72px] border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                      onClick={handleSendReply}
                      disabled={sending || (!replyBody.trim() && replyFiles.length === 0)}
                      className="gap-1.5 shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sending ? '...' : 'Enviar'}
                    </Button>
                  </div>
                  <FilePickerRow files={replyFiles} onChange={setReplyFiles} />
                </div>
              </>
            ) : null}
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Selecciona una conversación"
              description="Elige un mensaje de la lista o crea uno nuevo"
              action={
                canCompose ? (
                  <Button onClick={handleOpenCompose} className="gap-1.5 mt-2">
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo Mensaje
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
