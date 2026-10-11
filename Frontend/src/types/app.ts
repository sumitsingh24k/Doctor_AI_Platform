import type { Appointment, Doctor } from "../api";

export type Section =
  | "home"
  | "doctors"
  | "assistant"
  | "appointments"
  | "calendar"
  | "patients"
  | "knowledge"
  | "settings";

export type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  transcript?: boolean;
};

export type Availability = {
  date: string;
  timeZone?: string;
  slots: string[];
  suggestedSlots?: string[];
};

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type PatientCareActions = {
  appointments: Appointment[];
  appointmentsLoading: boolean;
  loadAppointments: () => Promise<void>;
  doctors: Doctor[];
  displayedDoctors: Doctor[];
  doctorsLoading: boolean;
  location: LocationCoordinates | null;
  locationMessage: string;
  requestLocation: () => void;
  search: string;
  setSearch: (value: string) => void;
  specialty: string;
  setSpecialty: (value: string) => void;
  selectedDoctor: Doctor | null;
  openBooking: (doctor: Doctor) => void;
  closeBooking: () => void;
  bookDate: string;
  setBookDate: (value: string) => void;
  bookTime: string;
  setBookTime: (value: string) => void;
  availability: Availability | null;
  availabilityLoading: boolean;
  bookPhone: string;
  setBookPhone: (value: string) => void;
  bookAddress: string;
  setBookAddress: (value: string) => void;
  checkAvailability: () => Promise<void>;
  confirmBooking: () => Promise<void>;
};
