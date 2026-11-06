import { ApiProperty } from '@nestjs/swagger';
import { DocumentResponse } from './document-response';
import { validateAssessment, DetectionAssessment } from '../assessment-workflow';
import { RevisionNotices } from '../revision-notices';
import { Document } from '../entities/document.entity';
import { detectionMethod } from '../ai-detection';

export class AiDetectionResponse {
  @ApiProperty({ enum: ['local'] })
  provider: 'local';

  @ApiProperty({ enum: ['complete', 'unavailable'] })
  status: 'complete' | 'unavailable';

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 1,
    nullable: true,
    description:
      'Token-weighted mean of segment model scores. Not an authorship percentage or calibrated document probability'
  })
  aiScore: number | null;

  @ApiProperty({ type: String, enum: ['too_short', 'too_long'], nullable: true })
  reason: 'too_short' | 'too_long' | null;

  @ApiProperty()
  modelVersion: string;

  @ApiProperty({ enum: [detectionMethod] })
  method: typeof detectionMethod;

  @ApiProperty({ format: 'date-time' })
  checkedAt: string;

  @ApiProperty({ description: 'SHA-256 of the full extracted text submitted for detection' })
  textHash: string;

  @ApiProperty({ description: 'Number of UTF-16 code units in the submitted text' })
  characterCount: number;

  @ApiProperty()
  tokenCount: number;

  @ApiProperty()
  segmentCount: number;
}

export class DetectionAssessmentResponse {
  @ApiProperty({ enum: ['local-detector-v1'] })
  rubric: 'local-detector-v1';

  @ApiProperty({ type: AiDetectionResponse })
  detection: AiDetectionResponse;
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
    type: DetectionAssessmentResponse,
    nullable: true,
    description: 'Initial assessment of the original, published when the document is assessed and retained afterwards'
  })
  assessment: DetectionAssessmentResponse | null;

  @ApiProperty({
    type: DetectionAssessmentResponse,
    nullable: true,
    description: 'Automatic assessment of the revised document; null until completed or when its score is unavailable'
  })
  finalAssessment: DetectionAssessmentResponse | null;

  @ApiProperty({
    description: 'True when the revised download is ready but its final assessment could not be completed'
  })
  finalScoreUnavailable: boolean;

  @ApiProperty({ type: RevisionNoticesResponse, nullable: true, description: 'Notices recorded with the revision' })
  revisionNotices: RevisionNoticesResponse | null;
}

export function assessmentResponse(assessment: DetectionAssessment | null): DetectionAssessmentResponse | null {
  if (!assessment) return null;
  try {
    return validateAssessment(assessment);
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
