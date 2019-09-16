## VENENO TRAFFIC BOT (With a simple rotating Tor Proxy Server)
This script generates traffic for websites using a Tor Proxy Pool or any proxy server for which you desire

## Prerequisites

* Ubuntu 18.04+ 64-bit operating system
* A user account with sudo privileges
* Command line / terminal (CTRL-ALT-T or Applications menu > Accessories > Terminal)
* Xvfb
* NodeJS
* unzip
* libxi6
* libgtk-3-0
* libxss1
* libgconf-2-4
* libasound2
* libxtst6
* libnss3
* Docker software repositories (optional)

## Step 1: Update software repositories

As usual, it’s a good idea to update the local database of software to make sure you’ve got access to the latest revisions.

Therefore, open a terminal window and type:

```bash
sudo apt-get update
```

Allow the operation to complete.


## Step 2: Install requirements for Electron and Xvfb
```bash
sudo apt install -y unzip libxi6 libgtk-3-0 libxss1 libgconf-2-4 libasound2 libxtst6 libnss3
```

## Step 3: Install Xvfb

Here Xvfb (X virtual framebuffer) is an in-memory display server for a UNIX-like operating system (e.g., Linux). It implements the X11 display server protocol without any display. This is helpful for CLI applications like CI service.

```bash
sudo apt-get install -y xvfb
```

## Step 4: Install NodeJS
```bash
sudo apt-get install nodejs
```
## Step 5: Install Docker

To install Docker on Ubuntu, in the terminal window enter the command:

```bash
snap docker install
```
or

```bash
apt install docker.io
```

## Step 6: Run the Proxy Server

So now we gonna create a proxy server

```bash
# build docker container
docker build -t zeta0/alpine-tor:latest .

# ... or pull docker container
docker pull zeta0/alpine-tor:latest

# start docker container
docker run -d -p 5566:5566 -p 2090:2090 -e tors=25 zeta0/alpine-tor

# start docker with privoxy enabled and exposed
docker run -d -p 8118:8118 -p 2090:2090 -e tors=25 -e privoxy=1 zeta0/alpine-tor

# test with ...
curl --socks5 localhost:5566 http://httpbin.org/ip

# or if privoxy enabled ...
curl --proxy localhost:8118 http://httpbin.org/ip

# or to run chromium with your new found proxy
chromium --proxy-server="http://localhost:8118" \
    --host-resolver-rules="MAP * 0.0.0.0 , EXCLUDE localhost"

# monitor
# auth login:admin
# auth pass:admin
http://localhost:2090 or http://admin:admin@localhost:2090

# start docket container with new auth
docker run -d -p 5566:5566 -p 2090:2090 -e haproxy_login=MySecureLogin \
    -e haproxy_pass=MySecurePassword zeta0/alpine-tor
```

## Step 7: Usage Of Veneno Traffic Bot

Environment variables
-----
 * `url` - URL for navigation. (Default: https://iphub.info/)
 * `proxy` - The proxy server IP or address that acts as an intermediary for requests. (Example: 127.0.0.1)
 * `port` - Integer, port for proxy. (Example: 8080)
 * `user` and `pass` - Basic auth config for the proxy server. (Default: \`\` in both variables)
 * `windows` - Integer, number of bot instances to run. (Default: 1)
 * `time` - Integer, Max session time parameter value in minutes. (Default: 3 minutes in 6 pages)

Normal usage with environment variables and Xvfb
-----

```bash
# Run the traffic bot
xvfb-run --auto-servernum --server-num=1 --server-args="-screen 0 1024x768x24" node --harmony index.js --url https://iphub.info/ --proxy 127.0.0.1 --port 8080 --user lucas --pass veneno --windows 1 --time 2
```

Normal usage with environment variables
-----

```bash
# Run the traffic bot
node index.js --url https://iphub.info/ --proxy 127.0.0.1 --port 8080 --user lucas --pass veneno --windows 1 --time 2
```

Normal usage without Xvfb and proxy option with 3 minute session and only one window
-----

```bash
# Run the traffic bot
node index.js --url https://iphub.info/ --windows 1 --time 3 
```

Debug usage
-----

```bash
#  Run the traffic bot with Debug enabled
DEBUG=nightmare*,electron* node index.js --url https://iphub.info/ --proxy 127.0.0.1 --port 8080 --user lucas --pass veneno --windows 1 --time 2 3>log.txt
```

Crontab at every minute
-----

```bash
* * * * * xvfb-run --auto-servernum --server-num=1 --server-args="-screen 0 1024x768x24" node --harmony /var/www/trafficbot/index.js
```

Further readings
----------------
 * [NodeJS](https://nodejs.org/en/)
 * [Nightmare](https://github.com/segmentio/nightmare)
 * [Alpine Tor](https://github.com/zet4/alpine-tor)
 * [Tor Manual](https://www.torproject.org/docs/tor-manual.html.en)
 * [Tor Control](https://www.thesprawl.org/research/tor-control-protocol/)
 * [HAProxy Manual](http://cbonte.github.io/haproxy-dconv/index.html)
 * [Privoxy Manual](https://www.privoxy.org/user-manual/)

License
-----

Veneno Traffic Bot is an open source project released under the permissive MIT license.

Veneno Traffic Bot is standing on the shoulders of giants. Building something like Veneno Traffic Bot probably wouldn't be possible if not for the excellent open source projects that it builds on top of. In particular, it uses Nightmare for its fast, event-driven architecture.