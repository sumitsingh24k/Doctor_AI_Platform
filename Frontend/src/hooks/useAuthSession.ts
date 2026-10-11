import { useEffect, useState } from "react";
import { api, signIn, signUp, type User } from "../api";

export function useAuthSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authRole, setAuthRole] = useState<"patient" | "doctor" | "admin">("patient");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setError("Your session expired. Sign in again to continue.");
    };
    window.addEventListener("medimind:session-expired", handleSessionExpired);
    const params = new URLSearchParams(window.location.search);
    const calendarStatus = params.get("calendar");
    if (calendarStatus === "connected") setNotice("Google Calendar connected. Your clinic events will appear in the calendar.");
    if (calendarStatus === "cancelled") setError("Google Calendar connection was cancelled.");
    if (calendarStatus === "denied") setError("Google blocked Calendar access because this OAuth app is restricted to approved testers or has not completed verification. Add this doctor as a test user for development, or publish and verify the app in Google Cloud for all doctors.");
    if (calendarStatus === "expired") setError("Google Calendar connection timed out. Start the connection again and complete Google's consent screen within 30 minutes.");
    if (calendarStatus === "error") setError("Google Calendar could not be connected. Check your Google OAuth settings and try again.");
    if (calendarStatus) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }

    api<{ accessToken: string; user: User }>("/api/auth/refresh", { method: "POST" })
      .then((result) => {
        localStorage.setItem("medimind.accessToken", result.accessToken);
        setUser(result.user);
      })
      .catch(() => localStorage.removeItem("medimind.accessToken"))
      .finally(() => setLoadingSession(false));
    return () => window.removeEventListener("medimind:session-expired", handleSessionExpired);
  }, []);

  const authenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    try {
      let nextUser: User;
      if (registering) {
        if (authRole === "admin") throw new Error("Admin accounts cannot be created from the public registration form.");
        nextUser = await signUp(name, email, password, authRole);
      } else {
        nextUser = await signIn(email, password);
      }
      if (nextUser.role !== authRole && !registering) {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        localStorage.removeItem("medimind.accessToken");
        throw new Error(`This account is registered as a ${nextUser.role}. Choose the matching sign-in option.`);
      }
      setUser(nextUser);
      setNotice(`Welcome${nextUser.name ? `, ${nextUser.name.split(" ")[0]}` : ""}!`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    }
  };

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear local session even if logout cannot reach the backend.
    }
    localStorage.removeItem("medimind.accessToken");
    setUser(null);
    setNotice("");
    setError("");
  };

  return {
    user, setUser, loadingSession, authRole, setAuthRole, registering, setRegistering,
    error, setError, notice, setNotice, authenticate, logout,
  };
}
