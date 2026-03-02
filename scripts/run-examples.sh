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
echo "11) Organic Search (No Proxy - Uses YOUR IP)"
echo "12) Targeted Google Search (Custom Keyword + URL)"
echo "q) Quit"
echo "------------------------------------------------"

read -p "Enter choice [1-12 or q]: " choice
choice=$(echo $choice | xargs)

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
    [[ ! $target_url =~ ^http ]] && target_url="https://$target_url"
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
  11)
    echo "Running Organic Search Simulation (NO PROXY)..."
    echo "This will use your own internet IP address."
    NODE_ENV=production ORGANIC_SEARCH=true SEARCH_KEYWORDS="traffic bot,github,ai agent" PROXY_URL="" PROXY_PORT="" MAX_SESSIONS=1 HEADLESS=false BOT_ROLE=both npm start
    ;;
  12)
    echo "Running Targeted Google Search Simulation..."
    read -p "Enter keyword to search for: " custom_keyword
    echo "How should the bot find the link in search results?"
    echo "1) Exact URL match"
    echo "2) URL contains specific text"
    echo "3) Click link by visible text (e.g. 'Lucas Veneno Portfolio')"
    read -p "Select option [1-3]: " match_type_choice
    
    case $match_type_choice in
      1) target_type="url";;
      2) target_type="contains";;
      3) target_type="text";;
      *) target_type="url";;
    esac

    read -p "Enter match value (URL, partial URL, or Link Text): " target_value
    read -p "Enter final destination URL (if different from above): " final_url
    read -p "Which search engine? [google/bing/duckduckgo/random]: " search_engine
    read -p "How many pages to search through? [1-5]: " page_limit
    read -p "Enable human behavior simulation? [y/n]: " behavior_choice
    
    [[ -z "$final_url" ]] && final_url="$target_value"
    [[ -z "$page_limit" ]] && page_limit="1"
    [[ -z "$search_engine" ]] || [[ "$search_engine" == "r" ]] && search_engine="random"
    [[ ! $final_url =~ ^http ]] && final_url="https://$final_url"
    
    if [[ "$behavior_choice" == "n" ]]; then
      human_behavior="false"
    else
      human_behavior="true"
    fi
    
    NODE_ENV=production \
    ORGANIC_SEARCH=true \
    SEARCH_KEYWORDS="$custom_keyword" \
    SEARCH_ENGINE="$search_engine" \
    SEARCH_TARGET_TYPE="$target_type" \
    SEARCH_TARGET_VALUE="$target_value" \
    SEARCH_PAGES_LIMIT="$page_limit" \
    DEFAULT_URL="$final_url" \
    HUMAN_BEHAVIOR="$human_behavior" \
    MAX_SESSIONS=1 \
    HEADLESS=false \
    BOT_ROLE=both \
    npm start
    ;;
  q)
    exit 0
    ;;
  *)
    echo "Invalid choice: '$choice'"
    ;;
esac
