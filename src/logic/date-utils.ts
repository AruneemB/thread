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
