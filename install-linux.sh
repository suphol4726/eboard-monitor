#!/bin/bash
# =========================================================
# E-Board Monitor - One-Click Linux Production Installer
# =========================================================

echo "🚀 Starting E-Board Monitor Production Installation..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential iputils-ping arp-scan
else
    echo "✅ Node.js is already installed: $(node -v)"
fi

# Install PM2 globally if missing
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 Process Manager..."
    sudo npm install -g pm2
fi

# Install dependencies and build project
echo "🔨 Installing npm dependencies..."
npm install

echo "🏗️ Building Production App (Vite + Esbuild)..."
npm run build

# Start or restart PM2 process
echo "⚡ Starting E-Board Service via PM2..."
pm2 stop eboard-monitor 2>/dev/null || true
pm2 delete eboard-monitor 2>/dev/null || true
pm2 stop netsentinel 2>/dev/null || true
pm2 delete netsentinel 2>/dev/null || true
pm2 start dist/server.cjs --name "eboard-monitor" --env production

# Setup PM2 Startup script
echo "📌 Configuring Auto-start on System Boot..."
pm2 startup | tail -n 1 | bash 2>/dev/null || true
pm2 save

echo "========================================================="
echo "🎉 E-Board Monitor is successfully installed & running!"
echo "🌐 Access Web App at: http://$(hostname -I | awk '{print $1}'):3000"
echo "========================================================="
