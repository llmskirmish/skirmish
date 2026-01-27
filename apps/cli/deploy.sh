#!/bin/bash
set -e

# Deploy script for @llmskirmish/skirmish
# Copies source packages to public repo (matching private repo structure)
# and optionally publishes to npm

PUBLIC_REPO="/Users/kai/src/public-skirmish"
PRIVATE_REPO="/Users/kai/src/skirmish"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Syncing to public repo ===${NC}"

# Verify public repo exists
if [ ! -d "$PUBLIC_REPO/.git" ]; then
  echo -e "${RED}Error: Public repo not found at $PUBLIC_REPO${NC}"
  exit 1
fi

# Clean target directories (preserve .git, LICENSE, etc)
echo "Cleaning target directories..."
rm -rf "$PUBLIC_REPO/packages"
rm -rf "$PUBLIC_REPO/apps"
rm -rf "$PUBLIC_REPO/tooling"

# Create directory structure
mkdir -p "$PUBLIC_REPO/packages"
mkdir -p "$PUBLIC_REPO/apps"
mkdir -p "$PUBLIC_REPO/tooling"

# Copy packages (engine + its deps)
echo "Copying packages..."
cp -r "$PRIVATE_REPO/packages/engine" "$PUBLIC_REPO/packages/"
cp -r "$PRIVATE_REPO/packages/maps" "$PUBLIC_REPO/packages/"
cp -r "$PRIVATE_REPO/packages/types" "$PUBLIC_REPO/packages/"
cp -r "$PRIVATE_REPO/packages/replay" "$PUBLIC_REPO/packages/"

# Copy the CLI app
echo "Copying CLI app..."
cp -r "$SCRIPT_DIR" "$PUBLIC_REPO/apps/cli"

# Copy tooling
echo "Copying tooling..."
cp -r "$PRIVATE_REPO/tooling/typescript-config" "$PUBLIC_REPO/tooling/"

# Clean up node_modules and dist from copied packages
echo "Cleaning up build artifacts..."
find "$PUBLIC_REPO/packages" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PUBLIC_REPO/packages" -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PUBLIC_REPO/packages" -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PUBLIC_REPO/apps" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PUBLIC_REPO/apps" -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PUBLIC_REPO/apps" -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PUBLIC_REPO/tooling" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

# Create root package.json
cat > "$PUBLIC_REPO/package.json" << 'EOF'
{
  "name": "llmskirmish",
  "version": "0.1.0",
  "private": true,
  "description": "LLM Skirmish - AI battle arena",
  "type": "module",
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "skirmish": "turbo run build --filter=@llmskirmish/skirmish && pnpm --filter @llmskirmish/skirmish skirmish"
  },
  "devDependencies": {
    "turbo": "^2.3.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF

# Create pnpm-workspace.yaml
cat > "$PUBLIC_REPO/pnpm-workspace.yaml" << 'EOF'
packages:
  - 'packages/*'
  - 'apps/*'
  - 'tooling/*'
EOF

# Create turbo.json
cat > "$PUBLIC_REPO/turbo.json" << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
EOF

# Copy root files from private repo
echo "Copying root files..."
cp "$PRIVATE_REPO/LICENSE" "$PUBLIC_REPO/"
cp "$PRIVATE_REPO/THIRD-PARTY-NOTICES.md" "$PUBLIC_REPO/"
cp -r "$PRIVATE_REPO/example_strategies" "$PUBLIC_REPO/"
cp -r "$PRIVATE_REPO/maps" "$PUBLIC_REPO/"
cp -r "$PRIVATE_REPO/prompts" "$PUBLIC_REPO/"

# Copy maps and example_strategies into CLI for npm distribution
echo "Copying maps and example_strategies into CLI..."
cp -r "$PRIVATE_REPO/maps" "$PUBLIC_REPO/apps/cli/maps"
cp -r "$PRIVATE_REPO/example_strategies" "$PUBLIC_REPO/apps/cli/example_strategies"

# Copy or create README
if [ -f "$SCRIPT_DIR/README.md" ]; then
  cp "$SCRIPT_DIR/README.md" "$PUBLIC_REPO/"
elif [ -f "$PRIVATE_REPO/README.md" ]; then
  cp "$PRIVATE_REPO/README.md" "$PUBLIC_REPO/"
fi

# Create .gitignore
cat > "$PUBLIC_REPO/.gitignore" << 'EOF'
node_modules/
dist/
.turbo/
*.log
.DS_Store
EOF

echo -e "${GREEN}✓ Files synced to $PUBLIC_REPO${NC}"

# Show structure
echo ""
echo -e "${YELLOW}Public repo structure:${NC}"
find "$PUBLIC_REPO" -maxdepth 3 -type d ! -path "*/.git/*" ! -name ".git" | head -20

# Show what changed in public repo
cd "$PUBLIC_REPO"
echo ""
echo -e "${YELLOW}Git status:${NC}"
git status --short | head -20

# Ask to commit
echo ""
read -p "Commit and push to public repo? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git add -A
  
  # Get version from CLI package.json
  VERSION=$(node -p "require('./apps/cli/package.json').version")
  
  read -p "Commit message [Release v${VERSION}]: " COMMIT_MSG
  COMMIT_MSG=${COMMIT_MSG:-"Release v${VERSION}"}
  
  git commit -m "$COMMIT_MSG"
  git push
  echo -e "${GREEN}✓ Pushed to public repo${NC}"
fi

# Ask to publish to npm
echo ""
read -p "Publish CLI to npm? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd "$PUBLIC_REPO/apps/cli"
  pnpm install
  pnpm run build
  npm publish --access public
  echo -e "${GREEN}✓ Published to npm${NC}"
fi

echo -e "${GREEN}=== Done ===${NC}"
