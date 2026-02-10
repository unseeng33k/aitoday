export interface MultiAIDailyLogSettings {
  crossAiPrompt: string;
  logTitle: string;
  logTitleMarkdownSize: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  openaiModel: string;
  anthropicModel: string;
  geminiModel: string;
  runAtLocalTime: string;
  markerStartHeading: string;
  markerEndHeading: string;
}

export const DEFAULT_SETTINGS: MultiAIDailyLogSettings = {
  crossAiPrompt:
    "give me a log of everything we talked about yesterday. create a simple, technical one line log of everything we spoke about with timestamps for each topic we discussed.",
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
