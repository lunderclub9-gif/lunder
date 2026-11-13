import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

/**
 * Filet de sécurité global de l'application.
 *
 * Sans lui, une erreur de rendu (ou l'échec du chargement d'un module différé)
 * laissait un écran vide sans explication. Ici l'utilisateur voit un écran
 * conforme à l'identité visuelle et peut recharger la page.
 *
 * Le message journalisé reste volontairement technique et local : aucun jeton,
 * aucune donnée client, aucune variable d'environnement n'est affichée ni
 * transmise.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const isChunkError = /dynamically imported module|Importing a module script failed/i.test(error.message)
    // Journalisation limitée au message et à la pile composant : pas de données
    // utilisateur, pas de configuration.
    console.error(
      isChunkError ? '[LUNDER] échec du chargement d’un module différé' : '[LUNDER] erreur de rendu',
      error.message,
      info.componentStack
    )
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isChunkError = /dynamically imported module|Importing a module script failed/i.test(error.message)

    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal-950 px-4">
        <div className="w-full max-w-lg rounded-xl border border-charcoal-400/15 bg-charcoal-800 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-red">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-offwhite">
            {isChunkError ? 'Mise à jour disponible' : 'Une erreur est survenue'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-charcoal-300">
            {isChunkError
              ? 'Une nouvelle version de la boutique a été publiée. Rechargez la page pour la charger.'
              : "L'affichage de cette page a échoué. Vos données et votre panier ne sont pas affectés."}
          </p>
          <button type="button" onClick={this.handleReload} className="btn-primary mx-auto mt-6">
            <RefreshCw className="h-4 w-4" />
            Recharger la page
          </button>
          <p className="mt-4 text-xs text-charcoal-500">
            Si le problème persiste, contactez-nous en indiquant l'heure de l'erreur.
          </p>
        </div>
      </div>
    )
  }
}
