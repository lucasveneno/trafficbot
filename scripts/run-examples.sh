#!/bin/bash

# Veneno Traffic Bot v2 - Local Execution Examples
# This script demonstrates how to run the bot with different configurations without using Docker.

# Ensure the project is built
echo "Building project..."
npm run build

echo "------------------------------------------------"
echo "Select an example to run:"
echo "1) Default Production Run (5 sessions, default URL)"
echo "2) High Concurrency (10 sessions)"
echo "3) Targeted URL (Example: https://google.com)"
echo "4) Fast Testing (1 session, 1 minute duration)"
echo "5) Local Tor Proxy (Assumes Tor is running on 9050)"
echo "6) Seeding (Visible Browser, Persistent Profile)"
echo "7) Human Behavior Simulation (Headed, High Intensity)"
echo "q) Quit"
echo "------------------------------------------------"

read -p "Enter choice [1-7 or q]: " choice

case $choice in
  6)
    echo "Running Visible Seeding Session..."
    echo "This will open a browser window and save data to ./sessions/session-0"
    echo "Current duration: 10 minutes (to allow manual interaction if needed)"
    NODE_ENV=production MAX_SESSIONS=1 PERSISTENT_SESSIONS=true HEADLESS=false SESSION_TIME=10 npm start
    ;;
  1)
    echo "Running Default Production..."
    NODE_ENV=production MAX_SESSIONS=5 npm start
    ;;
  2)
    echo "Running High Concurrency (10 sessions)..."
    NODE_ENV=production MAX_SESSIONS=10 npm start
    ;;
  3)
    read -p "Enter URL: " target_url
    echo "Running Targeted Traffic to $target_url..."
    NODE_ENV=production DEFAULT_URL=$target_url MAX_SESSIONS=3 npm start
    ;;
  4)
    echo "Running Fast Testing (1 min session)..."
    NODE_ENV=development MAX_SESSIONS=1 SESSION_TIME=1 npm start
    ;;
  5)
    echo "Running with Local Tor Proxy (socks5://127.0.0.1:9050)..."
    NODE_ENV=production PROXY_URL=socks5://127.0.0.1 PROXY_PORT=9050 MAX_SESSIONS=2 npm start
    ;;
  7)
    echo "Running Human Behavior Simulation (Headed)..."
    echo "Observe how the bot moves the mouse and scrolls automatically."
    NODE_ENV=production MAX_SESSIONS=1 HEADLESS=false HUMAN_BEHAVIOR=true BEHAVIOR_INTENSITY=high npm start
    ;;
  q)
    exit 0
    ;;
  *)
    echo "Invalid choice"
    ;;
esac
