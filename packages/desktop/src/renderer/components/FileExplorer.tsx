import { useState, useEffect, useCallback, memo } from 'react';

interface FileExplorerProps {
  workingDir: string;
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileEntry[];
  loaded?: boolean;
}

const xibe = (window as any).xibecode;

function update(nodes: FileEntry[], path: string, patch: Partial<FileEntry>): FileEntry[] {
  return nodes.map((n) => n.path === path ? { ...n, ...patch } : n.children ? { ...n, children: update(n.children, path, patch) } : n);
}

function color(name: string, dir: boolean): string {
  if (dir) return 'text-sky-400';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx'].includes(ext)) return 'text-blue-400';
  if (['js', 'jsx'].includes(ext)) return 'text-yellow-400';
  if (['json'].includes(ext)) return 'text-yellow-300';
  if (['css', 'scss'].includes(ext)) return 'text-pink-400';
  if (['html'].includes(ext)) return 'text-orange-400';
  if (['py'].includes(ext)) return 'text-green-400';
  if (['yml', 'yaml', 'toml'].includes(ext)) return 'text-purple-400';
  return 'text-xibe-text-dim';
}

/* ⚡ Bolt: Memoized Row component to prevent O(N) re-renders of the file tree on timer ticks */
const Row = memo(function Row({ node, depth, open, kids, onToggle }: { node: FileEntry; depth: number; open: boolean; kids?: FileEntry[]; onToggle: (n: FileEntry) => void }) {
  return (
    <div>
      <button onClick={() => onToggle(node)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-[2px] text-left hover:bg-xibe-surface-hover transition-colors group" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
        {node.isDirectory ? (
          <svg className={`h-3 w-3 shrink-0 text-xibe-text-dim/50 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        ) : <span className="w-3 shrink-0" />}
        {node.isDirectory ? (
          <svg className={`h-3.5 w-3.5 shrink-0 ${color(node.name, true)}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
        ) : (
          <svg className={`h-3.5 w-3.5 shrink-0 ${color(node.name, false)}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        )}
        <span className="truncate text-[11px] text-xibe-text-secondary group-hover:text-xibe-text transition-colors">{node.name}</span>
      </button>
      {open && node.isDirectory && kids?.map((c) => <Row key={c.path} node={c} depth={depth + 1} open={false} onToggle={onToggle} />)}
    </div>
  );
});

export default memo(function FileExplorer({ workingDir }: FileExplorerProps) {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (dir: string): Promise<FileEntry[]> => {
    const r = await xibe.fs.listDirectory(dir);
    if (r.error) return [];
    return r.entries.map((e: any) => ({ ...e, loaded: false }));
  }, []);

  useEffect(() => { load(workingDir).then(setTree); }, [workingDir, load]);

  const toggle = useCallback(async (node: FileEntry) => {
    if (!node.isDirectory) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(node.path) ? next.delete(node.path) : next.add(node.path);
      return next;
    });
    if (!node.loaded) {
      const children = await load(node.path);
      setTree((prev) => update(prev, node.path, { children, loaded: true }));
    }
  }, [load]);

  return (
    <div>
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-xibe-text-dim/40">Files</div>
      <div className="px-1">
        {tree.map((n) => <Row key={n.path} node={n} depth={0} open={expanded.has(n.path)} kids={n.loaded ? n.children : undefined} onToggle={toggle} />)}
      </div>
    </div>
  );
});
