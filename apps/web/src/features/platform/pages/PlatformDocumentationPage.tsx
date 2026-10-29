import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BookOpen, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import { platformGet } from '@/shared/lib/platform-api-client'
import { usePlatformRole } from '../hooks/usePlatform'

interface Guide {
  id: string
  title: string
  description: string
  content: string
}

function CodeBlock({ text }: { text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Comando copiado')
    } catch { toast.error('No se pudo copiar. Selecciona el comando para copiarlo manualmente.') }
  }
  return (
    <div className="relative min-w-0 rounded-lg bg-slate-900 text-slate-100">
      <Button variant="ghost" size="sm" className="absolute right-2 top-2 text-slate-300 hover:text-slate-900" onClick={copy} aria-label="Copiar bloque de código">
        <Copy className="h-4 w-4" /> Copiar
      </Button>
      <pre className="overflow-x-auto p-4 pt-12 text-xs leading-relaxed sm:text-sm"><code>{text}</code></pre>
    </div>
  )
}

// Restricted Markdown used by the operations guide: headings, paragraphs, lists,
// and fenced code. React escapes all content; raw HTML is never interpreted.
function GuideContent({ content }: { content: string }) {
  return (
    <div className="min-w-0 space-y-5">
      {content.split(/```[^\n]*\n([\s\S]*?)```/g).map((part, index) => index % 2 ? (
        <CodeBlock key={index} text={part.trimEnd()} />
      ) : part.trim().split(/\n\s*\n/).filter(Boolean).map((block, blockIndex) => {
        const key = `${index}-${blockIndex}`
        if (block.startsWith('# ')) return <h2 key={key} className="text-xl font-semibold text-slate-900">{block.slice(2)}</h2>
        if (block.startsWith('## ')) return <h3 key={key} className="border-b pb-2 pt-3 text-lg font-semibold text-slate-900">{block.slice(3)}</h3>
        if (block.startsWith('- ')) return <ul key={key} className="list-disc space-y-1 pl-5 text-sm text-slate-600">{block.split(/\n(?=- )/).map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^- /, '').replace(/\n/g, ' ')}</li>)}</ul>
        return <p key={key} className="text-sm leading-relaxed text-slate-600">{block.replace(/\n/g, ' ')}</p>
      }))}
    </div>
  )
}

export function PlatformDocumentationPage() {
  const { isOwner } = usePlatformRole()
  const [selectedId, setSelectedId] = useState('getting-started')
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-documentation'],
    queryFn: () => platformGet<{ guides: Guide[] }>('platform/documentation'),
    enabled: isOwner,
    gcTime: 0,
    meta: { persist: false },
  })
  const selectedGuide = data?.guides.find(guide => guide.id === selectedId) ?? data?.guides[0]
  if (!isOwner) return <Navigate to="/platform" replace />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><BookOpen className="h-6 w-6" />Documentación</h1>
        <p className="mt-1 text-sm text-slate-500">Guías de operación para el propietario de plataforma.</p>
      </div>
      {isLoading && <p role="status" className="text-sm text-slate-500">Cargando documentación…</p>}
      {error && <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{getErrorMessage(error)}</p><Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div>}
      {data && <nav aria-label="Guías de documentación" className="flex flex-wrap gap-2">
        {data.guides.map(guide => (
          <Button key={guide.id} variant={selectedGuide?.id === guide.id ? 'default' : 'outline'} aria-pressed={selectedGuide?.id === guide.id} onClick={() => setSelectedId(guide.id)}>{guide.title}</Button>
        ))}
      </nav>}
      {selectedGuide && (
        <Card key={selectedGuide.id}>
          <CardHeader><CardTitle>{selectedGuide.title}</CardTitle><p className="text-sm text-slate-500">{selectedGuide.description}</p></CardHeader>
          <CardContent><GuideContent content={selectedGuide.content} /></CardContent>
        </Card>
      )}
    </div>
  )
}
