import { Input, Type } from '@angular/core';

export function enableJitSignalInput(component: Type<unknown>, name: string): void {
  const options = { alias: name, isSignal: true };
  Input(options)(component.prototype, name);
}
