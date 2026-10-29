import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.retries >= 3) out.push(`${row.retries} retries`);
  if (row.lastStatus === 'fail') out.push('fail');
  return out;
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th><th>last</th>
              <th>last error</th><th>first</th><th>last at</th><th>flags</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => {
              const flagged = marks(row);
              return (
                <tr class={flagged.length > 0 ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? dash}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? dash}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td>{flagged.length > 0 ? flagged.join(', ') : dash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {night.badLines > 0 && <p class="mute">{night.badLines} unreadable lines skipped</p>}
    </>
  );
}
