'use client';

// Slide-over / drawer panel that renders a unified-diff-style comparison
// between two selected commits. Deleted lines render red with a '-'
// gutter, added lines render green with '+', and context lines render
// neutral with a space. Each file is a collapsible section headed by its
// path. A summary line reports files changed / insertions / deletions.

import { useEffect, useState } from 'react';
import { useDiff, type FileDiff } from '@/hooks/useDiff';

export interface DiffViewerProps {
  /** First selected commit hash (required to open the viewer). */
  hashA: string | null;
  /** Second selected commit hash. If omitted, hashA is diffed against its first parent. */
  hashB?: string | null;
  /** Called when the user closes the panel. */
  onClose?: () => void;
}

function lineClasses(tag: ' ' | '+' | '-'): string {
  if (tag === '+') return 'bg-green-50 text-green-800';
  if (tag === '-') return 'bg-red-50 text-red-800';
  return 'text-gray-700';
}

function gutterClasses(tag: ' ' | '+' | '-'): string {
  if (tag === '+') return 'text-green-600';
  if (tag === '-') return 'text-red-600';
  return 'text-gray-400';
}

function FileSection({ file }: { file: FileDiff }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-gray-200 rounded mb-2" data-testid="diff-file-section">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 text-left font-mono text-xs font-semibold"
        data-testid="diff-file-header"
      >
        <span>{file.path}</span>
        <span className="text-gray-400">{open ? '\u25be' : '\u25b8'}</span>
      </button>
      {open && (
        <pre className="text-xs font-mono overflow-x-auto" data-testid="diff-file-body">
          {file.lines.map((line, idx) => (
            <div key={idx} className={`px-3 flex gap-2 ${lineClasses(line.tag)}`}>
              <span className={`select-none ${gutterClasses(line.tag)}`}>{line.tag}</span>
              <span className="whitespace-pre-wrap break-all">{line.content}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

export default function DiffViewer({ hashA, hashB, onClose }: DiffViewerProps) {
  const { diffs, summary, compareHashes } = useDiff(hashA ?? null, hashB ?? null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!!hashA);
  }, [hashA, hashB]);

  if (!hashA || !visible) {
    return (
      <div className="border border-gray-200 rounded p-4 bg-white">
        <h2 className="font-semibold mb-2">Diff Viewer</h2>
        <p className="text-sm text-gray-400" data-testid="diff-viewer-empty">
          Select one or two commits in the graph to compare.
        </p>
      </div>
    );
  }

  const summaryLine = `${summary.filesChanged} file${summary.filesChanged === 1 ? '' : 's'} changed, ${summary.insertions} insertion${summary.insertions === 1 ? '' : 's'}(+), ${summary.deletions} deletion${summary.deletions === 1 ? '' : 's'}(-)`;

  return (
    <div
      className="border border-gray-200 rounded p-4 bg-white fixed md:static inset-x-0 bottom-0 md:inset-auto z-20 shadow-lg md:shadow-none max-h-[70vh] md:max-h-none overflow-y-auto"
      data-testid="diff-viewer-panel"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Diff Viewer</h2>
        {onClose && (
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              onClose();
            }}
            className="text-xs text-gray-400 hover:text-gray-700"
            data-testid="diff-viewer-close"
          >
            Close
          </button>
        )}
      </div>

      {compareHashes && (
        <p className="text-xs text-gray-500 mb-2 font-mono" data-testid="diff-compare-hashes">
          {compareHashes[0].slice(0, 7)}...{compareHashes[1].slice(0, 7)}
        </p>
      )}

      <p className="text-sm font-medium mb-3" data-testid="diff-summary">
        {summaryLine}
      </p>

      {diffs.length === 0 ? (
        <p className="text-sm text-gray-400" data-testid="diff-no-changes">
          No differences.
        </p>
      ) : (
        diffs.map((file) => <FileSection key={file.path} file={file} />)
      )}
    </div>
  );
}
