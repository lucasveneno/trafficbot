import winston from 'winston';
import TransportStream from 'winston-transport';

type LogCallback = (info: any) => void;
let logCallback: LogCallback | undefined;

export function setLogCallback(cb: LogCallback) {
  logCallback = cb;
}

class ControlServerTransport extends TransportStream {
  log(info: any, callback: () => void) {
    if (logCallback) {
      logCallback(info);
    }
    callback();
  }
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'trafficbot' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new ControlServerTransport(),
  ],
});
