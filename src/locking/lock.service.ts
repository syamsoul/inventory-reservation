import { Injectable } from '@nestjs/common';
import { Mutex } from './mutex';

@Injectable()
export class LockService {
  private readonly locks = new Map<string, Mutex>();

  forItem(itemId: string): Mutex {
    let lock = this.locks.get(itemId);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(itemId, lock);
    }
    return lock;
  }
}
