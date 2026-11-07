import { ApiProperty } from '@nestjs/swagger';
import {
  documentPhases,
  DocumentPhase,
  documentStatuses,
  DocumentStatus,
  failureMessages,
  processingStages,
  ProcessingStage
} from '../document-processing';
import { Document } from '../entities/document.entity';

export class EditingProgressResponse {
  @ApiProperty({ description: 'Editing chunks finished so far', minimum: 0 })
  completed: number;

  @ApiProperty({ description: 'Editing chunks planned for this rewrite', minimum: 0 })
  total: number;
}

export class DocumentResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  filename: string;

  @ApiProperty({ description: 'Original size in bytes', maximum: 10000000 })
  size: number;

  @ApiProperty({ enum: documentStatuses })
  status: DocumentStatus;

  @ApiProperty({
    enum: documentPhases,
    description:
      'Processing attempt the status refers to: the automatic AI detection, or the user-requested rewrite'
  })
  phase: DocumentPhase;

  @ApiProperty({
    enum: processingStages,
    nullable: true,
    description:
      'Active stage while processing; assessing has no measurable total, editing exposes progress'
  })
  processingStage: ProcessingStage | null;

  @ApiProperty({
    type: EditingProgressResponse,
    nullable: true,
    description: 'Completed and total editing work units while a rewrite is processing'
  })
  progress: EditingProgressResponse | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 100,
    description: 'Rewrite strength saved with the Unslopify request; null before the first request'
  })
  strength: number | null;

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
  const processing = document.status === 'processing';
  return {
    id: document.id,
    filename: document.filename,
    size: document.size,
    createdAt: document.createdAt,
    status: document.status,
    phase: document.phase,
    processingStage: processing
      ? (document.processingStage ?? (document.phase === 'assessment' ? 'assessing' : 'editing'))
      : null,
    progress:
      processing && document.editingTotal !== null && document.editingTotal !== undefined
        ? { completed: document.editingCompleted ?? 0, total: document.editingTotal }
        : null,
    strength: document.strength ?? null,
    failure: document.status === 'failed' ? failureMessages[document.failureCode] : null
  };
}
