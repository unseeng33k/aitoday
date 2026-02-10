import type { NormalizedEvent, TopicGroup } from "./model";

function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function getLocalDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
    month: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    day: Number(parts.find((p) => p.type === "day")?.value ?? "1")
  };
}

export function getYesterdayDateKey(timeZone: string, now = new Date()): string {
  const { year, month, day } = getLocalDateParts(now, timeZone);
  const todayUtcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const yesterdayUtcNoon = new Date(todayUtcNoon.getTime() - 24 * 60 * 60 * 1000);
  return formatDateKeyInTimeZone(yesterdayUtcNoon, timeZone);
}

export function filterEventsForYesterday(
  events: NormalizedEvent[],
  timeZone: string,
  now = new Date()
): { dateKey: string; events: NormalizedEvent[] } {
  const dateKey = getYesterdayDateKey(timeZone, now);
  const filtered = events
    .filter((event) => formatDateKeyInTimeZone(new Date(event.timestamp), timeZone) === dateKey)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return { dateKey, events: filtered };
}

function dedupeEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.source}|${event.timestamp}|${event.topic}|${event.oneLineSummary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeGroup(entries: NormalizedEvent[]): string {
  if (entries.length === 0) return "No technical detail captured.";
  if (entries.length === 1) return entries[0].oneLineSummary;
  const first = entries[0].oneLineSummary;
  return first.endsWith(".") ? `${first} (+${entries.length - 1} updates)` : `${first}. (+${entries.length - 1} updates)`;
}

export function groupEventsByTopicWindow(events: NormalizedEvent[], windowMinutes = 45): TopicGroup[] {
  const deduped = dedupeEvents(events);
  const groups: TopicGroup[] = [];
  const windowMs = windowMinutes * 60 * 1000;

  for (const event of deduped) {
    const currentTime = new Date(event.timestamp).getTime();
    const last = groups[groups.length - 1];
    if (!last) {
      groups.push({
        source: event.source,
        topic: event.topic,
        startedAt: event.timestamp,
        entries: [event],
        summary: event.oneLineSummary
      });
      continue;
    }

    const lastTime = new Date(last.entries[last.entries.length - 1].timestamp).getTime();
    const isSameTrack = last.source === event.source && last.topic === event.topic && currentTime - lastTime <= windowMs;
    if (isSameTrack) {
      last.entries.push(event);
      last.summary = summarizeGroup(last.entries);
    } else {
      groups.push({
        source: event.source,
        topic: event.topic,
        startedAt: event.timestamp,
        entries: [event],
        summary: event.oneLineSummary
      });
    }
  }

  return groups;
}

export function formatTimeInTimeZone(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(isoTimestamp));
}
