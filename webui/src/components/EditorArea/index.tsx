import { useCallback, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useEditorStore, OpenFile } from '../../stores/editorStore';
import { api } from '../../utils/api';
import { X, Loader2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function EditorArea() {
  const { openFiles, activeFilePath, setActiveFile, closeFile, updateFileContent, markFileSaved, setCursorPosition, fontSize, tabSize, wordWrap, minimap } = useEditorStore();

  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;
  const tabs = Array.from(openFiles.values());

  const handleSave = useCallback(async (file: OpenFile) => {
    try {
      const result = await api.files.write(file.path, file.content);
      if (result.success) {
        markFileSaved(file.path);
      } else {
        console.error('Failed to save:', result.error);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [markFileSaved]);

  if (tabs.length === 0) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c]">
      {/* Tab bar - v0 style */}
      <div className="flex items-center bg-[#0a0a0a] border-b border-zinc-800/80 h-9 overflow-x-auto flex-shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.path === activeFilePath;
          return (
            <div
              key={tab.path}
              className={cn(
                "flex items-center gap-2 px-3 h-full cursor-pointer border-r border-zinc-800/50 text-xs transition-colors group relative",
                isActive
                  ? "bg-[#0c0c0c] text-zinc-200"
                  : "bg-[#0a0a0a] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
              )}
              onClick={() => setActiveFile(tab.path)}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-zinc-400" />
              )}

              <span className="truncate max-w-[120px]">{tab.name}</span>
              {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 flex-shrink-0" />}
              <button
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(tab.path);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {activeFile && (
          <MonacoEditorWrapper
            file={activeFile}
            fontSize={fontSize}
            tabSize={tabSize}
            wordWrap={wordWrap}
            minimap={minimap}
            onChange={(content) => updateFileContent(activeFile.path, content)}
            onSave={() => handleSave(activeFile)}
            onCursorChange={setCursorPosition}
          />
        )}
      </div>
    </div>
  );
}

interface MonacoEditorWrapperProps {
  file: OpenFile;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onCursorChange: (line: number, column: number) => void;
}

function MonacoEditorWrapper({ file, fontSize, tabSize, wordWrap, minimap, onChange, onSave, onCursorChange }: MonacoEditorWrapperProps) {
  const editorRef = useRef<any>(null);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });

    editor.onDidChangeCursorPosition((e: any) => {
      onCursorChange(e.position.lineNumber, e.position.column);
    });

    editor.focus();
  }, [onSave, onCursorChange]);

  return (
    <Editor
      height="100%"
      language={file.language}
      value={file.content}
      theme="vs-dark"
      onChange={(value) => onChange(value || '')}
      onMount={handleMount}
      options={{
        fontSize,
        tabSize,
        wordWrap: wordWrap ? 'on' : 'off',
        minimap: { enabled: minimap },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 12 },
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
        fontLigatures: true,
        lineHeight: 20,
        renderWhitespace: 'none',
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
      }}
      loading={
        <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-500 bg-[#0c0c0c]">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-xs">Loading editor...</span>
        </div>
      }
    />
  );
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] text-center px-8">
      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
        <Sparkles size={22} className="text-zinc-500" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-200 mb-2">XibeCode IDE</h1>
      <p className="text-sm text-zinc-500 mb-6 max-w-[300px]">Open a file from the explorer or ask the AI assistant to help you build something.</p>
      <div className="flex flex-col gap-2 text-xs text-zinc-600">
        <div className="flex items-center gap-3">
          <kbd className="font-mono text-[10px] bg-zinc-900 text-zinc-400 px-2 py-1 rounded border border-zinc-800">Ctrl+P</kbd>
          <span>Quick open file</span>
        </div>
        <div className="flex items-center gap-3">
          <kbd className="font-mono text-[10px] bg-zinc-900 text-zinc-400 px-2 py-1 rounded border border-zinc-800">Ctrl+S</kbd>
          <span>Save file</span>
        </div>
        <div className="flex items-center gap-3">
          <kbd className="font-mono text-[10px] bg-zinc-900 text-zinc-400 px-2 py-1 rounded border border-zinc-800">Ctrl+`</kbd>
          <span>Toggle terminal</span>
        </div>
      </div>
    </div>
  );
}
