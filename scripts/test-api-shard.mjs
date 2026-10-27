import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const [shard, mode] = process.argv.slice(2);
if (!['1', '2'].includes(shard) || (mode && mode !== '--list') || process.argv.length > 4) {
 throw Error('Usage: test-api-shard.mjs 1|2 [--list]');
}
const files = (await readdir('./tests/api')).filter(name => name.endsWith('.test.mjs')).sort();
// The flow file includes the real idle-lease wait and the payment journeys.
// Give it one job; the remaining files together take a comparable measured time.
const selected = files.filter(name => (name === 'flows.test.mjs' ? 1 : 2) === Number(shard)).map(name => `./tests/api/${name}`);
if (!selected.length) throw Error('Empty API shard');
if (mode === '--list') console.log(JSON.stringify(selected));
else {
 const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...selected], {stdio: 'inherit'});
 if (result.error) throw result.error;
 process.exit(result.status ?? 1);
}
