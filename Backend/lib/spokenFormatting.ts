const TIME_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(AM|PM))?\b/gi;
const TIME_ZONE_PATTERN = /\b(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?\b/g;

const formatTime = (hourValue: string, minuteValue: string, meridiem?: string) => {
  let hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (meridiem) {
    const isPm = meridiem.toUpperCase() === "PM";
    hour = hour % 12 + (isPm ? 12 : 0);
  }
  const spokenHour = hour % 12 || 12;
  const spokenMinute = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${spokenHour}${spokenMinute} ${hour >= 12 ? "PM" : "AM"}`;
};

export const formatSpokenTime = (value: unknown) => {
  if (typeof value !== "string") return value;
  return value.replace(TIME_PATTERN, (_match, hour: string, minute: string, meridiem?: string) =>
    formatTime(hour, minute, meridiem)
  );
};

export const getSpokenTimeZoneName = (timeZone: string | undefined) => {
  if (!timeZone) return undefined;
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") return "India Standard Time";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone,
      timeZoneName: "long",
    }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
  } catch {
    return undefined;
  }
};

export const formatSpokenResponse = (value: string) => {
  const formattedTimes = value.replace(TIME_PATTERN, (_match, hour: string, minute: string, meridiem?: string) =>
    formatTime(hour, minute, meridiem)
  );
  return formattedTimes.replace(TIME_ZONE_PATTERN, (timeZone) =>
    getSpokenTimeZoneName(timeZone) ?? "the clinic's local time"
  );
};
