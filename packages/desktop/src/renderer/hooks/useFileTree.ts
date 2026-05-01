import { useState, useEffect, useCallback } from 'react';

const xibe = (window as any).xibecode;

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modified?: Date;
}

export interface UseFileTreeReturn {
  nodes: FileNode[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadDirectory: (dirPath: string) => Promise<FileNode[]>;
}

export function useFileTree(rootPath: string): UseFileTreeReturn {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    const result = await xibe.fs.listDirectory(dirPath);
    if (result.error) {
      setError(result.error);
      return [];
    }
    return result.entries;
  }, []);

  const refresh = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await xibe.fs.listDirectory(rootPath);
      if (result.error) {
        setError(result.error);
        setNodes([]);
      } else {
        setNodes(result.entries);
      }
    } catch (err: any) {
      setError(err.message);
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { nodes, loading, error, refresh, loadDirectory };
}
