import { loadEnvFile } from 'node:process';
import { createBackend } from './app.mjs';
import { createMonitorRegistry } from './monitor.mjs';
import { createLiveCallStore } from './live-calls.mjs';
import { deploymentConfig } from './deployment.mjs';
import { n8nConfig } from './n8n-delivery.mjs';
import { inventoryDbConfig } from './inventory.mjs';
import { realDataConfig } from './real-data.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

try { loadEnvFile('.env'); } catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
    console.error('.env를 읽을 수 없습니다. 파일 형식을 확인하세요.');
    process.exit(1);
  }
}
const key = process.env.RETELL_API_KEY?.trim() ?? '';
const agentId = process.env.RETELL_AGENT_ID?.trim() ?? '';
let deployment;
try {
  deployment = deploymentConfig();
  if (deployment && !existsSync(join(deployment.staticDir, 'index.html'))) throw new Error('먼저 npm run build로 배포 화면을 생성해 주세요.');
} catch (error) {
  console.error(error instanceof Error ? error.message : '배포 설정을 확인해 주세요.');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT는 1~65535 정수여야 합니다.');
  process.exit(1);
}
const liveCalls = createLiveCallStore();
const monitors = createMonitorRegistry({ key, liveCalls });
const server = createBackend({ key, agentId, monitors, liveCalls, deployment, ...n8nConfig(), ...inventoryDbConfig(), ...realDataConfig() });
server.on('error', () => { console.error('백엔드를 실행할 수 없습니다. 포트 사용 여부를 확인하세요.'); monitors.close(); process.exitCode = 1; server.close(); });
server.listen(port, deployment ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(deployment ? `KCM team test: ${deployment.origin}` : `KCM Retell backend: http://127.0.0.1:${port}`);
  if (!key || !agentId) console.log('Retell 설정 누락: 프로젝트 .env에 RETELL_API_KEY와 RETELL_AGENT_ID를 설정하세요.');
});
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.once(signal, () => {
    monitors.close();
    server.close();
    server.closeAllConnections();
  });
}
