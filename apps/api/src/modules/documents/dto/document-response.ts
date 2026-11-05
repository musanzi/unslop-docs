import { ApiProperty } from '@nestjs/swagger';
import { documentStatuses, DocumentStatus, failureMessages } from '../document-processing';
import { Document } from '../entities/document.entity';

export class DocumentResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty({ description: 'Original size in bytes', maximum: 10000000 })
  size: number;

  @ApiProperty({ enum: documentStatuses })
  status: DocumentStatus;

  @ApiProperty({ type: String, nullable: true })
  failure: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

export class DocumentPage {
  @ApiProperty({ type: [DocumentResponse] })
  items: DocumentResponse[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export function documentResponse(document: Document): DocumentResponse {
  return {
    id: document.id,
    filename: document.filename,
    size: document.size,
    createdAt: document.createdAt,
    status: document.status,
    failure: document.status === 'failed' ? failureMessages[document.failureCode] : null
  };
}
