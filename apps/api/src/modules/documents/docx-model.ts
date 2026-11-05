export interface DocxSource {
  readonly part: string;
  readonly start: number;
  readonly end: number;
}

export interface DocxRun {
  readonly kind: 'run';
  readonly source: DocxSource;
  readonly text: string;
  readonly textNodes: readonly { readonly source: DocxSource; readonly text: string }[];
  readonly bold: boolean;
  readonly italic: boolean;
  readonly hyperlink?: { readonly target?: string; readonly anchor?: string };
}

export interface DocxProtected {
  readonly kind: 'protected';
  readonly reason: string;
  readonly source: DocxSource;
  readonly text: string;
}

export interface DocxParagraph {
  readonly kind: 'heading' | 'paragraph' | 'list-item';
  readonly source: DocxSource;
  readonly style?: string;
  readonly level?: number;
  readonly numbering?: { readonly id: string; readonly level: number };
  readonly text: string;
  readonly inlines: readonly (DocxRun | DocxProtected)[];
}

export interface DocxTable {
  readonly kind: 'table';
  readonly source: DocxSource;
  readonly rows: readonly {
    readonly source: DocxSource;
    readonly cells: readonly { readonly source: DocxSource; readonly blocks: readonly DocxBlock[] }[];
  }[];
}

export type DocxBlock = DocxParagraph | DocxTable | DocxProtected;

export interface DocxDocument {
  readonly language: { readonly status: 'supported' | 'uncertain'; readonly languages: readonly ('en' | 'fr')[] };
  readonly mainPart: string;
  readonly blocks: readonly DocxBlock[];
  readonly text: string;
  readonly wordCount: number;
  readonly protectedParts: readonly { readonly name: string; readonly sha256: string; readonly size: number }[];
  readonly readXmlPart: (name: string) => string | undefined;
  readonly readPart: (name: string) => Buffer | undefined;
}
