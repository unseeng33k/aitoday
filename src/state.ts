export interface RunStateMap {
  [dateKey: string]: string;
}

export interface PluginDataState {
  runStateByDate: RunStateMap;
}

export function createDefaultState(): PluginDataState {
  return { runStateByDate: {} };
}

export function hasRunForDate(state: PluginDataState, dateKey: string): boolean {
  return Boolean(state.runStateByDate[dateKey]);
}

export function markRunForDate(state: PluginDataState, dateKey: string): PluginDataState {
  return {
    ...state,
    runStateByDate: {
      ...state.runStateByDate,
      [dateKey]: new Date().toISOString()
    }
  };
}
