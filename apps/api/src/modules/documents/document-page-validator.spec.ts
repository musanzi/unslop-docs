import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { DocumentPageValidator } from './document-page-validator';

const bytes = Buffer.from('validated document');
const sha256 = createHash('sha256').update(bytes).digest('hex');
afterEach(() => vi.unstubAllGlobals());

describe('Upload page validation', () => {
  it('accepts thirty rendered pages and rejects thirty-one regardless of saved metadata', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ pages: 30, sha256 }))
      .mockResolvedValueOnce(Response.json({ pages: 31, sha256 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await new DocumentPageValidator().validate(bytes)).toBe(30);
    await expect(new DocumentPageValidator().validate(bytes)).rejects.toThrow('31 pages');
    expect(fetcher.mock.calls[0][1].body).toEqual(new Uint8Array(bytes));
  });
  it.each([
    { pages: 0, sha256 },
    { pages: 1.5, sha256 },
    { pages: 2, sha256: 'wrong' }
  ])('rejects untrustworthy renderer results', async (result) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(result))
    );
    await expect(new DocumentPageValidator().validate(bytes)).rejects.toThrow('invalid result');
  });
  it('does not accept an upload when rendering is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );
    await expect(new DocumentPageValidator().validate(bytes)).rejects.toThrow('unavailable');
  });
});
