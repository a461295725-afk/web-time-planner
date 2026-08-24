export function todayKey(): string {
  return todayKeyAt(new Date());
}

export function todayKeyAt(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function filterDateItemsForMonth<T extends { date: string }>(
  items: T[],
  monthKey: string
): T[] {
  return items.filter((item) => item.date.startsWith(`${monthKey}-`));
}

export function displayDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function dateAtChinaMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

export function shiftDate(dateKey: string, days: number): string {
  const date = dateAtChinaMidnight(dateKey);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function weekStartKey(dateKey: string): string {
  const date = dateAtChinaMidnight(dateKey);
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(date);
  const weekday =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayName) + 1;
  return shiftDate(dateKey, 1 - weekday);
}

export function weekDateKeys(startDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDate(startDate, index));
}

export function displayWeekRange(startDate: string): string {
  const endDate = shiftDate(startDate, 6);
  const format = (dateKey: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
    }).format(dateAtChinaMidnight(dateKey));
  return `${format(startDate)} - ${format(endDate)}`;
}
