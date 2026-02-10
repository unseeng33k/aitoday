import {
  Notice,
  Plugin
} from "obsidian";
import { queryAllProviders } from "./src/api";
import { resolveTodaysDailyNote, upsertDailyLogInContent } from "./src/dailyNote";
import { renderDailyLogBlock, renderOneLineEntries } from "./src/markdown";
import { groupEventsByTopicWindow, getYesterdayDateKey } from "./src/normalize";
import { DailyScheduler } from "./src/scheduler";
import { DEFAULT_SETTINGS, MultiAIDailyLogSettingTab, type MultiAIDailyLogSettings } from "./src/settings";
import { createDefaultState, hasRunForDate, markRunForDate, type PluginDataState } from "./src/state";
import type { NormalizedEvent } from "./src/model";

interface PluginData extends PluginDataState {
  settings: MultiAIDailyLogSettings;
}

const DEFAULT_PLUGIN_DATA: PluginData = {
  settings: DEFAULT_SETTINGS,
  ...createDefaultState()
};

export default class MultiAIDailyLogPlugin extends Plugin {
  settings: MultiAIDailyLogSettings = { ...DEFAULT_SETTINGS };
  state: PluginDataState = createDefaultState();
  private scheduler: DailyScheduler | null = null;

  private getSystemTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  private getEffectiveTimezone(): string {
    return this.getSystemTimezone();
  }

  async onload(): Promise<void> {
    await this.loadPluginData();
    this.addSettingTab(new MultiAIDailyLogSettingTab(this.app, this));

    this.addCommand({
      id: "preview-multi-ai-daily-log",
      name: "Preview generated daily AI log",
      callback: async () => {
        const { markdown, dateKey } = await this.generateDailyLogMarkdown();
        new Notice(`Preview generated for ${dateKey}.`);
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

  async loadPluginData(): Promise<void> {
    const loaded = ((await this.loadData()) as Partial<PluginData> | undefined) ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) };
    this.state = {
      ...createDefaultState(),
      runStateByDate: loaded.runStateByDate ?? {}
    };
  }

  async savePluginData(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      ...this.state
    } satisfies PluginData);
  }

  private async collectEvents(): Promise<NormalizedEvent[]> {
    return queryAllProviders(this.settings);
  }

  private async generateDailyLogMarkdown(): Promise<{ markdown: string; dateKey: string }> {
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

  private buildConfigurationStatusLines(): string[] {
    const missing: string[] = [];
    if (!this.settings.crossAiPrompt.trim()) {
      missing.push("Set `Cross-AI prompt` in plugin settings.");
    }
    const hasAnyProviderKey =
      Boolean(this.settings.openaiApiKey.trim()) ||
      Boolean(this.settings.anthropicApiKey.trim()) ||
      Boolean(this.settings.geminiApiKey.trim());
    if (!hasAnyProviderKey) {
      missing.push("Add at least one provider API key (OpenAI, Anthropic, or Gemini).");
    }
    return missing;
  }

  private async generateAndInsertDailyLog(manualRun: boolean): Promise<void> {
    try {
      const dateKey = getYesterdayDateKey(this.getEffectiveTimezone());
      const missingConfiguration = this.buildConfigurationStatusLines();
      const markdown =
        missingConfiguration.length > 0
          ? renderDailyLogBlock(missingConfiguration, dateKey, this.settings.crossAiPrompt, {
              title: this.settings.logTitle,
              markdownHeadingPrefix: this.settings.logTitleMarkdownSize
            })
          : (await this.generateDailyLogMarkdown()).markdown;

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
        const configurationSuffix =
          missingConfiguration.length > 0 ? " (configuration hints included)" : "";
        new Notice(`Inserted daily AI log for ${dateKey}${configurationSuffix}.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(`Daily AI log failed: ${message}`);
      console.error(error);
    }
  }
}
