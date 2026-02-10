"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MultiAIDailyLogPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/api.ts
var OPENAI_URL = "https://api.openai.com/v1/responses";
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
var RETRYABLE_HTTP_STATUS = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var MAX_REQUEST_ATTEMPTS = 2;
var truncate = (value, max = 240) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No technical response content.";
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
};
function normalizeResponseText(input) {
  if (typeof input === "string") return input;
  return "";
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function readErrorMessageFromPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  if (record.error && typeof record.error === "object") {
    const errorObj = record.error;
    const parts = [errorObj.type, errorObj.status, errorObj.message].filter((part) => typeof part === "string" && part.trim().length > 0).map((part) => part.trim());
    if (parts.length > 0) return parts.join(" - ");
  }
  return "";
}
async function readErrorDetail(response) {
  try {
    const payload = await response.json();
    const fromPayload = readErrorMessageFromPayload(payload);
    if (fromPayload) return fromPayload;
  } catch {
  }
  return "";
}
function buildHttpError(provider, status, detail) {
  if (detail) return new Error(`${provider} request failed (${status}): ${detail}`);
  return new Error(`${provider} request failed (${status})`);
}
function buildNetworkError(provider, cause) {
  const reason = cause instanceof Error ? cause.message : "Unknown network error";
  return new Error(
    `${provider} network error: ${reason}. Check internet, firewall/VPN/proxy, and API endpoint access.`
  );
}
function isRetryableNetworkError(cause) {
  if (!(cause instanceof Error)) return false;
  const message = cause.message.toLowerCase();
  return message.includes("failed to fetch") || message.includes("network") || message.includes("timeout") || message.includes("econnreset") || message.includes("temporar");
}
async function postWithRetry(provider, request) {
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await request();
      if (response.ok) return response;
      const canRetry = RETRYABLE_HTTP_STATUS.has(response.status) && attempt < MAX_REQUEST_ATTEMPTS;
      if (canRetry) {
        await sleep(600 * attempt);
        continue;
      }
      const detail = await readErrorDetail(response);
      throw buildHttpError(provider, response.status, detail);
    } catch (error) {
      if (error instanceof Error && error.message.includes("request failed")) {
        throw error;
      }
      const canRetry = attempt < MAX_REQUEST_ATTEMPTS && isRetryableNetworkError(error);
      if (canRetry) {
        await sleep(600 * attempt);
        continue;
      }
      throw buildNetworkError(provider, error);
    }
  }
  throw new Error(`${provider} request failed (unknown)`);
}
function readOpenAIText(payload) {
  const data = payload;
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const chunks = data.output ?? [];
  const textParts = [];
  for (const chunk of chunks) {
    for (const part of chunk.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
  }
  return textParts.join("\n").trim();
}
function readAnthropicText(payload) {
  const data = payload;
  if (!data?.content) return "";
  return data.content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text ?? "").join("\n").trim();
}
function readGeminiText(payload) {
  const data = payload;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n").trim();
}
async function queryOpenAI(apiKey, model, prompt, fetchFn) {
  const response = await postWithRetry(
    "OpenAI",
    () => fetchFn(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt
      })
    })
  );
  const payload = await response.json();
  return readOpenAIText(payload);
}
async function queryAnthropic(apiKey, model, prompt, fetchFn) {
  const response = await postWithRetry(
    "Anthropic",
    () => fetchFn(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }]
      })
    })
  );
  const payload = await response.json();
  return readAnthropicText(payload);
}
async function queryGemini(apiKey, model, prompt, fetchFn) {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await postWithRetry(
    "Gemini",
    () => fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    })
  );
  const payload = await response.json();
  return readGeminiText(payload);
}
async function queryAllProviders(settings, fetchFn = fetch) {
  const prompt = normalizeResponseText(settings.crossAiPrompt).trim();
  if (!prompt) return [];
  const tasks = [];
  if (settings.openaiApiKey.trim()) {
    tasks.push(
      queryOpenAI(settings.openaiApiKey.trim(), settings.openaiModel.trim(), prompt, fetchFn).then((text) => ({
        source: "chatgpt",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        topic: "Cross-AI API Query",
        oneLineSummary: truncate(text),
        rawRef: "openai-api"
      })).catch((error) => ({
        source: "chatgpt",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        topic: "Cross-AI API Query",
        oneLineSummary: truncate(`OpenAI error: ${error instanceof Error ? error.message : "Unknown error"}`),
        rawRef: "openai-api-error"
      }))
    );
  }
  if (settings.anthropicApiKey.trim()) {
    tasks.push(
      queryAnthropic(settings.anthropicApiKey.trim(), settings.anthropicModel.trim(), prompt, fetchFn).then((text) => ({
        source: "claude",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        topic: "Cross-AI API Query",
        oneLineSummary: truncate(text),
        rawRef: "anthropic-api"
      })).catch((error) => ({
        source: "claude",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        topic: "Cross-AI API Query",
        oneLineSummary: truncate(`Anthropic error: ${error instanceof Error ? error.message : "Unknown error"}`),
        rawRef: "anthropic-api-error"
      }))
    );
  }
  if (settings.geminiApiKey.trim()) {
    tasks.push(
      queryGemini(settings.geminiApiKey.trim(), settings.geminiModel.trim(), prompt, fetchFn).then((text) => ({
        source: "gemini",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        topic: "Cross-AI API Query",
        oneLineSummary: truncate(text),
        rawRef: "gemini-api"
      })).catch((error) => ({
        source: "gemini",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        topic: "Cross-AI API Query",
        oneLineSummary: truncate(`Gemini error: ${error instanceof Error ? error.message : "Unknown error"}`),
        rawRef: "gemini-api-error"
      }))
    );
  }
  const results = await Promise.all(tasks);
  return results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// src/dailyNote.ts
function headingRegex(label) {
  return new RegExp(`^#{1,6}\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
}
function normalizeVaultPath(input) {
  return input.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/\.\//g, "/").replace(/\/$/, "");
}
function extractGenericMarker(content) {
  const start = content.search(/<!-- MULTI_AI_DAILY_LOG_START:[^>]+ -->/);
  if (start === -1) return null;
  const endMatch = /<!-- MULTI_AI_DAILY_LOG_END:[^>]+ -->/.exec(content.slice(start));
  if (!endMatch || endMatch.index === void 0) return null;
  const end = start + endMatch.index + endMatch[0].length;
  return { start, end };
}
function isGeneratedActivityHeading(line) {
  return /^###\s+AI Technical Activity \(\d{4}-\d{2}-\d{2}\)\s*$/.test(line.trim());
}
function isGeneratedLogListItem(line) {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) return false;
  if (/^-\s+\d{2}:\d{2}\s+-\s+\[[^\]]+\]\s+.+$/.test(trimmed)) return true;
  return trimmed === "- No AI activity found from configured providers for yesterday.";
}
function isListItem(line) {
  return typeof line === "string" && line.trim().startsWith("- ");
}
function isMarkdownHeading(line) {
  return /^#{1,6}\s+\S/.test(line.trim());
}
function stripGeneratedLogBlocks(section) {
  const lines = section.split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    const nextNext = lines[i + 2];
    const hasOptionalTitleThenActivity = isMarkdownHeading(current) && isGeneratedActivityHeading(next ?? "") && isListItem(nextNext);
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
function upsertDailyLogInContent(content, block, options) {
  let next = content;
  while (true) {
    const existingRange = extractGenericMarker(next);
    if (!existingRange) break;
    next = `${next.slice(0, existingRange.start).trimEnd()}

${next.slice(existingRange.end).trimStart()}`;
  }
  const startMatch = headingRegex(options.startHeading).exec(next);
  const endMatch = headingRegex(options.endHeading).exec(next);
  if (!startMatch || !endMatch || startMatch.index > endMatch.index) {
    const cleaned = stripGeneratedLogBlocks(next);
    return `${cleaned.trimEnd()}

${block}
`;
  }
  const startLineEnd = next.indexOf("\n", startMatch.index);
  const insertFrom = startLineEnd === -1 ? next.length : startLineEnd + 1;
  const before = next.slice(0, insertFrom).trimEnd();
  const between = stripGeneratedLogBlocks(next.slice(insertFrom, endMatch.index)).trim();
  const after = next.slice(endMatch.index).trimStart();
  const betweenWithSpacing = between ? `
${between}

` : "\n\n";
  return `${before}${betweenWithSpacing}${block}

${after}`.trimEnd() + "\n";
}
function toTodayFileName(now = /* @__PURE__ */ new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}.md`;
}
function formatDateFromPattern(format, now = /* @__PURE__ */ new Date()) {
  const runtimeMoment = globalThis.moment;
  if (runtimeMoment) {
    return runtimeMoment(now).format(format);
  }
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return format.replace(/YYYY/g, yyyy).replace(/MM/g, mm).replace(/DD/g, dd);
}
async function ensureFolderPath(app, folder) {
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
async function resolveTodaysDailyNote(app) {
  const pluginManager = app.internalPlugins;
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

// src/normalize.ts
function formatDateKeyInTimeZone(date, timeZone) {
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
function getLocalDateParts(date, timeZone) {
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
function getYesterdayDateKey(timeZone, now = /* @__PURE__ */ new Date()) {
  const { year, month, day } = getLocalDateParts(now, timeZone);
  const todayUtcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const yesterdayUtcNoon = new Date(todayUtcNoon.getTime() - 24 * 60 * 60 * 1e3);
  return formatDateKeyInTimeZone(yesterdayUtcNoon, timeZone);
}
function dedupeEvents(events) {
  const seen = /* @__PURE__ */ new Set();
  return events.filter((event) => {
    const key = `${event.source}|${event.timestamp}|${event.topic}|${event.oneLineSummary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function summarizeGroup(entries) {
  if (entries.length === 0) return "No technical detail captured.";
  if (entries.length === 1) return entries[0].oneLineSummary;
  const first = entries[0].oneLineSummary;
  return first.endsWith(".") ? `${first} (+${entries.length - 1} updates)` : `${first}. (+${entries.length - 1} updates)`;
}
function groupEventsByTopicWindow(events, windowMinutes = 45) {
  const deduped = dedupeEvents(events);
  const groups = [];
  const windowMs = windowMinutes * 60 * 1e3;
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
function formatTimeInTimeZone(isoTimestamp, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(isoTimestamp));
}

// src/markdown.ts
var sourceLabel = (source) => {
  if (source === "chatgpt") return "ChatGPT";
  if (source === "claude") return "Claude";
  if (source === "gemini") return "Gemini";
  return source;
};
function renderOneLineEntries(groups, timeZone) {
  return groups.map((group) => {
    const hhmm = formatTimeInTimeZone(group.startedAt, timeZone);
    return `${hhmm} - [${sourceLabel(group.source)}] ${group.summary}`;
  });
}
function toTitleCase(value) {
  return value.split(" ").filter(Boolean).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}
function summarizePromptToHeading(prompt) {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const stopWords = /* @__PURE__ */ new Set([
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
function normalizeMarkdownHeadingPrefix(value) {
  const trimmed = value.trim();
  const match = /^#{1,6}$/.exec(trimmed);
  return match ? match[0] : "####";
}
function renderDailyLogBlock(entries, dateKey, crossAiPrompt, options) {
  void dateKey;
  const summaryTitle = options?.title?.trim() || summarizePromptToHeading(crossAiPrompt);
  const headingPrefix = normalizeMarkdownHeadingPrefix(options?.markdownHeadingPrefix ?? "####");
  const body = entries.length > 0 ? entries.map((entry) => `- ${entry}`).join("\n") : "- No AI activity found from configured providers for yesterday.";
  return `${headingPrefix} ${summaryTitle}
${body}`;
}

// src/scheduler.ts
function parseHHmm(value) {
  const [rawH, rawM] = value.split(":");
  const hour = Number(rawH);
  const minute = Number(rawM);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 8, minute: 0 };
  return { hour: Math.max(0, Math.min(23, hour)), minute: Math.max(0, Math.min(59, minute)) };
}
function getLocalHHmmInZone(timeZone, now = /* @__PURE__ */ new Date()) {
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
var DailyScheduler = class {
  constructor(plugin, getTimeZone, runAtLocalTime, shouldRunToday, run) {
    __publicField(this, "timerId", null);
    __publicField(this, "inProgress", false);
    __publicField(this, "plugin");
    __publicField(this, "getTimeZone");
    __publicField(this, "runAtLocalTime");
    __publicField(this, "run");
    __publicField(this, "shouldRunToday");
    this.plugin = plugin;
    this.getTimeZone = getTimeZone;
    this.runAtLocalTime = runAtLocalTime;
    this.shouldRunToday = shouldRunToday;
    this.run = run;
  }
  start() {
    const tick = async () => {
      if (this.inProgress) return;
      const target = parseHHmm(this.runAtLocalTime);
      const current = getLocalHHmmInZone(this.getTimeZone());
      const reached = current.hour > target.hour || current.hour === target.hour && current.minute >= target.minute;
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
    }, 60 * 1e3);
    this.plugin.registerInterval(this.timerId);
    void tick();
  }
};

// src/settings.ts
var import_obsidian = require("obsidian");

// src/settings-model.ts
var DEFAULT_SETTINGS = {
  crossAiPrompt: "give me a log of everything we talked about yesterday. create a simple, technical one line log of everything we spoke about with timestamps for each topic we discussed.",
  logTitle: "",
  logTitleMarkdownSize: "####",
  openaiApiKey: "",
  anthropicApiKey: "",
  geminiApiKey: "",
  openaiModel: "gpt-4o-mini",
  anthropicModel: "claude-3-5-sonnet-latest",
  geminiModel: "gemini-1.5-flash",
  runAtLocalTime: "09:00",
  markerStartHeading: "To Be Completed",
  markerEndHeading: "Linked Mentions"
};

// src/settings.ts
var MultiAIDailyLogSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Multi AI Daily Log Settings" });
    new import_obsidian.Setting(containerEl).setName("Cross-AI prompt").setDesc("Prompt sent to each provider API on run.").addTextArea(
      (text) => text.setValue(this.plugin.settings.crossAiPrompt).onChange(async (value) => {
        this.plugin.settings.crossAiPrompt = value;
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("OpenAI API key").setDesc("Stored locally in plugin data.").addText((text) => {
      text.setValue(this.plugin.settings.openaiApiKey).onChange(async (value) => {
        this.plugin.settings.openaiApiKey = value.trim();
        await this.plugin.savePluginData();
      });
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      return text;
    });
    new import_obsidian.Setting(containerEl).setName("OpenAI model").setDesc("Example: gpt-4o-mini").addText(
      (text) => text.setValue(this.plugin.settings.openaiModel).onChange(async (value) => {
        this.plugin.settings.openaiModel = value.trim() || "gpt-4o-mini";
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Anthropic API key").setDesc("Stored locally in plugin data.").addText((text) => {
      text.setValue(this.plugin.settings.anthropicApiKey).onChange(async (value) => {
        this.plugin.settings.anthropicApiKey = value.trim();
        await this.plugin.savePluginData();
      });
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      return text;
    });
    new import_obsidian.Setting(containerEl).setName("Anthropic model").setDesc("Example: claude-3-5-sonnet-latest").addText(
      (text) => text.setValue(this.plugin.settings.anthropicModel).onChange(async (value) => {
        this.plugin.settings.anthropicModel = value.trim() || "claude-3-5-sonnet-latest";
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Gemini API key").setDesc("Stored locally in plugin data.").addText((text) => {
      text.setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => {
        this.plugin.settings.geminiApiKey = value.trim();
        await this.plugin.savePluginData();
      });
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      return text;
    });
    new import_obsidian.Setting(containerEl).setName("Gemini model").setDesc("Example: gemini-1.5-flash").addText(
      (text) => text.setValue(this.plugin.settings.geminiModel).onChange(async (value) => {
        this.plugin.settings.geminiModel = value.trim() || "gemini-1.5-flash";
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Log title").setDesc("Optional custom title shown above the inserted log.").addText(
      (text) => text.setPlaceholder("Auto-generate from Cross-AI prompt").setValue(this.plugin.settings.logTitle).onChange(async (value) => {
        this.plugin.settings.logTitle = value.trim();
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Log title markdown size").setDesc("Heading syntax used for the title (for example: ##, ###, ####).").addText(
      (text) => text.setPlaceholder("####").setValue(this.plugin.settings.logTitleMarkdownSize).onChange(async (value) => {
        this.plugin.settings.logTitleMarkdownSize = value.trim() || "####";
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Daily run time").setDesc("Local wall clock time (HH:mm) in your system timezone.").addText(
      (text) => text.setValue(this.plugin.settings.runAtLocalTime).onChange(async (value) => {
        this.plugin.settings.runAtLocalTime = value.trim() || "09:00";
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Insert after heading").setDesc("Generated block is inserted after this heading.").addText(
      (text) => text.setValue(this.plugin.settings.markerStartHeading).onChange(async (value) => {
        this.plugin.settings.markerStartHeading = value.trim() || "To Be Completed";
        await this.plugin.savePluginData();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Insert before heading").setDesc("Generated block is inserted before this heading.").addText(
      (text) => text.setValue(this.plugin.settings.markerEndHeading).onChange(async (value) => {
        this.plugin.settings.markerEndHeading = value.trim() || "Linked Mentions";
        await this.plugin.savePluginData();
      })
    );
  }
};

// src/state.ts
function createDefaultState() {
  return { runStateByDate: {} };
}
function hasRunForDate(state, dateKey) {
  return Boolean(state.runStateByDate[dateKey]);
}
function markRunForDate(state, dateKey) {
  return {
    ...state,
    runStateByDate: {
      ...state.runStateByDate,
      [dateKey]: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}

// main.ts
var DEFAULT_PLUGIN_DATA = {
  settings: DEFAULT_SETTINGS,
  ...createDefaultState()
};
var MultiAIDailyLogPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", { ...DEFAULT_SETTINGS });
    __publicField(this, "state", createDefaultState());
    __publicField(this, "scheduler", null);
  }
  getSystemTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  getEffectiveTimezone() {
    return this.getSystemTimezone();
  }
  async onload() {
    await this.loadPluginData();
    this.addSettingTab(new MultiAIDailyLogSettingTab(this.app, this));
    this.addCommand({
      id: "preview-multi-ai-daily-log",
      name: "Preview generated daily AI log",
      callback: async () => {
        const { markdown, dateKey } = await this.generateDailyLogMarkdown();
        new import_obsidian2.Notice(`Preview generated for ${dateKey}.`);
        console.log(markdown);
      }
    });
    this.addCommand({
      id: "generate-multi-ai-daily-log",
      name: "Generate and insert daily AI log",
      callback: async () => {
        await this.generateAndInsertDailyLog(true);
      }
    });
    this.scheduler = new DailyScheduler(
      this,
      () => this.getEffectiveTimezone(),
      this.settings.runAtLocalTime,
      () => {
        const dateKey = getYesterdayDateKey(this.getEffectiveTimezone());
        return !hasRunForDate(this.state, dateKey);
      },
      async () => {
        await this.generateAndInsertDailyLog(false);
      }
    );
    this.scheduler.start();
  }
  async loadPluginData() {
    const loaded = await this.loadData() ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...loaded.settings ?? {} };
    this.state = {
      ...createDefaultState(),
      runStateByDate: loaded.runStateByDate ?? {}
    };
  }
  async savePluginData() {
    await this.saveData({
      settings: this.settings,
      ...this.state
    });
  }
  async collectEvents() {
    return queryAllProviders(this.settings);
  }
  async generateDailyLogMarkdown() {
    const allEvents = await this.collectEvents();
    const timeZone = this.getEffectiveTimezone();
    const dateKey = getYesterdayDateKey(timeZone);
    const groups = groupEventsByTopicWindow(allEvents, 24 * 60);
    const oneLineEntries = renderOneLineEntries(groups, timeZone);
    const markdown = renderDailyLogBlock(oneLineEntries, dateKey, this.settings.crossAiPrompt, {
      title: this.settings.logTitle,
      markdownHeadingPrefix: this.settings.logTitleMarkdownSize
    });
    return { markdown, dateKey };
  }
  async generateAndInsertDailyLog(manualRun) {
    try {
      const { markdown, dateKey } = await this.generateDailyLogMarkdown();
      const hasConfiguredInputs = this.settings.openaiApiKey.trim() || this.settings.anthropicApiKey.trim() || this.settings.geminiApiKey.trim();
      if (!hasConfiguredInputs) {
        new import_obsidian2.Notice("Set at least one provider API key in plugin settings before running.");
        return;
      }
      if (!this.settings.crossAiPrompt.trim()) {
        new import_obsidian2.Notice("Set a Cross-AI prompt before running.");
        return;
      }
      const note = await resolveTodaysDailyNote(this.app);
      const content = await this.app.vault.read(note);
      const updated = upsertDailyLogInContent(content, markdown, {
        startHeading: this.settings.markerStartHeading,
        endHeading: this.settings.markerEndHeading
      });
      await this.app.vault.modify(note, updated);
      this.state = markRunForDate(this.state, dateKey);
      await this.savePluginData();
      if (manualRun) {
        new import_obsidian2.Notice(`Inserted daily AI log for ${dateKey}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      new import_obsidian2.Notice(`Daily AI log failed: ${message}`);
      console.error(error);
    }
  }
};
