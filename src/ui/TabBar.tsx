export interface TabItem<T extends string> { id: T; label: string; icon: string; badge?: number }

export function TabBar<T extends string>({ items, active, onSelect }: { items: TabItem<T>[]; active: T; onSelect: (id: T) => void }) {
  return (
    <nav className="tabbar">
      {items.map((t) => (
        <button key={t.id} className={t.id === active ? 'active' : ''} onClick={() => onSelect(t.id)}>
          <span className="ico">{t.icon}</span>
          {t.label}
          {!!t.badge && <span className="dot">{t.badge}</span>}
        </button>
      ))}
    </nav>
  )
}
