import * as chrono from "chrono-node";

const pad = (value: number) => String(value).padStart(2, "0");

const formatDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : undefined;
};

const formatParsedDate = (date: Date) =>
  formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());

const parseNumericDate = (input: string) => {
  const match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!match) return undefined;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  // Indian-style day/month is the default; use month/day when unambiguous.
  return second > 12 && first <= 12
    ? formatDate(year, first, second)
    : formatDate(year, second, first);
};

export const normalizeAppointmentDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const input = value.trim().replace(/\s+/g, " ");
  if (!input) return undefined;

  const numericDate = parseNumericDate(input);
  if (numericDate) return numericDate;

  const dayOnlyMatch = input.match(/^on the (\d{1,2})(?:st|nd|rd|th)?$/i);
  if (dayOnlyMatch) {
    const today = new Date();
    return formatDate(today.getFullYear(), today.getMonth() + 1, Number(dayOnlyMatch[1]));
  }

  const parsed = chrono.parseDate(input, new Date(), { forwardDate: false });
  return parsed ? formatParsedDate(parsed) : undefined;
};

export const isAppointmentDateInPast = (value: string) => {
  const today = new Date();
  const todayDate = formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate())!;
  return value < todayDate;
};

export const isWithinBookingWindow = (value: string) => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const latest = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);
  const requested = new Date(`${value}T00:00:00`);
  return requested >= start && requested <= latest;
};