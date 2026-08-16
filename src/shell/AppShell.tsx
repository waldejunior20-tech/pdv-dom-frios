import { useState, type ReactNode } from "react";
import { Button } from "react-aria-components";
import {
  BookOpen,
  ClipboardList,
  HeartHandshake,
  LogOut,
  Menu,
  Monitor,
  PackageOpen,
  Settings,
  ShoppingCart,
  Truck,
  WalletCards,
  X,
} from "lucide-react";

export type AppSection =
  | "orders"
  | "catalog"
  | "finance"
  | "delivery"
  | "loyalty"
  | "sale"
  | "system"
  | "printing";

type Props = {
  active: AppSection;
  email?: string;
  children: ReactNode;
  onNavigate: (section: AppSection) => void;
  onSignOut: () => void;
};

const items = [
  { id: "orders", label: "Pedidos", icon: ClipboardList },
  { id: "catalog", label: "Cardápio", icon: BookOpen },
  { id: "finance", label: "Financeiro", icon: WalletCards },
  { id: "delivery", label: "Entrega", icon: Truck },
  { id: "loyalty", label: "Fidelidade", icon: HeartHandshake },
  { id: "sale", label: "Venda+", icon: ShoppingCart },
  { id: "system", label: "Sistema", icon: Monitor },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Menu }>;

const names: Record<AppSection, string> = {
  orders: "Pedidos",
  catalog: "Cardápio",
  finance: "Financeiro",
  delivery: "Entrega",
  loyalty: "Fidelidade",
  sale: "Nova venda",
  system: "Sistema",
  printing: "Impressão",
};

export function AppShell({
  active,
  email,
  children,
  onNavigate,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);

  function navigate(section: AppSection) {
    onNavigate(section);
    setOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <Button
          className="mobile-menu"
          onPress={() => setOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu />
        </Button>
        <strong>{names[active]}</strong>
        <span className="mobile-monogram">DF</span>
      </header>
      {open && (
        <button
          className="sidebar-scrim"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        />
      )}
      <aside className={`app-sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-monogram">DF</span>
          <div>
            <strong>Dom Frios</strong>
            <small>Gestão e PDV</small>
          </div>
          <Button
            className="sidebar-close"
            onPress={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X />
          </Button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          <span className="nav-eyebrow">OPERAÇÃO</span>
          {items.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              className={`nav-item ${active === id ? "active" : ""}`}
              onPress={() => navigate(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button
            className={`nav-item ${active === "printing" ? "active" : ""}`}
            onPress={() => navigate("printing")}
          >
            <Settings size={21} />
            <span>Configurações</span>
          </Button>
          <div className="account-card">
            <span className="account-avatar">
              <PackageOpen size={20} />
            </span>
            <div>
              <strong>Dom Frios</strong>
              <small title={email}>{email || "Operador"}</small>
            </div>
          </div>
          <Button className="signout-button" onPress={onSignOut}>
            <LogOut size={18} /> Sair
          </Button>
        </div>
      </aside>
      <section className="app-workspace">{children}</section>
    </div>
  );
}
