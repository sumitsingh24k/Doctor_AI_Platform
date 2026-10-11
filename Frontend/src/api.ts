export type AccountRole = "patient" | "doctor" | "admin";

export class ApiError extends Error {
  constructor(message: string, public readonly data: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export type User = {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  doctorId?: string | null;
};

export type Doctor = {
  _id: string;
  name: string;
  specialization: string;
  qualification: string;
  clinicAddress: string;
  clinicName: string;
  aboutDoctor: string;
  clinicOpeningTime: string;
  clinicClosingTime: string;
  appointmentDurationMinutes?: number;
  calendarConnected?: boolean;
  distanceKm: number | null;
  clinicLatitude?: number | null;
  clinicLongitude?: number | null;
};

export type Appointment = {
  _id: string;
  patientName: string;
  phoneNumber: string;
  appointmentDate: string;
  appointmentTime: string;
  status: "booked" | "completed" | "cancelled";
  visitType?: string;
};

let refreshInFlight: Promise<string | null> | null = null;

const refreshAccessToken = () => {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const refreshed = await response.json() as { accessToken?: string };
        if (!refreshed.accessToken) return null;
        localStorage.setItem("medimind.accessToken", refreshed.accessToken);
        return refreshed.accessToken;
      })
      .catch(() => null)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const setAccessToken = (token: string | null) => {
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
  };
  setAccessToken(localStorage.getItem("medimind.accessToken"));
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const send = () => fetch(path, { ...init, credentials: "include", headers });
  let response = await send();
  if (
    response.status === 401 &&
    path !== "/api/auth/refresh" &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/register"
  ) {
    const hadAccessToken = Boolean(localStorage.getItem("medimind.accessToken"));
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      setAccessToken(refreshedToken);
      response = await send();
    } else {
      localStorage.removeItem("medimind.accessToken");
      setAccessToken(null);
      if (hadAccessToken) window.dispatchEvent(new Event("medimind:session-expired"));
    }
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String(data.message)
        : `Request failed (${response.status})`;
    throw new ApiError(message, data);
  }
  return data as T;
}

export async function signIn(email: string, password: string) {
  const result = await api<{ accessToken: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("medimind.accessToken", result.accessToken);
  return result.user;
}

export async function signUp(name: string, email: string, password: string, role: "patient" | "doctor") {
  const result = await api<{ accessToken: string; user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, role }),
  });
  localStorage.setItem("medimind.accessToken", result.accessToken);
  return result.user;
}
