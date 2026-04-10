/**
 * Subtracts one day from a date string in "YYYY-MM-DD" format.
 * @param dateStr Date string in "YYYY-MM-DD" format.
 * @returns New date string one day earlier in "YYYY-MM-DD" format.
 */
export function subtractOneDay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split("T")[0];
}

/**
 * Adds one day to a date string in "YYYY-MM-DD" format.
 * @param dateStr Date string in "YYYY-MM-DD" format.
 * @returns New date string one day later in "YYYY-MM-DD" format.
 */
export function addOneDay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split("T")[0];
}

/**
 * Formats a date string "YYYY-MM-DD" into "MMM D, YYYY" (e.g., "Jan 15, 2025").
 * @param dateStr Date string in "YYYY-MM-DD" format.
 * @returns Formatted date string.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Returns today's date in "YYYY-MM-DD" format in UTC.
 * @returns Date string.
 */
export function getTodayISOString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Returns the date N weeks ago from today in "YYYY-MM-DD" format.
 * @param weeks Number of weeks.
 * @returns Date string.
 */
export function getDateNWeeksAgo(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().split("T")[0];
}

/**
 * Returns the day of the week for a date string (0=Mon, 6=Sun).
 * @param dateStr Date string in "YYYY-MM-DD" format.
 * @returns Day of week (0-6).
 */
export function getDayOfWeek(dateStr: string): number {
  const date = new Date(dateStr + "T00:00:00Z");
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return (day + 6) % 7; // 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
}
