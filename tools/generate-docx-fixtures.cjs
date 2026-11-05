process.env.TS_NODE_PROJECT = 'apps/api/tsconfig.json';
require('ts-node/register/transpile-only');
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { docxFixtureCases } = require('../apps/api/src/shared/testing/docx-fixture-catalog.ts');

async function generate() {
  const directory = 'apps/api/src/shared/testing/fixtures/docx';
  await mkdir(directory, { recursive: true });
  for (const fixture of docxFixtureCases) {
    await writeFile(join(directory, `${fixture.name}.docx`), await fixture.create());
  }
  console.log(`Wrote ${docxFixtureCases.length} DOCX fixtures to ${directory}`);
}
generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
