import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const line = (at: string, job: string, status: string) => JSON.stringify({ at, job, status, owner: 'rook' });

// Log order is zeta, alpha, mid, so insertion order differs from job order (alpha, mid, zeta).
const threeJobs = [
  line('2026-10-30T01:00:00+01:00', 'zeta/job', 'ok'),
  line('2026-10-30T02:00:00+01:00', 'alpha/job', 'ok'),
  line('2026-10-30T03:00:00+01:00', 'mid/job', 'fail'),
].join('\n');

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-10-30.jsonl'), threeJobs + '\n');
  writeFileSync(join(dir, '2026-10-31.jsonl'), '');
  writeFileSync(join(dir, '2026-11-01.jsonl'), line('2026-11-01T01:00:00+01:00', 'only/job', 'ok') + '\n{"at": truncated\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const pageJobs = (html: string) => [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);

describe('GET /digest/:night', () => {
  it('200 for a night on file', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('digest · 2026-10-30');
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-12-31')).status).toBe(404);
  });

  it('says nothing ran on the empty night', async () => {
    const res = await app.request('/digest/2026-10-31');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('still renders a night with a bad line', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['only/job']);
    expect(html).toContain('1 unreadable lines skipped');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a night on file', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; counts: unknown; badLines: number };
    expect(body.night).toBe('2026-10-30');
    expect(body.counts).toEqual({ ok: 2, retry: 0, fail: 1 });
    expect(body.badLines).toBe(0);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-12-31');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('has no rows on the empty night', async () => {
    const res = await app.request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: '2026-10-31',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('reports badLines 1 and keeps the good row', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['only/job']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in job order, not log order', async () => {
    const html = await (await app.request('/digest/2026-10-30')).text();
    const body = (await (await app.request('/api/digest/2026-10-30')).json()) as { rows: { job: string }[] };
    const expected = ['alpha/job', 'mid/job', 'zeta/job'];
    expect(body.rows.map((r) => r.job)).toEqual(expected);
    expect(pageJobs(html)).toEqual(expected);
  });
});
