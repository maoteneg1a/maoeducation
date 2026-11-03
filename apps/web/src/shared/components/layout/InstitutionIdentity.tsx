import { useState } from 'react'
import { School } from 'lucide-react'

/** El nombre oficial se distribuye en líneas; no se sustituye por puntos suspensivos. */
export function InstitutionIdentity({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const logo = logoUrl
    ? /^(https?:|data:image\/|blob:)/i.test(logoUrl)
      ? logoUrl
      : `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/${logoUrl.replace(/^\//, '')}`
    : null
  const parts = name.match(/^(UNIDAD EDUCATIVA|ESCUELA DE EDUCACI[ÓO]N B[ÁA]SICA|COLEGIO)\s+(.+)$/i)
  return <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3" aria-label={`Institución: ${name}`}>
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white p-0.5 sm:h-10 sm:w-10">
      {logo && failedLogo !== logo
        ? <img src={logo} alt={`Logo de ${name}`} className="h-full w-full object-contain" onError={() => setFailedLogo(logo)} />
        : <School className="h-5 w-5 text-slate-500" aria-hidden />}
    </div>
    <div className="min-w-0" title={name}>
      {parts && <p className="mb-0.5 text-[9px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-[10px]">{parts[1]}</p>}
      <p className="break-words text-[11px] font-semibold leading-tight sm:text-sm">{parts?.[2] ?? name}</p>
    </div>
  </div>
}
