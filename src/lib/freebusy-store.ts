import { sqlite } from "@/db";
import { shiftDate } from "@/lib/date";
import { getSmartDaySettings, SmartDayError } from "@/lib/smart-day-store";
import { formatMinute, type SmartDayBlock, type SmartDayWindow } from "@/lib/smart-day-types";
import { isDateKey } from "@/lib/validation";

const MAX_RANGE_DAYS = 31;

type BusyRow = {
  date: string;
  plan_item_id: string;
  task_id: string;
  title: string;
  status: "proposed" | "accepted";
  block: SmartDayBlock;
  start_minute: number;
  end_minute: number;
};

export type FreebusyInterval = {
  block: SmartDayBlock;
  startMinute: number;
  endMinute: number;
  start: string;
  end: string;
};

export type FreebusyBusyInterval = FreebusyInterval & {
  planItemId: string;
  taskId: string;
  title: string;
  status: "proposed" | "accepted";
};

export type FreebusyDay = {
  date: string;
  workWindows: FreebusyInterval[];
  busy: FreebusyBusyInterval[];
  free: FreebusyInterval[];
  freeMinutes: number;
};

export type FreebusyRange = {
  from: string;
  to: string;
  timezone: "Asia/Shanghai";
  days: FreebusyDay[];
};

function interval(block: SmartDayBlock, startMinute: number, endMinute: number): FreebusyInterval {
  return {
    block,
    startMinute,
    endMinute,
    start: formatMinute(startMinute),
    end: formatMinute(endMinute),
  };
}

function dateRange(fromInput: unknown, toInput: unknown): string[] {
  if (!isDateKey(fromInput) || !isDateKey(toInput)) {
    throw new SmartDayError("from 和 to 必须是 YYYY-MM-DD 日期");
  }
  if (fromInput > toInput) throw new SmartDayError("from 不能晚于 to");

  const dates: string[] = [];
  for (let date = fromInput; date <= toInput; date = shiftDate(date, 1)) {
    if (dates.length >= MAX_RANGE_DAYS) {
      throw new SmartDayError(`日期范围不能超过 ${MAX_RANGE_DAYS} 天`);
    }
    dates.push(date);
  }
  return dates;
}

function freeIntervals(windows: SmartDayWindow[], busy: BusyRow[]): FreebusyInterval[] {
  return windows.flatMap((window) => {
    const occupied = busy
      .map((item) => ({
        start: Math.max(window.startMinute, item.start_minute),
        end: Math.min(window.endMinute, item.end_minute),
      }))
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const free: FreebusyInterval[] = [];
    let cursor = window.startMinute;
    for (const item of occupied) {
      if (item.start > cursor) free.push(interval(window.block, cursor, item.start));
      cursor = Math.max(cursor, item.end);
    }
    if (cursor < window.endMinute) free.push(interval(window.block, cursor, window.endMinute));
    return free;
  });
}

export function getFreebusyRange(
  userId: string,
  fromInput: unknown,
  toInput: unknown
): FreebusyRange {
  const dates = dateRange(fromInput, toInput);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const settings = getSmartDaySettings(userId);
  const rows = sqlite
    .prepare(
      `SELECT p.date, i.id AS plan_item_id, i.task_id, t.title, i.status, i.block,
        i.start_minute, i.end_minute
       FROM day_plan_items i
       JOIN day_plans p ON p.id = i.plan_id AND p.user_id = i.user_id
       JOIN tasks t ON t.id = i.task_id AND t.user_id = i.user_id
       WHERE i.user_id = ? AND p.date BETWEEN ? AND ? AND i.status <> 'rejected'
       ORDER BY p.date ASC, i.start_minute ASC, i.end_minute ASC, i.position ASC`
    )
    .all(userId, from, to) as BusyRow[];

  return {
    from,
    to,
    timezone: "Asia/Shanghai",
    days: dates.map((date) => {
      const dayBusy = rows.filter((row) => row.date === date);
      const free = freeIntervals(settings.windows, dayBusy);
      return {
        date,
        workWindows: settings.windows.map((window) =>
          interval(window.block, window.startMinute, window.endMinute)
        ),
        busy: dayBusy.map((item) => ({
          ...interval(item.block, item.start_minute, item.end_minute),
          planItemId: item.plan_item_id,
          taskId: item.task_id,
          title: item.title,
          status: item.status,
        })),
        free,
        freeMinutes: free.reduce((total, item) => total + item.endMinute - item.startMinute, 0),
      };
    }),
  };
}
