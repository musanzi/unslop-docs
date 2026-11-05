import { ApiProperty } from '@nestjs/swagger';
import { PreviewBlock, PreviewCell, PreviewInline, PreviewRow } from '../document-preview';

export class PreviewInlineResponse implements PreviewInline {
  @ApiProperty()
  text: string;

  @ApiProperty()
  bold: boolean;

  @ApiProperty()
  italic: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Protected element kind rendered as a placeholder, such as image, equation or footnote; null for text'
  })
  protected: string | null;
}

export class PreviewCellResponse implements PreviewCell {
  @ApiProperty({ type: () => [PreviewBlockResponse] })
  blocks: PreviewBlockResponse[];
}

export class PreviewRowResponse implements PreviewRow {
  @ApiProperty({ type: [PreviewCellResponse] })
  cells: PreviewCellResponse[];
}

export class PreviewBlockResponse implements PreviewBlock {
  @ApiProperty({ enum: ['heading', 'paragraph', 'list-item', 'table', 'protected'] })
  kind: PreviewBlock['kind'];

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Heading level from 1, or list nesting level from 1; null for other blocks'
  })
  level: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Plain text of the block; null for tables' })
  text: string | null;

  @ApiProperty({
    type: [PreviewInlineResponse],
    nullable: true,
    description: 'Formatted runs of a heading, paragraph or list item in document order; null for other blocks'
  })
  inlines: PreviewInlineResponse[] | null;

  @ApiProperty({ type: [PreviewRowResponse], nullable: true, description: 'Rows of a table; null for other blocks' })
  rows: PreviewRowResponse[] | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Protected block kind, such as image or equation; null for other blocks'
  })
  reason: string | null;
}

export class DocumentPreviewResponse {
  @ApiProperty({ type: [PreviewBlockResponse], description: 'Read-only structure of the original in document order' })
  blocks: PreviewBlockResponse[];
}
