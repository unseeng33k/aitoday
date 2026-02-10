import type { NormalizedEvent } from "./model";
import type { MultiAIDailyLogSettings } from "./settings-model";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_REQUEST_ATTEMPTS = 2;

const truncate = (value: string, max = 240): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No technical response content.";
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
};

function normalizeResponseText(input: unknown): string {
  if (typeof input === "string") return input;
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readErrorMessageFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    message?: unknown;
    error?: unknown;
  };

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }

  if (record.error && typeof record.error === "object") {
    const errorObj = record.error as { message?: unknown; status?: unknown; type?: unknown };
    const parts = [errorObj.type, errorObj.status, errorObj.message]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length > 0) return parts.join(" - ");
  }

  return "";
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    const fromPayload = readErrorMessageFromPayload(payload);
    if (fromPayload) return fromPayload;
  } catch {
    // Ignore JSON parse errors and fallback to status-only message.
  }
  return "";
}

function buildHttpError(provider: string, status: number, detail: string): Error {
  if (detail) return new Error(`${provider} request failed (${status}): ${detail}`);
  return new Error(`${provider} request failed (${status})`);
}

function buildNetworkError(provider: string, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : "Unknown network error";
  return new Error(
    `${provider} network error: ${reason}. Check internet, firewall/VPN/proxy, and API endpoint access.`
  );
}

function isRetryableNetworkError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const message = cause.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("temporar")
  );
}

async function postWithRetry(
  provider: string,
  request: () => Promise<Response>
): Promise<Response> {
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
    } catch (error: unknown) {
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

function readOpenAIText(payload: unknown): string {
  const data = payload as
    | {
        output_text?: string;
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      }
    | undefined;
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const chunks = data.output ?? [];
  const textParts: string[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
  }
  return textParts.join("\n").trim();
}

function readAnthropicText(payload: unknown): string {
  const data = payload as { content?: Array<{ type?: string; text?: string }> } | undefined;
  if (!data?.content) return "";
  return data.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function readGeminiText(payload: unknown): string {
  const data = payload as
    | {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      }
    | undefined;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function queryOpenAI(apiKey: string, model: string, prompt: string, fetchFn: typeof fetch): Promise<string> {
  const response = await postWithRetry("OpenAI", () =>
    fetchFn(OPENAI_URL, {
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
  const payload = (await response.json()) as unknown;
  return readOpenAIText(payload);
}

async function queryAnthropic(apiKey: string, model: string, prompt: string, fetchFn: typeof fetch): Promise<string> {
  const response = await postWithRetry("Anthropic", () =>
    fetchFn(ANTHROPIC_URL, {
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
  const payload = (await response.json()) as unknown;
  return readAnthropicText(payload);
}

async function queryGemini(apiKey: string, model: string, prompt: string, fetchFn: typeof fetch): Promise<string> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await postWithRetry("Gemini", () =>
    fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    })
  );
  const payload = (await response.json()) as unknown;
  return readGeminiText(payload);
}

export async function queryAllProviders(
  settings: MultiAIDailyLogSettings,
  fetchFn: typeof fetch = fetch
): Promise<NormalizedEvent[]> {
  const prompt = normalizeResponseText(settings.crossAiPrompt).trim();
  if (!prompt) return [];

  const tasks: Array<Promise<NormalizedEvent>> = [];

  if (settings.openaiApiKey.trim()) {
    tasks.push(
      queryOpenAI(settings.openaiApiKey.trim(), settings.openaiModel.trim(), prompt, fetchFn)
        .then((text) => ({
          source: "chatgpt" as const,
          timestamp: new Date().toISOString(),
          topic: "Cross-AI API Query",
          oneLineSummary: truncate(text),
          rawRef: "openai-api"
        }))
        .catch((error: unknown) => ({
          source: "chatgpt" as const,
          timestamp: new Date().toISOString(),
          topic: "Cross-AI API Query",
          oneLineSummary: truncate(`OpenAI error: ${error instanceof Error ? error.message : "Unknown error"}`),
          rawRef: "openai-api-error"
        }))
    );
  }

  if (settings.anthropicApiKey.trim()) {
    tasks.push(
      queryAnthropic(settings.anthropicApiKey.trim(), settings.anthropicModel.trim(), prompt, fetchFn)
        .then((text) => ({
          source: "claude" as const,
          timestamp: new Date().toISOString(),
          topic: "Cross-AI API Query",
          oneLineSummary: truncate(text),
          rawRef: "anthropic-api"
        }))
        .catch((error: unknown) => ({
          source: "claude" as const,
          timestamp: new Date().toISOString(),
          topic: "Cross-AI API Query",
          oneLineSummary: truncate(`Anthropic error: ${error instanceof Error ? error.message : "Unknown error"}`),
          rawRef: "anthropic-api-error"
        }))
    );
  }

  if (settings.geminiApiKey.trim()) {
    tasks.push(
      queryGemini(settings.geminiApiKey.trim(), settings.geminiModel.trim(), prompt, fetchFn)
        .then((text) => ({
          source: "gemini" as const,
          timestamp: new Date().toISOString(),
          topic: "Cross-AI API Query",
          oneLineSummary: truncate(text),
          rawRef: "gemini-api"
        }))
        .catch((error: unknown) => ({
          source: "gemini" as const,
          timestamp: new Date().toISOString(),
          topic: "Cross-AI API Query",
          oneLineSummary: truncate(`Gemini error: ${error instanceof Error ? error.message : "Unknown error"}`),
          rawRef: "gemini-api-error"
        }))
    );
  }

  const results = await Promise.all(tasks);
  return results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
