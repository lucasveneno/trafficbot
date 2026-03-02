import { logger } from '../logging/logger';

export interface IPDetails {
  ip: string;
  status: string;
  country: string;
  city: string;
  isp: string;
  hosting: boolean;
  proxy: boolean;
  vpn: boolean;
}

export class ReputationService {
  private static CACHE = new Map<string, IPDetails>();

  /**
   * Checks the reputation of an IP address using ip-api.com
   * Note: Free tier has a 45 req/min limit.
   */
  public static async checkIP(proxyServer?: string): Promise<IPDetails | null> {
    const cacheKey = proxyServer || 'direct';
    if (this.CACHE.has(cacheKey)) {
      return this.CACHE.get(cacheKey)!;
    }

    try {
      // Use ip-api.com to get advanced fields including hosting/proxy/vpn detection
      const response = await fetch('http://ip-api.com/json/?fields=status,message,country,city,isp,query,hosting,proxy,vpn');
      
      if (!response.ok) {
        throw new Error(`IP Check failed: ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (data.status === 'fail') {
        logger.warn('IP Reputation check failed', { message: data.message });
        return null;
      }

      const details: IPDetails = {
        ip: data.query,
        status: data.status,
        country: data.country,
        city: data.city,
        isp: data.isp,
        hosting: data.hosting || false,
        proxy: data.proxy || false,
        vpn: data.vpn || false,
      };

      this.CACHE.set(cacheKey, details);
      
      const isBurnt = details.hosting || details.proxy || details.vpn;
      if (isBurnt) {
        logger.warn('Proxy Reputation Alert: IP looks suspicious/burnt', { 
           ip: details.ip, 
           hosting: details.hosting, 
           proxy: details.proxy, 
           vpn: details.vpn 
        });
      } else {
        logger.info('Proxy Reputation Clean', { ip: details.ip, isp: details.isp });
      }

      return details;
    } catch (error) {
      logger.error('Failed to perform IP reputation check', { error });
      return null;
    }
  }
}
