import { ApiProperty } from '@nestjs/swagger';
import { DocumentResponse } from './document-response';
import { WritingAssessment } from '../assessment-workflow';
import { RevisionNotices } from '../revision-notices';
import { Document } from '../entities/document.entity';

export class WritingPatternResponse {
  @ApiProperty()
  rule: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  examples: string[];
}

export class WritingAssessmentResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Version of the document-wide scoring rubric; null for assessments recorded before scoring existed'
  })
  rubric: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 100,
    description:
      'Estimated AI-style score from 0 to 100. It measures writing patterns and does not establish who wrote the document. Null for assessments recorded before scoring existed'
  })
  score: number | null;

  @ApiProperty({ type: [WritingPatternResponse] })
  patterns: WritingPatternResponse[];
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
  return {
    rubric: assessment.rubric ?? null,
    score: Number.isInteger(assessment.score) ? assessment.score : null,
    patterns: assessment.patterns
  };
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
