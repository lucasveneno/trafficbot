# Veneno Traffic Bot
This script generates traffic for websites

# Prerequisites

* Ubuntu 18.04 64-bit operating system
* A user account with sudo privileges
* Command line / terminal (CTRL-ALT-T or Applications menu > Accessories > Terminal)
* Docker software repositories (optional)

# Install Docker on Ubuntu Using Default Repositories
## Step 1: Update Software Repositories

As usual, it’s a good idea to update the local database of software to make sure you’ve got access to the latest revisions.

Therefore, open a terminal window and type:

```bash
$ sudo apt-get update
```

Allow the operation to complete.

## Step 2: Install Docker

To install Docker on Ubuntu, in the terminal window enter the command:

```bash
$ snap docker install
```


First of all we gonna create a proxy server

```bash
$ docker run -d -p 8118:8118 -p 2090:2090 -e tors=100 -e privoxy=1 zeta0/alpine-tor
```

apt-get install npm
apt-get install xfvb

Requirements for electron

libgtk-3-0
libxss1
libgconf-2-4
libasound2

npm i nightmare

https://www.npmjs.com/package/nightmare

DEBUG_FD=3 DEBUG=nightmare*,electron* node my-script.js 3>log.txt

Crontab

```bash
* * * * * cd /home/node_modules/nightmare/ && xvfb-run --auto-servernum --server-num=1 --server-args="-screen 0 1024x768x24" node --harmony queridin.js
```
