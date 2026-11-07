import { ApiProperty } from '@nestjs/swagger';
import { DocumentResponse } from './document-response';
import { RevisionNotices } from '../revision-notices';
import { Document } from '../entities/document.entity';
import { detectionMethod, DetectionUnavailableReason, DocumentDetection, validateDetection } from '../detection-rate';

export class DetectionRateResponse {
  @ApiProperty({ enum: ['complete', 'unavailable'] })
  status: 'complete' | 'unavailable';

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 100,
    nullable: true,
    description: 'AI detection rate from the Oculus model: the token-weighted mean of its window scores, scaled to 100'
  })
  rate: number | null;

  @ApiProperty({ type: String, enum: ['no_prose', 'too_short', 'too_long'], nullable: true })
  reason: DetectionUnavailableReason | null;

  @ApiProperty({ enum: [detectionMethod] })
  method: typeof detectionMethod;

  @ApiProperty({ format: 'date-time' })
  checkedAt: string;
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
    type: DetectionRateResponse,
    nullable: true,
    description: 'AI detection result for the original, published when the document is assessed and retained afterwards'
  })
  assessment: DetectionRateResponse | null;

  @ApiProperty({ type: RevisionNoticesResponse, nullable: true, description: 'Notices recorded with the revision' })
  revisionNotices: RevisionNoticesResponse | null;
}

export function assessmentResponse(assessment: DocumentDetection | null): DetectionRateResponse | null {
  if (!assessment) return null;
  try {
    const { status, rate, reason, method, checkedAt } = validateDetection(assessment);
    return { status, rate, reason, method, checkedAt };
  } catch {
    return null;
  }
}

export function noticesResponse(notices: RevisionNotices | null): RevisionNoticesResponse | null {
  if (!notices) return null;
  return { keptPassages: [...notices.keptPassages], uneditedElements: [...notices.uneditedElements] };
}

export function documentAssessmentResponse(document: Document, base: DocumentResponse): DocumentAssessmentResponse {
  return {
    ...base,
    assessment: assessmentResponse(document.assessment ?? null),
    revisionNotices: document.status === 'completed' ? noticesResponse(document.revisionNotices ?? null) : null
  };
}
