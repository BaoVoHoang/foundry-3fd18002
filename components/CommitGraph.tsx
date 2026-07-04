'use client';

// Renders the commit DAG as an interactive SVG: commit nodes as circles,
// parent->child edges as lines with arrowheads, branch label chips
// anchored to their tip commits, and a HEAD indicator. Clicking a node
// invokes onSelectCommit; right-clicking (or the "+branch" label) opens
// a small inline form to create a branch from that commit.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { getObjects, getRefs, getConfig } from '@/lib/storage';
import { topologicalSort } from '@/lib/git/dag';
import { useRepository } from '@/hooks/useRepository';
import type { GitObjectMap, RefMap, RepoConfig } from '@/lib/types';

export interface CommitGraphProps {
  onSelectCommit?: (hash: string) => void;
}

const NODE_RADIUS = 18;
const X_GAP = 90;
const Y_GAP = 70;
const LEFT_PAD = 60;
const TOP_PAD = 40;

const LANE_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#9333ea', // purple
  '#d97706', // amber
  '#0891b2', // cyan
];

function colorForLane(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

export default function CommitGraph({ onSelectCommit }: CommitGraphProps) {
  const { createBranch } = useRepository();
  const [objects, setObjects] = useState<GitObjectMap>({});
  const [refs, setRefs] = useState<RefMap>({});
  const [config, setConfig] = useState<RepoConfig>({
    repoInitialized: false,
    currentBranch: null,
    HEAD: null,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [branchFormFor, setBranchFormFor] = useState<string | null>(null);
  const [branchNameInput, setBranchNameInput] = useState('');

  const load = useCallback(() => {
    setObjects(getObjects());
    setRefs(getRefs());
    setConfig(getConfig());
  }, []);

  useEffect(() => {
    load();
    function onStorage() {
      load();
    }
    window.addEventListener('storage', onStorage);
    const interval = window.setInterval(load, 1000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [load]);

  const commitHashes = useMemo(
    () => Object.keys(objects).filter((h) => objects[h]?.type === 'commit'),
    [objects]
  );

  const order = useMemo(
    () => topologicalSort(commitHashes, objects),
    [commitHashes, objects]
  );

  const tiers = useMemo(() => {
    const reversed = [...order].reverse(); // oldest first
    const tierOf = new Map<string, number>();
    for (const hash of reversed) {
      const obj = objects[hash];
      const parents = obj?.commit?.parentHashes ?? [];
      const parentTiers = parents
        .filter((p) => tierOf.has(p))
        .map((p) => tierOf.get(p) as number);
      const tier = parentTiers.length > 0 ? Math.max(...parentTiers) + 1 : 0;
      tierOf.set(hash, tier);
    }
    return tierOf;
  }, [order, objects]);

  const lanes = useMemo(() => {
    const laneOf = new Map<string, number>();
    const branchNames = Object.keys(refs).filter((r) =>
      r.startsWith('refs/heads/')
    );
    branchNames.sort((a, b) => {
      if (a === 'refs/heads/main') return -1;
      if (b === 'refs/heads/main') return 1;
      return a.localeCompare(b);
    });

    let nextLane = 0;
    for (const branchRef of branchNames) {
      const tip = refs[branchRef];
      let lane = -1;
      const stack = [tip];
      const seen = new Set<string>();
      const path: string[] = [];
      while (stack.length > 0) {
        const cur = stack.pop() as string;
        if (seen.has(cur)) continue;
        seen.add(cur);
        path.push(cur);
        if (laneOf.has(cur)) {
          lane = laneOf.get(cur) as number;
          break;
        }
        const parents = objects[cur]?.commit?.parentHashes ?? [];
        for (const p of parents) stack.push(p);
      }
      if (lane === -1) {
        lane = nextLane++;
      }
      for (const hash of path) {
        if (!laneOf.has(hash)) laneOf.set(hash, lane);
      }
    }
    for (const hash of commitHashes) {
      if (!laneOf.has(hash)) {
        laneOf.set(hash, nextLane++);
      }
    }
    return laneOf;
  }, [refs, objects, commitHashes]);

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    for (const hash of commitHashes) {
      const tier = tiers.get(hash) ?? 0;
      const lane = lanes.get(hash) ?? 0;
      pos.set(hash, {
        x: LEFT_PAD + lane * X_GAP,
        y: TOP_PAD + tier * Y_GAP,
      });
    }
    return pos;
  }, [commitHashes, tiers, lanes]);

  const maxTier = useMemo(() => {
    let max = 0;
    for (const t of tiers.values()) max = Math.max(max, t);
    return max;
  }, [tiers]);
  const maxLane = useMemo(() => {
    let max = 0;
    for (const l of lanes.values()) max = Math.max(max, l);
    return max;
  }, [lanes]);

  const width = LEFT_PAD * 2 + maxLane * X_GAP;
  const height = TOP_PAD * 2 + maxTier * Y_GAP;

  const branchTips = useMemo(() => {
    const tips: { branch: string; hash: string }[] = [];
    for (const [refName, hash] of Object.entries(refs)) {
      if (refName.startsWith('refs/heads/')) {
        tips.push({ branch: refName.slice('refs/heads/'.length), hash });
      }
    }
    return tips;
  }, [refs]);

  const headHash = useMemo(() => {
    if (config.currentBranch) {
      return refs[`refs/heads/${config.currentBranch}`] ?? null;
    }
    return config.HEAD;
  }, [config, refs]);

  function handleSelect(hash: string) {
    setSelected(hash);
    onSelectCommit?.(hash);
  }

  function handleContextMenu(e: React.MouseEvent, hash: string) {
    e.preventDefault();
    setBranchFormFor(hash);
    setBranchNameInput('');
  }

  function submitBranchForm() {
    const name = branchNameInput.trim();
    if (!name || !branchFormFor) return;
    createBranch(name, branchFormFor);
    setBranchFormFor(null);
    setBranchNameInput('');
    load();
  }

  const isEmpty = commitHashes.length === 0;

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="font-semibold mb-2">Commit Graph</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-400" data-testid="commit-graph-empty">
          {config.repoInitialized
            ? 'No commits yet. HEAD is null.'
            : 'Repository not initialized.'}
        </p>
      ) : (
        <svg
          width={Math.max(width, 200)}
          height={Math.max(height, 100)}
          role="img"
          aria-label="Commit graph"
          data-testid="commit-graph-svg"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
            </marker>
          </defs>

          {commitHashes.map((hash) => {
            const obj = objects[hash];
            const parents = obj?.commit?.parentHashes ?? [];
            const childPos = positions.get(hash);
            if (!childPos) return null;
            return parents.map((parentHash) => {
              const parentPos = positions.get(parentHash);
              if (!parentPos) return null;
              return (
                <line
                  key={`${parentHash}-${hash}`}
                  x1={parentPos.x}
                  y1={parentPos.y + NODE_RADIUS}
                  x2={childPos.x}
                  y2={childPos.y - NODE_RADIUS}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  markerEnd="url(#arrowhead)"
                />
              );
            });
          })}

          {branchTips.map(({ branch, hash }) => {
            const pos = positions.get(hash);
            if (!pos) return null;
            const lane = lanes.get(hash) ?? 0;
            const chipWidth = Math.max(branch.length * 7 + 16, 40);
            return (
              <g
                key={branch}
                transform={`translate(${pos.x - chipWidth / 2}, ${
                  pos.y - NODE_RADIUS - 26
                })`}
              >
                <rect
                  width={chipWidth}
                  height={20}
                  rx={4}
                  fill={colorForLane(lane)}
                  data-testid={`branch-chip-${branch}`}
                />
                <text
                  x={chipWidth / 2}
                  y={14}
                  textAnchor="middle"
                  fontSize={11}
                  fill="white"
                >
                  {branch}
                </text>
              </g>
            );
          })}

          {commitHashes.map((hash) => {
            const pos = positions.get(hash);
            if (!pos) return null;
            const lane = lanes.get(hash) ?? 0;
            const isSelected = selected === hash;
            const isHead = headHash === hash;
            return (
              <g key={hash}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS}
                  fill={colorForLane(lane)}
                  stroke={isSelected ? '#000' : 'white'}
                  strokeWidth={isSelected ? 3 : 2}
                  data-testid={`commit-node-${hash}`}
                  onClick={() => handleSelect(hash)}
                  onContextMenu={(e) => handleContextMenu(e, hash)}
                  style={{ cursor: 'pointer' }}
                />
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="white"
                  style={{ pointerEvents: 'none' }}
                >
                  {hash.slice(0, 5)}
                </text>
                {isHead && (
                  <text
                    x={pos.x}
                    y={pos.y + NODE_RADIUS + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="bold"
                    fill="#111827"
                    data-testid="head-indicator"
                  >
                    HEAD
                  </text>
                )}
                <text
                  x={pos.x + NODE_RADIUS + 6}
                  y={pos.y + 3}
                  fontSize={9}
                  fill="#9ca3af"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setBranchFormFor(hash)}
                >
                  +branch
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {branchFormFor && (
        <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
          <span className="text-xs text-gray-500">
            New branch from {branchFormFor.slice(0, 7)}:
          </span>
          <input
            type="text"
            value={branchNameInput}
            onChange={(e) => setBranchNameInput(e.target.value)}
            placeholder="branch-name"
            className="border border-gray-300 rounded px-2 py-1 text-xs"
            data-testid="branch-from-commit-input"
          />
          <button
            type="button"
            onClick={submitBranchForm}
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded"
            data-testid="branch-from-commit-submit"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setBranchFormFor(null)}
            className="text-xs px-2 py-1 bg-gray-200 rounded"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
