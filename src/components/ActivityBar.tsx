import type { SidebarView } from "../types";

type Props = {
  active: SidebarView;
  onChange: (view: SidebarView) => void;
  changeCount?: number;
};

const items: Array<{ id: SidebarView; label: string; icon: string }> = [
  { id: "explorer", label: "Explorer", icon: "📁" },
  { id: "changes", label: "Changes", icon: "⎇" },
  { id: "terminal", label: "Terminal", icon: "⌘" },
  { id: "search", label: "Search", icon: "🔎" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function ActivityBar({ active, onChange, changeCount = 0 }: Props) {
  return (
    <nav className="activity-bar" aria-label="Activity Bar">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`activity-btn ${active === item.id ? "active" : ""}`}
          title={item.label}
          aria-label={item.label}
          aria-pressed={active === item.id}
          onClick={() => onChange(item.id)}
        >
          <span aria-hidden>{item.icon}</span>
          {item.id === "changes" && changeCount > 0 && (
            <span className="activity-badge">{changeCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
