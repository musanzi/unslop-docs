import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs';
import { getUploadsPath } from '@api/shared/config';
import { diskStorage } from 'multer';

export function createDiskUploadOptions(category: string): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const destination = getUploadsPath(category);
        mkdir(destination, { recursive: true }, (error) => cb(error, destination));
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}.${file.mimetype?.split('/')[1]?.split(';')[0]}`);
      }
    })
  };
}
