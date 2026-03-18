#!/bin/bash

# RevBrain Supabase Cloud Initialization Script
# 🚀Rocketship Mode

set -e

echo "🚀 Starting RevBrain Supabase Cloud Setup..."

# Helper function to update env
# Usage: update_env "apps/client/.env" "KEY" "VALUE"
update_env() {
    local file=$1
    local key=$2
    local value=$3
    
    # Ensure file exists to avoid grep errors
    mkdir -p "$(dirname "$file")"
    touch "$file"
    
    if grep -q "$key" "$file"; then
        # Use simple sed. If keys contain slashes, this might break, but standard Supabase keys don't.
        sed -i '' "s|$key=.*|$key=$value|" "$file"
    else
        echo "$key=$value" >> "$file"
    fi
}

# Helper to get Project ID by Name using robust JSON parsing
# Usage: get_project_id "project-name"
get_project_id() {
    local name=$1
    # We use node to parse the JSON output from Supabase CLI
    npx supabase projects list --output json | node -pe "try { JSON.parse(require('fs').readFileSync(0)).find(p => p.name == '$name').id } catch(e) { '' }"
}

# 1. Login Check
if ! npx supabase projects list &> /dev/null; then
  echo "⚠️  Not logged in. Opening browser to login..."
  npx supabase login
fi

echo "✅ Logged in to Supabase CLI."

# 2. Select Organization
echo "📋 Fetching your organizations..."
npx supabase orgs list

read -p "👉 Enter the Organization ID where you want to create the projects (or type 'new' to create one): " ORG_ID

if [ "$ORG_ID" == "new" ]; then
    read -p "👉 Enter the Name for the new Organization: " ORG_NAME
    echo "🛠  Creating organization '$ORG_NAME'..."
    ORG_OUTPUT=$(npx supabase orgs create "$ORG_NAME")
    echo "$ORG_OUTPUT"
    ORG_ID=$(echo "$ORG_OUTPUT" | grep -oE '([a-z]{20})' | head -n 1)
    
    if [ -z "$ORG_ID" ]; then
        echo "⚠️  Could not auto-detect Organization ID from output."
        read -p "👉 Please copy the Organization ID from the output above: " ORG_ID
    fi
    echo "✅ Organization Created! ID: $ORG_ID"
fi

echo "👉 We will create 2 environments: DEV and PROD."
read -p "👉 Enter Base Project Name (will become <name>-dev and <name>-prod) [default: revbrain]: " BASE_NAME
BASE_NAME=${BASE_NAME:-revbrain}

read -p "👉 Enter a Database Password (min 8 chars, used for BOTH): " DB_PASSWORD
read -p "👉 Enter Region (e.g. eu-central-1, us-east-1) [default: eu-central-1]: " REGION
REGION=${REGION:-eu-central-1}

# Loop through stages
for STAGE in "dev" "prod"; do
    PROJECT_NAME="${BASE_NAME}-${STAGE}"
    echo ""
    echo "----------------------------------------------------------------"
    echo "🚧  Setting up Environment: $STAGE ($PROJECT_NAME)"
    echo "----------------------------------------------------------------"

    # 3. Create or Select Project
    echo "🔍 Checking if project '$PROJECT_NAME' already exists..."
    
    PROJECT_REF=$(get_project_id "$PROJECT_NAME")

    if [ -n "$PROJECT_REF" ] && [ "$PROJECT_REF" != "undefined" ]; then
        echo "✅ Found existing project. Reference ID: $PROJECT_REF"
    else
        echo "🛠  Creating project '$PROJECT_NAME' in region '$REGION'..."
        # Create project (ignoring text output parsing)
        npx supabase projects create "$PROJECT_NAME" --org-id "$ORG_ID" --db-password "$DB_PASSWORD" --region "$REGION"
        
        # Verify creation by fetching ID again
        sleep 2
        PROJECT_REF=$(get_project_id "$PROJECT_NAME")
    fi

    if [ -z "$PROJECT_REF" ] || [ "$PROJECT_REF" == "undefined" ]; then
        echo "⚠️  Could not auto-detect Project Reference ID. Creation might have failed."
        read -p "👉 Please copy the Project Reference ID (20 chars) from the dashboard or output above: " PROJECT_REF
    fi

    echo "🎉 Project Selected! Reference ID: $PROJECT_REF"

    # 4. Link Project
    echo "🔗 Linking local environment to $STAGE project..."
    # Pipe password to avoid prompt
    echo "$DB_PASSWORD" | npx supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"

    # 5. Push Schema
    echo "Creating migrations..."
    pnpm db:generate
    echo "⬆️  Pushing Database Schema to $STAGE..."
    # --yes to skip confirmation
    npx supabase db push --yes

    # 6. Fetch Keys & Update Env
    echo "🔑 Fetching API Keys..."
    KEYS_OUTPUT=$(npx supabase projects api-keys --project-ref "$PROJECT_REF")
    ANON_KEY=$(echo "$KEYS_OUTPUT" | grep -A 1 "anon" | grep "key" | awk -F': ' '{print $2}' | tr -d ' "')
    API_URL="https://$PROJECT_REF.supabase.co"

    # Save to env file
    ENV_FILE="apps/client/.env.$STAGE"
    echo "VITE_SUPABASE_URL=$API_URL" > "$ENV_FILE"
    echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY" >> "$ENV_FILE"
    echo "✅ Saved configuration to $ENV_FILE"
    
    # If dev, update active .env too
    if [ "$STAGE" == "dev" ]; then
         update_env "apps/client/.env" "VITE_SUPABASE_URL" "$API_URL"
         update_env "apps/client/.env" "VITE_SUPABASE_ANON_KEY" "$ANON_KEY"
         echo "✅ Set as ACTIVE configuration (.env)"
    fi
done

echo ""
echo "----------------------------------------------------------------"
echo "🔄  Restoring Link to DEV environment for local development..."

DEV_PROJECT_NAME="${BASE_NAME}-dev"
DEV_PROJECT_REF=$(get_project_id "$DEV_PROJECT_NAME")

if [ -n "$DEV_PROJECT_REF" ] && [ "$DEV_PROJECT_REF" != "undefined" ]; then
    echo "$DB_PASSWORD" | npx supabase link --project-ref "$DEV_PROJECT_REF" --password "$DB_PASSWORD"
    echo "✅ Local CLI is now linked to DEV ($DEV_PROJECT_NAME)"
else
    echo "⚠️  Could not duplicate find dev project ID to restore link. Please run 'npx supabase link' manually."
fi

echo ""
echo "🚀🚀🚀 DUAL SETUP COMPLETE! 🚀🚀🚀"
echo "1. $BASE_NAME-dev (Linked, Active)"
echo "2. $BASE_NAME-prod (deployed)"
echo ""
echo "Keys saved in apps/client/.env.dev and .env.prod"
