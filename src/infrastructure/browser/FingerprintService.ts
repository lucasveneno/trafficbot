import { UserAgentService } from './UserAgentService';

export interface Fingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  platform: string;
  languages: string[];
  webgl: {
    vendor: string;
    renderer: string;
  };
}

export class FingerprintService {
  private static GPU_PROFILES = [
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, Radeon(TM) RX 580 Series Direct3D11 vs_5_0 ps_5_0)' },
    { vendor: 'Apple Inc.', renderer: 'Apple M1' },
    { vendor: 'Intel Inc.', renderer: 'Intel(R) Iris(TM) Plus Graphics 640' },
  ];

  static generate(): Fingerprint {
    // 1. Resolve host platform to guide initial selection
    const hostPlatform = process.platform; // 'darwin', 'win32', 'linux'
    
    // 2. Get random UA matching the host platform (or random if not matched)
    const { ua, platform: uaPlatform } = UserAgentService.getRandomUA('most-common', hostPlatform);
    
    // 3. Resolve navigator.platform based on UA
    let navPlatform = 'Win32';
    if (ua.includes('Macintosh')) navPlatform = 'MacIntel';
    if (ua.includes('Linux')) navPlatform = 'Linux x86_64';

    // 4. Pick a realistic GPU based on the resolved platform
    let gpuPool = this.GPU_PROFILES;
    if (navPlatform === 'MacIntel') {
      gpuPool = this.GPU_PROFILES.filter(p => p.vendor.includes('Apple') || p.vendor.includes('Intel'));
    } else if (navPlatform === 'Win32') {
      gpuPool = this.GPU_PROFILES.filter(p => p.vendor.includes('Google') || p.vendor.includes('NVIDIA'));
    }

    const webgl = gpuPool[Math.floor(Math.random() * gpuPool.length)];

    return {
      userAgent: ua,
      viewport: {
        width: 1280 + Math.floor(Math.random() * 200),
        height: 720 + Math.floor(Math.random() * 200),
      },
      deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
      hardwareConcurrency: [4, 8, 12, 16][Math.floor(Math.random() * 4)],
      deviceMemory: [8, 16][Math.floor(Math.random() * 2)],
      platform: navPlatform,
      languages: ['en-US', 'en'],
      webgl,
    };
  }

  static getInjectionScript(fingerprint: Fingerprint): string {
    return `
      (() => {
        // --- Hardware & Platform Spoofing ---
        const overwriteProperty = (obj, prop, value) => {
          try {
            Object.defineProperty(obj, prop, {
              get: () => value,
              set: () => {},
              configurable: true,
              enumerable: true
            });
          } catch (e) {}
        };

        overwriteProperty(navigator, 'hardwareConcurrency', ${fingerprint.hardwareConcurrency});
        overwriteProperty(navigator, 'deviceMemory', ${fingerprint.deviceMemory});
        overwriteProperty(navigator, 'platform', '${fingerprint.platform}');
        overwriteProperty(navigator, 'userAgent', '${fingerprint.userAgent}');
        overwriteProperty(navigator, 'appVersion', '${fingerprint.userAgent.replace('Mozilla/', '')}');
        overwriteProperty(navigator, 'languages', ${JSON.stringify(fingerprint.languages)});
        overwriteProperty(navigator, 'language', '${fingerprint.languages[0]}');

        // --- WebGL Randomization ---
        const maskWebGL = (proto) => {
          if (!proto) return;
          const getParameter = proto.getParameter;
          proto.getParameter = function(parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) return '${fingerprint.webgl.vendor}';
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) return '${fingerprint.webgl.renderer}';
            // VENDOR
            if (parameter === 3571) return '${fingerprint.webgl.vendor.split(' ')[0]}';
            // RENDERER
            if (parameter === 3572) return '${fingerprint.webgl.renderer}';
            return getParameter.apply(this, arguments);
          };
        };

        if (window.WebGLRenderingContext) maskWebGL(WebGLRenderingContext.prototype);
        if (window.WebGL2RenderingContext) maskWebGL(WebGL2RenderingContext.prototype);

        // --- Canvas Protection (Non-destructive noise) ---
        const manipulateCanvas = (proto) => {
          if (!proto) return;
          const getImageData = proto.getImageData;
          proto.getImageData = function() {
            const res = getImageData.apply(this, arguments);
            // Dynamic shift: subtly perturb the very last pixel if data exists
            if (res && res.data && res.data.length >= 4) {
              const lastIdx = res.data.length - 4;
              res.data[lastIdx] = (res.data[lastIdx] + 1) % 256;
            }
            return res;
          };
        };

        if (window.CanvasRenderingContext2D) manipulateCanvas(CanvasRenderingContext2D.prototype);
        
        // --- Audio Fingerprint Protection ---
        const maskAudio = () => {
          if (!window.AudioBuffer) return;
          const getChannelData = AudioBuffer.prototype.getChannelData;
          AudioBuffer.prototype.getChannelData = function() {
            const res = getChannelData.apply(this, arguments);
            // Add deterministic noise to the frequency data
            if (res && res.length > 100) {
              for (let i = 0; i < 10; i++) {
                res[res.length - 1 - i] += 0.0000001;
              }
            }
            return res;
          };
        };
        maskAudio();

        // --- Font & Geometry Protection (ClientRects) ---
        const maskFonts = () => {
          const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
          const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

          if (originalOffsetWidth && originalOffsetWidth.get) {
            Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
              get: function() {
                const val = originalOffsetWidth.get.apply(this);
                // Return slightly perturbed fractional value to break precise measurement
                return val > 0 ? val + (Math.random() * 0.001) : val;
              }
            });
          }

          if (originalOffsetHeight && originalOffsetHeight.get) {
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
              get: function() {
                const val = originalOffsetHeight.get.apply(this);
                return val > 0 ? val + (Math.random() * 0.001) : val;
              }
            });
          }
        };
        maskFonts();
        
        // --- WebDriver/Automation Protection ---
        overwriteProperty(navigator, 'webdriver', false);
      })();
    `;
  }
}
