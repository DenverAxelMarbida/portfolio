import { expect, test, type Page } from '@playwright/test';

const email = 'denver0504.marbida@gmail.com';
const github = 'https://github.com/DenverAxelMarbida';

async function expectNoHorizontalOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width);
}

test('skip link reaches the main landmark with visible keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await expect(skip).toHaveCSS('outline-style', 'solid');
  await expect(skip).toHaveCSS('outline-width', '2px');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page).toHaveURL(/\/#main$/);
});

test('header and footer expose real destinations and verified contacts', async ({ page }) => {
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  await expect(primary.getByRole('link', { name: 'Projects' })).toHaveAttribute(
    'href',
    '/#projects',
  );
  await expect(primary.getByRole('link', { name: 'Approach' })).toHaveAttribute(
    'href',
    '/#approach',
  );
  await expect(primary.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/#contact');
  await expect(primary.getByRole('link', { name: 'Denver.dev home' })).toHaveAttribute('href', '/');

  const contact = page.locator('#contact');
  await expect(contact.getByRole('heading', { name: 'Contact' })).toBeVisible();
  await expect(contact.getByRole('link', { name: email })).toHaveAttribute(
    'href',
    `mailto:${email}`,
  );
  await expect(contact.getByRole('link', { name: 'GitHub profile' })).toHaveAttribute(
    'href',
    github,
  );
});

test('keyboard navigation follows the visual order with visible focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Denver.dev home' })).toBeFocused();
  await page.keyboard.press('Tab');
  const projects = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
    name: 'Projects',
  });
  await expect(projects).toBeFocused();
  await expect(projects).toHaveCSS('outline-style', 'solid');
  await expect(projects).toHaveCSS('outline-width', '2px');
});

test('mobile menu is a hydrated disclosure with Escape and selection closure', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Navigation menu' });
  const list = page.locator('#primary-navigation');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'primary-navigation');
  await expect(list).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(list).toBeVisible();
  await expect(list.getByRole('link', { name: 'Projects' })).toHaveCSS('min-height', '44px');

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(list).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await list.getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/#projects$/);
  await expect(list).toBeHidden();
  await expect(page.locator('#projects')).toBeFocused();
});

test('closed enhanced mobile navigation leaves no links in the tab order', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const list = page.locator('#primary-navigation');
  await expect(list).toBeHidden();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('#primary-navigation'))),
    ).toBe(false);
  }
});

test('mobile navigation remains native and readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.getByRole('button', { name: 'Navigation menu' })).toHaveCount(0);
    const primary = page.getByRole('navigation', { name: 'Primary' });
    await expect(primary.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect(primary.getByRole('link', { name: 'Approach' })).toBeVisible();
    await expect(primary.getByRole('link', { name: 'Contact' })).toBeVisible();
    await primary.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/#projects$/);
    await expect(page.getByRole('heading', { name: 'Project previews' })).toBeVisible();
    await expect(page.locator('#contact').getByRole('link', { name: email })).toBeVisible();
    await expect(
      page.locator('#contact').getByRole('link', { name: 'GitHub profile' }),
    ).toHaveAttribute('href', github);
  } finally {
    await context.close();
  }
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`layout at ${width}px has no overflow and a usable navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page, width);
    const toggle = page.getByRole('button', { name: 'Navigation menu' });
    if (width < 768) {
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveCSS('min-height', '44px');
      await expect(page.locator('#primary-navigation')).toBeHidden();
    } else {
      await expect(toggle).toHaveCount(0);
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Contact' }),
      ).toBeVisible();
    }
    await expect(page.locator('#contact')).toBeVisible();
    for (const id of ['projects', 'approach', 'contact']) {
      expect(await page.locator(`#${id}`).count()).toBe(1);
    }
  });
}

for (const width of [640, 320]) {
  test(`reflow equivalent at ${width}px has no content overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 512 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page, width);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#contact')).toBeVisible();
  });
}

test('header navigation works from a project detail page', async ({ page }) => {
  await page.goto('/projects/saklolo161/');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Projects' })
    .click();
  await expect(page).toHaveURL(/\/#projects$/);
  await expect(page.getByRole('heading', { name: 'Project previews' })).toBeVisible();
});

test('not-found page keeps the shared navigation and a real home destination', async ({ page }) => {
  await page.goto('/missing/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Building Problem-Solving Software with AI.',
  );
});
