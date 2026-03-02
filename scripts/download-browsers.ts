import { execSync } from 'child_process';
import { logger } from '../src/infrastructure/logging/logger';

async function downloadBrowsers() {
  const isLinux = process.platform === 'linux';
  logger.info(`Detected platform: ${process.platform}. Starting browser binary and system dependency download...`);
  
  try {
    // npx puppeteer browsers install chrome --install-deps handles:
    // - Chrome for Testing binary
    // - Low-level system libraries (graphics, networking, etc.) on Linux
    const isMacArm = process.platform === 'darwin' && process.arch === 'arm64';
    let command = isLinux 
      ? 'npx puppeteer browsers install chrome --install-deps'
      : 'npx puppeteer browsers install chrome';

    if (isMacArm) {
      command += ' --platform mac_arm';
    }

    logger.debug(`Executing: ${command}`);
    logger.info('Note: This will download Chrome for Testing and required shared libraries (if on Linux).');
    
    execSync(command, { stdio: 'inherit' });
    
    logger.info('Browser binaries and low-level system dependencies handled successfully.');
  } catch (error: any) {
    logger.error('Failed to handle browser or system dependencies.', { 
      error: error?.message || error 
    });
    
    if (isLinux) {
      logger.warn('On Linux, you may need to run this command with "sudo" to install system graphics/networking libraries.');
      logger.warn('Alternatively, run: sudo npm run setup:linux');
    }
    
    if (!isLinux) {
      process.exit(1);
    }
  }
}

downloadBrowsers();
