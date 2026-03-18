/**
 * Project-scoped localStorage utility.
 * All data keys are prefixed with `{projectId}::` to ensure full isolation between projects.
 */

// ── Key scoping ────────────────────────────────────────────────────

/** Build a project-scoped localStorage key */
export function getProjectKey(projectId: string, baseKey: string): string {
  return `${projectId}::${baseKey}`;
}

// ── Safe I/O ───────────────────────────────────────────────────────

/** Write to project-scoped localStorage, silently catching QuotaExceededError */
export function saveProjectData(projectId: string, baseKey: string, value: string): void {
  try {
    localStorage.setItem(getProjectKey(projectId, baseKey), value);
  } catch {
    console.warn(
      `[ProjectStorage] Quota exceeded for "${baseKey}" (${(value.length / 1024).toFixed(0)} KB). Skipping save.`
    );
  }
}

/** Read from project-scoped localStorage, parse as JSON, return defaultValue on miss/error */
export function loadProjectData<T>(projectId: string, baseKey: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(getProjectKey(projectId, baseKey));
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/** Read raw string from project-scoped key (no JSON parse) */
export function loadProjectDataRaw(projectId: string, baseKey: string): string | null {
  return localStorage.getItem(getProjectKey(projectId, baseKey));
}

/** Remove a project-scoped key */
export function removeProjectData(projectId: string, baseKey: string): void {
  localStorage.removeItem(getProjectKey(projectId, baseKey));
}

// ── Cleanup ────────────────────────────────────────────────────────

/** Delete ALL project-scoped keys for a given project */
export function deleteAllProjectData(projectId: string): void {
  const prefix = `${projectId}::`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  console.log(`[ProjectStorage] Deleted ${keysToRemove.length} keys for project ${projectId}`);
}

/** Calculate approximate storage bytes used by a project */
export function getProjectStorageSize(projectId: string): number {
  const prefix = `${projectId}::`;
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const val = localStorage.getItem(key);
      totalBytes += (key.length + (val?.length || 0)) * 2; // UTF-16
    }
  }
  return totalBytes;
}
