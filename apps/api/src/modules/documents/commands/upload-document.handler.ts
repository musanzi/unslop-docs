import { documentFilename } from '../document-filename';
import { MAX_DOCUMENT_BYTES } from '../document-upload.interceptor';
import { validateDocx } from '../validate-docx';
import { BadRequestException, Logger, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentStorage } from '../document-storage';
import { DocumentResponse, documentResponse } from '../dto/document-response';

export class UploadDocument {
  constructor(
    public readonly ownerId: string,
    public readonly file: Express.Multer.File
  ) {}
}

@CommandHandler(UploadDocument)
export class UploadDocumentHandler implements ICommandHandler<UploadDocument, DocumentResponse> {
  private readonly logger = new Logger(UploadDocumentHandler.name);
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly storage: DocumentStorage
  ) {}

  async execute({ ownerId, file }: UploadDocument): Promise<DocumentResponse> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a DOCX file.');
    if (file.buffer.length > MAX_DOCUMENT_BYTES)
      throw new PayloadTooLargeException('Choose a DOCX file of 10 MB or less.');
    await validateDocx(file.buffer);
    const document = this.documents.create({
      id: randomUUID(),
      ownerId,
      filename: documentFilename(file.originalname),
      originalKey: `${randomUUID()}.docx`,
      size: file.buffer.length
    });
    let awaitingCommit = false;
    let fileWritten = false;
    try {
      const saved = await this.documents.manager.transaction(async (manager) => {
        await this.storage.write(document.originalKey, file.buffer);
        fileWritten = true;
        const saved = await manager.getRepository(Document).save(document);
        awaitingCommit = true;
        return saved;
      });
      return documentResponse(saved);
    } catch {
      if (fileWritten && !awaitingCommit) {
        try {
          await this.storage.remove(document.originalKey);
        } catch {
          this.logger.warn('Private upload cleanup failed.');
        }
      }
      throw new ServiceUnavailableException('The document could not be saved. Try again.');
    }
  }
}
