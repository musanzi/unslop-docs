import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentPage, documentResponse } from '../dto/document-response';
import { ListDocumentsDto } from '../dto/list-documents.dto';

export class FindDocuments {
  constructor(
    public readonly ownerId: string,
    public readonly pagination: ListDocumentsDto
  ) {}
}

@QueryHandler(FindDocuments)
export class FindDocumentsHandler implements IQueryHandler<FindDocuments, DocumentPage> {
  constructor(@InjectRepository(Document) private readonly documents: Repository<Document>) {}

  async execute({ ownerId, pagination: { page, pageSize } }: FindDocuments): Promise<DocumentPage> {
    const [documents, total] = await this.documents.findAndCount({
      where: { ownerId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items: documents.map(documentResponse), total, page, pageSize };
  }
}
