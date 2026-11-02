import { createContext } from 'react'

export const designSchemes = [
  { id: 'paperback', name: 'Paperback ’68', description: 'An editorial spread with open profiles and chapter indexing' },
  { id: 'signal', name: 'Signal Orange', description: 'A circular crew dial, capsule profiles and poster typography' },
  { id: 'blue-hour', name: 'Blue Hour', description: 'Sidebar navigation, flowing profiles and curved paper' },
  { id: 'midnight', name: 'Midnight Broadcast', description: 'A wide broadcast console with porthole profiles and pill tabs' },
] as const
export type DesignScheme = typeof designSchemes[number]['id']
export const defaultDesignScheme: DesignScheme = 'signal'
export const DesignContext = createContext<DesignScheme>(defaultDesignScheme)
export const designStorageKey = 'bitd.design'
export function isDesignScheme(value: unknown): value is DesignScheme {
  return designSchemes.some(scheme => scheme.id === value)
}
export function readDesignScheme(): DesignScheme {
  try {
    const saved = localStorage.getItem(designStorageKey)
    return isDesignScheme(saved) ? saved : defaultDesignScheme
  } catch { return defaultDesignScheme }
}
