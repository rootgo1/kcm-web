import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

/** Deployment-only configuration. Never infer public access from a request header. */
export function deploymentConfig(/** @type {NodeJS.ProcessEnv} */ env = process.env) {
  if (env.NODE_ENV !== 'production' && env.RENDER !== 'true') return null;
  const address = env.KCM_PUBLIC_ORIGIN?.trim() || env.RENDER_EXTERNAL_URL?.trim();
  let origin;
  try {
    const url = new URL(address ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    origin = url.origin;
  } catch { throw new Error('배포용 HTTPS 주소 설정이 필요합니다.'); }
  const username = env.KCM_ACCESS_USER?.trim() ?? '';
  const password = env.KCM_ACCESS_PASSWORD ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username) || password.trim().length < 16 || /[\r\n]/.test(password)) {
    throw new Error('배포용 접근 계정과 16자 이상의 공용 비밀번호가 필요합니다.');
  }
  if (!env.RETELL_API_KEY?.trim() || !env.RETELL_AGENT_ID?.trim()) throw new Error('배포용 Retell 환경변수가 필요합니다.');
  return { origin, username, password, staticDir: resolve('dist') };
}

/** @typedef {NonNullable<ReturnType<typeof deploymentConfig>>} Deployment */
/** @param {Deployment} config */
export function teamAccess(config) {
  const digest = (/** @type {string} */ value) => createHash('sha256').update(value).digest();
  const expected = digest(config.username + ':' + config.password);
  return (/** @type {string | undefined} */ authorization) => {
    if (!authorization?.startsWith('Basic ') || authorization.length > 4096) return false;
    const supplied = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    return timingSafeEqual(expected, digest(supplied));
  };
}

const mime = /** @type {Record<string,string>} */ ({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
});
/** Only the Vite entry and compiled assets are served, never repository files or .env.
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {string} staticDir
 * @returns {Promise<boolean>}
 */
export async function serveBuild(request, response, staticDir) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  let path;
  try { path = decodeURIComponent((request.url ?? '').split('?')[0]); } catch { return false; }
  const file = path === '/' || path === '/index.html' ? 'index.html' : path === '/favicon.svg' ? 'favicon.svg'
    : /^\/assets\/[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').some(part => part === '..' || part === '.') ? path.slice(1) : null;
  if (!file || !mime[extname(file)]) return false;
  try {
    const data = await readFile(resolve(staticDir, file));
    response.writeHead(200, { 'Content-Type': mime[extname(file)], 'Content-Length': data.length });
    response.end(request.method === 'HEAD' ? undefined : data);
    return true;
  } catch {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error_message: 'BUILD_FILE_NOT_FOUND' }));
    return true;
  }
}
