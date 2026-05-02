#!/usr/bin/env bash
set -e

cleanup() {
  echo ""
  echo "Shutting down servers..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Installing dependencies ==="
cd "$ROOT_DIR"
npm install --silent
cd "$ROOT_DIR/web-ui"
npm install --silent

echo ""
echo "=== Starting backend (port 3001) ==="
cd "$ROOT_DIR"
npm run server &
BACKEND_PID=$!

echo "=== Starting frontend (port 5173) ==="
cd "$ROOT_DIR/web-ui"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
