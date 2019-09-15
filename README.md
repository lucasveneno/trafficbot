## VENENO TRAFFIC BOT (With a simple rotating Tor Proxy Server)
This script generates traffic for websites using a Tor pool proxy or any proxy server for which you desire

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

## Step 1: Update Software Repositories

As usual, it’s a good idea to update the local database of software to make sure you’ve got access to the latest revisions.

Therefore, open a terminal window and type:

```bash
$ sudo apt-get update
```

Allow the operation to complete.


## Step 2: Install Requirements for Electron and Xvfb
```bash
$ sudo apt install -y unzip libxi6 libgtk-3-0 libxss1 libgconf-2-4 libasound2 libxtst6 libnss3
```

## Step 3: Install Xvfb

Here Xvfb (X virtual framebuffer) is an in-memory display server for a UNIX-like operating system (e.g., Linux). It implements the X11 display server protocol without any display. This is helpful for CLI applications like CI service.

```bash
$ sudo apt-get install -y xvfb
```

## Step 4: Install NodeJS
```bash
$ sudo apt-get install nodejs
```
## Step 5: Install Docker

To install Docker on Ubuntu, in the terminal window enter the command:

```bash
$ snap docker install
```

So now we gonna create a proxy server

```bash
$ docker run -d -p 8118:8118 -p 2090:2090 -e tors=100 -e privoxy=1 zeta0/alpine-tor
```

apt-get install npm

npm i nightmare

https://www.npmjs.com/package/nightmare

DEBUG_FD=3 DEBUG=nightmare*,electron* node my-script.js 3>log.txt

Crontab

```bash
* * * * * cd /home/node_modules/nightmare/ && xvfb-run --auto-servernum --server-num=1 --server-args="-screen 0 1024x768x24" node --harmony queridin.js
```
