# Session 01: Code Quality & Developer Experience

**Priority:** Critical (Blocking)
**Estimated Duration:** 1 day
**Dependencies:** None

---

## Objective

Establish consistent code quality tooling across the entire monorepo before any significant development begins. This prevents technical debt accumulation and ensures all future code meets quality standards.

---

## Deliverables

### 1. ESLint Configuration

**Root Configuration** (`eslint.config.js`)

```javascript
// Root eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['**/dist', '**/node_modules', '**/.turbo']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strict],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);
```

**Backend-Specific Rules** (`apps/server/eslint.config.js`)

```javascript
import rootConfig from '../../eslint.config.js';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...rootConfig,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
```

### 2. Prettier Configuration

**Root Configuration** (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

**Ignore File** (`.prettierignore`)

```
dist
node_modules
.turbo
pnpm-lock.yaml
*.md
supabase/.temp
```

### 3. Git Hooks (Husky + lint-staged)

**Install Commands:**

```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
```

**lint-staged Configuration** (`.lintstagedrc`)

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,css,scss}": ["prettier --write"]
}
```

**Pre-commit Hook** (`.husky/pre-commit`)

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm lint-staged
```

### 4. Editor Configuration

**EditorConfig** (`.editorconfig`)

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

**VSCode Settings** (`.vscode/settings.json`)

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.eol": "\n"
}
```

**VSCode Extensions** (`.vscode/extensions.json`)

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "editorconfig.editorconfig"
  ]
}
```

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
# Root devDependencies
pnpm add -D -w \
  eslint \
  @eslint/js \
  typescript-eslint \
  prettier \
  husky \
  lint-staged

# Verify versions
pnpm ls eslint prettier husky
```

### Step 2: Create Configuration Files

```bash
# Create all config files as specified above
touch .prettierrc .prettierignore .editorconfig .lintstagedrc
touch eslint.config.js
mkdir -p .vscode
touch .vscode/settings.json .vscode/extensions.json
```

### Step 3: Initialize Husky

```bash
pnpm exec husky init
echo 'pnpm lint-staged' > .husky/pre-commit
chmod +x .husky/pre-commit
```

### Step 4: Update package.json Scripts

```json
{
  "scripts": {
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{ts,tsx,json,css}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,css}\"",
    "prepare": "husky"
  }
}
```

### Step 5: Fix Existing Code

```bash
# Run formatter on entire codebase
pnpm format

# Run linter with auto-fix
pnpm lint:fix

# Verify no errors remain
pnpm lint
```

### Step 6: Update CI Pipeline

Add to `.github/workflows/ci.yml`:

```yaml
- name: Format Check
  run: pnpm format:check

- name: Lint
  run: pnpm lint
```

---

## Acceptance Criteria

- [ ] `pnpm lint` passes with 0 errors across all packages
- [ ] `pnpm format:check` passes (all files formatted)
- [ ] Git pre-commit hook prevents commits with lint errors
- [ ] CI pipeline includes lint and format checks
- [ ] VSCode settings auto-format on save
- [ ] All team members have recommended extensions installed

---

## Files Changed/Created

```
revbrain/
├── .editorconfig           (new)
├── .prettierrc             (new)
├── .prettierignore         (new)
├── .lintstagedrc           (new)
├── eslint.config.js        (new)
├── .husky/
│   └── pre-commit          (new)
├── .vscode/
│   ├── settings.json       (new/update)
│   └── extensions.json     (new)
├── package.json            (update scripts)
├── apps/
│   └── server/
│       └── eslint.config.js (new)
└── .github/
    └── workflows/
        └── ci.yml          (update)
```

---

## Rollback Plan

If issues arise:

1. Remove husky: `pnpm remove -w husky lint-staged`
2. Delete `.husky/` directory
3. Revert package.json scripts
4. Config files can remain (they're passive)

---

## Notes

- Prettier handles formatting, ESLint handles code quality
- No overlap in responsibilities = no conflicts
- lint-staged only checks staged files = fast commits
- EditorConfig ensures consistency across different IDEs
