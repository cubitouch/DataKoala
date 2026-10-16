import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverAuditBatches, loadAuditBatch, executeAuditBatch, verifyBatchEvidence } from './audit-batch-loader.mjs'
import { runAuditBatches } from './run-audit-batches.mjs'

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'audit batches '))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}
const validModule = 'export function installAuditIpc(){}; export async function runVisualAudit(){}; export const screenshots=[]'

test('discovery is deterministic and ignores helpers, tests, directories and symlinks', async t => {
  const dir = await fixture(t)
  for (const name of ['cap-20.mjs', 'cap-19.mjs', 'non-02.mjs', 'helper.mjs', 'cap-18.test.mjs']) await writeFile(join(dir, name), validModule)
  await mkdir(join(dir, 'cap-21.mjs'))
  await symlink(join(dir, 'cap-19.mjs'), join(dir, 'cap-22.mjs'))
  assert.deepEqual((await discoverAuditBatches(dir)).map(x => x.id), ['cap-19', 'cap-20', 'non-02'])
})
test('missing directory is an empty registry, unrelated IO errors propagate', async t => {
  const dir = await fixture(t)
  assert.deepEqual(await discoverAuditBatches(join(dir, 'missing')), [])
  const file = join(dir, 'file'); await writeFile(file, '')
  await assert.rejects(discoverAuditBatches(file), { code: 'ENOTDIR' })
})
test('loader imports a discovered module from a directory with spaces', async t => {
  const dir = await fixture(t); await writeFile(join(dir, 'cap-19.mjs'), validModule)
  const loaded = await loadAuditBatch('cap-19', { directory: dir })
  assert.equal(loaded.id, 'cap-19'); assert.deepEqual(loaded.module.screenshots, [])
})
test('unknown and traversal IDs never reach dynamic import', async t => {
  const dir = await fixture(t); let imports = 0
  for (const id of ['../cap-19', '/tmp/cap-19.mjs', 'file:///tmp/x', 'cap-99']) {
    await assert.rejects(loadAuditBatch(id, { directory: dir, importer: () => { imports++ } }), /Unknown audit batch/)
  }
  assert.equal(imports, 0)
})
test('load error retains batch identity and original cause', async t => {
  const dir = await fixture(t); await writeFile(join(dir, 'cap-19.mjs'), '')
  const cause = Error('syntax failure')
  await assert.rejects(loadAuditBatch('cap-19', { directory: dir, importer: () => { throw cause } }), error => error.message.includes('cap-19') && error.cause === cause)
})
test('missing exports and unsafe/duplicate manifests fail closed', async t => {
  const dir = await fixture(t); await writeFile(join(dir, 'cap-19.mjs'), '')
  const base = { installAuditIpc() {}, runVisualAudit() {}, screenshots: [] }
  for (const module of [{ ...base, installAuditIpc: null }, { ...base, runVisualAudit: null }, { ...base, screenshots: ['../x.png'] }, { ...base, screenshots: ['x.png', 'x.png'] }, { ...base, screenshots: undefined }]) {
    await assert.rejects(loadAuditBatch('cap-19', { directory: dir, importer: () => module }))
  }
})
async function evidence(dir, patch = {}) {
  const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(1440,16); png.writeUInt32BE(900,20)
  await writeFile(join(dir, 'state.png'), png)
  await writeFile(join(dir, 'measurements.json'), JSON.stringify({ sourceHead: 'abc', observations: [{ filename:'state.png', dpr:1, zoom:1, target:{width:10,height:10} }], ...patch }))
}
test('evidence verifies exact manifest, PNG dimensions, provenance and semantic observation', async t => {
  const dir = await fixture(t); await evidence(dir)
  await verifyBatchEvidence(dir, ['state.png'], 'abc')
  await assert.rejects(verifyBatchEvidence(dir, [], 'abc'), /manifest/)
  await assert.rejects(verifyBatchEvidence(dir, ['state.png'], 'wrong'), /sourceHead/)
  await evidence(dir, { observations:[] }); await assert.rejects(verifyBatchEvidence(dir, ['state.png'], 'abc'), /observation/)
  await evidence(dir); await writeFile(join(dir, 'state.png'), 'not a PNG')
  await assert.rejects(verifyBatchEvidence(dir, ['state.png'], 'abc'), /1440x900/)
})
test('failed module preserves partial evidence and writes failure status, never success', async t => {
  const dir = await fixture(t); await writeFile(join(dir, 'partial.png'), 'stale'); await writeFile(join(dir, 'notes.txt'), 'unrelated')
  const batch = { id:'cap-19', module:{ screenshots:['partial.png'], async runVisualAudit() { await writeFile(join(dir,'partial.png'),'partial'); throw Error('scenario failed') } } }
  await assert.rejects(executeAuditBatch(batch, {outputDir:dir}, 'abc'), /scenario failed/)
  assert.equal((await readFile(join(dir, 'partial.png'))).toString(), 'partial')
  assert.equal(JSON.parse(await readFile(join(dir,'status.json'))).status, 'failure')
  assert.equal((await readFile(join(dir,'notes.txt'))).toString(), 'unrelated')
})
test('a module returning without its measurements is a failure', async t => {
  const dir = await fixture(t)
  await assert.rejects(executeAuditBatch({ id:'cap-19', module:{ screenshots:[], async runVisualAudit() {} } }, {outputDir:dir}, 'abc'))
  assert.equal(JSON.parse(await readFile(join(dir,'status.json'))).status, 'failure')
})
test('orchestration uses separate outputs, continues after failures and returns a failing result', async t => {
  const dir = await fixture(t), outputDir = join(dir,'output'), calls = []
  for (const name of ['cap-19.mjs','non-02.mjs']) await writeFile(join(dir,name), '')
  const success = await runAuditBatches({directory:dir,outputDir,sourceHead:'abc',execute:async(id,out)=>{calls.push([id,out]); if(id==='cap-19')throw Error('child failed');return {status:0}}})
  assert.equal(success,false); assert.deepEqual(calls.map(c=>c[0]),['cap-19','non-02'])
  assert.notEqual(calls[0][1],calls[1][1])
  assert.deepEqual(JSON.parse(await readFile(join(outputDir,'index.json'))).batches.map(x=>x.status),['failure','success'])
})
test('successful and empty registries return success with an explicit index', async t => {
  const dir = await fixture(t), outputDir = join(dir,'output')
  assert.equal(await runAuditBatches({directory:dir,outputDir,sourceHead:'abc',execute:()=>assert.fail()}),true)
  assert.deepEqual(JSON.parse(await readFile(join(outputDir,'index.json'))).batches,[])
})

test('narrow captures must match their declared natural viewport dimensions', async t => {
  const dir = await fixture(t)
  await evidence(dir, { observations:[{filename:'state.png',width:900,height:900,dpr:1,zoom:1,target:{width:652,height:200}}] })
  const png = await readFile(join(dir,'state.png')); png.writeUInt32BE(900,16)
  await writeFile(join(dir,'state.png'),png)
  await verifyBatchEvidence(dir,['state.png'],'abc')
  png.writeUInt32BE(899,16); await writeFile(join(dir,'state.png'),png)
  await assert.rejects(verifyBatchEvidence(dir,['state.png'],'abc'))
})
