import { Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { IPreviewBlockResponse } from '@unslop-docs/api-contracts';
import { DocumentPreview } from './document-preview';

// Vitest uses JIT without Angular's signal-input metadata transform.
const blocksInput = { alias: 'blocks', isSignal: true };
Input(blocksInput)(DocumentPreview.prototype, 'blocks');

const text = (value: string, extra: Partial<IPreviewBlockResponse> = {}): IPreviewBlockResponse => ({
  kind: 'paragraph',
  level: null,
  text: value,
  inlines: [{ text: value, bold: false, italic: false, protected: null }],
  rows: null,
  reason: null,
  ...extra
});

afterEach(() => TestBed.resetTestingModule());

function render(blocks: IPreviewBlockResponse[]): HTMLElement {
  TestBed.overrideComponent(DocumentPreview, {
    set: { template: readFileSync(`${import.meta.dirname}/document-preview.html`, 'utf8'), templateUrl: undefined }
  });
  const fixture = TestBed.createComponent(DocumentPreview);
  fixture.componentRef.setInput('blocks', blocks);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Document preview', () => {
  it('renders headings below the page outline with bold and italic runs', () => {
    const page = render([
      { ...text('Chapter 3'), kind: 'heading', level: 1 },
      { ...text('Methods'), kind: 'heading', level: 2 },
      {
        ...text('A bold start and an italic end'),
        inlines: [
          { text: 'A bold', bold: true, italic: false, protected: null },
          { text: ' start and ', bold: false, italic: false, protected: null },
          { text: 'an italic end', bold: false, italic: true, protected: null }
        ]
      }
    ]);
    expect(page.querySelector('h3')?.textContent).toBe('Chapter 3');
    expect(page.querySelector('h4')?.textContent).toBe('Methods');
    expect(page.querySelector('h1, h2')).toBeNull();
    expect(page.querySelector('p strong')?.textContent).toBe('A bold');
    expect(page.querySelector('p em')?.textContent).toBe('an italic end');
  });

  it('groups consecutive list items into one list and indents nested levels', () => {
    const page = render([
      text('Intro'),
      { ...text('First'), kind: 'list-item', level: 1 },
      { ...text('Nested'), kind: 'list-item', level: 2 },
      { ...text('Second'), kind: 'list-item', level: 1 },
      text('Outro'),
      { ...text('Later'), kind: 'list-item', level: 1 }
    ]);
    const lists = page.querySelectorAll('ul');
    expect(lists).toHaveLength(2);
    const items = [...lists[0].querySelectorAll('li')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(['First', 'Nested', 'Second']);
    expect(items[1].getAttribute('data-level')).toBe('2');
    expect(items[1].className).not.toBe(items[0].className);
  });

  it('renders tables with nested blocks in cells', () => {
    const page = render([
      {
        kind: 'table',
        level: null,
        text: null,
        inlines: null,
        rows: [
          { cells: [{ blocks: [text('Year')] }, { blocks: [text('Value')] }] },
          { cells: [{ blocks: [text('2024')] }, { blocks: [text('12'), text('13')] }] }
        ],
        reason: null
      }
    ]);
    const cells = [...page.querySelectorAll('table td')];
    const cellText = (cell: Element) => [...cell.querySelectorAll('p')].map((p) => p.textContent?.trim()).join(' ');
    expect(cells.map(cellText)).toEqual(['Year', 'Value', '2024', '12 13']);
    expect(page.querySelectorAll('table td p')).toHaveLength(5);
  });

  it('shows protected elements as labelled placeholders and never loads resources', () => {
    const page = render([
      { kind: 'protected', level: null, text: null, inlines: null, rows: null, reason: 'image' },
      {
        ...text('See <img src="https://evil.example/x.png" onerror="alert(1)"> and <a href="x">link</a>'),
        inlines: [
          { text: 'See ', bold: false, italic: false, protected: null },
          { text: 'equation', bold: false, italic: false, protected: 'equation' },
          {
            text: ' <img src="https://evil.example/x.png" onerror="alert(1)"> and <a href="x">link</a>',
            bold: false,
            italic: false,
            protected: null
          }
        ]
      }
    ]);
    expect(page.querySelector('img, a, script, iframe, object, video, audio, link, style')).toBeNull();
    expect(page.textContent).toContain('<img src="https://evil.example/x.png"');
    const placeholders = [...page.querySelectorAll('[data-protected]')];
    expect(placeholders.map((placeholder) => placeholder.getAttribute('data-protected'))).toEqual([
      'image',
      'equation'
    ]);
    expect(placeholders[0].textContent).toContain('Image');
    expect(placeholders[1].textContent).toContain('Equation');
  });
});
