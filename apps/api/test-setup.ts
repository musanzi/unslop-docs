import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});
