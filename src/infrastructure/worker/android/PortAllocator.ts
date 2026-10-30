import net from 'net';

export class PortAllocator {
  private static allocated = new Set<number>();

  static async allocate(): Promise<number> {
    const port = await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
    });

    if (this.allocated.has(port)) {
      // Very unlikely collision, retry once
      return this.allocate();
    }
    
    this.allocated.add(port);
    return port;
  }

  static release(port: number): void {
    this.allocated.delete(port);
  }
}
