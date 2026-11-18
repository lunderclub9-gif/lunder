let modelViewerPromise: Promise<void> | null = null

/**
 * Charge le runtime uniquement lorsqu’un aperçu 3D est réellement nécessaire.
 * Le singleton évite de relancer l’import si plusieurs modèles sont visibles.
 */
export function ensureModelViewer(): Promise<void> {
  if (!modelViewerPromise) {
    modelViewerPromise = import('@google/model-viewer').then(() => undefined).catch((error) => {
      modelViewerPromise = null
      throw error
    })
  }
  return modelViewerPromise
}
