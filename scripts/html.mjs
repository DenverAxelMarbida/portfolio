/** @param {string} markup @param {string} assets @param {number} status */
export function createDocument(markup, assets, status = 200) {
  const title = status === 404 ? 'Page not found · Denver Axel Marbida' : 'Denver Axel Marbida';
  const template = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="icon" href="data:,">
    ${assets}
  </head>
  <body>
    <div id="root"><!--app-html--></div>
  </body>
</html>`;
  // React has escaped text already; a callback preserves literal $ replacement patterns.
  return template.replace('<!--app-html-->', () => markup);
}
