import { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { SignOut } from '../impl';
import { SignOutHandler } from './sign-out.handler';

describe('Sign out', () => {
  it('waits until the session store confirms deletion', async () => {
    let destroy: (error?: Error) => void;
    const request = {
      session: {
        destroy: (done) => {
          destroy = done;
        }
      }
    } as Request;
    const finished = vi.fn();
    const pending = new SignOutHandler().execute(new SignOut(request)).then(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    destroy();
    await pending;
    expect(finished).toHaveBeenCalledOnce();
  });
});
