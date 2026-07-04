'use client';

// Hook for accessing/mutating the workspace file system.
// Persists all mutations to gitlite:workspace and gitlite:index via
// lib/storage.ts, per the ADR data model.

import { useCallback, useEffect, useState } from 'react';
import {
  getWorkspace,
  setWorkspace,
  getIndex,
  setIndex,
} from '@/lib/storage';
import type { WorkspaceMap, IndexEntry, FileStatus } from '@/lib/types';
import { sha1 } from '@/lib/git/sha1';

export interface UseFileSystemResult {
  files: WorkspaceMap;
  index: IndexEntry[];
  createFile: (path: string, content: string) => void;
  editFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  stageFile: (path: string) => void;
  unstageFile: (path: string) => void;
}

export function useFileSystem(): UseFileSystemResult {
  const [files, setFiles] = useState<WorkspaceMap>({});
  const [index, setIndexState] = useState<IndexEntry[]>([]);

  // Load persisted state on mount (client-side only).
  useEffect(() => {
    setFiles(getWorkspace());
    setIndexState(getIndex());
  }, []);

  const persistFiles = useCallback((next: WorkspaceMap) => {
    setFiles(next);
    setWorkspace(next);
  }, []);

  const persistIndex = useCallback((next: IndexEntry[]) => {
    setIndexState(next);
    setIndex(next);
  }, []);

  const createFile = useCallback(
    (path: string, content: string) => {
      setFiles((prev) => {
        const next: WorkspaceMap = {
          ...prev,
          [path]: { content, status: 'untracked' as FileStatus },
        };
        setWorkspace(next);
        return next;
      });
    },
    []
  );

  const editFile = useCallback((path: string, content: string) => {
    setFiles((prev) => {
      const existing = prev[path];
      if (!existing) return prev;
      // Untracked files remain untracked when edited; everything else
      // (staged, modified, committed) becomes modified.
      const status: FileStatus =
        existing.status === 'untracked' ? 'untracked' : 'modified';
      const next: WorkspaceMap = {
        ...prev,
        [path]: { content, status },
      };
      setWorkspace(next);
      return next;
    });
  }, []);

  const deleteFile = useCallback((path: string) => {
    setFiles((prev) => {
      const existing = prev[path];
      if (!existing) return prev;
      const next: WorkspaceMap = {
        ...prev,
        [path]: { content: existing.content, status: 'deleted' as FileStatus },
      };
      setWorkspace(next);
      return next;
    });
  }, []);

  const stageFile = useCallback(
    (path: string) => {
      setFiles((prevFiles) => {
        const existing = prevFiles[path];
        if (!existing) return prevFiles;
        const nextFiles: WorkspaceMap = {
          ...prevFiles,
          [path]:
            existing.status === 'deleted'
              ? existing
              : { content: existing.content, status: 'staged' as FileStatus },
        };
        setWorkspace(nextFiles);

        setIndexState((prevIndex) => {
          const hash = sha1(existing.content);
          const filtered = prevIndex.filter((e) => e.path !== path);
          const nextIndex = [...filtered, { path, sha1: hash }];
          setIndex(nextIndex);
          return nextIndex;
        });

        return nextFiles;
      });
    },
    []
  );

  const unstageFile = useCallback(
    (path: string) => {
      setFiles((prevFiles) => {
        const existing = prevFiles[path];
        if (!existing) return prevFiles;
        const nextFiles: WorkspaceMap = {
          ...prevFiles,
          [path]: { content: existing.content, status: 'modified' as FileStatus },
        };
        setWorkspace(nextFiles);
        return nextFiles;
      });

      setIndexState((prevIndex) => {
        const nextIndex = prevIndex.filter((e) => e.path !== path);
        setIndex(nextIndex);
        return nextIndex;
      });
    },
    []
  );

  return {
    files,
    index,
    createFile,
    editFile,
    deleteFile,
    stageFile,
    unstageFile,
  };
}

export default useFileSystem;
