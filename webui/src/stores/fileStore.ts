import { create } from 'zustand';
import { api } from '../utils/api';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface FileState {
  fileTree: FileNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setFileTree: (tree: FileNode[]) => void;
  toggleExpanded: (path: string) => void;
  setSelectedPath: (path: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refreshFileTree: () => Promise<void>;
}

export const useFileStore = create<FileState>((set) => ({
  fileTree: [],
  expandedPaths: new Set(['.']),
  selectedPath: null,
  isLoading: false,
  error: null,

  setFileTree: (tree) => set({ fileTree: tree }),

  toggleExpanded: (path) => {
    set((state) => {
      const expanded = new Set(state.expandedPaths);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
      }
      return { expandedPaths: expanded };
    });
  },

  setSelectedPath: (path) => set({ selectedPath: path }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  refreshFileTree: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.files.tree('.', 10);
      if (data.success && data.tree) {
        set({ fileTree: data.tree, isLoading: false });
      } else {
        set({ error: data.error || 'Failed to load files', isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to load files', isLoading: false });
    }
  },
}));
