import type { TopicGroup } from "./model";
import { formatTimeInTimeZone } from "./normalize";

const sourceLabel = (source: string): string => {
  if (source === "chatgpt") return "ChatGPT";
  if (source === "claude") return "Claude";
  if (source === "gemini") return "Gemini";
  return source;
};

export function renderOneLineEntries(groups: TopicGroup[], timeZone: string): string[] {
  return groups.map((group) => {
    const hhmm = formatTimeInTimeZone(group.startedAt, timeZone);
    return `${hhmm} - [${sourceLabel(group.source)}] ${group.summary}`;
  });
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function summarizePromptToHeading(prompt: string): string {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ").filter(Boolean);
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "for",
    "with",
    "we",
    "i",
    "me",
    "my",
    "as",
    "it",
    "is",
    "this",
    "that",
    "what",
    "give",
    "create",
    "think"
  ]);

  const meaningful = words.filter((word) => !stopWords.has(word));
  let selected = meaningful.slice(0, 7);
  if (selected.length < 3) {
    selected = words.slice(0, 5);
  }
  if (selected.length < 3) {
    return "Daily Cross-AI Technical Log";
  }
  if (selected.length > 10) {
    selected = selected.slice(0, 10);
  }
  return toTitleCase(selected.join(" "));
}

function normalizeMarkdownHeadingPrefix(value: string): string {
  const trimmed = value.trim();
  const match = /^#{1,6}$/.exec(trimmed);
  return match ? match[0] : "####";
}

export function renderDailyLogBlock(
  entries: string[],
  dateKey: string,
  crossAiPrompt: string,
  options?: { title?: string; markdownHeadingPrefix?: string }
): string {
  void dateKey;
  const summaryTitle = options?.title?.trim() || summarizePromptToHeading(crossAiPrompt);
  const headingPrefix = normalizeMarkdownHeadingPrefix(options?.markdownHeadingPrefix ?? "####");
  const body =
    entries.length > 0
      ? entries.map((entry) => `- ${entry}`).join("\n")
      : "- No AI activity found from configured providers for yesterday.";
  return `${headingPrefix} ${summaryTitle}
${body}`;
}
