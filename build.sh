#!/usr/bin/env bash
set -e

echo ">>> Building frontend..."
cd frontend
npm install
node ./node_modules/vite/bin/vite.js build
cd ..

echo ">>> Installing backend..."
cd backend
npm install
cd ..

echo ">>> Build complete."
