import { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createCsvUploadOptions } from './csv-upload';

describe('CSV upload policy', () => {
  it.each([
    { mimetype: 'text/csv', originalname: 'users' },
    { mimetype: 'application/csv', originalname: 'users' },
    { mimetype: 'text/plain', originalname: 'users.txt' },
    { mimetype: 'application/octet-stream', originalname: 'USERS.CSV' }
  ])('accepts a supported MIME type or CSV extension: %j', (file) => {
    const callback = vi.fn();
    createCsvUploadOptions().fileFilter({} as Request, file as Express.Multer.File, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it.each(['users.exe', 'users.csv.exe', ''])('rejects unsupported uploads: %s', (originalname) => {
    const callback = vi.fn();
    createCsvUploadOptions().fileFilter(
      {} as Request,
      { mimetype: 'application/octet-stream', originalname } as Express.Multer.File,
      callback
    );
    expect(callback).toHaveBeenCalledWith(null, false);
  });
});
