import type { App, TFile } from "obsidian";

export interface InsertionOptions {
  startHeading: string;
  endHeading: string;
}

function headingRegex(label: string): RegExp {
  return new RegExp(`^#{1,6}\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
}

function normalizeVaultPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/\.\//g, "/")
    .replace(/\/$/, "");
}

function extractGenericMarker(content: string): { start: number; end: number } | null {
  const start = content.search(/<!-- MULTI_AI_DAILY_LOG_START:[^>]+ -->/);
  if (start === -1) return null;
  const endMatch = /<!-- MULTI_AI_DAILY_LOG_END:[^>]+ -->/.exec(content.slice(start));
  if (!endMatch || endMatch.index === undefined) return null;
  const end = start + endMatch.index + endMatch[0].length;
  return { start, end };
}

function isGeneratedActivityHeading(line: string): boolean {
  return /^###\s+AI Technical Activity \(\d{4}-\d{2}-\d{2}\)\s*$/.test(line.trim());
}

function isGeneratedLogListItem(line: string | undefined): boolean {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) return false;
  if (/^-\s+\d{2}:\d{2}\s+-\s+\[[^\]]+\]\s+.+$/.test(trimmed)) return true;
  return trimmed === "- No AI activity found from configured providers for yesterday.";
}

function isListItem(line: string | undefined): boolean {
  return typeof line === "string" && line.trim().startsWith("- ");
}

function isMarkdownHeading(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line.trim());
}

function stripGeneratedLogBlocks(section: string): string {
  const lines = section.split("\n");
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    const nextNext = lines[i + 2];

    const hasOptionalTitleThenActivity =
      isMarkdownHeading(current) && isGeneratedActivityHeading(next ?? "") && isListItem(nextNext);
    const hasTitleThenGeneratedLogItems = isMarkdownHeading(current) && isGeneratedLogListItem(next);
    const hasActivityHeading = isGeneratedActivityHeading(current) && isListItem(next);

    if (hasOptionalTitleThenActivity) {
      i += 2;
      while (i < lines.length && isListItem(lines[i])) {
        i++;
      }
      while (i < lines.length && !lines[i].trim()) {
        i++;
      }
      i -= 1;
      continue;
    }

    if (hasTitleThenGeneratedLogItems) {
      i += 1;
      while (i < lines.length && isGeneratedLogListItem(lines[i])) {
        i++;
      }
      while (i < lines.length && !lines[i].trim()) {
        i++;
      }
      i -= 1;
      continue;
    }

    if (hasActivityHeading) {
      i += 1;
      while (i < lines.length && isListItem(lines[i])) {
        i++;
      }
      while (i < lines.length && !lines[i].trim()) {
        i++;
      }
      i -= 1;
      continue;
    }

    kept.push(current);
  }

  return kept.join("\n");
}

export function upsertDailyLogInContent(content: string, block: string, options: InsertionOptions): string {
  let next = content;

  while (true) {
    const existingRange = extractGenericMarker(next);
    if (!existingRange) break;
    next = `${next.slice(0, existingRange.start).trimEnd()}\n\n${next.slice(existingRange.end).trimStart()}`;
  }

  const startMatch = headingRegex(options.startHeading).exec(next);
  const endMatch = headingRegex(options.endHeading).exec(next);

  if (!startMatch || !endMatch || startMatch.index > endMatch.index) {
    const cleaned = stripGeneratedLogBlocks(next);
    return `${cleaned.trimEnd()}\n\n${block}\n`;
  }

  const startLineEnd = next.indexOf("\n", startMatch.index);
  const insertFrom = startLineEnd === -1 ? next.length : startLineEnd + 1;
  const before = next.slice(0, insertFrom).trimEnd();
  const between = stripGeneratedLogBlocks(next.slice(insertFrom, endMatch.index)).trim();
  const after = next.slice(endMatch.index).trimStart();
  const betweenWithSpacing = between ? `\n${between}\n\n` : "\n\n";
  return `${before}${betweenWithSpacing}${block}\n\n${after}`.trimEnd() + "\n";
}

function toTodayFileName(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}.md`;
}

function formatDateFromPattern(format: string, now = new Date()): string {
  const runtimeMoment = (globalThis as { moment?: (input?: Date) => { format: (fmt: string) => string } }).moment;
  if (runtimeMoment) {
    return runtimeMoment(now).format(format);
  }

  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return format.replace(/YYYY/g, yyyy).replace(/MM/g, mm).replace(/DD/g, dd);
}

async function ensureFolderPath(app: App, folder: string): Promise<void> {
  const normalized = normalizeVaultPath(folder);
  if (!normalized) return;
  const segments = normalized.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

export async function resolveTodaysDailyNote(app: App): Promise<TFile> {
  const pluginManager = (app as App & {
    internalPlugins?: {
      getPluginById?: (id: string) => {
        instance?: {
          options?: { folder?: string; format?: string };
        };
      };
    };
  }).internalPlugins;

  const dailyNotesPlugin = pluginManager?.getPluginById?.("daily-notes");
  if (!dailyNotesPlugin?.instance?.options) {
    throw new Error("Daily Notes plugin is not enabled or not initialized.");
  }

  const folder = dailyNotesPlugin?.instance?.options?.folder ?? "";
  const format = dailyNotesPlugin?.instance?.options?.format ?? "YYYY-MM-DD";
  const fileName = `${formatDateFromPattern(format)}.md`;
  const resolvedName = fileName.trim() ? fileName : toTodayFileName();
  const path = normalizeVaultPath(folder ? `${folder}/${resolvedName}` : resolvedName);
  const existing = app.vault.getFileByPath(path);
  if (existing) return existing;

  await ensureFolderPath(app, folder);
  const created = await app.vault.create(path, "");
  return created;
}
