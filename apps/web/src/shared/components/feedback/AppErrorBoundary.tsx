import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback, reloadOnceForChunkError } from './RouteErrorBoundary'

interface Props {
  children: ReactNode
}

interface State {
  error: unknown
}

/**
 * Último recurso: captura errores de render fuera del árbol de rutas (o que
 * escapen a los `errorElement`) para no dejar la pantalla en blanco.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (!reloadOnceForChunkError(error)) {
      console.error(error, info.componentStack)
    }
  }

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} />
    return this.props.children
  }
}
