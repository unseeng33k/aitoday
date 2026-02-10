import { describe, expect, it } from "vitest";
import { renderDailyLogBlock, renderOneLineEntries, summarizePromptToHeading } from "../src/markdown";
import { filterEventsForYesterday, groupEventsByTopicWindow } from "../src/normalize";
import type { NormalizedEvent } from "../src/model";

describe("normalization and rendering", () => {
  it("filters yesterday events and renders one-line output", () => {
    const now = new Date("2025-01-11T12:00:00.000Z");
    const events: NormalizedEvent[] = [
      {
        source: "chatgpt",
        timestamp: "2025-01-10T08:00:00.000Z",
        topic: "API",
        oneLineSummary: "Implemented API validation middleware",
        rawRef: "x"
      },
      {
        source: "chatgpt",
        timestamp: "2025-01-10T08:20:00.000Z",
        topic: "API",
        oneLineSummary: "Added tests for bad payloads",
        rawRef: "x"
      },
      {
        source: "claude",
        timestamp: "2025-01-11T09:00:00.000Z",
        topic: "Today",
        oneLineSummary: "Should not appear",
        rawRef: "x"
      }
    ];

    const { dateKey, events: yesterday } = filterEventsForYesterday(events, "UTC", now);
    expect(dateKey).toBe("2025-01-10");
    expect(yesterday).toHaveLength(2);

    const groups = groupEventsByTopicWindow(yesterday, 45);
    expect(groups).toHaveLength(1);
    expect(groups[0].summary).toContain("updates");

    const lines = renderOneLineEntries(groups, "UTC");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^08:00 - \[ChatGPT\]/);

    const block = renderDailyLogBlock(
      lines,
      dateKey,
      "give me a log of everything we talked about yesterday with technical one line timestamps"
    );
    expect(block).not.toContain("MULTI_AI_DAILY_LOG_START");
    expect(block).not.toContain("AI Technical Activity");
    expect(block).toContain("#### ");
  });

  it("creates a 3-10 word heading from prompt", () => {
    const heading = summarizePromptToHeading(
      "give me a log of everything we talked about yesterday. create a simple technical one line log."
    );
    const wordCount = heading.split(" ").filter(Boolean).length;
    expect(wordCount).toBeGreaterThanOrEqual(3);
    expect(wordCount).toBeLessThanOrEqual(10);
  });

  it("uses configured title and markdown heading size", () => {
    const block = renderDailyLogBlock(["08:00 - [ChatGPT] Did work"], "2025-01-10", "ignored prompt", {
      title: "My Custom Log Title",
      markdownHeadingPrefix: "##"
    });
    expect(block).toContain("## My Custom Log Title");
  });

  it("falls back to default heading size when invalid", () => {
    const block = renderDailyLogBlock(["08:00 - [ChatGPT] Did work"], "2025-01-10", "ignored prompt", {
      title: "Title",
      markdownHeadingPrefix: "not-markdown"
    });
    expect(block).toContain("#### Title");
  });
});
