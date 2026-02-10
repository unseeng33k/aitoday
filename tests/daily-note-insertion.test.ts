import { describe, expect, it } from "vitest";
import { upsertDailyLogInContent } from "../src/dailyNote";

describe("daily note insertion", () => {
  it("inserts block between headings", () => {
    const input = `# Daily Note

## To Be Completed
- task

## Linked Mentions
- [[x]]
`;
    const block = `#### Daily Cross-AI Technical Log
- 08:00 - [ChatGPT] Implemented parser`;

    const output = upsertDailyLogInContent(input, block, {
      startHeading: "To Be Completed",
      endHeading: "Linked Mentions"
    });

    expect(output).toContain(block);
    expect(output.indexOf("To Be Completed")).toBeLessThan(output.indexOf("Daily Cross-AI Technical Log"));
    expect(output.indexOf("Daily Cross-AI Technical Log")).toBeLessThan(output.indexOf("Linked Mentions"));
  });

  it("replaces previously inserted block", () => {
    const existing = `## To Be Completed
#### Daily Cross-AI Technical Log
### AI Technical Activity (2025-01-09)
- old
## Linked Mentions`;
    const nextBlock = `#### Daily Cross-AI Technical Log
- 08:00 - [ChatGPT] new`;

    const output = upsertDailyLogInContent(existing, nextBlock, {
      startHeading: "To Be Completed",
      endHeading: "Linked Mentions"
    });

    expect(output).not.toContain("2025-01-09");
    expect(output.match(/Daily Cross-AI Technical Log/g)?.length ?? 0).toBe(1);
    expect(output).toContain("- 08:00 - [ChatGPT] new");
  });
});
