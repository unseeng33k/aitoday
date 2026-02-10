import { App, moment, Notice, Plugin, PluginSettingTab, Setting, TFile, Vault } from "obsidian";

interface AiDailyLogSettings {
  dailyNoteFolder: string;
  dailyNoteFilenameFormat: string;
  insertionAfterHeading: string;
  insertionBeforeHeading: string;
  lastRunDate: string | null;

  // Provider toggles
  enableGemini: boolean;
  enableChatGPT: boolean;
  enableClaude: boolean;

  // API keys – stored locally in Obsidian's plugin data
  geminiApiKey: string;
  openaiApiKey: string;
  claudeApiKey: string;
}

type ProviderId = "gemini" | "chatgpt" | "claude";

interface NormalizedEvent {
  provider: ProviderId;
  conversationId: string;
  timestamp: string; // ISO string
  summary: string; // one-line technical summary
}

const DEFAULT_SETTINGS: AiDailyLogSettings = {
  // Folder that contains your daily notes (inside the vault)
  // You can set this in the plugin settings to match:
  // /Users/mpruskowski/Desktop/AMP/_Archive/Pruskowski/Me
  // relative to your Obsidian vault root.
  dailyNoteFolder: "",

  // Filename format using moment.js tokens, e.g. "YYYY-MM-DD.md"
  dailyNoteFilenameFormat: "YYYY-MM-DD.md",

  // Headings in the daily note that define where to insert the log
  insertionAfterHeading: "To Be Completed",
  insertionBeforeHeading: "Linked Mentions",

  // ISO date string when the job last ran successfully
  lastRunDate: null,

  // Providers enabled by default
  enableGemini: false,
  enableChatGPT: false,
  enableClaude: false,

  // Empty API keys by default – user supplies them in settings
  geminiApiKey: "",
  openaiApiKey: "",
  claudeApiKey: "",
};

export default class AiDailyLogPlugin extends Plugin {
  settings: AiDailyLogSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new AiDailyLogSettingTab(this.app, this));

    // Run once on startup if we missed 7am today
    this.maybeRunForToday();

    // Check every minute whether it's time to run (and hasn't run yet today).
    const oneMinute = 60 * 1000;
    this.registerInterval(
      window.setInterval(() => {
        this.checkScheduleAndRun();
      }, oneMinute)
    );
  }

  onunload() {
    // Nothing special; intervals are cleaned up by registerInterval
  }

  private async checkScheduleAndRun() {
    const now = moment();
    const hour = now.hour();
    const minute = now.minute();

    // Run at 7:00 (within the first minute) local time
    if (hour === 7 && minute === 0) {
      await this.maybeRunForToday();
    }
  }

  /**
   * Ensures the job runs at most once per calendar day.
   * Also runs on startup if lastRunDate is before today.
   */
  private async maybeRunForToday() {
    const today = moment().format("YYYY-MM-DD");
    if (this.settings.lastRunDate === today) {
      return;
    }

    try {
      await this.appendYesterdayLogIntoTodayNote();
      this.settings.lastRunDate = today;
      await this.saveSettings();
    } catch (err) {
      console.error("AI Daily Log: failed to run", err);
      new Notice("AI Daily Log: failed to append yesterday's AI log. See console for details.");
    }
  }

  /**
   * Main workflow:
   * 1. Gather all AI conversations from "yesterday".
   * 2. Transform them into a one-line-per-topic technical markdown log with timestamps.
   * 3. Open today's daily note.
   * 4. Insert markdown block below "To Be Completed" and before "Linked Mentions".
   */
  private async appendYesterdayLogIntoTodayNote() {
    const vault = this.app.vault;

    const yesterdayStart = moment().subtract(1, "day").startOf("day");
    const yesterdayEnd = moment().subtract(1, "day").endOf("day");

    // TODO: Replace this stub with real logic that pulls your AI conversations
    // from the tools you actually use (ChatGPT export, Cursor logs, etc.).
    const aiConversationsMarkdown = await this.buildYesterdayAiLogMarkdown(
      yesterdayStart.toISOString(),
      yesterdayEnd.toISOString()
    );

    if (!aiConversationsMarkdown || aiConversationsMarkdown.trim().length === 0) {
      console.log("AI Daily Log: no AI conversations found for yesterday.");
      return;
    }

    const todayFile = await this.getTodayDailyNoteFile(vault);
    if (!todayFile) {
      throw new Error("Could not find today's daily note using current settings.");
    }

    const currentContent = await vault.read(todayFile);
    const newContent = this.insertLogBetweenHeadings(
      currentContent,
      aiConversationsMarkdown,
      this.settings.insertionAfterHeading,
      this.settings.insertionBeforeHeading
    );

    await vault.modify(todayFile, newContent);
    new Notice("AI Daily Log: appended yesterday's AI log to today's daily note.");
  }

  /**
   * Build the markdown block for yesterday's AI conversations by:
   *  - Collecting normalized events from each enabled provider.
   *  - Formatting them into one-line technical log entries.
   */
  private async buildYesterdayAiLogMarkdown(
    isoStart: string,
    isoEnd: string
  ): Promise<string> {
    const events = await this.collectAllProviderEventsForYesterday(isoStart, isoEnd);
    if (!events.length) {
      return "";
    }

    const dateLabel = moment(isoStart).format("YYYY-MM-DD");
    return this.formatLogsToMarkdown(events, dateLabel);
  }

  /**
   * Collect events from all enabled providers for the given window.
   * NOTE: At the moment, the collectors are stubs that you can extend
   * to call APIs or parse local export files. They are structured so
   * you can plug in real logic without touching the rest of the plugin.
   */
  private async collectAllProviderEventsForYesterday(
    isoStart: string,
    isoEnd: string
  ): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = [];

    if (this.settings.enableGemini) {
      try {
        const geminiEvents = await this.collectGeminiEvents(isoStart, isoEnd);
        events.push(...geminiEvents);
      } catch (err) {
        console.error("AI Daily Log: Gemini collector failed", err);
        new Notice("AI Daily Log: Gemini history could not be loaded. See console for details.");
      }
    }

    if (this.settings.enableChatGPT) {
      try {
        const chatgptEvents = await this.collectChatGPTEvents(isoStart, isoEnd);
        events.push(...chatgptEvents);
      } catch (err) {
        console.error("AI Daily Log: ChatGPT collector failed", err);
        new Notice("AI Daily Log: ChatGPT history could not be loaded. See console for details.");
      }
    }

    if (this.settings.enableClaude) {
      try {
        const claudeEvents = await this.collectClaudeEvents(isoStart, isoEnd);
        events.push(...claudeEvents);
      } catch (err) {
        console.error("AI Daily Log: Claude collector failed", err);
        new Notice("AI Daily Log: Claude history could not be loaded. See console for details.");
      }
    }

    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Gemini history collector stub.
   *
   * For now this is a scaffold you can extend to:
   *  - Call the Gemini / Google AI API for API-created conversations, or
   *  - Parse local export files that you save from the Gemini UI.
   */
  private async collectGeminiEvents(
    _isoStart: string,
    _isoEnd: string
  ): Promise<NormalizedEvent[]> {
    if (!this.settings.geminiApiKey) {
      console.info("AI Daily Log: Gemini is enabled but no API key is configured.");
    }
    // TODO: Implement real Gemini history fetching or local export parsing.
    return [];
  }

  /**
   * ChatGPT / OpenAI history collector stub.
   *
   * Currently, OpenAI's APIs do not provide direct access to your
   * consumer web UI history on chat.openai.com. You can extend this to:
   *  - Read assistant threads you create via the OpenAI API, or
   *  - Parse local export files from chat.openai.com.
   */
  private async collectChatGPTEvents(
    _isoStart: string,
    _isoEnd: string
  ): Promise<NormalizedEvent[]> {
    if (!this.settings.openaiApiKey) {
      console.info("AI Daily Log: ChatGPT is enabled but no OpenAI API key is configured.");
    }
    // TODO: Implement real ChatGPT history fetching or local export parsing.
    return [];
  }

  /**
   * Claude / Anthropic history collector stub.
   *
   * Anthropic's public APIs focus on programmatic conversations and
   * do not expose your claude.ai web UI history. You can extend this to:
   *  - Read conversations you create via the Anthropic API, or
   *  - Parse local export files from claude.ai.
   */
  private async collectClaudeEvents(
    _isoStart: string,
    _isoEnd: string
  ): Promise<NormalizedEvent[]> {
    if (!this.settings.claudeApiKey) {
      console.info("AI Daily Log: Claude is enabled but no Anthropic API key is configured.");
    }
    // TODO: Implement real Claude history fetching or local export parsing.
    return [];
  }

  /**
   * Format normalized events into the final markdown block that is
   * inserted into today's daily note.
   */
  private formatLogsToMarkdown(events: NormalizedEvent[], dateLabel: string): string {
    if (!events.length) {
      return "";
    }

    const lines: string[] = [];
    lines.push(`## AI Session Log (Yesterday – ${dateLabel})`);
    lines.push("");

    for (const event of events) {
      const time = moment(event.timestamp).format("HH:mm");
      const providerLabel = this.getProviderLabel(event.provider);
      lines.push(`- ${time} – ${providerLabel} – ${event.summary}`);
    }

    lines.push("");
    return lines.join("\n");
  }

  private getProviderLabel(provider: ProviderId): string {
    if (provider === "gemini") return "Gemini";
    if (provider === "chatgpt") return "ChatGPT";
    if (provider === "claude") return "Claude";
    return provider;
  }

  /**
   * Use settings to locate today's daily note file.
   * This assumes your daily notes are all in `dailyNoteFolder`
   * and named with `dailyNoteFilenameFormat` (moment.js format).
   */
  private async getTodayDailyNoteFile(vault: Vault): Promise<TFile | null> {
    const todayName = moment().format(this.settings.dailyNoteFilenameFormat);
    const folder = this.settings.dailyNoteFolder.trim().replace(/^\/+/, "").replace(/\/+$/, "");

    const path = folder ? `${folder}/${todayName}` : todayName;
    const file = vault.getAbstractFileByPath(path);

    if (file instanceof TFile) {
      return file;
    }
    return null;
  }

  /**
   * Inserts `logMarkdown` between the given two headings.
   *
   * Heading match is text-based; any level (`##`, `###`, etc.) is accepted.
   * If the "before" heading is not found, the log is appended
   * after the "after" heading section.
   */
  private insertLogBetweenHeadings(
    content: string,
    logMarkdown: string,
    afterHeading: string,
    beforeHeading: string
  ): string {
    const lines = content.split("\n");

    let afterIndex = -1;
    let beforeIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (afterIndex === -1 && this.isHeadingWithText(line, afterHeading)) {
        afterIndex = i;
      } else if (afterIndex !== -1 && beforeIndex === -1 && this.isHeadingWithText(line, beforeHeading)) {
        beforeIndex = i;
        break;
      }
    }

    if (afterIndex === -1) {
      // If we can't find the "after" heading, just append to the end.
      return content.trimEnd() + "\n\n" + logMarkdown.trim() + "\n";
    }

    // Insert after the "after" heading line. If we found a "before" heading,
    // insert just before it; otherwise, insert until the end.
    const insertionStart = afterIndex + 1;
    const insertionEnd = beforeIndex === -1 ? lines.length : beforeIndex;

    const beforeLines = lines.slice(0, insertionStart);
    const middleLines = logMarkdown.trimEnd().split("\n");
    const afterLines = lines.slice(insertionEnd);

    return [...beforeLines, "", ...middleLines, "", ...afterLines].join("\n");
  }

  private isHeadingWithText(line: string, text: string): boolean {
    if (!line.startsWith("#")) return false;
    const stripped = line.replace(/^#+\s*/, "").trim();
    return stripped === text.trim();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class AiDailyLogSettingTab extends PluginSettingTab {
  plugin: AiDailyLogPlugin;

  constructor(app: App, plugin: AiDailyLogPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI Daily Log – Settings" });

    new Setting(containerEl)
      .setName("Daily note folder (relative to vault)")
      .setDesc(
        "Folder where your daily notes live, relative to the root of your Obsidian vault (e.g. _Archive/Pruskowski/Me)."
      )
      .addText((text) =>
        text
          .setPlaceholder("_Archive/Pruskowski/Me")
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note filename format")
      .setDesc(
        "Moment.js format for your daily note filenames (e.g. YYYY-MM-DD.md). Must match how your daily notes are actually named."
      )
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD.md")
          .setValue(this.plugin.settings.dailyNoteFilenameFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFilenameFormat = value.trim() || "YYYY-MM-DD.md";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Log insertion" });

    new Setting(containerEl)
      .setName("Heading after which to insert")
      .setDesc("The heading text that the AI log should appear below (default: \"To Be Completed\").")
      .addText((text) =>
        text
          .setPlaceholder("To Be Completed")
          .setValue(this.plugin.settings.insertionAfterHeading)
          .onChange(async (value) => {
            this.plugin.settings.insertionAfterHeading = value || "To Be Completed";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Heading before which to insert")
      .setDesc("The heading text that the AI log should appear before (default: \"Linked Mentions\").")
      .addText((text) =>
        text
          .setPlaceholder("Linked Mentions")
          .setValue(this.plugin.settings.insertionBeforeHeading)
          .onChange(async (value) => {
            this.plugin.settings.insertionBeforeHeading = value || "Linked Mentions";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Providers & API keys" });

    containerEl.createEl("p", {
      text:
        "Configure which AI providers to include in the daily log. API keys are stored locally in Obsidian's plugin data and are only used to talk to the respective provider APIs.",
    });

    new Setting(containerEl)
      .setName("Enable Gemini")
      .setDesc("Include Gemini conversations when building the daily AI log.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableGemini).onChange(async (value) => {
          this.plugin.settings.enableGemini = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Gemini API key")
      .setDesc("Google AI / Gemini API key used to access conversations you create via the API.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.geminiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.geminiApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Enable ChatGPT / OpenAI")
      .setDesc("Include ChatGPT / OpenAI assistant conversations when building the daily AI log.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableChatGPT).onChange(async (value) => {
          this.plugin.settings.enableChatGPT = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("OpenAI API key")
      .setDesc("OpenAI API key used for ChatGPT/Assistants API access (not your chat.openai.com history).")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openaiApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Enable Claude / Anthropic")
      .setDesc("Include Claude conversations when building the daily AI log.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableClaude).onChange(async (value) => {
          this.plugin.settings.enableClaude = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc("Anthropic API key used to access Claude via the API (not your claude.ai web UI history).")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.claudeApiKey)
          .onChange(async (value) => {
            this.plugin.settings.claudeApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}

