# trafficbot
this script generates traffic for websites


snap docker install
docker run -d -p 8118:8118 -p 2090:2090 -e tors=100 -e privoxy=1 zeta0/alpine-tor




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
