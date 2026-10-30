const fs = require('fs')
const path = require('path')

const version = require('../package.json').version
const pubDate = new Date().toISOString()
const dist = path.join(__dirname, '../dist/release-assets')

const files = fs.readdirSync(dist)

function findFile(regex) {
  return files.find(f => regex.test(f))
}

const macArmTar = findFile(/aarch64.*\.app\.tar\.gz$/) || findFile(/mac.*arm64.*\.app\.tar\.gz$/) || `Trafficbot_${version}_aarch64-apple-darwin.app.tar.gz`
const macX64Tar = findFile(/x86_64.*\.app\.tar\.gz$/) || findFile(/mac.*x64.*\.app\.tar\.gz$/) || `Trafficbot_${version}_x86_64-apple-darwin.app.tar.gz`
const winX64Zip = findFile(/nsis\.zip$/) || `Trafficbot_${version}_x64-setup.nsis.zip`

function getSig(file) {
  try {
    return fs.readFileSync(path.join(dist, file + '.sig'), 'utf8').trim()
  } catch(e) {
    return ''
  }
}

const updater = {
  version,
  notes: `Trafficbot ${version}`,
  pub_date: pubDate,
  platforms: {
    'darwin-aarch64': {
      signature: getSig(macArmTar),
      url: `https://github.com/lucasveneno/trafficbot/releases/download/v${version}/${macArmTar}`
    },
    'darwin-x86_64': {
      signature: getSig(macX64Tar),
      url: `https://github.com/lucasveneno/trafficbot/releases/download/v${version}/${macX64Tar}`
    },
    'windows-x86_64': {
      signature: getSig(winX64Zip),
      url: `https://github.com/lucasveneno/trafficbot/releases/download/v${version}/${winX64Zip}`
    }
  }
}

fs.writeFileSync(path.join(dist, 'updater.json'), JSON.stringify(updater, null, 2))
console.log('updater.json generated:\n', JSON.stringify(updater, null, 2))
