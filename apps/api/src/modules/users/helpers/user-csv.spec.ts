import { describe, expect, it } from 'vitest';
import { parseUsersCsv } from './user-csv';

describe('parseUsersCsv', () => {
  it('trims names and normalizes emails without losing quoted commas', async () => {
    const csv = 'Name,Email\n" Alice, A ", Alice@EXAMPLE.com \nBob,bob@example.com';
    await expect(parseUsersCsv(Buffer.from(csv))).resolves.toEqual([
      { name: 'Alice, A', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' }
    ]);
  });

  it('skips incomplete rows', async () => {
    await expect(
      parseUsersCsv(Buffer.from('Name,Email\nAlice,\n,bob@example.com\n  , \nCarol,carol@example.com'))
    ).resolves.toEqual([{ name: 'Carol', email: 'carol@example.com' }]);
  });

  it.each(['', 'Name,Email\n'])('accepts an empty import', async (csv) => {
    await expect(parseUsersCsv(Buffer.from(csv))).resolves.toEqual([]);
  });

  it('rejects malformed quoting', async () => {
    await expect(parseUsersCsv(Buffer.from('Name,Email\n"Alice,alice@example.com'))).rejects.toThrow();
  });
});
