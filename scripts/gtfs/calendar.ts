import type { GtfsFeed } from "./archive";
import { field, unique } from "./values";

const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const dayMillis = 86_400_000;
type Rule = { start: string; end: string; days: boolean[] };
type Exception = { date: string; added: boolean };

function parseDate(value: string): number {
  if (!/^\d{8}$/.test(value)) throw new Error(`Invalid GTFS date: ${value}`);
  const date = Date.parse(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T00:00:00Z`,
  );
  if (!Number.isFinite(date) || dateKey(date) !== value)
    throw new Error(`Invalid GTFS date: ${value}`);
  return date;
}

function dateKey(date: number) {
  return new Date(date).toISOString().slice(0, 10).replaceAll("-", "");
}

export async function readCalendars(feed: GtfsFeed) {
  const rules = new Map<string, Rule>();
  const exceptions = new Map<string, Map<string, Exception>>();
  if (feed.files.has("calendar.txt")) {
    for await (const row of feed.rows("calendar.txt", [
      "service_id",
      "start_date",
      "end_date",
      ...weekdays,
    ])) {
      const start = field(row, "start_date");
      const end = field(row, "end_date");
      if (parseDate(end) < parseDate(start))
        throw new Error("Calendar ends before it starts");
      const days = weekdays.map((day) => {
        const value = field(row, day);
        if (value !== "0" && value !== "1")
          throw new Error(`Invalid ${day} flag: ${value}`);
        return value === "1";
      });
      unique(rules, field(row, "service_id"), { start, end, days });
    }
  }
  if (feed.files.has("calendar_dates.txt")) {
    for await (const row of feed.rows("calendar_dates.txt", [
      "service_id",
      "date",
      "exception_type",
    ])) {
      const id = field(row, "service_id");
      const date = field(row, "date");
      parseDate(date);
      const type = field(row, "exception_type");
      if (type !== "1" && type !== "2")
        throw new Error(`Invalid exception_type: ${type}`);
      const dates = exceptions.get(id) ?? new Map<string, Exception>();
      unique(dates, date, { date, added: type === "1" });
      exceptions.set(id, dates);
    }
  }

  return new Map(
    [...new Set([...rules.keys(), ...exceptions.keys()])].map((id) => {
      const rule = rules.get(id);
      const overrides = exceptions.get(id);
      const activeDates = new Set<string>();
      if (rule?.days.some(Boolean)) {
        const end = parseDate(rule.end);
        for (let date = parseDate(rule.start); date <= end; date += dayMillis) {
          if (rule.days[new Date(date).getUTCDay()])
            activeDates.add(dateKey(date));
        }
      }
      for (const { date, added } of overrides?.values() ?? []) {
        if (added) activeDates.add(date);
        else activeDates.delete(date);
      }
      const dates = [...activeDates].sort();
      return [
        id,
        {
          rule,
          exceptions: [...(overrides?.values() ?? [])],
          start: dates[0],
          end: dates.at(-1),
        },
      ] as const;
    }),
  );
}
