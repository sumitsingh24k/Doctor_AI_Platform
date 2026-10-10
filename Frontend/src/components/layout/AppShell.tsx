import type { ReactNode } from "react";
import {
  ArrowDownLeft, ArrowRight, Bell, ChevronDown, HeartPulse, Menu, Search, Sparkles, Stethoscope, X,
} from "lucide-react";
import type { User } from "../../api";
import type { Section } from "../../types/app";
import { initials } from "../../utils/format";

export type NavigationItem = {
  id: Section;
  label: string;
  icon: typeof HeartPulse;
};

export function AppShell({
  user,
  section,
  navigation,
  appointmentsCount,
  search,
  setSearch,
  mobileNav,
  setMobileNav,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  section: Section;
  navigation: NavigationItem[];
  appointmentsCount: number;
  search: string;
  setSearch: (value: string) => void;
  mobileNav: boolean;
  setMobileNav: (open: boolean) => void;
  onNavigate: (section: Section) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const patientMode = user.role === "patient";
  const activeLabel = navigation.find((item) => item.id === section)?.label ?? "Overview";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><HeartPulse size={19} /></div><span>medimind</span><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace-label">{patientMode ? "YOUR CARE" : "PRACTICE"}</div>
      <nav className="side-nav">
        {navigation.map(({ id, label, icon: Icon }) => <button className={`nav-link ${section === id ? "active" : ""}`} key={id} onClick={() => { onNavigate(id); setMobileNav(false); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "appointments" && appointmentsCount > 0 && <span className="nav-count">{appointmentsCount}</span>}</button>)}
      </nav>
      {patientMode && <button className="assistant-promo" onClick={() => onNavigate("assistant")}><div className="promo-icon"><Sparkles size={16} /></div><div><b>Meet your care assistant</b><span>Book care by voice or chat</span></div><ArrowRight size={16} /></button>}
      {!patientMode && <div className="sidebar-bottom"><div className="clinic-pill"><div className="clinic-avatar"><Stethoscope size={16} /></div><div><b>Practice workspace</b><span>Doctor portal</span></div><ChevronDown size={14} /></div></div>}
      <div className="sidebar-user"><div className="avatar">{initials(user.name)}</div><div className="user-meta"><b>{user.name}</b><span>{patientMode ? "Patient account" : "Doctor portal"}</span></div><button className="icon-button logout-button" onClick={onLogout} title="Sign out"><ArrowDownLeft size={17} /></button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="main-panel">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="breadcrumb"><span>{patientMode ? "Patient space" : "Practice portal"}</span><span className="crumb-slash">/</span><b>{activeLabel}</b></div>
        <div className="topbar-actions"><label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={patientMode ? "Search doctors or specialties" : "Search patients, appointments"} onFocus={() => patientMode && onNavigate("doctors")} /></label><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button><div className="top-avatar">{initials(user.name)}</div></div>
      </header>
      <div className="content-area">{children}</div>
    </main>
  </div>;
}
