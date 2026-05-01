import { useState, useEffect, useCallback, useRef } from 'react';

const xibe = (window as any).xibecode;

export interface AgentEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface UseAgentReturn {
  isRunning: boolean;
  isInitialized: boolean;
  modeState: {
    current: string;
    previous?: string;
    history: Array<{ mode: string; timestamp: number; reason?: string }>;
  };
  initialize: (config: {
    apiKey: string;
    model: string;
    provider?: string;
    baseUrl?: string;
    workingDir: string;
    mode?: string;
  }) => Promise<void>;
  sendMessage: (message: string) => Promise<{ success: boolean; error?: string }>;
  switchMode: (mode: string, reason: string) => Promise<{ approved: boolean; requiresConfirmation: boolean; reason?: string }>;
  onEvents: (callback: (batch: AgentEvent[]) => void) => () => void;
}

export function useAgent(): UseAgentReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [modeState, setModeState] = useState<UseAgentReturn['modeState']>({
    current: 'agent',
    history: [{ mode: 'agent', timestamp: Date.now(), reason: 'Initial mode' }],
  });

  const initialize = useCallback(async (config: Parameters<UseAgentReturn['initialize']>[0]) => {
    await xibe.agent.initialize(config);
    setIsInitialized(true);
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    setIsRunning(true);
    try {
      const result = await xibe.agent.sendMessage(message);
      if (!result.success) {
        setIsRunning(false);
      }
      return result;
    } catch (err: any) {
      setIsRunning(false);
      return { success: false, error: err.message };
    }
  }, []);

  const switchMode = useCallback(async (mode: string, reason: string) => {
    const result = await xibe.agent.switchMode(mode, reason);
    if (result.approved) {
      setModeState((prev) => ({
        current: mode,
        previous: prev.current,
        history: [...prev.history, { mode, timestamp: Date.now(), reason }],
      }));
    }
    return result;
  }, []);

  const onEvents = useCallback((callback: (batch: AgentEvent[]) => void) => {
    return xibe.agent.onEvents(callback);
  }, []);

  useEffect(() => {
    const checkRunning = setInterval(async () => {
      const running = await xibe.agent.isRunning();
      setIsRunning(running);
    }, 1000);
    return () => clearInterval(checkRunning);
  }, []);

  return {
    isRunning,
    isInitialized,
    modeState,
    initialize,
    sendMessage,
    switchMode,
    onEvents,
  };
}
