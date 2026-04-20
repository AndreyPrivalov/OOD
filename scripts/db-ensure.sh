#!/bin/sh

set -eu

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh/."
  exit 1
fi

if ! brew list postgresql@16 >/dev/null 2>&1; then
  echo "Formula postgresql@16 is not installed."
  echo "Run: brew install postgresql@16"
  exit 1
fi

echo "Starting PostgreSQL service (postgresql@16)..."
brew services start postgresql@16
