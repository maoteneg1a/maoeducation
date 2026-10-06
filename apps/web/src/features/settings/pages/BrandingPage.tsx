import { useEffect, useRef, useState } from 'react'
import { Building2, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { hexToHsl, hslToHex } from '@/shared/lib/utils'
import { useInstitutionSettings, useUpdateBranding, useUploadLogo } from '../hooks/useSettings'

const DEFAULT_PRIMARY_HEX = '#2563eb' // ~ hsl(221 83% 53%)
const DEFAULT_SIDEBAR_HEX = '#223047' // ~ hsl(217 33% 20%)

export function BrandingPage() {
  const { data: settings, isLoading } = useInstitutionSettings()
  const updateBranding = useUpdateBranding()
  const uploadLogo = useUploadLogo()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [primaryHex, setPrimaryHex] = useState(DEFAULT_PRIMARY_HEX)
  const [sidebarHex, setSidebarHex] = useState(DEFAULT_SIDEBAR_HEX)

  useEffect(() => {
    if (!settings) return
    setName(settings.name)
    if (settings.branding.primaryColor) {
      setPrimaryHex(hslToHex(settings.branding.primaryColor) ?? DEFAULT_PRIMARY_HEX)
    }
    if (settings.branding.sidebarColor) {
      setSidebarHex(hslToHex(settings.branding.sidebarColor) ?? DEFAULT_SIDEBAR_HEX)
    }
  }, [settings])

  if (isLoading || !settings) return <PageLoader />

  const handleSave = () => {
    updateBranding.mutate({
      name,
      branding: {
        primaryColor: hexToHsl(primaryHex),
        sidebarColor: hexToHsl(sidebarHex),
      },
    })
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadLogo.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Personalización</h1>
        <p className="text-sm text-slate-500">Logo, nombre y colores de tu institución</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identidad</CardTitle>
            <CardDescription>Nombre y logotipo que se muestran en la app</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre de la institución</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Logotipo</Label>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-lg border bg-white p-1">
                  {settings.branding.logoUrl ? (
                    <img
                      src={settings.branding.logoUrl}
                      alt="Logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Building2 className="h-7 w-7 text-slate-400" />
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <Button
                  variant="outline"
                  loading={uploadLogo.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Subir logo
                </Button>
              </div>
              <p className="text-xs text-slate-500">PNG, JPG, SVG o WebP, máx. 10 MB.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colores</CardTitle>
            <CardDescription>Color principal y de la barra lateral</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="primary">Color principal</Label>
              <div className="flex items-center gap-3">
                <input
                  id="primary"
                  type="color"
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border"
                />
                <span className="font-mono text-sm text-slate-600">{primaryHex}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sidebar">Color de la barra lateral</Label>
              <div className="flex items-center gap-3">
                <input
                  id="sidebar"
                  type="color"
                  value={sidebarHex}
                  onChange={(e) => setSidebarHex(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border"
                />
                <span className="font-mono text-sm text-slate-600">{sidebarHex}</span>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <p className="mb-2 text-xs font-medium text-slate-500">Vista previa</p>
              <div className="flex items-center gap-2">
                <Button style={{ backgroundColor: primaryHex }} className="text-white">
                  Botón principal
                </Button>
                <span
                  className="inline-flex h-9 items-center rounded-md px-3 text-sm text-white"
                  style={{ backgroundColor: sidebarHex }}
                >
                  Barra lateral
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={updateBranding.isPending}>
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
