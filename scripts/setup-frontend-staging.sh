#!/bin/bash
# =============================================================================
# Frontend - Staging Project Setup
#
# Creates a separate Vercel project for staging/develop branch deployments.
# Free tier requires separate projects for staging vs production.
#
# Prerequisites:
#   - Vercel CLI installed and authenticated
#   - GitHub CLI installed and authenticated
#
# Usage:
#   ./scripts/setup-frontend-staging.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."

cd "$REPO_ROOT"

echo "================================================"
echo "Frontend - Staging Project Setup"
echo "================================================"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Error: Vercel CLI not installed."
    echo "Install: npm i -g vercel"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI not installed."
    echo "Install: brew install gh"
    exit 1
fi

# Show current Vercel account
echo "Current Vercel account:"
vercel whoami
echo ""

read -p "Continue with this account? [Y/n] " CONFIRM
if [[ "$CONFIRM" =~ ^[nN] ]]; then
    echo "Run 'vercel logout' and 'vercel login' to switch accounts."
    exit 1
fi

echo ""
echo "Creating new Vercel project: geometrix-client-staging"
echo ""

# Link to a new project
echo "Linking to new Vercel project..."
vercel link --yes --project geometrix-client-staging 2>&1 || true

# Deploy to create the project if it doesn't exist
echo ""
echo "Initial deployment to create project..."
vercel --yes --name geometrix-client-staging --prod 2>&1 | tail -5 || true

# Get the project ID
PROJECT_JSON=".vercel/project.json"
if [ -f "$PROJECT_JSON" ]; then
    STAGING_PROJECT_ID=$(grep -o '"projectId":"[^"]*"' "$PROJECT_JSON" | cut -d'"' -f4)
    echo ""
    echo "Staging Project ID: $STAGING_PROJECT_ID"
else
    echo "Error: Could not find project.json"
    echo "Please run 'vercel link --project geometrix-client-staging' manually"
    exit 1
fi

# Set GitHub secret
echo ""
echo "Setting GitHub secret: VERCEL_PROJECT_ID_STAGING"
gh secret set VERCEL_PROJECT_ID_STAGING --body "$STAGING_PROJECT_ID"

# Copy environment variables from production project
echo ""
echo "Note: You may need to copy environment variables from your production project."
echo "Run: vercel env pull --environment=production"
echo "Then set them on the staging project."

echo ""
echo "================================================"
echo "Staging Setup Complete!"
echo "================================================"
echo ""
echo "Staging Project ID: $STAGING_PROJECT_ID"
echo "Staging URL: https://geometrix-client-staging.vercel.app"
echo ""
echo "Next steps:"
echo "1. Copy any required env vars to the staging project:"
echo "   vercel env add VITE_API_URL production"
echo "   (set to your staging Supabase URL)"
echo ""
echo "2. Push to develop branch to trigger staging deployment"
echo ""
