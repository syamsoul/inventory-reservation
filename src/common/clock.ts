import { Injectable } from '@nestjs/common';

export interface Clock {
  now(): Date;
  setTimeout(callback: () => void, delayMs: number): NodeJS.Timeout;
  clearTimeout(timeout: NodeJS.Timeout): void;
}

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  setTimeout(callback: () => void, delayMs: number): NodeJS.Timeout {
    return setTimeout(callback, delayMs);
  }

  clearTimeout(timeout: NodeJS.Timeout): void {
    clearTimeout(timeout);
  }
}
