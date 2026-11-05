import { CallHandler, ExecutionContext, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Observable } from 'rxjs';

export const MAX_DOCUMENT_BYTES = 10000000;

@Injectable()
export class DocumentUploadInterceptor extends FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES + 1, files: 1, fields: 0, parts: 2, fieldNameSize: 100 }
}) {
  override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException)
        throw new PayloadTooLargeException('Choose a DOCX file of 10 MB or less.');
      throw error;
    }
  }
}
