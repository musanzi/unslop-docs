import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentPreviewResponse } from '../dto/document-preview-response';

export class FindDocumentPreview {
  constructor(
    public readonly ownerId: string,
    public readonly id: string
  ) {}
}

@QueryHandler(FindDocumentPreview)
export class FindDocumentPreviewHandler implements IQueryHandler<FindDocumentPreview, DocumentPreviewResponse> {
  constructor(@InjectRepository(Document) private readonly documents: Repository<Document>) {}

  async execute({ ownerId, id }: FindDocumentPreview): Promise<DocumentPreviewResponse> {
    if (!isUUID(id)) throw new NotFoundException('Preview not available.');
    let document: Document | null;
    try {
      document = await this.documents.findOne({ where: { id, ownerId }, select: { id: true, preview: true } });
    } catch {
      throw new ServiceUnavailableException('The preview could not be loaded. Try again.');
    }
    if (!document?.preview) throw new NotFoundException('Preview not available.');
    return { blocks: document.preview.blocks };
  }
}
