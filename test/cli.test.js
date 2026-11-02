const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseOptions, runningPids } = require('../index');

test('running-process detection resolves executable symlinks', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-pids-'));
    try {
        const link = path.join(root, 'node-link');
        fs.symlinkSync(process.execPath, link);
        assert.ok(runningPids(link).includes(String(process.pid)));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('patch modes are explicit and mutually exclusive', () => {
    assert.equal(parseOptions(['--full']).mode, 'full');
    assert.equal(parseOptions(['--font-only']).mode, 'font-only');
    assert.throws(() => parseOptions(['--patch']), /explicit|full|font-only/i);
    assert.throws(() => parseOptions(['--full', '--font-only']), /one|exclusive/i);
    assert.throws(() => parseOptions(['--restore', '--full']), /one|exclusive/i);
    assert.throws(() => parseOptions(['--unknown']), /unknown/i);
});

test('dry-run and status select a read-only operation and accept normal Linux paths', () => {
    assert.equal(parseOptions(['--dry-run', '/usr/lib/claude-desktop']).action, 'diagnose');
    assert.equal(parseOptions(['--status']).action, 'diagnose');
    assert.equal(parseOptions(['--diagnose', '--path', '/example with spaces/resources']).customPath, '/example with spaces/resources');
});

test('mismatched binary and archive versions are rejected before any backup or mutation', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const crypto = require('node:crypto');
    const { Readable } = require('node:stream');
    const asar = require('@electron/asar');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-cli-'));
    try {
        fs.mkdirSync(path.join(root, 'resources'));
        const archive = path.join(root, 'resources/app.asar');
        const files = { 'package.json': '{"version":"1.0.0"}', '.vite/build/index.js': 'const window = {webPreferences: {preload: ".vite/build/mainView.js"}};', '.vite/build/mainView.js': 'require("electron"); contextBridge;' };
        await asar.createPackageFromStreams(archive, Object.entries(files).map(([name, text]) => ({ path: name, type: 'file', stat: { size: Buffer.byteLength(text), mode: 0o644 }, streamGenerator: () => Readable.from([Buffer.from(text)]) })));
        fs.writeFileSync(path.join(root, 'claude-desktop'), '#!/bin/sh\nprintf 9.0.0\n', { mode: 0o755 });
        const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
        const diagnosis = spawnSync(process.execPath, [path.join(__dirname, '../index.js'), '--diagnose', '--path', root, '--json'], { encoding: 'utf8' });
        assert.equal(diagnosis.status, 0, diagnosis.stderr);
        assert.equal(JSON.parse(diagnosis.stdout).binaryVersion, null);
        const result = spawnSync(process.execPath, [path.join(__dirname, '../index.js'), '--full', '--path', root], { encoding: 'utf8' });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /versions disagree/);
        assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), hash);
        assert.equal(fs.existsSync(`${archive}.rtl-backups`), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI help works without detecting or opening an installation', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../index.js'), '--help'], { encoding: 'utf8', env: { ...process.env, PATH: '' } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /diagnose/);
    assert.match(result.stdout, /restore/);
});
