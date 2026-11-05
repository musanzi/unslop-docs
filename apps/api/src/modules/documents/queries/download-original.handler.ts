import { NotFoundException, StreamableFile } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentStorage } from '../document-storage';

export class DownloadOriginal {
  constructor(
    public readonly ownerId: string,
    public readonly id: string
  ) {}
}

@QueryHandler(DownloadOriginal)
export class DownloadOriginalHandler implements IQueryHandler<DownloadOriginal, StreamableFile> {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly storage: DocumentStorage
  ) {}

  async execute({ ownerId, id }: DownloadOriginal): Promise<StreamableFile> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException();
    const document = await this.documents.findOneBy({ id, ownerId });
    if (!document) throw new NotFoundException();
    try {
      return new StreamableFile(await this.storage.read(document.originalKey, document.size), {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        disposition: `attachment; filename="original.docx"; filename*=UTF-8''${encodeURIComponent(document.filename).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        length: document.size
      });
    } catch {
      throw new NotFoundException();
    }
  }
}
