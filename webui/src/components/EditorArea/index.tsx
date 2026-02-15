import { useCallback, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useEditorStore, OpenFile } from '../../stores/editorStore';
import { api } from '../../utils/api';
import { X, Loader2, Sparkles, Image, Film, Music, FileWarning } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// File extensions that are media/binary and should not be opened in Monaco
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.tif', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.flv', '.wmv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus']);
const BINARY_EXTENSIONS = new Set(['.pdf', '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib', '.woff', '.woff2', '.ttf', '.otf', '.eot']);

function getFileExtension(path: string): string {
  const name = path.split('/').pop() || '';
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.substring(dotIndex).toLowerCase() : '';
}

function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(path));
}

function isVideoFile(path: string): boolean {
  return VIDEO_EXTENSIONS.has(getFileExtension(path));
}

function isAudioFile(path: string): boolean {
  return AUDIO_EXTENSIONS.has(getFileExtension(path));
}

function isBinaryFile(path: string): boolean {
  const ext = getFileExtension(path);
  return BINARY_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext);
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

      {/* Editor or Media Preview */}
      <div className="flex-1 min-h-0">
        {activeFile && (
          isBinaryFile(activeFile.path) ? (
            <MediaPreview file={activeFile} />
          ) : (
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
          )
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

function MediaPreview({ file }: { file: OpenFile }) {
  const filePath = file.path;
  const fileName = file.name;
  const mediaUrl = `/api/files/raw?path=${encodeURIComponent(filePath)}`;

  if (isImageFile(filePath)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] p-6 overflow-auto">
        <div className="flex items-center gap-2 mb-4 text-zinc-500">
          <Image size={16} />
          <span className="text-xs font-medium">{fileName}</span>
          <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{getFileExtension(filePath).toUpperCase()}</span>
        </div>
        <div className="relative max-w-full max-h-[70vh] rounded-lg overflow-hidden border border-zinc-800 bg-[#111]">
          {/* Checkerboard background for transparency */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }} />
          <img
            src={mediaUrl}
            alt={fileName}
            className="relative max-w-full max-h-[70vh] object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="p-8 text-center text-zinc-500 text-xs">Failed to load image</div>';
            }}
          />
        </div>
        <span className="text-[10px] text-zinc-600 mt-3">Image preview</span>
      </div>
    );
  }

  if (isVideoFile(filePath)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] p-6">
        <div className="flex items-center gap-2 mb-4 text-zinc-500">
          <Film size={16} />
          <span className="text-xs font-medium">{fileName}</span>
          <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">{getFileExtension(filePath).toUpperCase()}</span>
        </div>
        <div className="max-w-[80%] max-h-[70vh] rounded-lg overflow-hidden border border-zinc-800 bg-black">
          <video
            src={mediaUrl}
            controls
            className="max-w-full max-h-[70vh]"
          >
            Your browser does not support this video format.
          </video>
        </div>
        <span className="text-[10px] text-zinc-600 mt-3">Video preview</span>
      </div>
    );
  }

  if (isAudioFile(filePath)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] p-6">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center mb-4">
          <Music size={28} className="text-zinc-400" />
        </div>
        <span className="text-sm font-medium text-zinc-300 mb-1">{fileName}</span>
        <span className="text-[10px] text-zinc-600 mb-4">{getFileExtension(filePath).toUpperCase()} Audio</span>
        <audio
          src={mediaUrl}
          controls
          className="max-w-[400px]"
        >
          Your browser does not support this audio format.
        </audio>
      </div>
    );
  }

  // Generic binary file - not viewable
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] p-6">
      <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <FileWarning size={24} className="text-zinc-500" />
      </div>
      <span className="text-sm font-medium text-zinc-300 mb-1">{fileName}</span>
      <span className="text-[10px] text-zinc-600 mb-2">{getFileExtension(filePath).toUpperCase()} file</span>
      <p className="text-xs text-zinc-500 max-w-[300px] text-center">
        This binary file cannot be displayed in the editor. Use an external application to open it.
      </p>
    </div>
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
