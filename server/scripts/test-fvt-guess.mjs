import { io } from 'socket.io-client';

const fundCode = process.argv[2] || 'PHE';
const deviceId = `fundtrack_${Date.now()}`;

const socket = io('https://fws.fvt.com.tr', {
  path: '/ws/guess/socket.io',
  transports: ['polling', 'websocket'],
  query: { deviceId },
  timeout: 10000,
});

const timeout = setTimeout(() => {
  console.log('TIMEOUT - no data_update for', fundCode);
  socket.close();
  process.exit(1);
}, 15000);

socket.on('connect', () => {
  console.log('connected', socket.id);
});

socket.on('data_update', (payload) => {
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (!row?.symbol) continue;
    const code = String(row.symbol).toUpperCase();
    console.log('update', code, row.getiri);
    if (code === fundCode) {
      console.log('MATCH', JSON.stringify(row));
      clearTimeout(timeout);
      socket.close();
      process.exit(0);
    }
  }
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err.message);
});
