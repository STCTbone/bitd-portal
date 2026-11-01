export const designSchemes = [
  { id: 'paperback', name: 'Paperback ’68', description: 'Book-white pages, black ink, orange chapter marks' },
  { id: 'signal', name: 'Signal Orange', description: 'Cover-inspired amber, burnt orange and bold display type' },
  { id: 'blue-hour', name: 'Blue Hour', description: 'Rainy Doskvol blues, pale mint and clean editorial grids' },
  { id: 'midnight', name: 'Midnight Broadcast', description: 'Ink-dark screens, electric blue and warm signal lights' },
] as const
export type DesignScheme = typeof designSchemes[number]['id']
export const designStorageKey = 'bitd.design'
export function isDesignScheme(value: unknown): value is DesignScheme {
  return designSchemes.some(scheme => scheme.id === value)
}
export function readDesignScheme(): DesignScheme {
  try {
    const saved = localStorage.getItem(designStorageKey)
    return isDesignScheme(saved) ? saved : 'paperback'
  } catch { return 'paperback' }
}
