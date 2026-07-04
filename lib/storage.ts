import type {
  GitObjectMap,
  RefMap,
  WorkspaceMap,
  IndexEntry,
  RepoConfig,
} from './types';

// localStorage keys used by GitLite, per the ADR data model.
export const STORAGE_KEYS = {
  objects: 'gitlite:objects',
  refs: 'gitlite:refs',
  workspace: 'gitlite:workspace',
  index: 'gitlite:index',
  config: 'gitlite:config',
} as const;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function getItem<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function clearItem(key: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
}

// gitlite:objects
export function getObjects(): GitObjectMap {
  return getItem<GitObjectMap>(STORAGE_KEYS.objects, {});
}
export function setObjects(objects: GitObjectMap): void {
  setItem(STORAGE_KEYS.objects, objects);
}
export function clearObjects(): void {
  clearItem(STORAGE_KEYS.objects);
}

// gitlite:refs
export function getRefs(): RefMap {
  return getItem<RefMap>(STORAGE_KEYS.refs, {});
}
export function setRefs(refs: RefMap): void {
  setItem(STORAGE_KEYS.refs, refs);
}
export function clearRefs(): void {
  clearItem(STORAGE_KEYS.refs);
}

// gitlite:workspace
export function getWorkspace(): WorkspaceMap {
  return getItem<WorkspaceMap>(STORAGE_KEYS.workspace, {});
}
export function setWorkspace(workspace: WorkspaceMap): void {
  setItem(STORAGE_KEYS.workspace, workspace);
}
export function clearWorkspace(): void {
  clearItem(STORAGE_KEYS.workspace);
}

// gitlite:index
export function getIndex(): IndexEntry[] {
  return getItem<IndexEntry[]>(STORAGE_KEYS.index, []);
}
export function setIndex(index: IndexEntry[]): void {
  setItem(STORAGE_KEYS.index, index);
}
export function clearIndex(): void {
  clearItem(STORAGE_KEYS.index);
}

// gitlite:config
const DEFAULT_CONFIG: RepoConfig = {
  repoInitialized: false,
  currentBranch: null,
  HEAD: null,
};

export function getConfig(): RepoConfig {
  return getItem<RepoConfig>(STORAGE_KEYS.config, DEFAULT_CONFIG);
}
export function setConfig(config: RepoConfig): void {
  setItem(STORAGE_KEYS.config, config);
}
export function clearConfig(): void {
  clearItem(STORAGE_KEYS.config);
}

// Clear all GitLite keys at once (useful for resetting the repo).
export function clearAll(): void {
  clearObjects();
  clearRefs();
  clearWorkspace();
  clearIndex();
  clearConfig();
}
