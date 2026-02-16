import { create } from 'zustand';

export type SidebarPanel = 'explorer' | 'git' | 'search' | 'settings' | null;
export type BottomPanelTab = 'terminal' | 'problems' | 'output';
export type RightPanelMode = 'code' | 'preview';

interface UIState {
  // Sidebar
  activeSidebarPanel: SidebarPanel;
  sidebarWidth: number;
  setActiveSidebarPanel: (panel: SidebarPanel) => void;
  setSidebarWidth: (width: number) => void;

  // Chat panel
  isChatCollapsed: boolean;
  chatWidth: number;
  setIsChatCollapsed: (collapsed: boolean) => void;
  setChatWidth: (width: number) => void;

  // Right panel mode (code editor vs preview)
  rightPanelMode: RightPanelMode;
  setRightPanelMode: (mode: RightPanelMode) => void;

  // Sidebar full-width toggle
  isSidebarFullWidth: boolean;
  setIsSidebarFullWidth: (full: boolean) => void;

  // Preview URL for iframe
  previewUrl: string;
  setPreviewUrl: (url: string) => void;

  // Bottom panel
  isBottomPanelCollapsed: boolean;
  bottomPanelHeight: number;
  activeBottomTab: BottomPanelTab;
  setIsBottomPanelCollapsed: (collapsed: boolean) => void;
  setBottomPanelHeight: (height: number) => void;
  setActiveBottomTab: (tab: BottomPanelTab) => void;

  // Settings modal
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;

  // Context menu
  contextMenu: { x: number; y: number; items: any[] } | null;
  setContextMenu: (menu: { x: number; y: number; items: any[] } | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  activeSidebarPanel: 'explorer',
  sidebarWidth: 260,
  setActiveSidebarPanel: (panel) =>
    set((state) => ({
      activeSidebarPanel: state.activeSidebarPanel === panel ? null : panel,
    })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  // Chat panel
  isChatCollapsed: false,
  chatWidth: 380,
  setIsChatCollapsed: (collapsed) => set({ isChatCollapsed: collapsed }),
  setChatWidth: (width) => set({ chatWidth: width }),

  // Right panel mode
  rightPanelMode: 'code',
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),

  // Sidebar full-width
  isSidebarFullWidth: false,
  setIsSidebarFullWidth: (full) => set({ isSidebarFullWidth: full }),

  // Preview URL
  previewUrl: 'http://localhost:3000',
  setPreviewUrl: (url) => set({ previewUrl: url }),

  // Bottom panel
  isBottomPanelCollapsed: false,
  bottomPanelHeight: 200,
  activeBottomTab: 'terminal',
  setIsBottomPanelCollapsed: (collapsed) => set({ isBottomPanelCollapsed: collapsed }),
  setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

  // Settings modal
  isSettingsOpen: false,
  setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),

  // Context menu
  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),
}));
