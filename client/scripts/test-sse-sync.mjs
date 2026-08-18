/** Smoke-test daily sync SSE — exits after first progress or 20s timeout. */
import http from 'node:http';

const url = 'http://localhost:3001/api/sync/recent?range=daily';

const req = http.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error('FAIL status', res.statusCode);
    process.exit(1);
  }

  let buf = '';
  const timer = setTimeout(() => {
    console.log('TIMEOUT waiting for progress (stream open OK)');
    req.destroy();
    process.exit(0);
  }, 20000);

  res.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: progress')) continue;
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          console.log('OK progress event:', {
            kind: data.kind,
            current: data.current,
            total: data.total,
            pct: data.total > 0 ? Math.round((data.current / data.total) * 100) : 0,
          });
          clearTimeout(timer);
          req.destroy();
          process.exit(0);
        } catch {
          /* partial */
        }
      }
    }
  });
});

req.on('error', (e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
