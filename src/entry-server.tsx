import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppRoutes } from './app/AppRoutes';
import { getStaticPaths } from './app/staticPaths';

export { getStaticPaths };

export function renderPage(pathname: string) {
  return {
    html: renderToString(
      <StaticRouter location={pathname}>
        <AppRoutes />
      </StaticRouter>,
    ),
    status: getStaticPaths().includes(pathname) ? 200 : 404,
  };
}
