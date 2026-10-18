export interface TabItem<T extends string> { id: T; label: string; icon: string; badge?: number; className?: string }

// One element: a bottom bar on phones, a left sidebar from 900px (see index.css).
export function TabBar<T extends string>({ items, active, onSelect }: { items: TabItem<T>[]; active: T; onSelect: (id: T) => void }) {
  return (
    <nav className="tabbar">
      {items.map((t) => (
        <button key={t.id} className={`${t.id === active ? 'active' : ''} ${t.className ?? ''}`} onClick={() => onSelect(t.id)}
          aria-current={t.id === active ? 'page' : undefined}>
          <span className="ico">{t.icon}</span>
          <span className="label">{t.label}</span>
          {!!t.badge && <span className="dot">{t.badge}</span>}
        </button>
      ))}
    </nav>
  )
}
