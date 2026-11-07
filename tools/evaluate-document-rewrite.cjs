require('reflect-metadata');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const base = process.env.EVALUATION_MODULE_ROOT || path.resolve(__dirname, '../dist/apps/api/src/modules/documents');
const { readDocx } = require(path.join(base, 'validate-docx'));
const { assessmentText } = require(path.join(base, 'detection-rate'));
const { paragraphs } = require(path.join(base, 'revision-validation'));
const { planDocxEdits, validateChunkResult } = require(path.join(base, 'revise-docx'));
const { LocalDetectorProvider, localDetectorSettings } = require(path.join(base, 'local-detector-provider'));
const { DeepSeekProvider, workerSettings, loadEditingSkill } = require(path.join(base, 'deepseek-provider'));
const { createRewriteWorkflow } = require(path.join(base, 'document-workflow'));

async function save(directory, name, value) {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
}

async function compare(original, revised, directory) {
  const detector = new LocalDetectorProvider(localDetectorSettings(process.env));
  const scores = {};
  for (const [label, document] of [
    ['original', original],
    ['revised', revised]
  ]) {
    scores[label] = await detector.detect(assessmentText(document), AbortSignal.timeout(600000));
    console.log(JSON.stringify({ event: 'detection', label, ...scores[label] }));
  }
  const before = paragraphs(original.blocks);
  const after = paragraphs(revised.blocks);
  const pairs = before.map((paragraph, index) => ({
    index,
    kind: paragraph.kind,
    original: paragraph.text,
    revised: after[index]?.text ?? null,
    changed: paragraph.text !== after[index]?.text
  }));
  const prose = pairs.filter((pair) => pair.original.trim().split(/\s+/u).length >= 30);
  const result = {
    scores,
    scoreDelta:
      scores.revised.rate === null || scores.original.rate === null
        ? null
        : (scores.revised.aiScore - scores.original.aiScore) * 100,
    paragraphs: before.length,
    revisedParagraphs: after.length,
    changedParagraphs: pairs.filter((pair) => pair.changed).length,
    proseParagraphsAtLeast30Words: prose.length,
    changedProseParagraphs: prose.filter((pair) => pair.changed).length,
    originalWords: original.wordCount,
    revisedWords: revised.wordCount,
    pairs
  };
  await save(directory, 'comparison.json', result);
  console.log(JSON.stringify({ event: 'comparison', ...result, pairs: undefined, scores: undefined }));
  if (result.scoreDelta === null) process.exitCode = 3;
  else if (result.scoreDelta >= 0) process.exitCode = 2;
}

async function main() {
  const [mode, originalPath, revisedOrDirectory, outputOrStrength] = process.argv.slice(2);
  if (
    !['compare', 'rewrite'].includes(mode) ||
    !originalPath ||
    !revisedOrDirectory ||
    (mode === 'compare' && !outputOrStrength)
  )
    throw new Error('Use compare ORIGINAL REVISED OUTPUT_DIRECTORY or rewrite ORIGINAL OUTPUT_DIRECTORY [STRENGTH].');
  const directory = path.resolve(mode === 'compare' ? outputOrStrength : revisedOrDirectory);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const original = await readDocx(await fs.readFile(originalPath));
  if (mode === 'compare') {
    await compare(original, await readDocx(await fs.readFile(revisedOrDirectory)), directory);
    return;
  }
  const strength = Number(outputOrStrength || 100);
  if (!Number.isInteger(strength) || strength < 1 || strength > 100) throw new Error('Strength must be 1 to 100.');
  const settings = workerSettings(process.env);
  const provider = new DeepSeekProvider(settings);
  const skill = await loadEditingSkill();
  const records = [];
  const total = planDocxEdits(original).length;
  const startedAt = new Date().toISOString();
  const workflow = createRewriteWorkflow(
    {
      edit: async (system, chunk, signal) => {
        if (!records.length) await fs.writeFile(path.join(directory, 'instructions.txt'), system, { mode: 0o600 });
        const start = Date.now();
        const raw = await provider.edit(system, chunk, signal);
        const accepted = validateChunkResult(chunk, raw);
        records.push({ chunk, raw, accepted, durationMs: Date.now() - start });
        await save(directory, 'requests.json', records);
        console.log(
          JSON.stringify({
            event: 'edited',
            completed: records.length,
            total,
            changed: accepted.filter((span, index) => span.text !== chunk.spans[index].text).length,
            kept: accepted.filter((span) => span.kept).map((span) => ({ id: span.id, check: span.kept }))
          })
        );
        return raw;
      }
    },
    skill,
    strength
  );
  const result = await workflow.invoke({ source: original }, { signal: AbortSignal.timeout(900000) });
  await fs.writeFile(path.join(directory, 'revised.docx'), result.revised, { mode: 0o600 });
  await save(directory, 'run.json', {
    startedAt,
    finishedAt: new Date().toISOString(),
    model: settings.model,
    strength,
    skillHash: createHash('sha256').update(skill).digest('hex'),
    notices: result.notices,
    requests: records.length
  });
  await compare(original, await readDocx(result.revised), directory);
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'evaluation-failed', category: error.category || error.check || error.name }));
  process.exitCode = 1;
});
