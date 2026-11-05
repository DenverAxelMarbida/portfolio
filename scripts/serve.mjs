import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { createDocument } from './html.mjs';

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
    configureServer(server) {
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
