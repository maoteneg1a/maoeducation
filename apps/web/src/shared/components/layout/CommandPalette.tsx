import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { create } from 'zustand'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft, GraduationCap, Loader2, Search } from 'lucide-react'
import { apiGet } from '@/shared/lib/api-client'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useVisibleNavSections } from './Sidebar'

// Estado de apertura compartido (Topbar abre, AppLayout monta).
const useCommandPaletteStore = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
)

export function openCommandPalette() {
  useCommandPaletteStore.getState().setOpen(true)
}

interface StudentResult {
  id: string
  fullName: string
  email: string
  dni?: string
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const itemClass =
  'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50'

const groupClass =
  'px-1 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground'

/**
 * Paleta de comandos global (⌘K / Ctrl+K): navegación a las páginas visibles
 * en el Sidebar (mismos filtros de permisos/módulos) y búsqueda de estudiantes.
 */
export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open)
  const setOpen = useCommandPaletteStore((s) => s.setOpen)
  const navigate = useNavigate()
  const sections = useVisibleNavSections()
  const { hasPermission } = usePermissions()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search.trim(), 300)

  const canSearchStudents = hasPermission('users:read:all')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useCommandPaletteStore.getState().open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const studentsQuery = useQuery({
    queryKey: ['command-palette', 'students', debouncedSearch],
    queryFn: () =>
      apiGet<{ data: StudentResult[] }>('users', {
        search: debouncedSearch,
        role: 'student',
        limit: 8,
      }).then((r) => r.data),
    enabled: open && canSearchStudents && debouncedSearch.length >= 2,
    staleTime: 30_000,
  })

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  // Ítems con hijos: se listan los hijos (con el padre como contexto) porque
  // el padre en sí no siempre es una ruta navegable distinta.
  const pages = sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.children && item.children.length > 0
        ? item.children.map((child) => ({
            key: `${item.path}>${child.path}`,
            label: child.label === item.label ? item.label : `${item.label} · ${child.label}`,
            path: child.path,
            icon: item.icon,
            group: section.label ?? 'General',
          }))
        : [{ key: item.path, label: item.label, path: item.path, icon: item.icon, group: section.label ?? 'General' }],
    ),
  )
  const groups = Array.from(new Set(pages.map((p) => p.group)))
  const students = studentsQuery.data ?? []

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Búsqueda global"
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder={canSearchStudents ? 'Buscar páginas o estudiantes…' : 'Buscar páginas…'}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {studentsQuery.isFetching && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          Sin resultados.
        </Command.Empty>

        {groups.map((group) => (
          <Command.Group key={group} heading={group} className={groupClass}>
            {pages
              .filter((p) => p.group === group)
              .map((p) => (
                <Command.Item
                  key={p.key}
                  value={`${p.label} ${p.key}`}
                  keywords={[group]}
                  onSelect={() => go(p.path)}
                  className={itemClass}
                >
                  <p.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{p.label}</span>
                </Command.Item>
              ))}
          </Command.Group>
        ))}

        {canSearchStudents && students.length > 0 && (
          <Command.Group heading="Buscar estudiante" className={groupClass}>
            {students.map((st) => (
              <Command.Item
                key={st.id}
                value={`student-${st.id} ${st.fullName}`}
                // El backend ya filtró (nombre, email, cédula): forzamos coincidencia.
                keywords={[search, st.email, st.dni ?? '']}
                onSelect={() => go(`/students/${st.id}`)}
                className={itemClass}
              >
                <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{st.fullName}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">{st.email}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>

      <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" aria-hidden="true" /> para abrir
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 font-sans">Esc</kbd> para cerrar
        </span>
      </div>
    </Command.Dialog>
  )
}
