// Contenido y configuración central de "THE HILDA".
// Separado de la presentación: los componentes solo leen de aquí.

export type UnlockRule =
  | { type: 'initial' }
  | { type: 'query'; parameter: string; value: string }
  | { type: 'datetime'; unlockAt: string }

export interface PlayStep {
  id: string
  number: number
  title: string
  description: string
  image?: string
  imageAlt?: string
  video?: string
  videoAlt?: string
  audio?: string
  audioLabel?: string
  hasQrArea?: boolean
  annotation?: string
  unlockRule: UnlockRule
  lockedHint: string
}

export interface TrickFile {
  title: string
  objective: string
  difficultyStars: number
  prepTime: string
  accomplices: string[]
  successRate: string
}

export interface CoverContent {
  fileNumber: string
  name: string
  subtitle: string
  compiledBy: string
  executedBy: string
  classification: string[]
  footnote: string
  cta: string
}

export interface RevealContent {
  title: string
  paragraphs: string[]
  image: string
  imageAlt: string
  cta: string
}

export interface FinalContent {
  headline: string[]
  signature: string
  closingLines: string[]
}

export interface ScreenMeta {
  id: 'cover' | 'file' | 'plan' | 'reveal' | 'final'
  label: string
}

export const THE_HILDA_SCREENS: ScreenMeta[] = [
  { id: 'cover', label: 'Portada' },
  { id: 'file', label: 'Ficha' },
  { id: 'plan', label: 'El plan' },
  { id: 'reveal', label: 'Revelación' },
  { id: 'final', label: 'Final' },
]

export const COVER_CONTENT: CoverContent = {
  fileNumber: 'TRUCO #117',
  name: 'THE HILDA',
  subtitle: 'EL TRUCO LEGENDARIO DE CUMPLEAÑOS',
  compiledBy: 'Barney Stinson*',
  executedBy: 'Mauricio',
  classification: ['CONFIDENCIAL', 'SOLO PARA HILDA'],
  footnote:
    '*Inspirado en la filosofía del libro de jugadas. Esta es una creación original para un cumpleaños.',
  cta: 'ABRIR EL TRUCO',
}

export const TRICK_FILE: TrickFile = {
  title: 'THE HILDA',
  objective:
    'Conseguir que Hilda tenga el mejor cumpleaños de su vida sin descubrir el verdadero truco hasta el final.',
  difficultyStars: 5,
  prepTime: '365 días',
  accomplices: ['Dos niños', 'Flores', 'Desayuno fitness', 'Códigos QR', 'Muchísimo amor'],
  successRate: 'Desconocida...',
}

export const THE_HILDA_STEPS: PlayStep[] = [
  {
    id: 'paso-1',
    number: 1,
    title: 'Preparar un desayuno que sepa que le va a encantar',
    description:
      'Prepara un desayuno que creas que le encantará: algo fitness, saludable y delicioso para comenzar el día con una sonrisa.',
    unlockRule: { type: 'initial' },
    lockedHint: 'Este paso todavía no forma parte de tu historia.',
  },
  {
    id: 'paso-3',
    number: 3,
    title: 'Colaborar con mis hijos para que sea perfecto',
    description:
      'Necesitaba que mis hijos me ayudaran en esto para que te enviaran mensajes y detalles que te llegaran directo al corazón.',
    video: '/the-hilda/video/hijo.mp4',
    videoAlt: 'Mensaje en video de tu hijo',
    audio: '/the-hilda/audio/hija.mp3',
    audioLabel: 'Mensaje de tu hija',
    annotation: 'No hay Paso 2. Así es el truco.',
    unlockRule: { type: 'query', parameter: 'paso', value: '3' },
    lockedHint: 'Este paso todavía no forma parte de tu historia.',
  },
  {
    id: 'paso-4',
    number: 4,
    title: 'Hacerle creer que ya es el final',
    description: 'Muéstrale algo que parezca el regalo final para que piense que la sorpresa ha terminado.',
    unlockRule: { type: 'query', parameter: 'paso', value: '4' },
    lockedHint: 'Este paso todavía no forma parte de tu historia.',
  },
  {
    id: 'paso-5',
    number: 5,
    title: 'Esperar que le guste',
    description: 'Espera su reacción, su sonrisa y su emoción. Disfrútala al máximo. Ese es el verdadero objetivo.',
    unlockRule: { type: 'query', parameter: 'revelacion', value: 'true' },
    lockedHint: 'Este paso todavía no forma parte de tu historia.',
  },
]

export const REVEAL_CONTENT: RevealContent = {
  title: 'LA REVELACIÓN',
  paragraphs: [
    'Necesitaba que pensaras que el desayuno era la sorpresa.',
    'Necesitaba que los detalles y las flores parecieran lo único importante.',
    'Necesitaba que mis hijos me ayudaran en esto.',
    'Necesitaba que la web pareciera el regalo final.',
    'Porque el verdadero regalo era demostrarte cuánto te amo y todo lo que haría por ti, cada día.',
  ],
  image: '/the-hilda/images/foto-final.jpg',
  imageAlt: 'Foto especial para Hilda',
  cta: 'DESCUBRIR EL VERDADERO FINAL',
}

export const FINAL_CONTENT: FinalContent = {
  headline: ['FELIZ CUMPLEAÑOS,', 'MI COSHI.'],
  signature: '— Mauricio',
  closingLines: ['Los mejores trucos no engañan.', 'Hacen que alguien descubra cuánto lo amas.'],
}
