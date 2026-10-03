#!/usr/bin/env bash
# PDF Signer MVP — Start script
# Instala deps del backend si no existen, luego lo levanta.
# El frontend se sirve con 'npx serve'.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "🚀  PDF Signer MVP"
echo "────────────────────────────"

# Backend
cd "$SCRIPT_DIR/backend"
if [ ! -d "node_modules" ]; then
  echo "📦  Instalando dependencias del backend..."
  npm install
fi

echo "⚡  Iniciando backend en http://localhost:3001"
node src/index.js &
BACKEND_PID=$!

sleep 1

# Frontend
echo "🌐  Sirviendo frontend en http://localhost:3000"
echo "────────────────────────────"
echo "   Abre http://localhost:3000 en tu navegador"
echo "   Ctrl+C para detener"
echo ""
cd "$SCRIPT_DIR/frontend"
npx --yes serve -p 3000 . &
FRONTEND_PID=$!

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Detenido.'" EXIT INT TERM
wait
