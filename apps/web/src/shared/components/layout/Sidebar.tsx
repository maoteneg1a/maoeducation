import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, Users, Settings, BookOpen, GraduationCap,
  ClipboardList, AlertTriangle, MessageSquare, Calendar,
  FileText, ChevronRight, X, UserPlus, ShieldCheck,
  ClipboardCheck, CalendarDays, Palette, Smile, Award, HeartHandshake, FolderOpen, NotebookPen, Puzzle,
  Sparkles, School, CreditCard,
  Megaphone,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useUIStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useEffect, useState } from 'react'

interface NavItem {
  label: string
  icon: React.ElementType
  path: string
  permission?: string
  module?: string
  children?: Array<{ label: string; path: string; hideForPersonal?: boolean; showOnlyForPersonal?: boolean }>
}

interface NavSection {
  id: string
  /** Sin label = sin encabezado ni separador (el bloque de Inicio). */
  label?: string
  icon?: React.ElementType
  /** Destaca el encabezado con el color de marca. */
  accent?: boolean
  items: NavItem[]
}

const labelCollator = new Intl.Collator('es', { sensitivity: 'base' })

/**
 * Navegación agrupada por flujo de trabajo. Las rutas, permisos y módulos se
 * mantienen independientes del grupo visual para poder reorganizar el menú sin
 * alterar el acceso. Si agregas un ítem con `module`, esa llave tiene que
 * existir en ALL_MODULES o el panel de superadmin no podrá activarla.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    id: 'inicio',
    items: [
      {
        label: 'Inicio',
        icon: Home,
        path: '/dashboard',
      },
    ],
  },
  {
    id: 'docencia',
    label: 'Aula',
    icon: Sparkles,
    accent: true,
    items: [
      {
        label: 'Planificaciones',
        icon: NotebookPen,
        path: '/planning',
        permission: 'planning:read',
        module: 'planning',
      },
      {
        label: 'Proyectos Interdisciplinarios',
        icon: Puzzle,
        path: '/interdisciplinary-projects',
        permission: 'planning:read',
        module: 'interdisciplinary_projects',
      },
      {
        label: 'Actividades',
        icon: BookOpen,
        path: '/activities',
        permission: 'activities:read',
        module: 'activities',
      },
      {
        label: 'Tareas',
        icon: ClipboardCheck,
        path: '/tasks',
        module: 'tasks',
      },
      {
        label: 'Refuerzo y Adaptaciones',
        icon: HeartHandshake,
        path: '/reinforcement-plans',
        permission: 'grades:write',
        module: 'reinforcement_plans',
      },
    ],
  },
  {
    id: 'academico',
    label: 'Gestión académica',
    icon: GraduationCap,
    items: [
      {
        label: 'Calificaciones',
        icon: GraduationCap,
        path: '/grades',
        permission: 'grades:read',
        module: 'grades',
      },
      {
        label: 'Recuperación',
        icon: BookOpen,
        path: '/pedagogic-recovery',
        permission: 'grades:write',
        module: 'pedagogic_recovery',
      },
      {
        label: 'Promoción',
        icon: Award,
        path: '/promotion',
        permission: 'grades:read',
        module: 'promotion',
      },
      {
        label: 'Asistencia',
        icon: ClipboardList,
        path: '/attendance',
        permission: 'attendance:write',
        module: 'attendance',
        children: [
          { label: 'Registro', path: '/attendance' },
          { label: 'Justificaciones', path: '/attendance/justifications' },
        ],
      },
      {
        label: 'Horario',
        icon: Calendar,
        path: '/schedules',
        module: 'schedules',
      },
      {
        label: 'Matrículas',
        icon: UserPlus,
        path: '/enrollment',
        permission: 'enrollment:read',
        module: 'enrollment',
      },
      {
        label: 'Reportes',
        icon: FileText,
        path: '/reports',
        permission: 'reports:read',
        module: 'reports',
      },
    ],
  },
  {
    id: 'seguimiento',
    label: 'Seguimiento y convivencia',
    icon: HeartHandshake,
    items: [
      {
        label: 'Alertas académicas',
        icon: AlertTriangle,
        path: '/academic-alerts',
        permission: 'reports:read',
      },
      {
        label: 'Comportamiento',
        icon: Smile,
        path: '/behavior',
        permission: 'grades:write',
        module: 'behavior',
      },
      {
        label: 'Incidentes',
        icon: AlertTriangle,
        path: '/incidents',
        permission: 'incidents:read',
        module: 'incidents',
        children: [
          { label: 'Casos', path: '/incidents' },
          { label: 'Tipos de falta', path: '/incidents/types' },
        ],
      },
      {
        label: 'Atención a Padres',
        icon: HeartHandshake,
        path: '/parent-meetings',
        permission: 'parent_meetings:read',
        module: 'parent_meetings',
      },
      {
        label: 'Carpeta del Estudiante',
        icon: FolderOpen,
        path: '/student-folder',
        permission: 'student_folder:read',
        module: 'student_folder',
      },
      {
        label: 'Ficha de anamnesis',
        icon: ClipboardCheck,
        path: '/settings/anamnesis',
        permission: 'anamnesis:manage',
        module: 'anamnesis',
      },
    ],
  },
  {
    id: 'comunicacion',
    label: 'Comunicación',
    icon: MessageSquare,
    items: [
      {
        label: 'Avisos',
        icon: Megaphone,
        path: '/announcements',
      },
      {
        label: 'Mensajes',
        icon: MessageSquare,
        path: '/messages',
        module: 'messages',
      },
      {
        label: 'Calendario',
        icon: CalendarDays,
        path: '/calendar',
        module: 'calendar',
      },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    icon: School,
    items: [
      {
        label: 'Configuración',
        icon: Settings,
        path: '/academic',
        permission: 'academic_config:manage',
        module: 'academic',
        children: [
          // Estructura académica: para cuentas personales de profesor ya nace
          // creada desde bootstrapInstitution al registrarse, así que no se
          // expone en su sidebar. Calificación y Formato de Planificación sí se
          // conservan: son plantillas/personalización, no estructura.
          { label: 'Niveles', path: '/academic/levels', hideForPersonal: true },
          { label: 'Materias', path: '/academic/subjects', hideForPersonal: true },
          { label: 'Años lectivos', path: '/academic/years', hideForPersonal: true },
          { label: 'Paralelos', path: '/academic/parallels', hideForPersonal: true },
          { label: 'Asignaciones', path: '/academic/assignments', hideForPersonal: true },
          { label: 'Insumos por paralelo', path: '/academic/insumo-setup', hideForPersonal: true },
          { label: 'Calificación y Asistente IA', path: '/settings/calificacion' },
          { label: 'Formato de Planificación', path: '/settings/formato-planificacion' },
          { label: 'Mis grados y materias', path: '/settings/mis-grados', showOnlyForPersonal: true },
        ],
      },
      {
        label: 'Usuarios',
        icon: Users,
        path: '/users',
        permission: 'users:read',
        module: 'users',
      },
      {
        label: 'Roles y Permisos',
        icon: ShieldCheck,
        path: '/roles',
        permission: 'users:manage',
        module: 'roles',
      },
      {
        label: 'Personalización',
        icon: Palette,
        path: '/settings/branding',
        permission: 'institution_config:manage',
        module: 'branding',
      },
      {
        // Sin `module` a propósito: si se pudiera desactivar, una institución
        // bloqueada por falta de pago se quedaría sin forma de pagar.
        label: 'Suscripción',
        icon: CreditCard,
        path: '/subscription',
        permission: 'institution_config:manage',
      },
    ],
  },
]

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const collapsed  = useUIStore((s) => s.sidebarCollapsed)
  const { hasPermission } = usePermissions()
  const location   = useLocation()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('auleka.sidebar.sections') ?? '[]')
      const savedSections = Array.isArray(saved) ? saved : []
      const lastSaved = savedSections[savedSections.length - 1]
      const lastOpen = lastSaved === 'institucional' ? 'academico' : lastSaved
      return new Set<string>(lastOpen ? [lastOpen] : ['docencia'])
    } catch {
      return new Set(['docencia'])
    }
  })
  const institution = useAuthStore((s) => s.user?.institution ?? null)

  const enabledModules = institution?.modules ?? null
  const isPersonalAccount = institution?.accountType === 'personal'

  const isVisible = (item: NavItem) =>
    (!item.permission || hasPermission(item.permission)) &&
    (!item.module || !enabledModules || enabledModules.includes(item.module))

  // Una sección sin ítems visibles desaparece con su encabezado — así una cuenta
  // personal sin módulos institucionales no muestra un título vacío. Los hijos
  // de estructura académica (niveles/materias/años/paralelos/asignaciones) se
  // ocultan además para cuentas personales — esa estructura ya nace creada
  // desde bootstrapInstitution (ver PersonalStructureGuard, que bloquea
  // también el acceso por URL directa a esas rutas).
  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items
        .filter(isVisible)
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (c) => (!isPersonalAccount || !c.hideForPersonal) && (isPersonalAccount || !c.showOnlyForPersonal),
          ).sort((a, b) => labelCollator.compare(a.label, b.label)),
        }))
        .sort((a, b) => labelCollator.compare(a.label, b.label)),
    }))
    .filter((section) => section.items.length > 0)
    .sort((a, b) => {
      if (!a.label) return -1
      if (!b.label) return 1
      return labelCollator.compare(a.label, b.label)
    })

  const matchesRoute = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  const isItemActive = (item: NavItem) =>
    matchesRoute(item.path) || Boolean(item.children?.some((child) => matchesRoute(child.path)))

  useEffect(() => {
    const activeSection = visibleSections.find((section) =>
      section.items.some(isItemActive),
    )
    if (activeSection?.label) {
      setExpandedSections((current) => {
        if (current.size === 1 && current.has(activeSection.id)) return current
        const next = new Set([activeSection.id])
        localStorage.setItem('auleka.sidebar.sections', JSON.stringify([...next]))
        return next
      })
    }

    const activeParent = visibleSections
      .flatMap((section) => section.items)
      .find((item) => item.children?.some((child) => matchesRoute(child.path)))
    if (activeParent) setExpanded(activeParent.path)
  }, [location.pathname])

  const toggleSection = (sectionId: string) => {
    setExpandedSections((current) => {
      const next = current.has(sectionId) ? new Set<string>() : new Set([sectionId])
      localStorage.setItem('auleka.sidebar.sections', JSON.stringify([...next]))
      return next
    })
  }

  const renderItem = (item: NavItem) => {
    const isActive = isItemActive(item)
    const isExpanded = expanded === item.path

    if (item.children && !collapsed) {
      return (
        <div key={item.path}>
          <button
            onClick={() => setExpanded(isExpanded ? null : item.path)}
            className={cn(
              'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
            />
          </button>
          {isExpanded && (
            <div className="mt-0.5 ml-5 space-y-0.5 border-l border-primary/30 pl-2">
              {item.children.map((child) => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-md px-3 py-1.5 text-xs transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                    )
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onMobileClose}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            collapsed && 'justify-center px-0',
            isActive
              ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          )
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    )
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 px-3 border-b border-sidebar-border shrink-0',
        collapsed ? 'justify-center' : 'gap-2.5',
      )}>
        <img src="/isotipo.svg" alt="Auleka" className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary leading-none">
              auleka
            </span>
            {institution?.name && (
              <span className="text-sm font-semibold text-sidebar-foreground truncate leading-tight mt-0.5">
                {institution.name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Nav items, agrupados por sección */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {visibleSections.map((section, index) => {
          const sectionIsOpen = expandedSections.has(section.id)
          const sectionIsActive = section.items.some(isItemActive)
          return (
          <div
            key={section.id}
            className={cn(
              section.label && 'mt-2 rounded-lg border border-transparent transition-colors',
              section.label && sectionIsOpen && 'border-sidebar-border bg-sidebar-accent/20',
              section.label && sectionIsActive && 'border-primary/35 bg-sidebar-accent/40',
            )}
          >
            {/* Encabezado: etiqueta + regla horizontal. Colapsado no cabe texto,
                así que la separación es solo un guion centrado. */}
            {section.label && !collapsed && (
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/40',
                  sectionIsActive && 'text-primary',
                )}
                aria-expanded={sectionIsOpen}
              >
                {section.icon && (
                  <section.icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      section.accent || sectionIsActive ? 'text-primary' : 'text-sidebar-foreground/50',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-wider leading-none',
                    section.accent || sectionIsActive ? 'text-primary' : 'text-sidebar-foreground/55',
                  )}
                >
                  {section.label}
                </span>
                <span className="h-px flex-1 bg-sidebar-border" />
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60 transition-transform',
                    sectionIsOpen && 'rotate-90',
                  )}
                />
              </button>
            )}
            {section.label && collapsed && index > 0 && (
              <div className="my-2 mx-auto h-px w-6 bg-sidebar-border" />
            )}

            {(!section.label || collapsed || sectionIsOpen) && (
              <div className={cn('space-y-0.5', section.label && !collapsed && 'mx-1 mb-1 border-l border-primary/25 pl-2')}>
                {section.items.map(renderItem)}
              </div>
            )}
          </div>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative z-10 flex flex-col w-72 bg-sidebar h-full shadow-xl">
            <button
              onClick={onMobileClose}
              className="absolute top-3.5 right-3 text-sidebar-foreground/60 hover:text-sidebar-foreground p-1"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
