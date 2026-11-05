import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Document } from '../entities/document.entity';
import { DocumentAssessmentResponse } from '../dto/document-assessment-response';
import { documentResponse } from '../dto/document-response';

export class FindDocument {
  constructor(
    public readonly ownerId: string,
    public readonly id: string
  ) {}
}

@QueryHandler(FindDocument)
export class FindDocumentHandler implements IQueryHandler<FindDocument, DocumentAssessmentResponse> {
  constructor(@InjectRepository(Document) private readonly documents: Repository<Document>) {}

  async execute({ ownerId, id }: FindDocument): Promise<DocumentAssessmentResponse> {
    if (!isUUID(id)) throw new NotFoundException('Document not found.');
    let document: Document | null;
    try {
      document = await this.documents.findOne({
        where: { id, ownerId },
        select: {
          id: true,
          filename: true,
          size: true,
          createdAt: true,
          status: true,
          failureCode: true,
          assessment: true
        }
      });
    } catch {
      throw new ServiceUnavailableException('The document could not be loaded. Try again.');
    }
    if (!document) throw new NotFoundException('Document not found.');
    return { ...documentResponse(document), assessment: document.status === 'assessed' ? document.assessment : null };
  }
}
