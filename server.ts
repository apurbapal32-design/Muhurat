import 'dotenv/config';
import { createAppServer } from './server/appFactory';

// Parse port from CLI args (--port <number>) or process.env.PORT
let PORT = 3000;
const portArgIndex = process.argv.indexOf('--port');
if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
  PORT = parseInt(process.argv[portArgIndex + 1], 10) || 3000;
} else if (process.env.PORT) {
  PORT = parseInt(process.env.PORT, 10) || 3000;
}

createAppServer({ port: PORT, listen: true }).catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
