import { ApiProperty } from '@nestjs/swagger';
import { DocumentResponse } from './document-response';
import { validateAssessment, WritingAssessment } from '../assessment-workflow';
import { RevisionNotices } from '../revision-notices';
import { Document } from '../entities/document.entity';
import { assessmentMethod } from '../style-assessment';

export class StyleAssessmentResponse {
  @ApiProperty({ enum: ['deepseek'] })
  provider: 'deepseek';

  @ApiProperty({ enum: ['complete', 'unavailable'] })
  status: 'complete' | 'unavailable';

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 100,
    nullable: true,
    description: 'AI-style score calculated from word-weighted sentence severity. Does not establish authorship'
  })
  score: number | null;

  @ApiProperty({ type: String, enum: ['no_prose'], nullable: true })
  reason: 'no_prose' | null;

  @ApiProperty()
  modelVersion: string;

  @ApiProperty({ enum: [assessmentMethod] })
  method: typeof assessmentMethod;

  @ApiProperty({ format: 'date-time' })
  checkedAt: string;

  @ApiProperty({ description: 'SHA-256 of the text submitted for assessment' })
  textHash: string;

  @ApiProperty()
  characterCount: number;

  @ApiProperty()
  wordCount: number;

  @ApiProperty()
  sentenceCount: number;

  @ApiProperty()
  weightedSeverity: number;
}

export class WritingAssessmentResponse {
  @ApiProperty({ enum: ['unslop-style-v1'] })
  rubric: 'unslop-style-v1';

  @ApiProperty({ type: StyleAssessmentResponse })
  style: StyleAssessmentResponse;
}

export class KeptPassageResponse {
  @ApiProperty({ description: 'Preservation check that kept the original passage' })
  check: string;

  @ApiProperty({ description: 'Identifier of the kept span' })
  span: string;

  @ApiProperty({ description: 'Excerpt of the original passage, at most 120 characters' })
  excerpt: string;
}

export class UneditedElementResponse {
  @ApiProperty({ description: 'Protected element kind, such as image, equation or footnote' })
  reason: string;

  @ApiProperty()
  count: number;
}

export class RevisionNoticesResponse {
  @ApiProperty({ type: [KeptPassageResponse] })
  keptPassages: KeptPassageResponse[];

  @ApiProperty({ type: [UneditedElementResponse] })
  uneditedElements: UneditedElementResponse[];
}

export class DocumentAssessmentResponse extends DocumentResponse {
  @ApiProperty({
    type: WritingAssessmentResponse,
    nullable: true,
    description: 'Initial assessment of the original, published when the document is assessed and retained afterwards'
  })
  assessment: WritingAssessmentResponse | null;

  @ApiProperty({
    type: WritingAssessmentResponse,
    nullable: true,
    description: 'Automatic assessment of the revised document; null until completed or when its score is unavailable'
  })
  finalAssessment: WritingAssessmentResponse | null;

  @ApiProperty({
    description: 'True when the revised download is ready but its final assessment could not be completed'
  })
  finalScoreUnavailable: boolean;

  @ApiProperty({ type: RevisionNoticesResponse, nullable: true, description: 'Notices recorded with the revision' })
  revisionNotices: RevisionNoticesResponse | null;
}

export function assessmentResponse(assessment: WritingAssessment | null): WritingAssessmentResponse | null {
  if (!assessment) return null;
  try {
    const { rubric, style } = validateAssessment(assessment);
    return { rubric, style };
  } catch {
    return null;
  }
}

export function noticesResponse(notices: RevisionNotices | null): RevisionNoticesResponse | null {
  if (!notices) return null;
  return { keptPassages: [...notices.keptPassages], uneditedElements: [...notices.uneditedElements] };
}

export function documentAssessmentResponse(document: Document, base: DocumentResponse): DocumentAssessmentResponse {
  const completed = document.status === 'completed';
  const finalAssessment = completed ? assessmentResponse(document.finalAssessment ?? null) : null;
  return {
    ...base,
    assessment: assessmentResponse(document.assessment ?? null),
    finalAssessment,
    finalScoreUnavailable: completed && document.strength != null && finalAssessment === null,
    revisionNotices: completed ? noticesResponse(document.revisionNotices ?? null) : null
  };
}
