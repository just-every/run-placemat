import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {deploymentSpec} from './delivery/base/spec.mjs';
const config = JSON.parse(await readFile(new URL('../packaging.json', import.meta.url), 'utf8'));
const spec = await deploymentSpec(process.cwd(), config.artifact.specInputs);
const file = new URL('../management/integration/deployment-spec.json', import.meta.url);
const bytes = `${JSON.stringify(spec, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (await readFile(file, 'utf8') !== bytes) throw Error('Deployment specification is stale; run pnpm delivery:spec after the real build.');
  console.log('Deployment specification matches the real build and source policy.');
} else {
  await mkdir(new URL('.', file), {recursive: true});
  await writeFile(file, bytes);
  console.log(`Wrote deployment specification with ${spec.migrations.length} migrations.`);
}
