import path from 'path';
import { onShutdown } from '@netlify/server';
import type { Config } from '@netlify/server';
import { createAppServer } from '../../server/appFactory';
import { marketWebSocketServer } from '../../server/marketWebSocketServer';
import { scannerService } from '../../server/scannerService';

export const config: Config = {
  size: 'small',
  scale: {
    min: 0,
    max: 1,
  },
  includedFiles: [
    '../../quant_screener_dashboard.html',
    '../../public/quant_screener_dashboard.html',
  ],
};

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

const { httpServer } = await createAppServer({
  port: Number(process.env.PORT) || 3000,
  listen: true,
  enableViteDev: false,
  assetBaseDirs: [projectRoot, import.meta.dirname],
});

onShutdown(async ({ drained }) => {
  scannerService.stopBackground();
  marketWebSocketServer.closeAll(1012, 'Server restarting');
  await drained;
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
