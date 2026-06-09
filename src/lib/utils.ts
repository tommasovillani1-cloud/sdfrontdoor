import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Time-of-day greeting in British English, using the user's first name.
 * Per the brief: never use "Good night" as a greeting (reads as farewell).
 * Small-hours window uses a friendly "Working late?".
 *
 * @param firstName  user's first name (already extracted)
 * @param date       defaults to now; injectable for testing
 */
export function timeOfDayGreeting(firstName: string, date = new Date()): string {
  const hour = date.getHours();
  const name = firstName ? `, ${firstName}` : "";

  if (hour >= 5 && hour < 12) return `Good morning${name}`;
  if (hour >= 12 && hour < 18) return `Good afternoon${name}`;
  if (hour >= 18 && hour < 23) return `Good evening${name}`;
  // 23:00–04:59 small hours
  return `Working late${name}?`;
}

/** First name from a display name, falling back to the email local part. */
export function firstNameFrom(
  displayName: string | null | undefined,
  email: string,
): string {
  if (displayName && displayName.trim()) {
    return displayName.trim().split(/\s+/)[0];
  }
  const local = email.split("@")[0] ?? "";
  // tommaso.villani -> Tommaso
  const first = local.split(/[._-]/)[0] ?? local;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}

/** Truncate text to a max length with an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** Format a date for display (British English). */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
