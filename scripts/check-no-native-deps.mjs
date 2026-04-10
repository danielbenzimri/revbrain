#!/usr/bin/env node
/**
 * check-no-native-deps.mjs
 *
 * Fails if the transitive dependency closure of a workspace package contains
 * any native-compilation markers. Used to enforce the BB-3 contract-package
 * invariant (spec §6.3): `@revbrain/migration-ir-contract` must be importable
 * from a Deno edge function, which means no tree-sitter, no node-gyp, no
 * node-pre-gyp, no binding.gyp anywhere in its closure.
 *
 * Usage:
 *   node scripts/check-no-native-deps.mjs <package-name>
 *
 * If <package-name> is omitted, defaults to @revbrain/migration-ir-contract.
 *
 * Exits 0 on success, 1 on any native-dep finding.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const targetPackageName = process.argv[2] ?? '@revbrain/migration-ir-contract';

/**
 * Markers that indicate a package compiles native code.
 */
const NATIVE_DEP_NAMES = new Set([
  'node-gyp',
  'node-pre-gyp',
  '@mapbox/node-pre-gyp',
  'prebuild-install',
  'node-addon-api',
  'bindings',
  'nan',
  'tree-sitter',
  'tree-sitter-apex',
]);

/**
 * Find a workspace package's directory by its name (reads package.json of every
 * top-level directory under packages/, apps/, providers/).
 */
function findWorkspacePackageDir(name) {
  const roots = ['packages', 'apps', 'providers'];
  for (const root of roots) {
    const rootDir = join(repoRoot, root);
    if (!existsSync(rootDir)) continue;
    for (const entry of readdirSync(rootDir)) {
      const pkgJsonPath = join(rootDir, entry, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.name === name) return join(rootDir, entry);
      } catch {
        // ignore malformed package.json
      }
    }
  }
  return null;
}

/**
 * Resolve a dependency name to its installed directory, starting from
 * `fromDir` and walking up through nested node_modules, then the repo-root
 * node_modules (pnpm hoists very little, so nested resolution is the main
 * path).
 */
function resolveDepDir(depName, fromDir) {
  let dir = fromDir;
  while (true) {
    const candidate = join(dir, 'node_modules', depName, 'package.json');
    if (existsSync(candidate)) return dirname(candidate);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // pnpm virtual store fallback: check the workspace root .pnpm directory.
  const pnpmStore = join(repoRoot, 'node_modules', '.pnpm');
  if (existsSync(pnpmStore)) {
    // Look for any entry that starts with `<depName>@`. This is a best-effort
    // resolution — we don't version-match, we just want to know if the dep
    // exists anywhere in the closure.
    const scopedName = depName.replace('/', '+');
    try {
      for (const entry of readdirSync(pnpmStore)) {
        if (entry.startsWith(`${scopedName}@`) || entry.startsWith(`${depName}@`)) {
          const nested = join(pnpmStore, entry, 'node_modules', depName);
          if (existsSync(join(nested, 'package.json'))) return nested;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Check a single package directory for native-dep markers. Returns an array
 * of findings (empty if clean).
 */
function scanPackageDir(pkgDir, pkgName) {
  const findings = [];
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return findings;

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch (e) {
    return findings;
  }

  // 1. binding.gyp is the canonical node-gyp trigger.
  if (existsSync(join(pkgDir, 'binding.gyp'))) {
    findings.push({ pkg: pkgName, reason: 'has binding.gyp' });
  }

  // 2. gypfile: true in package.json.
  if (pkg.gypfile === true) {
    findings.push({ pkg: pkgName, reason: 'package.json has gypfile: true' });
  }

  // 3. install / preinstall / postinstall script invoking node-gyp.
  const scripts = pkg.scripts ?? {};
  for (const [scriptName, body] of Object.entries(scripts)) {
    if (typeof body !== 'string') continue;
    if (/node-gyp\b/.test(body) || /node-pre-gyp\b/.test(body) || /prebuild-install\b/.test(body)) {
      findings.push({
        pkg: pkgName,
        reason: `script "${scriptName}" uses native-build tooling: ${body}`,
      });
    }
  }

  // 4. Direct dependency on a known native package.
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  for (const depName of Object.keys(deps)) {
    if (NATIVE_DEP_NAMES.has(depName)) {
      findings.push({ pkg: pkgName, reason: `depends on native package: ${depName}` });
    }
  }

  return findings;
}

/**
 * Recursively walk the dependency closure of a workspace package. Workspace
 * deps (`workspace:*`) are followed into the monorepo; everything else is
 * resolved via node_modules.
 */
function walkClosure(startPkgDir, startPkgName) {
  const visited = new Set();
  const allFindings = [];

  function visit(pkgDir, pkgName) {
    if (visited.has(pkgName)) return;
    visited.add(pkgName);

    allFindings.push(...scanPackageDir(pkgDir, pkgName));

    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) return;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    } catch {
      return;
    }

    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
      // devDependencies intentionally excluded — they are not part of the
      // runtime closure that ships to the edge function.
    };

    for (const [depName, depSpec] of Object.entries(deps)) {
      // Skip if we already flagged this as a native dep — scanPackageDir
      // recorded it, and we don't have its directory anyway.
      if (NATIVE_DEP_NAMES.has(depName)) continue;

      // workspace:* protocol — follow into the monorepo
      if (typeof depSpec === 'string' && depSpec.startsWith('workspace:')) {
        const wsDir = findWorkspacePackageDir(depName);
        if (wsDir) visit(wsDir, depName);
        continue;
      }

      // external dep — resolve via node_modules
      const depDir = resolveDepDir(depName, pkgDir);
      if (depDir) visit(depDir, depName);
    }
  }

  visit(startPkgDir, startPkgName);
  return allFindings;
}

// ---- main ----

const targetDir = findWorkspacePackageDir(targetPackageName);
if (!targetDir) {
  console.error(`check-no-native-deps: could not find workspace package "${targetPackageName}"`);
  process.exit(1);
}

const findings = walkClosure(targetDir, targetPackageName);

if (findings.length > 0) {
  console.error(
    `check-no-native-deps: ${findings.length} native-dep violation(s) in closure of ${targetPackageName}:`
  );
  for (const f of findings) {
    console.error(`  - ${f.pkg}: ${f.reason}`);
  }
  process.exit(1);
}

console.log(
  `check-no-native-deps: OK — ${targetPackageName} closure is free of native deps (${visitedCount()} packages scanned)`
);

// Small helper that re-counts for the success log without changing walkClosure's API.
function visitedCount() {
  // walkClosure's visited set is not exposed; recompute via a second pass.
  // This is cheap (the closure for the contract package is tiny).
  const visited = new Set();
  function recount(pkgDir, pkgName) {
    if (visited.has(pkgName)) return;
    visited.add(pkgName);
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) return;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    } catch {
      return;
    }
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
    for (const [depName, depSpec] of Object.entries(deps)) {
      if (NATIVE_DEP_NAMES.has(depName)) continue;
      if (typeof depSpec === 'string' && depSpec.startsWith('workspace:')) {
        const wsDir = findWorkspacePackageDir(depName);
        if (wsDir) recount(wsDir, depName);
        continue;
      }
      const depDir = resolveDepDir(depName, pkgDir);
      if (depDir) recount(depDir, depName);
    }
  }
  recount(targetDir, targetPackageName);
  return visited.size;
}
