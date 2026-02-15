import { useEffect } from 'react';
import { useFileStore, FileNode } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { api } from '../../utils/api';
import { ChevronRight, ChevronDown, Folder, File as FileIcon, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function FileExplorer() {
  const { fileTree, expandedPaths, selectedPath, isLoading, refreshFileTree, toggleExpanded, setSelectedPath } = useFileStore();
  const { openFile } = useEditorStore();

  useEffect(() => {
    refreshFileTree();
  }, []);

  const handleFileClick = async (node: FileNode) => {
    setSelectedPath(node.path);

    if (node.isDirectory) {
      toggleExpanded(node.path);
    } else {
      try {
        const result = await api.files.read(node.path);
        if (result.success && result.content !== undefined) {
          openFile({ path: node.path, content: result.content });
        }
      } catch (err) {
        console.error('Failed to read file:', err);
      }
    }
  };

  if (isLoading && fileTree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-zinc-600 gap-2">
        <Loader2 className="animate-spin" size={16} />
        <span className="text-[11px]">Loading files...</span>
      </div>
    );
  }

  return (
    <div className="h-full select-none">
      {fileTree.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-600 text-[11px] px-4 text-center">
          <Folder size={20} className="mb-2 opacity-40" />
          <span>No files loaded</span>
          <span className="text-[10px] text-zinc-700 mt-1">Start the backend server to browse files</span>
        </div>
      ) : (
        <div className="flex flex-col py-0.5">
          {fileTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              onToggle={toggleExpanded}
              onClick={handleFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onClick: (node: FileNode) => void;
}

function TreeNode({ node, depth, expandedPaths, selectedPath, onToggle, onClick }: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(node.path);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 py-[3px] pr-2 cursor-pointer transition-colors text-[12px]",
          isSelected
            ? "bg-zinc-800/60 text-zinc-200"
            : "text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onClick(node)}
      >
        <span
          className="flex items-center justify-center w-4 h-4 text-zinc-600 transition-colors flex-shrink-0"
          onClick={node.isDirectory ? handleToggle : undefined}
        >
          {node.isDirectory && (
            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          )}
        </span>

        <span className={cn("flex-shrink-0", node.isDirectory ? "text-zinc-500" : "text-zinc-600")}>
          {node.isDirectory ? (
            <Folder size={13} fill={isExpanded ? "currentColor" : "none"} />
          ) : (
            <FileIcon size={13} />
          )}
        </span>

        <span className="truncate leading-none">{node.name}</span>
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onClick={onClick}
            />
          ))}
        </div>
      )}
    </>
  );
}
