import type { Plugin } from "obsidian";

export type ScheduledRunner = () => Promise<void>;

function parseHHmm(value: string): { hour: number; minute: number } {
  const [rawH, rawM] = value.split(":");
  const hour = Number(rawH);
  const minute = Number(rawM);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 8, minute: 0 };
  return { hour: Math.max(0, Math.min(23, hour)), minute: Math.max(0, Math.min(59, minute)) };
}

function getLocalHHmmInZone(timeZone: string, now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  };
}

export class DailyScheduler {
  private timerId: number | null = null;
  private inProgress = false;
  private readonly plugin: Plugin;
  private readonly getTimeZone: () => string;
  private readonly runAtLocalTime: string;
  private readonly run: ScheduledRunner;
  private readonly shouldRunToday: () => boolean;

  constructor(
    plugin: Plugin,
    getTimeZone: () => string,
    runAtLocalTime: string,
    shouldRunToday: () => boolean,
    run: ScheduledRunner
  ) {
    this.plugin = plugin;
    this.getTimeZone = getTimeZone;
    this.runAtLocalTime = runAtLocalTime;
    this.shouldRunToday = shouldRunToday;
    this.run = run;
  }

  start(): void {
    const tick = async (): Promise<void> => {
      if (this.inProgress) return;
      const target = parseHHmm(this.runAtLocalTime);
      const current = getLocalHHmmInZone(this.getTimeZone());
      const reached = current.hour > target.hour || (current.hour === target.hour && current.minute >= target.minute);
      if (!reached || !this.shouldRunToday()) return;

      this.inProgress = true;
      try {
        await this.run();
      } finally {
        this.inProgress = false;
      }
    };

    this.timerId = window.setInterval(() => {
      void tick();
    }, 60 * 1000);
    this.plugin.registerInterval(this.timerId);
    void tick();
  }
}
