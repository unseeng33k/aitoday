import { App, PluginSettingTab, Setting } from "obsidian";
import type MultiAIDailyLogPlugin from "../main";
import { DEFAULT_SETTINGS } from "./settings-model";
export { DEFAULT_SETTINGS } from "./settings-model";
export type { MultiAIDailyLogSettings } from "./settings-model";

export class MultiAIDailyLogSettingTab extends PluginSettingTab {
  private readonly plugin: MultiAIDailyLogPlugin;

  constructor(app: App, plugin: MultiAIDailyLogPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Multi AI Daily Log Settings" });

    new Setting(containerEl)
      .setName("Cross-AI prompt")
      .setDesc("Prompt sent to each provider API on run.")
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.crossAiPrompt)
          .onChange(async (value) => {
            this.plugin.settings.crossAiPrompt = value;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName("OpenAI API key")
      .setDesc("Stored locally in plugin data.")
      .addText((text) => {
        text.setValue(this.plugin.settings.openaiApiKey).onChange(async (value) => {
          this.plugin.settings.openaiApiKey = value.trim();
          await this.plugin.savePluginData();
        });
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        return text;
      });

    new Setting(containerEl)
      .setName("OpenAI model")
      .setDesc("Example: gpt-4o-mini")
      .addText((text) =>
        text.setValue(this.plugin.settings.openaiModel).onChange(async (value) => {
          this.plugin.settings.openaiModel = value.trim() || "gpt-4o-mini";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc("Stored locally in plugin data.")
      .addText((text) => {
        text.setValue(this.plugin.settings.anthropicApiKey).onChange(async (value) => {
          this.plugin.settings.anthropicApiKey = value.trim();
          await this.plugin.savePluginData();
        })
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        return text;
      });

    new Setting(containerEl)
      .setName("Anthropic model")
      .setDesc("Example: claude-3-5-sonnet-latest")
      .addText((text) =>
        text.setValue(this.plugin.settings.anthropicModel).onChange(async (value) => {
          this.plugin.settings.anthropicModel = value.trim() || "claude-3-5-sonnet-latest";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName("Gemini API key")
      .setDesc("Stored locally in plugin data.")
      .addText((text) => {
        text.setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => {
          this.plugin.settings.geminiApiKey = value.trim();
          await this.plugin.savePluginData();
        })
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        return text;
      });

    new Setting(containerEl)
      .setName("Gemini model")
      .setDesc("Example: gemini-1.5-flash")
      .addText((text) =>
        text.setValue(this.plugin.settings.geminiModel).onChange(async (value) => {
          this.plugin.settings.geminiModel = value.trim() || "gemini-1.5-flash";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName("Log title")
      .setDesc("Optional custom title shown above the inserted log.")
      .addText((text) =>
        text
          .setPlaceholder("Auto-generate from Cross-AI prompt")
          .setValue(this.plugin.settings.logTitle)
          .onChange(async (value) => {
            this.plugin.settings.logTitle = value.trim();
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName("Log title markdown size")
      .setDesc("Heading syntax used for the title (for example: ##, ###, ####).")
      .addText((text) =>
        text
          .setPlaceholder("####")
          .setValue(this.plugin.settings.logTitleMarkdownSize)
          .onChange(async (value) => {
            this.plugin.settings.logTitleMarkdownSize = value.trim() || "####";
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName("Daily run time")
      .setDesc("Local wall clock time (HH:mm) in your system timezone.")
      .addText((text) =>
        text.setValue(this.plugin.settings.runAtLocalTime).onChange(async (value) => {
          this.plugin.settings.runAtLocalTime = value.trim() || "09:00";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName("Insert after heading")
      .setDesc("Generated block is inserted after this heading.")
      .addText((text) =>
        text.setValue(this.plugin.settings.markerStartHeading).onChange(async (value) => {
          this.plugin.settings.markerStartHeading = value.trim() || "To Be Completed";
          await this.plugin.savePluginData();
        })
      );

    new Setting(containerEl)
      .setName("Insert before heading")
      .setDesc("Generated block is inserted before this heading.")
      .addText((text) =>
        text.setValue(this.plugin.settings.markerEndHeading).onChange(async (value) => {
          this.plugin.settings.markerEndHeading = value.trim() || "Linked Mentions";
          await this.plugin.savePluginData();
        })
      );
  }
}
