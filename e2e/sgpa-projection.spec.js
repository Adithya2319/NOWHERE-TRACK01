import { test, expect } from '@playwright/test';
import { COMPONENTS } from '../src/config/vesit.js';

const metric = (page, label) => page.getByText(label, { exact: true }).locator('..');
const savedState = async page => (await page.request.get('/api/state')).json();

async function saveMarks(page) {
  await page.getByRole('button', { name: 'Save recorded marks & target', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Recorded marks, target and policy saved' })).toBeVisible();
}

test('partial marks project transparently, unavailable subjects stay explicit, and saved final results stay pending', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/login');
  await page.getByRole('button', { name: /Enter as Alex Demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Your day plan' })).toBeVisible();
  await page.goto('/marks');

  const original = await savedState(page);
  expect(original.academics.policy.gradeBands).toEqual([]);
  expect(original.academics.semesters[1].marks).toEqual({});
  await page.getByLabel('Edit recorded values').check();
  const internal = page.getByLabel('26ETBS11 recorded Continuous assessment', { exact: true });
  await internal.fill('18');
  await expect(metric(page, 'Recorded SGPA')).toContainText('Pending');
  await expect(metric(page, 'Projected SGPA')).toContainText('Insufficient data');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('10.00');
  await expect(metric(page, 'Projected SGPA')).toContainText('Sample planning rules');
  await expect(page.getByText('Available-subject estimate: 10.00 across 4/18 credits; not a full-semester SGPA.', { exact: true })).toBeVisible();
  const gradingBasis = page.getByLabel('Projection grading basis', { exact: true });
  await gradingBasis.selectOption('configured');
  await expect(metric(page, 'Projected SGPA')).toContainText('Missing grading rules');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('Missing grading rules');
  await gradingBasis.selectOption('sample');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('10.00');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('Sample planning rules');
  await gradingBasis.selectOption('auto');
  await saveMarks(page);
  await page.reload();
  await expect(internal).toHaveValue('18');
  await expect(metric(page, 'Projected SGPA')).toContainText('Insufficient data');
  const partial = await savedState(page);
  expect(partial.academics.semesters[1].marks['26ETBS11']).toEqual({ internal: 18 });
  expect(partial.academics.policy).toEqual(original.academics.policy);

  await page.getByLabel('Edit recorded values').check();
  const expectedMarks = { '26ETBS11': { internal: 18 } };
  for (const course of partial.academics.semesters[1].courses) {
    if (course.code === '26ETBS11') continue;
    const [component, maximum] = Object.entries(course.maxima)[0];
    await page.getByLabel(`${course.code} recorded ${COMPONENTS[component]}`, { exact: true }).fill(String(maximum));
    expectedMarks[course.code] = { [component]: maximum };
  }
  await expect(metric(page, 'Projected SGPA')).toContainText('10.00');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('10.00');
  await expect(metric(page, 'Recorded SGPA')).toContainText('Pending');
  await saveMarks(page);
  await page.reload();
  await expect(metric(page, 'Projected SGPA')).toContainText('10.00');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('10.00');
  await expect(metric(page, 'Recorded SGPA')).toContainText('Pending');
  const saved = await savedState(page);
  expect(saved.academics.semesters[1].marks).toEqual(expectedMarks);
  expect(saved.academics.semesters[1].marks['26ETBS11']).not.toHaveProperty('endSem');
  expect(saved.academics.policy).toEqual(original.academics.policy);
  await page.getByLabel('Edit recorded values').check();
  await internal.fill('17.5');
  await expect(metric(page, 'Projected SGPA')).toContainText('9.78');
  await expect(metric(page, 'Maximum reachable SGPA')).toContainText('10.00');
  await expect(metric(page, 'Recorded SGPA')).toContainText('Pending');
  await internal.fill('18');
  await expect(metric(page, 'Projected SGPA')).toContainText('10.00');
  for (const label of ['Recorded SGPA', 'Projected SGPA', 'Maximum reachable SGPA']) {
    expect(await metric(page, label).evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.width > 0;
    })).toBe(true);
  }
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/browser-mobile-sgpa-projection.png', fullPage: true });
  await metric(page, 'Projected SGPA').locator('..').screenshot({ path: 'tmp/browser-mobile-sgpa-outlook.png' });
  expect(errors).toEqual([]);
});
