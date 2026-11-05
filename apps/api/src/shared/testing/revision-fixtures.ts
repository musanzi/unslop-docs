import { DocumentProvider } from '../../modules/documents/document-workflow';
import { docxFixtureCases } from './docx-fixture-catalog';
import { readerFixture, textParagraph } from './docx-reader-fixture';
import { readDocx } from '../../modules/documents/validate-docx';

export const revisionPassages = {
  english:
    'In order to compare the results, the students collected 12 samples on 5 March 2026. Smith (2024) reports that “the river is stable”. The measurements are listed at https://example.org/study. They used the same method for each sample and kept their notes for the next study. The report does not establish why the river changed.',
  french:
    'Dans le but de comparer les résultats, les étudiants ont prélevé 12 échantillons le 5 mars 2026. Selon Martin (2024), « la rivière est stable ». Les mesures sont disponibles sur https://example.org/etude. Ils ont utilisé la même méthode pour chaque échantillon et conservé leurs notes pour la prochaine étude. Cette étude ne permet pas de déterminer pourquoi la rivière a changé.'
};

export async function revisionFixture(language: 'english' | 'french'): Promise<Buffer> {
  const base = await docxFixtureCases.find((fixture) => fixture.name === `${language}-structures`).create();
  const source = await readDocx(base);
  const xml = source.readXmlPart(source.mainPart);
  return readerFixture('', {
    'word/numbering.xml': source
      .readXmlPart('word/numbering.xml')
      .replace(
        '</w:abstractNum>',
        '<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/></w:lvl></w:abstractNum>'
      ),
    [source.mainPart]: xml
      .replace(
        '</w:tbl>',
        `<w:tr><w:tc>${textParagraph(language === 'english' ? 'Second sampling site' : 'Deuxième point de prélèvement')}</w:tc><w:tc>${textParagraph('8')}</w:tc></w:tr></w:tbl>`
      )
      .replace(
        '<w:sectPr>',
        `${textParagraph(revisionPassages[language])}<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${language === 'english' ? 'Compare the second sample' : 'Comparer le deuxième échantillon'}</w:t></w:r></w:p><w:sectPr>`
      )
  });
}

export function faithfulRevisionProvider(patterns = false): DocumentProvider {
  return {
    assess: async () => ({ patterns: patterns ? [{ rule: 23, examples: ['In order to'] }] : [] }),
    edit: async (_system, chunk) => ({
      edits: chunk.spans.map(({ id, text }) => ({
        id,
        text: text.replaceAll('In order to', 'To').replaceAll('Dans le but de', 'Pour')
      }))
    })
  };
}
