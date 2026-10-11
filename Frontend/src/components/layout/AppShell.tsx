import type { ReactNode } from "react";
import {
  ArrowRight, ChevronDown, HeartPulse, LogOut, Menu, Search, Sparkles, Stethoscope, X,
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
  isGuest,
  search,
  setSearch,
  mobileNav,
  setMobileNav,
  onNavigate,
  onLogout,
  onSignIn,
  onDoctorPortal,
  children,
}: {
  user: User;
  section: Section;
  navigation: NavigationItem[];
  appointmentsCount: number;
  isGuest: boolean;
  search: string;
  setSearch: (value: string) => void;
  mobileNav: boolean;
  setMobileNav: (open: boolean) => void;
  onNavigate: (section: Section) => void;
  onLogout: () => void;
  onSignIn: () => void;
  onDoctorPortal: () => void;
  children: ReactNode;
}) {
  const patientMode = user.role === "patient";
  const adminMode = user.role === "admin";
  const activeLabel = navigation.find((item) => item.id === section)?.label ?? "Overview";

  if (patientMode && isGuest) return <div className="public-shell">
    <header className="public-nav"><button className="public-brand" onClick={() => onNavigate("home")}><span className="public-brand-mark"><HeartPulse size={19}/></span><span>medimind<small>CARE, MADE MORE HUMAN</small></span></button><nav aria-label="Main navigation"><button className={section === "doctors" ? "current" : ""} onClick={() => onNavigate("doctors")}>Find a doctor</button><button className={section === "assistant" ? "current" : ""} onClick={() => onNavigate("assistant")}>Care assistant</button></nav><button className="public-nav-cta" onClick={onDoctorPortal}>For clinics <ArrowRight size={15}/></button></header>
    <main className="public-main">{children}</main>
  </div>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><HeartPulse size={19} /></div><span>medimind</span><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace-label">{patientMode ? "YOUR CARE" : adminMode ? "ADMIN" : "PRACTICE"}</div>
      <nav className="side-nav">
        {navigation.map(({ id, label, icon: Icon }) => <button className={`nav-link ${section === id ? "active" : ""}`} key={id} onClick={() => { onNavigate(id); setMobileNav(false); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "appointments" && appointmentsCount > 0 && <span className="nav-count">{appointmentsCount}</span>}</button>)}
      </nav>
      {patientMode && <button className="assistant-promo" onClick={() => onNavigate("assistant")}><div className="promo-icon"><Sparkles size={16} /></div><div><b>Meet your care assistant</b><span>Book care by voice or chat</span></div><ArrowRight size={16} /></button>}
      {!patientMode && <div className="sidebar-bottom"><div className="clinic-pill"><div className="clinic-avatar"><Stethoscope size={16} /></div><div><b>{adminMode ? "Quality workspace" : "Practice workspace"}</b><span>{adminMode ? "Admin portal" : "Doctor portal"}</span></div><ChevronDown size={14} /></div></div>}
      <div className="sidebar-user"><div className="avatar">{initials(user.name)}</div><div className="user-meta"><b>{user.name}</b><span>{isGuest ? "Browsing as guest" : patientMode ? "Patient account" : "Doctor portal"}</span></div>{isGuest ? <button className="guest-signin-button" onClick={onSignIn}>Sign in</button> : <button className="icon-button logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>}</div>
    </aside>
    {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="main-panel">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="breadcrumb"><span>{patientMode ? "Patient space" : adminMode ? "Admin portal" : "Practice portal"}</span><span className="crumb-slash">/</span><b>{activeLabel}</b></div>
        <div className="topbar-actions">{patientMode && <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search doctors or specialties" onFocus={() => onNavigate("doctors")} /></label>}<div className="top-avatar">{initials(user.name)}</div></div>
      </header>
      <div className="content-area">{children}</div>
    </main>
  </div>;
}
