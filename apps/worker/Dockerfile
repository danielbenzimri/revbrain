# ============================================================
# CPQ Extraction Worker — Multi-stage Docker Build
# ============================================================
# Architecture spec Section 6.3. Runs on Cloud Run Jobs.
# Uses tsx for TypeScript execution (matches monorepo pattern
# where all imports use .ts extensions for Deno compat).
# ============================================================

# -- Build stage: install deps + type-check --
FROM node:20-slim AS builder
WORKDIR /app

# Native-build toolchain for tree-sitter-sfapex (PH5.1 Apex parser):
# node-gyp needs python3 + make + g++ to compile the addon. Only
# installed in the builder stage; the runtime image stays slim.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Copy workspace root files needed for install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy only the packages needed by worker (for layer caching)
COPY packages/contract/package.json packages/contract/
COPY packages/database/package.json packages/database/
COPY packages/seed-data/package.json packages/seed-data/
COPY packages/migration-ir-contract/package.json packages/migration-ir-contract/
COPY packages/bb3-normalizer/package.json packages/bb3-normalizer/
COPY apps/worker/package.json apps/worker/

# Install all dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source for workspace packages the worker depends on
COPY packages/contract/ packages/contract/
COPY packages/database/ packages/database/
COPY packages/seed-data/ packages/seed-data/
COPY packages/migration-ir-contract/ packages/migration-ir-contract/
COPY packages/bb3-normalizer/ packages/bb3-normalizer/
COPY apps/worker/ apps/worker/

# Type-check (catches errors at build time, not runtime)
RUN pnpm --filter @revbrain/worker build

# -- Runtime stage --
FROM node:20-slim AS runtime

# Create non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copy everything needed at runtime (source + deps)
# tsx runs TypeScript directly — no pre-compilation needed
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/worker/ ./apps/worker/
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Switch to non-root user
USER appuser

# Heap limit: 1536MB leaves ~500MB for non-heap within 2GB container
# --max-old-space-size must be passed via NODE_OPTIONS for tsx
ENV NODE_OPTIONS="--max-old-space-size=1536"
CMD ["apps/worker/node_modules/.bin/tsx", "apps/worker/src/index.ts"]
