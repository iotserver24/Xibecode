import { create } from 'zustand';
import { getLanguageFromPath } from '../utils/languageDetection';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  isDirty: boolean;
}

interface CursorPosition {
  line: number;
  column: number;
}

interface EditorState {
  openFiles: Map<string, OpenFile>;
  activeFilePath: string | null;
  cursorPosition: CursorPosition;

  // Editor settings
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;

  // Computed
  activeFile: OpenFile | null;

  // Actions
  openFile: (file: { path: string; name?: string; content: string; language?: string; isDirty?: boolean }) => void;
  closeFile: (path: string) => void;
  closeAllFiles: () => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string, newContent?: string) => void;
  setCursorPosition: (line: number, column: number) => void;

  // Settings actions
  setFontSize: (size: number) => void;
  setTabSize: (size: number) => void;
  setWordWrap: (enabled: boolean) => void;
  setMinimap: (enabled: boolean) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFiles: new Map(),
  activeFilePath: null,
  cursorPosition: { line: 1, column: 1 },
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  minimap: true,

  get activeFile() {
    const { openFiles, activeFilePath } = get();
    return activeFilePath ? openFiles.get(activeFilePath) || null : null;
  },

  openFile: (file) => {
    const { path, content, name, language, isDirty } = file;
    const fileName = name || path.split('/').pop() || path;
    const fileLang = language || getLanguageFromPath(path);

    set((state) => {
      const files = new Map(state.openFiles);
      if (!files.has(path)) {
        files.set(path, {
          path,
          name: fileName,
          content,
          originalContent: content,
          language: fileLang,
          isDirty: isDirty ?? false,
        });
      }
      return { openFiles: files, activeFilePath: path };
    });
  },

  closeFile: (path) => {
    set((state) => {
      const files = new Map(state.openFiles);
      files.delete(path);

      // If closing active file, switch to another
      let newActivePath = state.activeFilePath;
      if (state.activeFilePath === path) {
        const paths = Array.from(files.keys());
        newActivePath = paths.length > 0 ? paths[paths.length - 1] : null;
      }

      return { openFiles: files, activeFilePath: newActivePath };
    });
  },

  closeAllFiles: () => {
    set({ openFiles: new Map(), activeFilePath: null });
  },

  setActiveFile: (path) => {
    set({ activeFilePath: path });
  },

  updateFileContent: (path, content) => {
    set((state) => {
      const files = new Map(state.openFiles);
      const file = files.get(path);
      if (file) {
        files.set(path, {
          ...file,
          content,
          isDirty: content !== file.originalContent,
        });
      }
      return { openFiles: files };
    });
  },

  markFileSaved: (path, newContent) => {
    set((state) => {
      const files = new Map(state.openFiles);
      const file = files.get(path);
      if (file) {
        const content = newContent ?? file.content;
        files.set(path, {
          ...file,
          content,
          originalContent: content,
          isDirty: false,
        });
      }
      return { openFiles: files };
    });
  },

  setCursorPosition: (line, column) => set({ cursorPosition: { line, column } }),

  setFontSize: (size) => set({ fontSize: size }),
  setTabSize: (size) => set({ tabSize: size }),
  setWordWrap: (enabled) => set({ wordWrap: enabled }),
  setMinimap: (enabled) => set({ minimap: enabled }),
}));
