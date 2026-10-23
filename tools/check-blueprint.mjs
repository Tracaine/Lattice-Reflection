#!/usr/bin/env node
// Read-only draft package checker. No dependencies, network access, or application execution.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const read = path => readFileSync(resolve(root, path), 'utf8');
const bp = JSON.parse(read('blueprint.json'));
const groups = bp.registries;
const items = [...bp.artifacts, ...Object.values(groups).flat()];
const index = new Map();
const validId = /^(ART|REQ|INV|DEC|ASM|QST|RSK|CMP|INT|DAT|FLW|VER|WRK)-\d{3,}$/;
for (const item of items) {
  assert(validId.test(item.id), `Invalid ID ${item.id}`);
  assert(!index.has(item.id), `Duplicate ID ${item.id}`);
  assert(typeof item.summary === 'string' && item.summary.trim(), `Missing summary ${item.id}`);
  assert(Boolean(item.source || item.rationale), `Missing claim source ${item.id}`);
  index.set(item.id, item);
}
const within = path => { const r = relative(root, resolve(root, path)); return r !== '..' && !r.startsWith('..' + sep) && !r.startsWith(sep); };
for (const a of bp.artifacts) {
  assert(within(a.path), `Artifact escapes package: ${a.path}`);
  assert(existsSync(resolve(root, a.path)), `Missing artifact: ${a.path}`);
}
const refs = new Set(['depends_on', 'requirements', 'owned_by', 'verified_by', 'implemented_by', 'affects', 'supersedes', 'replaced_by', 'blocked_by', 'components', 'interfaces', 'target', 'from', 'to', 'active_work_item', 'decisions', 'prerequisites']);
function visitRefs(value, key = '') {
  if (typeof value === 'string' && refs.has(key)) assert(!validId.test(value) || index.has(value), `Unknown reference ${value}`);
  else if (Array.isArray(value)) value.forEach(v => visitRefs(v, key));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visitRefs(v, k);
}
visitRefs(bp);
for (const req of groups.requirements) {
  assert(req.owned_by?.length === 1, `${req.id} requires one accountable owner`);
  assert(req.verified_by?.length > 0 && req.implemented_by?.length > 0 && req.acceptance, `${req.id} lacks traceability`);
  for (const v of req.verified_by || []) assert(index.get(v)?.target?.includes(req.id), `${req.id}/${v} verification link mismatch`);
  for (const w of req.implemented_by || []) assert(index.get(w)?.requirements?.includes(req.id), `${req.id}/${w} implementation link mismatch`);
}
for (const inv of groups.invariants) assert(inv.enforcement && inv.verified_by?.length, `${inv.id} lacks enforcement/proof`);
for (const int of groups.interfaces) assert(int.from?.length && int.to?.length && int.failure_semantics && existsSync(resolve(root, int.contract)), `${int.id} lacks a complete interface`);
for (const d of groups.data_entities) assert(index.has(d.owner) && d.lifecycle && d.persistence && d.sensitivity && d.migration, `${d.id} lacks state ownership/lifecycle`);
const visiting = new Set(), visited = new Set(), order = [];
function visitWork(id) {
  if (visiting.has(id)) { errors.push(`Work dependency cycle at ${id}`); return; }
  if (visited.has(id)) return;
  const w = index.get(id);
  assert(Boolean(w), `Missing work item ${id}`);
  if (!w) return;
  visiting.add(id);
  for (const dep of w.depends_on || []) if (dep.startsWith('WRK-')) visitWork(dep);
  visiting.delete(id); visited.add(id); order.push(id);
}
for (const w of groups.work_items) {
  visitWork(w.id);
  assert(w.affected_paths?.length && w.acceptance_checks?.length && w.commands?.length, `${w.id} lacks bounded work/checks`);
  if (['completed', 'verified'].includes(w.status)) assert(w.evidence_paths?.length, `${w.id} claims completion without evidence`);
}

// Local document links and registered claim references. Supporting research reports are optional on handoff.
let checkedLinks = 0;
for (const a of bp.artifacts) {
  if (!existsSync(resolve(root, a.path)) || !/\.(md|ts|mjs)$/.test(a.path)) continue;
  const text = read(a.path);
  if (a.path.endsWith('.md')) {
    assert(!/\[REPLACE|\{\{[A-Z_]+\}\}/.test(text), `Template placeholder in ${a.path}`);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      let dest = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!dest || /^[a-z]+:\/\//i.test(dest)) continue;
      const full = resolve(dirname(resolve(root, a.path)), decodeURIComponent(dest));
      checkedLinks++;
      if (!existsSync(full)) {
        if (!within(relative(root, full))) warnings.push(`Optional supporting report not present: ${dest}`);
        else errors.push(`Broken document link ${a.path} -> ${dest}`);
      }
    }
    for (const m of text.matchAll(/\b(?:ART|REQ|INV|DEC|ASM|QST|RSK|CMP|INT|DAT|FLW|VER|WRK)-\d{3,}\b/g)) assert(index.has(m[0]), `Unknown ID in ${a.path}: ${m[0]}`);
  }
}

// Declaration linkage only; this is deliberately not called a TypeScript compiler/typecheck.
const declarations = readdirSync(resolve(root, 'contracts')).filter(x => x.endsWith('.ts'));
let importLinks = 0;
for (const file of declarations) {
  const text = read('contracts/' + file);
  assert(!/^import\s+(?!type)/m.test(text), `Runtime import in declaration contract ${file}`);
  for (const m of text.matchAll(/import\s+type\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    const path = resolve(root, 'contracts', m[2] + '.ts');
    assert(existsSync(path), `Missing contract import ${file} -> ${m[2]}`);
    if (!existsSync(path)) continue;
    const exports = new Set([...readFileSync(path, 'utf8').matchAll(/export\s+(?:type|interface)\s+(\w+)/g)].map(x => x[1]));
    for (const name of m[1].split(',').map(x => x.trim()).filter(Boolean)) { importLinks++; assert(exports.has(name), `Missing type ${name} imported by ${file}`); }
  }
}
assert(!read('contracts/companion.ts').includes('from "./inference"'), 'Companion contract imports private inference');

const seed = JSON.parse(read('examples/mock-configuration.json'));
assert(seed.schemaVersion === 1, 'Wrong seed schema version');
assert(seed.connections.filter(c => c.enabled).every(c => c.kind === 'mock'), 'Seed enables a real provider');
const connections = new Map(seed.connections.map(x => [x.id, x]));
const profiles = new Map(seed.modelProfiles.map(x => [x.id, x]));
for (const p of seed.modelProfiles) assert(connections.has(p.connectionId), `Unknown seed connection ${p.connectionId}`);
for (const route of seed.routeBindings) {
  if (route.binding.mode === 'model') {
    const p = profiles.get(route.binding.profileId);
    assert(p && route.binding.maxOutputTokens > 0 && route.binding.maxOutputTokens <= p.capabilities.outputTokenLimit, `Invalid seed model binding ${route.id}`);
  }
  assert(route.role !== 'dialogue' || route.binding.mode === 'model', 'Seed dialogue not model-backed');
}
function findSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert(!/^(apiKey|accessToken|password|authorization|secretValue)$/i.test(k), `Credential value key in example: ${k}`);
    findSecrets(v);
  }
}
findSecrets(seed);
const trace = JSON.parse(read('examples/interruption.trace.json'));
const contract = read('contracts/companion.ts');
const messages = new Map();
const commands = new Map();
const acknowledged = new Set();
const eventIds = new Set();
let seq = 0, epoch = 0;
for (const frame of trace.frames) {
  const m = frame.message;
  assert(m.protocol === 'companion' && m.version === 1, 'Example protocol/version mismatch');
  assert(contract.includes('"' + m.kind + '"'), `Unknown example kind ${m.kind}`);
  if (frame.direction === 'client_to_broker') {
    assert(!commands.has(m.commandId), `Duplicate command ID in illustrative trace: ${m.commandId}`);
    commands.set(m.commandId, m);
  }
  if (frame.direction === 'broker_to_client') {
    assert(m.eventSeq === ++seq, `Example event sequence gap at ${m.kind}`);
    assert(!eventIds.has(m.eventId), `Duplicate event ID in illustrative trace: ${m.eventId}`); eventIds.add(m.eventId);
    assert(m.epoch >= epoch, 'Example epoch went backward'); epoch = m.epoch;
    if (m.kind === 'command.result') {
      const command = commands.get(m.body.commandId);
      assert(command && !acknowledged.has(m.body.commandId), 'Example command receipt is missing its command or duplicated');
      acknowledged.add(m.body.commandId);
      if (command?.kind === 'turn.interrupt' && m.body.effect === 'scheduled') assert(m.epoch > command.scope.expectedEpoch, 'Example scheduled interruption did not change epoch');
    }
    if (m.kind === 'turn.started') messages.set(m.body.assistantMessageId, { text: '', revision: 0 });
    if (m.kind === 'message.delta') {
      const previous = messages.get(m.body.messageId);
      assert(previous && previous.revision === m.body.fromRevision && previous.text.length === m.body.offsetUtf16, 'Example transcript delta mismatch');
      if (previous) messages.set(m.body.messageId, { text: previous.text + m.body.textDelta, revision: m.body.toRevision });
    }
    if (m.kind === 'message.final') assert(messages.get(m.body.messageId)?.text === m.body.text, 'Example final text differs from committed deltas');
  }
}
for (const commandId of commands.keys()) assert(acknowledged.has(commandId), `Unacknowledged command in illustrative trace: ${commandId}`);
if (process.argv.includes('--approval')) {
  for (const d of groups.decisions) assert(['accepted', 'active'].includes(d.status) && d.approval_evidence, `Unaccepted architecture decision ${d.id}`);
  for (const a of groups.assumptions) if (a.architecture_shaping) assert(['accepted', 'validated', 'verified'].includes(a.status), `Unvalidated architecture assumption ${a.id}`);
  for (const q of groups.questions) if (q.blocking) assert(['resolved', 'accepted', 'verified', 'deferred'].includes(q.status), `Blocking question ${q.id}`);
}
const output = {
  mode: process.argv.includes('--approval') ? 'approval-gate' : 'draft-structure',
  artifacts: bp.artifacts.length, registryItems: items.length,
  requirements: groups.requirements.length, workPackages: groups.work_items.length,
  checkedLinks, declarationFiles: declarations.length, declarationImportLinks: importLinks,
  declarationCheckScope: 'Imports and exported names only; not TypeScript compilation',
  exampleControlFrames: trace.frames.length, workOrder: order,
  errors, warnings
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = errors.length ? 1 : 0;
