import { FindAllowanceHandler } from './queries/find-allowance.handler';
import { AllowanceClock, MonthlyAllowance } from './monthly-allowance';
import { FindDocumentHandler } from './queries/find-document.handler';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsController } from './documents.controller';
import { Document } from './entities/document.entity';
import { DocumentStorage } from './document-storage';
import { UploadDocumentHandler } from './commands/upload-document.handler';
import { RetryDocumentHandler } from './commands/retry-document.handler';
import { UnslopifyDocumentHandler } from './commands/unslopify-document.handler';
import { DeleteDocumentHandler } from './commands/delete-document.handler';
import { FindDocumentPreviewHandler } from './queries/find-document-preview.handler';
import { FindDocumentsHandler } from './queries/find-documents.handler';
import { DownloadDocumentHandler } from './queries/download-document.handler';
import { DocumentPageValidator } from './document-page-validator';

@Module({
  imports: [TypeOrmModule.forFeature([Document])],
  controllers: [DocumentsController],
  providers: [
    DocumentPageValidator,
    { provide: DocumentStorage, useFactory: () => new DocumentStorage() },
    UploadDocumentHandler,
    RetryDocumentHandler,
    UnslopifyDocumentHandler,
    DeleteDocumentHandler,
    FindDocumentPreviewHandler,
    FindAllowanceHandler,
    AllowanceClock,
    MonthlyAllowance,
    FindDocumentsHandler,
    FindDocumentHandler,
    DownloadDocumentHandler
  ]
})
export class DocumentsModule {}
