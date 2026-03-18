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

// ── Migration ──────────────────────────────────────────────────────

/**
 * Complete list of localStorage base-keys that hold per-project data.
 * Global-only keys (loggedInUser, currentProject, projects list) are NOT included.
 */
export const ALL_MIGRATABLE_KEYS: string[] = [
  // MainApp state
  'geometrix_project',
  'geometrix_boq',
  'geometrix_bills',
  'geometrix_paymentRequests',
  'geometrix_timeLogs',
  'geometrix_dailyWorkLogs',
  'geometrix_users',
  'geometrix_approvedBills',
  'geometrix_quantityPages',
  'geometrix_billingSettings',
  'geometrix_billsAuditLog',
  'geometrix_paymentRequestsAuditLog',
  'geometrix_tasks',
  'geometrix_tasksAuditLog',
  'geometrix_systemFiles',
  'geometrix_photos',
  'geometrix_chatGroups',
  'geometrix_chatMessages',
  'geometrix_exceptionsSettings',
  'geometrix_exceptionsCalculations',
  'geometrix_exceptionReports',
  'geometrix_systemElements',
  'geometrix_folders',
  'geometrix_documents',
  // Wall modules
  'reinforced-walls-data',
  'reinforced-walls-rebar-images',
  'wall-calculator-react-data',
  'gravity-walls-data',
  'mse-walls-data',
  'mse-walls-rebar-images',
  // Bezeq
  'geometrix_bezeq_lines',
  'geometrix_bezeq_blocks',
  'geometrix_bezeq_boq_mappings',
  // Paving
  'geometrix_paving_boqMapping',
  'geometrix_paving_structures',
  'geometrix_area_assignments',
  'geometrix_paving_3d_data',
  'geometrix_curb_flip_sides',
  // Landscaping
  'geometrix_landscape_structures',
  'geometrix_landscape_area_assignments',
  'geometrix_landscape_line_assignments',
  'geometrix_dxf_length_assignments',
  'landscaping_curb_definitions',
  'geometrix_landscape_material_library',
  'geometrix_detailsBookAssignments',
  'geometrix_detailsBook',
  // Demolition
  'geometrix_demolition_boqMapping',
  // Street Lighting
  'geometrix_lighting_poles',
  'geometrix_lighting_cables',
  'geometrix_lighting_controlBoxes',
  'geometrix_lighting_manholes',
  'geometrix_lighting_plConnections',
  'geometrix_lighting_boq_mappings',
  'geometrix_lighting_dxfFileName',
  // 3D Workspace
  'geometrix_bezeq_3d_data',
  'geometrix_landscaping_3d_data',
  // Concrete Columns
  'concrete-columns-data',
  'column-rebar-pdf-data',
  'column-rebar-pdf-name',
  'column-analyzer-pdf-data',
  'column-analyzer-pdf-name',
  'column-analyzer-selections',
  // Piles
  'piles-project-data',
  // Rock Bolts
  'rock-bolts-project-data',
];

/**
 * Keys that are still read/written by modules that haven't been project-scoped yet.
 * These must NOT be deleted during cleanup — they are still used globally.
 * Currently: reinforcedWalls module (WallContext + SpreadsheetManager).
 */
export const KEYS_STILL_GLOBAL: ReadonlySet<string> = new Set([
  'reinforced-walls-data',
  'reinforced-walls-rebar-images',
]);

/** Keys safe to clean after migration (excludes KEYS_STILL_GLOBAL) */
export const CLEANABLE_KEYS: string[] = ALL_MIGRATABLE_KEYS.filter(
  (k) => !KEYS_STILL_GLOBAL.has(k)
);

/**
 * Migrate global (unscoped) localStorage data to a project-scoped namespace.
 * Uses copy-if-not-exists strategy so re-running is safe.
 */
export function migrateGlobalToProject(projectId: string): void {
  let migrated = 0;

  // 1. Migrate known fixed keys
  for (const key of ALL_MIGRATABLE_KEYS) {
    const scopedKey = getProjectKey(projectId, key);
    if (localStorage.getItem(scopedKey) !== null) continue; // already exists
    const globalValue = localStorage.getItem(key);
    if (globalValue !== null) {
      try {
        localStorage.setItem(scopedKey, globalValue);
        migrated++;
      } catch {
        /* quota — skip */
      }
    }
  }

  // 2. Migrate dynamic spreadsheet-* keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('spreadsheet-')) continue;
    if (key.includes('::')) continue; // already scoped
    const scopedKey = getProjectKey(projectId, key);
    if (localStorage.getItem(scopedKey) !== null) continue;
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        localStorage.setItem(scopedKey, value);
        migrated++;
      } catch {
        /* quota — skip */
      }
    }
  }

  // 3. Mark as migrated
  localStorage.setItem(getProjectKey(projectId, '__migrated__'), 'true');
  console.log(`[ProjectStorage] Migrated ${migrated} keys to project ${projectId}`);

  // 4. Clean up global keys to free localStorage space (data is now in scoped keys)
  // IMPORTANT: Only clean keys that have been project-scoped — NOT keys still used globally
  // (e.g., reinforced-walls-data is still read directly from global localStorage)
  let cleaned = 0;
  for (const key of CLEANABLE_KEYS) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      cleaned++;
    }
  }
  // NOTE: Do NOT delete global spreadsheet-* keys — reinforcedWalls SpreadsheetManager still uses them
  if (cleaned > 0) {
    console.log(`[ProjectStorage] Cleaned ${cleaned} global keys after migration`);
  }
}

/** Check whether a project already underwent migration */
export function isProjectMigrated(projectId: string): boolean {
  return localStorage.getItem(getProjectKey(projectId, '__migrated__')) === 'true';
}

/** Check whether ANY global (unscoped) data exists that could be migrated */
export function hasGlobalData(): boolean {
  // Check a few representative keys
  return [
    'geometrix_boq',
    'geometrix_users',
    'reinforced-walls-data',
    'mse-walls-data',
    'geometrix_tasks',
  ].some((key) => localStorage.getItem(key) !== null);
}

/**
 * Clean up leftover global keys for a project that was already migrated.
 * Safe to call multiple times — only removes globals if scoped data exists.
 */
export function cleanupGlobalKeysIfMigrated(projectId: string): void {
  if (!isProjectMigrated(projectId)) return;
  let cleaned = 0;
  // Only clean keys that have been project-scoped — preserve KEYS_STILL_GLOBAL
  for (const key of CLEANABLE_KEYS) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      cleaned++;
    }
  }
  // NOTE: Do NOT delete global spreadsheet-* keys — reinforcedWalls SpreadsheetManager still uses them

  // Restore KEYS_STILL_GLOBAL from scoped storage if they were accidentally deleted
  for (const key of KEYS_STILL_GLOBAL) {
    if (localStorage.getItem(key) === null) {
      const scopedValue = localStorage.getItem(getProjectKey(projectId, key));
      if (scopedValue !== null) {
        try {
          localStorage.setItem(key, scopedValue);
          console.log(`[ProjectStorage] Restored global key "${key}" from scoped storage`);
        } catch {
          /* quota — skip */
        }
      }
    }
  }
  // Also restore global spreadsheet-* keys from scoped storage if they were deleted
  const prefix = `${projectId}::spreadsheet-`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      const globalKey = k.substring(projectId.length + 2); // Remove "projId::" prefix
      if (localStorage.getItem(globalKey) === null) {
        const scopedValue = localStorage.getItem(k);
        if (scopedValue !== null) {
          try {
            localStorage.setItem(globalKey, scopedValue);
            console.log(`[ProjectStorage] Restored global key "${globalKey}" from scoped storage`);
          } catch {
            /* quota — skip */
          }
        }
      }
    }
  }

  if (cleaned > 0) {
    console.log(
      `[ProjectStorage] Cleaned ${cleaned} leftover global keys for already-migrated project ${projectId}`
    );
  }
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
