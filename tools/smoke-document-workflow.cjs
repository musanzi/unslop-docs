require('reflect-metadata');
const assert = require('node:assert/strict');
const { ZipFile } = require('yazl');
const base = '../dist/apps/api/src/modules/documents/';

async function fixture(pages = 1) {
  const zip = new ZipFile();
  const text =
    'In order to understand the results, we measured water use in twelve classrooms over six weeks. Each class recorded its daily use in a shared notebook. The school repaired two leaking taps during the third week. Water use fell after those repairs, although the study did not separate the repairs from changes in student behaviour. The comparison therefore describes an observed change and does not establish its cause. A second study could assign repairs to different weeks and compare the results. The original records remain available for checking the calculation.';
  const paragraphs = Array.from(
    { length: pages },
    (_, i) => `<w:p><w:r>${i ? '<w:br w:type="page"/>' : ''}<w:t>${text}</w:t></w:r></w:p>`
  ).join('');
  zip.addBuffer(
    Buffer.from(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    ),
    '[Content_Types].xml'
  );
  zip.addBuffer(
    Buffer.from(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    ),
    '_rels/.rels'
  );
  zip.addBuffer(
    Buffer.from(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
    ),
    'word/document.xml'
  );
  const data = [];
  const result = new Promise((resolve, reject) => {
    zip.outputStream.on('data', (part) => data.push(part));
    zip.outputStream.once('end', () => resolve(Buffer.concat(data)));
    zip.outputStream.once('error', reject);
  });
  zip.end();
  return result;
}

async function main() {
  if (process.argv[2] === 'pages') {
    const { DocumentPageValidator } = require(base + 'document-page-validator');
    const validator = new DocumentPageValidator();
    assert.equal(await validator.validate(await fixture(5)), 5);
    await assert.rejects(() => fixture(6).then((bytes) => validator.validate(bytes)), /6 pages/);
    console.log('Page validation passed: five pages accepted, six rejected.');
    return;
  }
  const { readDocx } = require(base + 'validate-docx');
  const { assessmentText } = require(base + 'style-assessment');
  const { validateAssessment } = require(base + 'assessment-workflow');
  const { DeepSeekProvider, workerSettings, loadEditingSkill } = require(base + 'deepseek-provider');
  const { createRewriteWorkflow } = require(base + 'document-workflow');
  const provider = new DeepSeekProvider(workerSettings(process.env));
  const source = await readDocx(await fixture());
  const before = validateAssessment(await provider.assess(assessmentText(source), AbortSignal.timeout(120000)));
  assert.equal(before.style.status, 'complete');
  const revised = await createRewriteWorkflow(provider, await loadEditingSkill(), 50).invoke(
    { source },
    { signal: AbortSignal.timeout(180000) }
  );
  const output = await readDocx(revised.revised);
  const after = validateAssessment(await provider.assess(assessmentText(output), AbortSignal.timeout(120000)));
  assert.equal(after.style.status, 'complete');
  assert.ok(output.wordCount > 0);
  console.log(
    `Synthetic document workflow passed: assessment, rewrite, DOCX validation, final assessment (${before.style.score} -> ${after.style.score}).`
  );
}

main().catch(() => {
  console.error('Document service smoke check failed. No credentials or document contents were logged.');
  process.exitCode = 1;
});
