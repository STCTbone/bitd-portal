import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { DesignContext, designSchemes, designStorageKey, readDesignScheme, type DesignScheme } from '@/lib/design'

/** Appearance stays outside campaign state, so switching schemes retains every editor. */
export function DesignProvider({ children }: { children: ReactNode }) {
  const [design, setDesign] = useState<DesignScheme>(readDesignScheme)
  useLayoutEffect(() => { document.documentElement.dataset.design = design }, [design])
  useEffect(() => {
    const followPreference = (event: StorageEvent) => {
      if (event.key === designStorageKey || event.key === null) setDesign(readDesignScheme())
    }
    window.addEventListener('storage', followPreference)
    return () => window.removeEventListener('storage', followPreference)
  }, [])
  function choose(next: DesignScheme) {
    setDesign(next)
    try { localStorage.setItem(designStorageKey, next) } catch { /* The live choice still works when storage is unavailable. */ }
  }
  return <DesignContext.Provider value={design}><DesignSwitcher design={design} choose={choose} />{children}</DesignContext.Provider>
}

function DesignSwitcher({ design, choose }: { design: DesignScheme; choose: (design: DesignScheme) => void }) {
  const current = designSchemes.find(scheme => scheme.id === design)!
  return <aside className="design-studio" aria-label="Design studio">
    <details className="design-studio-picker">
      <summary>
        <span className="design-studio-label">Design studio</span>
        <span className="design-studio-current"><span className="design-studio-dot" aria-hidden="true" />{current.name}</span>
      </summary>
      <div className="design-studio-options">
        {designSchemes.map((scheme, index) => <button type="button" key={scheme.id} className="design-option" data-scheme={scheme.id} aria-label={scheme.name} aria-pressed={design === scheme.id} onClick={() => choose(scheme.id)}>
          <span className="design-option-preview" aria-hidden="true"><span className="design-option-number">0{index + 1}</span><span className="design-option-swatches"><i /><i /><i /></span></span>
          <span className="design-option-name">{scheme.name}</span>
          <span className="design-option-description">{scheme.description}</span>
        </button>)}
      </div>
    </details>
  </aside>
}
