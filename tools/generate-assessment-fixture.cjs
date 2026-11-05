process.env.TS_NODE_PROJECT = 'apps/api/tsconfig.json';
require('ts-node/register/transpile-only');
const { mkdir, writeFile } = require('node:fs/promises');
const { assessmentDocxFixture } = require('../apps/api/src/shared/testing/assessment-fixtures.ts');

async function generate() {
  const directory = 'apps/api/src/shared/testing/fixtures/assessment';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/injection.docx`, await assessmentDocxFixture());
}

generate().catch(() => {
  process.exitCode = 1;
});
