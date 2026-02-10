import { describe, expect, it } from "vitest";
import { queryAllProviders } from "../src/api";
import { DEFAULT_SETTINGS } from "../src/settings-model";

const jsonResponse = (status: number, payload: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  }) as Response;

describe("api query mode", () => {
  it("queries all configured providers and maps normalized events", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      crossAiPrompt: "Summarize yesterday's technical work in one line logs",
      openaiApiKey: "openai-key",
      anthropicApiKey: "anthropic-key",
      geminiApiKey: "gemini-key",
      openaiModel: "gpt-4o-mini",
      anthropicModel: "claude-3-5-sonnet-latest",
      geminiModel: "gemini-1.5-flash"
    };

    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.openai.com")) {
        return jsonResponse(200, { output_text: "OpenAI summary output" });
      }
      if (url.includes("api.anthropic.com")) {
        return jsonResponse(200, { content: [{ type: "text", text: "Anthropic summary output" }] });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: "Gemini summary output" }] } }]
        });
      }
      return jsonResponse(404, {});
    }) as typeof fetch;

    const events = await queryAllProviders(settings, mockFetch);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.source).sort()).toEqual(["chatgpt", "claude", "gemini"]);
    expect(events.every((event) => event.topic === "Cross-AI API Query")).toBe(true);
    expect(events.every((event) => event.oneLineSummary.length > 0)).toBe(true);
  });

  it("retries transient provider failures and returns success", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      crossAiPrompt: "Summarize yesterday",
      openaiApiKey: "openai-key",
      openaiModel: "gpt-4o-mini"
    };

    let openAiCalls = 0;
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("api.openai.com")) return jsonResponse(404, {});
      openAiCalls += 1;
      if (openAiCalls === 1) {
        return jsonResponse(429, { error: { message: "rate limit exceeded" } });
      }
      return jsonResponse(200, { output_text: "Recovered after retry" });
    }) as typeof fetch;

    const events = await queryAllProviders(settings, mockFetch);
    expect(events).toHaveLength(1);
    expect(openAiCalls).toBe(2);
    expect(events[0].oneLineSummary).toContain("Recovered after retry");
  });

  it("surfaces provider error detail in normalized output", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      crossAiPrompt: "Summarize yesterday",
      geminiApiKey: "gemini-key",
      geminiModel: "gemini-1.5-flash"
    };

    const mockFetch = (async () =>
      jsonResponse(400, { error: { message: "API key invalid or API not enabled." } })) as typeof fetch;

    const events = await queryAllProviders(settings, mockFetch);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("gemini");
    expect(events[0].oneLineSummary).toContain("Gemini error:");
    expect(events[0].oneLineSummary).toContain("API key invalid or API not enabled.");
  });
});
