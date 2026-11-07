import { NotFoundException, StreamableFile } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentStorage } from '../document-storage';

export class DownloadDocument {
  constructor(
    public readonly ownerId: string,
    public readonly id: string,
    public readonly version: 'original' | 'revised' = 'original'
  ) {}
}

@QueryHandler(DownloadDocument)
export class DownloadDocumentHandler implements IQueryHandler<DownloadDocument, StreamableFile> {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly storage: DocumentStorage
  ) {}

  async execute({ ownerId, id, version }: DownloadDocument): Promise<StreamableFile> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException();
    const document = await this.documents.findOne({
      where: { id, ownerId },
      select: { filename: true, originalKey: true, size: true, status: true, revisedKey: true, revisedSize: true }
    });
    if (!document) throw new NotFoundException();
    const key =
      version === 'original' ? document.originalKey : document.status === 'completed' ? document.revisedKey : null;
    const size = version === 'original' ? document.size : document.revisedSize;
    if (!key || !size) throw new NotFoundException();
    const filename = version === 'original' ? document.filename : `revised-${document.filename}`;
    try {
      return new StreamableFile(await this.storage.read(key, size), {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        disposition: `attachment; filename="${version}.docx"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        length: size
      });
    } catch {
      throw new NotFoundException();
    }
  }
}
