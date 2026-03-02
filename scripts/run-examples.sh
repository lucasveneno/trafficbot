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
echo "8) Distributed Worker (Wait for tasks from Redis)"
echo "9) Distributed Producer (Add 5 tasks to Redis)"
echo "10) Organic Search Simulation (via Google/Bing)"
echo "q) Quit"
echo "------------------------------------------------"

read -p "Enter choice [1-10 or q]: " choice

case $choice in
  1)
    echo "Running Default Production..."
    NODE_ENV=production MAX_SESSIONS=5 BOT_ROLE=both npm start
    ;;
  2)
    echo "Running High Concurrency (10 sessions)..."
    NODE_ENV=production MAX_SESSIONS=10 BOT_ROLE=both npm start
    ;;
  3)
    read -p "Enter URL: " target_url
    echo "Running Targeted Traffic to $target_url..."
    NODE_ENV=production DEFAULT_URL=$target_url MAX_SESSIONS=3 BOT_ROLE=both npm start
    ;;
  4)
    echo "Running Fast Testing (1 min session)..."
    NODE_ENV=development MAX_SESSIONS=1 SESSION_TIME=1 BOT_ROLE=both npm start
    ;;
  5)
    echo "Running with Local Tor Proxy (socks5://127.0.0.1:9050)..."
    NODE_ENV=production PROXY_URL=socks5://127.0.0.1 PROXY_PORT=9050 MAX_SESSIONS=2 BOT_ROLE=both npm start
    ;;
  6)
    echo "Running Visible Seeding Session..."
    echo "This will open a browser window and save data to ./sessions/session-0"
    echo "Current duration: 10 minutes (to allow manual interaction if needed)"
    NODE_ENV=production MAX_SESSIONS=1 PERSISTENT_SESSIONS=true HEADLESS=false SESSION_TIME=10 BOT_ROLE=both npm start
    ;;
  7)
    echo "Running Human Behavior Simulation (Headed)..."
    echo "Observe how the bot moves the mouse and scrolls automatically."
    NODE_ENV=production MAX_SESSIONS=1 HEADLESS=false HUMAN_BEHAVIOR=true BEHAVIOR_INTENSITY=high BOT_ROLE=both npm start
    ;;
  8)
    echo "Running as Distributed Worker..."
    echo "Make sure Redis is running at redis://127.0.0.1:6379"
    NODE_ENV=production BOT_ROLE=worker MAX_SESSIONS=5 npm start
    ;;
  9)
    echo "Running as Distributed Producer..."
    echo "Adding 5 sessions to the task queue..."
    NODE_ENV=production BOT_ROLE=producer DEFAULT_URL=https://lucasveneno.com/ MAX_SESSIONS=5 npm start
    ;;
  10)
    echo "Running Organic Search Simulation (via Google/Bing)..."
    echo "This will search for 'traffic bot' and then navigate to your site."
    NODE_ENV=production ORGANIC_SEARCH=true SEARCH_KEYWORDS="traffic bot,github,ai agent" MAX_SESSIONS=1 HEADLESS=false BOT_ROLE=both npm start
    ;;
  q)
    exit 0
    ;;
  *)
    echo "Invalid choice"
    ;;
esac
