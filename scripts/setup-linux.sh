#!/bin/bash

# setup-linux.sh - Prepare Linux system for Puppeteer/Chrome
# This script installs the required system libraries for Chrome to "breathe".

set -e

if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "This script is intended for Linux (Ubuntu/Debian) only."
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)." 
   exit 1
fi

echo "Updating package lists..."
apt-get update

echo "Installing Puppeteer dependencies (libnss3, libcups2, etc.)..."
apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

echo "System setup complete. Chrome should now be able to run."
