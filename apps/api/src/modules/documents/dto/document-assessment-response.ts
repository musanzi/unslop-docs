import { ApiProperty } from '@nestjs/swagger';
import { DocumentResponse } from './document-response';

export class WritingPatternResponse {
  @ApiProperty()
  rule: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [String] })
  examples: string[];
}

export class WritingAssessmentResponse {
  @ApiProperty({ type: [WritingPatternResponse] })
  patterns: WritingPatternResponse[];
}

export class DocumentAssessmentResponse extends DocumentResponse {
  @ApiProperty({ type: WritingAssessmentResponse, nullable: true })
  assessment: WritingAssessmentResponse | null;
}
