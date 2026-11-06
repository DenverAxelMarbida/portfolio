import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { createDocument } from './html.mjs';
import { containedFile } from './content/files.ts';

/** @typedef {import('vite').Connect.IncomingMessage} Request */
/** @typedef {import('node:http').ServerResponse} Response */

/** @param {string} url */
function requestPath(url) {
  const routerPath = url.split('?')[0] ?? '/';
  const pathname = decodeURIComponent(routerPath);
  if (
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    /[\\:]/.test(pathname) ||
    [...pathname].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    pathname.split('/').some((part) => part.startsWith('.'))
  ) {
    throw new URIError('Invalid request path');
  }
  return { pathname, routerPath };
}

/** @param {Response} response @param {number} status @param {string | Buffer} body @param {string} type @param {boolean} head */
function send(response, status, body, type, head) {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(head ? undefined : body);
}

/** @param {Request} request @param {Response} response */
function readRequest(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8', false);
    return null;
  }
  try {
    return requestPath(request.url ?? '/');
  } catch {
    send(response, 400, 'Invalid path', 'text/plain; charset=utf-8', request.method === 'HEAD');
    return null;
  }
}

/** @param {string} pathname */
function isAsset(pathname) {
  const extension = extname(pathname).toLowerCase();
  return pathname.startsWith('/assets/') || (extension !== '' && extension !== '.html');
}

/** @type {Record<string, string>} */
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.apk': 'application/vnd.android.package-archive',
};

/** @param {string} dist @returns {import('vite').Plugin} */
export function staticPreview(dist) {
  return {
    name: 'portfolio-static-preview',
    async configurePreviewServer(server) {
      const outputRoot = await realpath(dist);
      const notFound = await readFile(resolve(outputRoot, '404.html'));
      server.middlewares.use((request, response, next) => {
        const target = readRequest(request, response);
        if (target === null) return;
        const { pathname } = target;
        const head = request.method === 'HEAD';
        const sendNotFound = () => {
          const asset = isAsset(pathname);
          send(
            response,
            404,
            asset ? 'Not found' : notFound,
            asset ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
            head,
          );
        };
        const serve = async () => {
          if (pathname !== target.routerPath) {
            sendNotFound();
            return;
          }
          let file = resolve(outputRoot, `.${pathname}`);
          try {
            const info = await stat(file);
            if (info.isDirectory()) file = resolve(file, 'index.html');
            const actual = await realpath(file);
            if (!actual.startsWith(`${outputRoot}${sep}`)) {
              send(response, 404, 'Not found', 'text/plain; charset=utf-8', head);
              return;
            }
            const publicFilePath = `/${relative(outputRoot, actual).split(sep).join('/')}`;
            const requestedFilePath = info.isDirectory()
              ? `${pathname.endsWith('/') ? pathname : `${pathname}/`}index.html`
              : pathname;
            // Filesystem aliases must not serve HTML for a different browser route.
            if (requestedFilePath !== publicFilePath) {
              sendNotFound();
              return;
            }
            const type = mimeTypes[extname(actual)];
            if (!type) {
              send(response, 404, 'Not found', 'text/plain; charset=utf-8', head);
              return;
            }
            if (
              pathname.endsWith('/index.html') ||
              (info.isDirectory() && !pathname.endsWith('/'))
            ) {
              const canonical = pathname.endsWith('/index.html')
                ? pathname.slice(0, -'index.html'.length)
                : `${pathname}/`;
              const query = (request.url ?? '').includes('?')
                ? (request.url ?? '').slice((request.url ?? '').indexOf('?'))
                : '';
              response.writeHead(308, { Location: `${encodeURI(canonical)}${query}` });
              response.end();
              return;
            }
            send(
              response,
              pathname === '/404.html' ? 404 : 200,
              await readFile(actual),
              type,
              head,
            );
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !('code' in error) ||
              !['ENOENT', 'ENOTDIR'].includes(String(error.code))
            ) {
              throw error;
            }
            sendNotFound();
          }
        };
        void serve().catch(next);
      });
    },
  };
}

/** @returns {import('vite').Plugin} */
export function developmentPages() {
  return {
    name: 'portfolio-development-pages',
    async configureServer(server) {
      const root = await realpath(server.config.root);
      const sourceRoot = await realpath(resolve(root, 'src'));
      const dependencies = await realpath(resolve(root, 'node_modules'));
      const cacheRoot = resolve(root, '.generated/vite');
      const publicManifest = resolve(root, '.generated/public-content.json');
      server.middlewares.use((request, response, next) => {
        const guard = async () => {
          const head = request.method === 'HEAD';
          let pathname;
          try {
            pathname = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
          } catch {
            send(response, 400, 'Invalid path', 'text/plain; charset=utf-8', head);
            return;
          }
          if (pathname === '/@vite/client' || pathname === '/@react-refresh') {
            next();
            return;
          }
          // This app has no virtual-module endpoints; /@id/ can also resolve raw filesystem IDs.
          if (pathname.startsWith('/@id/')) {
            send(response, 404, 'Not found', 'text/plain; charset=utf-8', head);
            return;
          }
          if (pathname.startsWith('/media/')) {
            const target = readRequest(request, response);
            if (!target) return;
            try {
              const file = await containedFile(
                resolve(root, '.generated/media'),
                pathname.slice('/media/'.length),
              );
              const type = mimeTypes[extname(file)];
              if (!type) throw new Error('Unsupported media');
              send(response, 200, await readFile(file), type, head);
            } catch {
              send(response, 404, 'Not found', 'text/plain; charset=utf-8', head);
            }
            return;
          }
          if (isAsset(pathname) || pathname.startsWith('/@fs/')) {
            try {
              const candidate = pathname.startsWith('/@fs/')
                ? pathname.slice('/@fs/'.length)
                : resolve(root, `.${pathname}`);
              const actual = await realpath(candidate);
              if (
                actual === publicManifest ||
                actual.startsWith(`${sourceRoot}${sep}`) ||
                actual.startsWith(`${dependencies}${sep}`) ||
                actual.startsWith(`${cacheRoot}${sep}`)
              ) {
                next();
                return;
              }
            } catch {
              /* Unresolved file requests remain unavailable. */
            }
            send(response, 404, 'Not found', 'text/plain; charset=utf-8', head);
            return;
          }
          next();
        };
        void guard().catch(next);
      });
      return () => {
        server.middlewares.use((request, response, next) => {
          const target = readRequest(request, response);
          if (target === null) return;
          const { pathname, routerPath } = target;
          const render = async () => {
            const head = request.method === 'HEAD';
            if (isAsset(pathname)) {
              send(response, 404, 'Not found', 'text/plain; charset=utf-8', head);
              return;
            }
            const entry = /** @type {typeof import('../src/entry-server')} */ (
              await server.ssrLoadModule('/src/entry-server.tsx')
            );
            const page = entry.renderPage(routerPath);
            const html = await server.transformIndexHtml(
              routerPath,
              createDocument(
                page.html,
                '<script type="module" src="/src/entry-client.tsx"></script>',
                page.status,
              ),
            );
            send(response, page.status, html, 'text/html; charset=utf-8', head);
          };
          void render().catch(next);
        });
      };
    },
  };
}
