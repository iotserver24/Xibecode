import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  source?: 'tui' | 'webui';
  toolName?: string;
  toolStatus?: 'running' | 'success' | 'error';
  timestamp: number;
}

export type AgentMode =
  | 'agent' | 'plan' | 'tester' | 'debugger' | 'security'
  | 'review' | 'team_leader' | 'architect' | 'engineer'
  | 'seo' | 'product' | 'data' | 'researcher';

interface ChatState {
  messages: ChatMessage[];
  isProcessing: boolean;
  isConnected: boolean;
  currentMode: AgentMode;
  streamingContent: string;

  // WebSocket
  ws: WebSocket | null;

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastMessage: (content: string) => void;
  clearMessages: () => void;
  setProcessing: (processing: boolean) => void;
  setConnected: (connected: boolean) => void;
  setCurrentMode: (mode: AgentMode) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (text: string) => void;
  finalizeStreamingMessage: () => void;
  setWebSocket: (ws: WebSocket | null) => void;
  sendMessage: (content: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  isConnected: false,
  currentMode: 'agent',
  streamingContent: '',
  ws: null,

  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));
  },

  updateLastMessage: (content) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        const lastMessage = { ...messages[messages.length - 1] };
        if (lastMessage.role === 'tool') {
          lastMessage.toolStatus = content === 'success' ? 'success' : 'error';
        } else {
          lastMessage.content = content;
        }
        messages[messages.length - 1] = lastMessage;
      }
      return { messages };
    });
  },

  clearMessages: () => set({ messages: [], streamingContent: '' }),

  setProcessing: (processing) => set({ isProcessing: processing }),
  setConnected: (connected) => set({ isConnected: connected }),
  setCurrentMode: (mode) => set({ currentMode: mode }),
  setStreamingContent: (content) => set({ streamingContent: content }),

  appendStreamingContent: (text) => {
    set((state) => ({ streamingContent: state.streamingContent + text }));
  },

  finalizeStreamingMessage: () => {
    const { streamingContent, addMessage } = get();
    if (streamingContent) {
      addMessage({ role: 'assistant', content: streamingContent });
      set({ streamingContent: '' });
    }
  },

  setWebSocket: (ws) => set({ ws }),

  sendMessage: (content) => {
    const { ws, addMessage, setProcessing } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      addMessage({ role: 'user', content, source: 'webui' });
      ws.send(JSON.stringify({ type: 'message', content }));
      setProcessing(true);
    }
  },
}));
