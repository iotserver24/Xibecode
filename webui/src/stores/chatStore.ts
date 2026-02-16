import { create } from 'zustand';
import { history as historyApi, type SavedConversation } from '../utils/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  source?: 'tui' | 'webui';
  toolName?: string;
  toolStatus?: 'running' | 'success' | 'error';
  timestamp: number;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  type: 'terminal' | 'file';
  content: string;
  label: string;
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

  // Conversation persistence
  conversationId: string | null;
  conversationTitle: string;

  // WebSocket
  ws: WebSocket | null;

  // Attachments
  attachments: Attachment[];
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

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

  // History actions
  autoSave: () => void;
  loadConversation: (id: string) => Promise<void>;
  newConversation: () => void;
}

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  isConnected: false,
  currentMode: 'agent',
  streamingContent: '',
  conversationId: null,
  conversationTitle: '',
  ws: null,
  attachments: [],

  addAttachment: (attachment) => set((state) => ({
    attachments: [...state.attachments, attachment]
  })),

  removeAttachment: (id) => set((state) => ({
    attachments: state.attachments.filter((a) => a.id !== id)
  })),

  clearAttachments: () => set({ attachments: [] }),

  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));

    // Generate conversation ID and title on first user message
    if (message.role === 'user' && !get().conversationId) {
      const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const title = message.content.length > 80
        ? message.content.substring(0, 77) + '...'
        : message.content;
      set({ conversationId: convId, conversationTitle: title });
    }
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

  clearMessages: () => set({
    messages: [],
    streamingContent: '',
    conversationId: null,
    conversationTitle: '',
  }),

  setProcessing: (processing) => set({ isProcessing: processing }),
  setConnected: (connected) => set({ isConnected: connected }),
  setCurrentMode: (mode) => set({ currentMode: mode }),
  setStreamingContent: (content) => set({ streamingContent: content }),

  appendStreamingContent: (text) => {
    set((state) => ({ streamingContent: state.streamingContent + text }));
  },

  finalizeStreamingMessage: () => {
    const { streamingContent, addMessage, autoSave } = get();
    if (streamingContent) {
      addMessage({ role: 'assistant', content: streamingContent });
      set({ streamingContent: '' });
      // Auto-save after assistant message is finalized
      autoSave();
    }
  },

  setWebSocket: (ws) => set({ ws }),


  sendMessage: (content) => {
    const { ws, addMessage, setProcessing, attachments, clearAttachments } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      let fullContent = content;

      // Construct the full prompt for the backend/AI
      // This ensures the AI sees the context
      if (attachments.length > 0) {
        const contextParts = attachments.map(a => `[Context: ${a.label}]\n${a.content}`);
        fullContent = `${contextParts.join('\n\n')}\n\n${content}`;
      }

      // Add message to UI with attachments but WITHOUT the full text prepended
      // This keeps the UI clean (chips will be rendered instead)
      addMessage({
        role: 'user',
        content: content, // Original user input
        source: 'webui',
        attachments: [...attachments] // Copy current attachments
      });

      // Send the FULL content to the backend so the AI sees it
      ws.send(JSON.stringify({ type: 'message', content: fullContent }));

      setProcessing(true);
      clearAttachments();
    }
  },

  // Auto-save conversation to backend (debounced)
  autoSave: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { conversationId, conversationTitle, messages, currentMode } = get();
      if (!conversationId || messages.length === 0) return;

      try {
        const conversation: SavedConversation = {
          id: conversationId,
          title: conversationTitle,
          projectPath: '',
          projectName: '',
          created: new Date(messages[0]?.timestamp || Date.now()).toISOString(),
          updated: new Date().toISOString(),
          model: '',
          mode: currentMode,
          messages: messages,
        };
        await historyApi.save(conversation);
      } catch {
        // Silently fail - history is not critical
      }
    }, 1500);
  },

  // Load a previous conversation
  loadConversation: async (id: string) => {
    try {
      const result = await historyApi.get(id);
      if (result.success && result.conversation) {
        set({
          messages: result.conversation.messages || [],
          conversationId: result.conversation.id,
          conversationTitle: result.conversation.title,
          streamingContent: '',
          isProcessing: false,
        });
      }
    } catch {
      // Failed to load conversation
    }
  },

  // Start a new conversation (saves current first)
  newConversation: () => {
    const { autoSave, messages } = get();
    if (messages.length > 0) {
      autoSave(); // Save current conversation first
    }
    set({
      messages: [],
      streamingContent: '',
      conversationId: null,
      conversationTitle: '',
      isProcessing: false,
    });
  },
}));
