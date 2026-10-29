// Plan morning-digest § 1. The contract the reader, the page, the JSON and the board link share.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One job's night. Times are the log's own strings, offset kept: never converted to UTC.
export type DigestRow = {
  job: string;
  // Owner on the job's last line. null renders as `—`; the row is never dropped.
  owner: string | null;
  // Every line for the job, retries included.
  runs: number;
  // Lines with status `retry`.
  retries: number;
  lastStatus: RunStatus;
  // The most recent `error` the job logged that night, even if a later line was ok.
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job, so the page and the JSON agree on order (ADR 0001).
  rows: DigestRow[];
  // Lines that didn't parse as a RunLine. Counted, never thrown.
  badLines: number;
};

// null when `night` is not YYYY-MM-DD or runs/<night>.jsonl doesn't exist (the routes 404).
// An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
