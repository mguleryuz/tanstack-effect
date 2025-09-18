#!/bin/sh
set -eu

# Only consider these placeholders, in this exact order
# Note: <div align="center"> is not a placeholder and is excluded
PLACEHOLDERS_LIST='"mgguleryuz" "MG" "mguleryuz" "React + Tanstack Query + Effect Fullstack e2e queries with validation" "tanstack-effect"'

# Helper to search for placeholder with find+grep (BSD-compatible)
has_placeholder() {
  PH="$1"
  find . \
    -path './node_modules' -prune -o \
    -path './dist' -prune -o \
    -path './.git' -prune -o \
    -type f \
    ! -name '*.map' \
    ! -name 'bun.lockb' \
    ! -name 'package-lock.json' \
    ! -name 'pnpm-lock.yaml' \
    ! -name 'yarn.lock' \
    -exec grep -F -q "$PH" {} \; -print -quit | grep -q .
}

# Check if any of the specified placeholders exist
FOUND_ANY=0
for PH in "mgguleryuz" "MG" "mguleryuz" "React + Tanstack Query + Effect Fullstack e2e queries with validation" "tanstack-effect"; do
  if has_placeholder "$PH"; then
    FOUND_ANY=1
    break
  fi
done

if [ "$FOUND_ANY" -eq 0 ]; then
  echo "no placeholders found"
  exit 0
fi

echo "Detected placeholders to fill (present in project):"
for PH in "mgguleryuz" "MG" "mguleryuz" "React + Tanstack Query + Effect Fullstack e2e queries with validation" "tanstack-effect"; do
  if has_placeholder "$PH"; then
    echo "  $PH"
  fi
done
echo

# Prompt and replace one by one, only if placeholder exists
for PH in "mgguleryuz" "MG" "mguleryuz" "React + Tanstack Query + Effect Fullstack e2e queries with validation" "tanstack-effect"; do
  if ! has_placeholder "$PH"; then
    continue
  fi

  printf "Enter value for %s: " "$PH"
  IFS= read -r VALUE

  # Replace across files excluding build/deps and common artifacts using Perl for safe fixed-string replace
  find . \
    -path './node_modules' -prune -o \
    -path './dist' -prune -o \
    -path './.git' -prune -o \
    -type f \
    ! -name '*.map' \
    ! -name 'bun.lockb' \
    ! -name 'package-lock.json' \
    ! -name 'pnpm-lock.yaml' \
    ! -name 'yarn.lock' \
    -print0 | xargs -0 perl -0777 -i -pe "s/\Q$PH\E/$VALUE/g"
done

echo "Done."


