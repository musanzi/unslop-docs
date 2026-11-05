import { FindDocumentHandler } from './queries/find-document.handler';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsController } from './documents.controller';
import { Document } from './entities/document.entity';
import { DocumentStorage } from './document-storage';
import { UploadDocumentHandler } from './commands/upload-document.handler';
import { FindDocumentsHandler } from './queries/find-documents.handler';
import { DownloadDocumentHandler } from './queries/download-document.handler';

@Module({
  imports: [TypeOrmModule.forFeature([Document])],
  controllers: [DocumentsController],
  providers: [
    { provide: DocumentStorage, useFactory: () => new DocumentStorage() },
    UploadDocumentHandler,
    FindDocumentsHandler,
    FindDocumentHandler,
    DownloadDocumentHandler
  ]
})
export class DocumentsModule {}
