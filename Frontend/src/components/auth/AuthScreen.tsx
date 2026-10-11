import {
  Activity, ArrowRight, HeartPulse, ShieldCheck, Sparkles,
} from "lucide-react";

export function AuthScreen({ role, setRole, registering, setRegistering, onSubmit, error, onContinueAsGuest }: {
  role: "patient" | "doctor" | "admin";
  setRole: (role: "patient" | "doctor" | "admin") => void;
  registering: boolean;
  setRegistering: (value: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  error: string;
  onContinueAsGuest: () => void;
}) {
  return <div className="auth-layout">
    <section className="auth-story">
      <div className="auth-brand"><div className="brand-mark"><HeartPulse size={19} /></div><span>medimind</span></div>
      <div className="story-content"><div className="eyebrow"><span className="live-dot" />CARE THAT LISTENS</div><h1>Feel better about<br />finding <em>better care.</em></h1><p>Find trusted specialists nearby, book appointments in a few simple steps, and let your care assistant help along the way.</p>
        <div className="story-orb"><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /><div className="orb-core"><HeartPulse size={52} strokeWidth={1.4} /></div><span className="orb-spark spark-a"><Sparkles size={16} /></span><span className="orb-spark spark-b"><Activity size={16} /></span></div>
        <div className="trust-note"><div className="trust-icon"><ShieldCheck size={18} /></div><span><b>Your health, handled with care</b><small>Private, thoughtful, and always on your side</small></span></div>
      </div><div className="auth-foot">A little more human. A lot more helpful.<span>© 2026 Medimind</span></div>
    </section>
    <section className="auth-form-side"><div className="auth-form-wrap">
      <div className="form-topline"><span>{registering ? "GET STARTED" : "WELCOME BACK"}</span><div className="role-switch"><button className={role === "patient" ? "selected" : ""} onClick={() => setRole("patient")}>Patient</button><button className={role === "doctor" ? "selected" : ""} onClick={() => setRole("doctor")}>Doctor</button><button className={role === "admin" ? "selected" : ""} onClick={() => { setRole("admin"); setRegistering(false); }}>Admin</button></div></div>
      <h2>{registering ? "Create your account" : role === "patient" ? "Welcome back" : role === "doctor" ? "Welcome back, doctor" : "Admin sign in"}</h2><p className="form-subtitle">{registering ? "A better care experience starts here." : role === "patient" ? "Sign in to find care that feels right." : role === "doctor" ? "Sign in to your practice dashboard." : "Review assistant quality checks and conversation audits."}</p>
      <form className="auth-form" onSubmit={onSubmit}>
        {registering && <label>Full name<input name="name" autoComplete="name" placeholder="Your name" minLength={2} required /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <label>Password<input name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "At least 8 characters" : "Enter your password"} minLength={registering ? 8 : undefined} required /></label>
        {!registering && <div className="forgot-row"><span>Secure sign-in</span><span><ShieldCheck size={13} /> Protected</span></div>}
        {error && <div className="auth-error">{error}</div>}
        <button className="button button-primary auth-submit" type="submit">{registering ? "Create account" : "Sign in"}<ArrowRight size={17} /></button>
      </form>
      {role !== "admin" && <div className="auth-toggle">{registering ? "Already have an account?" : "New to Medimind?"}<button onClick={() => setRegistering(!registering)}>{registering ? "Sign in" : "Create an account"}</button></div>}
      {role === "patient" && <><button className="button button-outline auth-submit guest-entry-button" type="button" onClick={onContinueAsGuest}>Continue without an account</button><div className="auth-assistant-hint"><Sparkles size={17} /><span><b>Explore care as a guest</b><small>Browse clinics, chat with the assistant, and book with your contact details.</small></span></div></>}
      {role === "doctor" && <div className="auth-assistant-hint"><ShieldCheck size={17} /><span><b>Your practice, in one place</b><small>Manage appointments, patients, and your clinic profile.</small></span></div>}
      <div className="auth-legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div>
    </div></section>
  </div>;
}
