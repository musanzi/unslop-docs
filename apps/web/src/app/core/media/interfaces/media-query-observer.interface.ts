import type { WritableSignal } from '@angular/core';

export interface IMediaQueryObserver {
  matches: WritableSignal<boolean>;
  handler: (event: MediaQueryListEvent) => void;
}
