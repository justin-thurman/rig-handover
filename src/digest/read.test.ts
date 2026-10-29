import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from './read.js';

const RUNS = join(import.meta.dirname, '../../runs');

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight(RUNS, '2026-10-28')!;

  it('reads five jobs, sorted by job, and counts the one bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  // Counted by hand from the file: 15 lines parse; the truncated last line is the bad one.
  it('counts parsed lines by status across all jobs', () => {
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('aggregates every job', () => {
    expect(night.rows).toEqual([
      {
        job: 'digest/render',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00',
        lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh',
        owner: 'rook',
        runs: 4,
        retries: 3,
        lastStatus: 'ok',
        lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00',
        lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync',
        owner: 'rook',
        runs: 8,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00',
        lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00',
        lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00',
        lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });
});

describe('readNight edge cases', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  function runsWith(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  }

  it('returns null for a night with no file', () => {
    expect(readNight(runsWith({}), '2026-10-30')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD, even if such a file exists', () => {
    const runs = runsWith({ 'latest.jsonl': '' });
    expect(readNight(runs, 'latest')).toBeNull();
    expect(readNight(runs, '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    expect(readNight(runsWith({ '2026-10-30.jsonl': '' }), '2026-10-30')).toEqual({
      night: '2026-10-30',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts lines that are JSON but not a run line, and skips blank lines', () => {
    const ok = { at: '2026-10-30T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
    const lines = [
      JSON.stringify(ok),
      '',
      JSON.stringify({ ...ok, status: 'skipped' }),
      JSON.stringify({ ...ok, owner: undefined }),
      JSON.stringify({ ...ok, at: 'yesterday' }),
      JSON.stringify({ ...ok, error: 42 }),
      '[]',
      'null',
    ];
    const night = readNight(runsWith({ '2026-10-30.jsonl': lines.join('\n') + '\n' }), '2026-10-30')!;
    expect(night.badLines).toBe(6);
    expect(night.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(night.rows.map((r) => r.job)).toEqual(['a']);
  });

  it('takes the owner from the last line and keeps the latest error after a later ok', () => {
    const lines = [
      { at: '2026-10-30T01:00:00+01:00', job: 'a', status: 'fail', owner: 'rook', error: 'first' },
      { at: '2026-10-30T02:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'second' },
      { at: '2026-10-30T03:00:00+01:00', job: 'a', status: 'ok', owner: null },
    ];
    const text = lines.map((l) => JSON.stringify(l)).join('\n');
    const [row] = readNight(runsWith({ '2026-10-30.jsonl': text }), '2026-10-30')!.rows;
    expect(row).toMatchObject({ owner: null, lastStatus: 'ok', lastError: 'second', runs: 3, retries: 1 });
  });
});
