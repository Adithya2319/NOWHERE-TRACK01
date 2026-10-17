import { test, expect } from '@playwright/test';

const recordedInputs = page => page.locator('input[aria-label*=" recorded "]');

async function expectWithinViewport(page, locator) {
  const overflow = await locator.evaluateAll(elements => elements.map(element => {
    const rectangle = element.getBoundingClientRect();
    return {
      label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 60),
      left: rectangle.left,
      right: rectangle.right,
      width: rectangle.width,
    };
  }).filter(rectangle => rectangle.left < -1 || rectangle.right > window.innerWidth + 1 || rectangle.width < 1));
  expect(overflow).toEqual([]);
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth)).toBe(true);
}

test('marks controls and expanded grade planning fit mobile and desktop and save after refresh', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.getByRole('button', { name: /Enter as Taylor Demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Your day plan' })).toBeVisible();
  await page.goto('/marks');
  await page.getByLabel('Assessment rule mode').selectOption('demo');
  await page.getByLabel('Edit recorded values').check();

  const mark = page.getByLabel('26ETBS11 recorded Mid-term', { exact: true });
  await mark.fill('15.5');
  await expect(mark).toHaveValue('15.5');
  const planning = page.locator('section').filter({ has: page.getByRole('heading', { name: 'What-if & grade requirements', exact: true }) });
  const mathematics = planning.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Mathematics-1 / }) });
  await mathematics.locator('summary').click();
  const estimate = mathematics.getByLabel('26ETBS11 what-if internal', { exact: true });
  await estimate.fill('14');
  await expect(estimate).toHaveValue('14');
  await expect(mathematics.getByLabel('26ETBS11 what-if midterm', { exact: true })).toBeDisabled();
  await expect(mathematics.locator('thead').getByText('Required remaining marks', { exact: true })).toBeAttached();
  await expect(recordedInputs(page)).toHaveCount(14);
  const recordedRow = page.getByRole('table', { name: 'Recorded marks by course', exact: true }).locator('tbody tr').filter({ has: mark });

  for (const width of [320, 360, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectWithinViewport(page, page.getByLabel('Assessment rule mode'));
    await expectWithinViewport(page, page.getByLabel('Academic semester'));
    await expectWithinViewport(page, mathematics);
    await expectWithinViewport(page, mathematics.locator('input'));
    await expectWithinViewport(page, recordedInputs(page));
    await expectWithinViewport(page, mathematics.locator('tbody th, tbody td'));
    if (width < 1280) {
      await expect(recordedRow.getByText('Mid-term', { exact: true })).toBeVisible();
      await expect(recordedRow.getByText('Continuous assessment', { exact: true })).toBeVisible();
    }
    if (width < 640) {
      expect(await recordedInputs(page).evaluateAll(elements => elements
        .map(element => ({ label: element.getAttribute('aria-label'), height: element.getBoundingClientRect().height }))
        .filter(element => element.height < 44))).toEqual([]);
    }
    await expect(mark).toHaveValue('15.5');
    await expect(estimate).toHaveValue('14');
  }

  await page.setViewportSize({ width: 320, height: 900 });
  await mark.click();
  await mark.fill('16');
  await expect(mark).toHaveValue('16');
  await mark.fill('15.5');
  await page.getByText('Configure grade bands and pass minima', { exact: true }).click();
  await page.getByRole('button', { name: 'Load policy JSON', exact: true }).click();
  const policyEditor = page.getByLabel('Academic policy JSON');
  const policy = JSON.parse(await policyEditor.inputValue());
  policy.mode = 'official';
  policy.confirmed = true;
  policy.source = `https://example.invalid/regulations/${'unbroken-source-reference'.repeat(20)}`;
  await policyEditor.fill(JSON.stringify(policy, null, 2));
  await page.getByRole('button', { name: 'Apply policy to preview', exact: true }).click();
  await expect(page.getByText(`User-confirmed policy source: ${policy.source}. Confirmation is not institutional verification.`, { exact: true })).toBeVisible();
  await expectWithinViewport(page, policyEditor);
  await expectWithinViewport(page, page.getByRole('button', { name: 'Save recorded marks & target', exact: true }));
  await page.getByRole('button', { name: 'Save recorded marks & target', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Recorded marks, target and policy saved' })).toBeVisible();
  await page.reload();
  await expect(mark).toHaveValue('15.5');
  await expect(mark).toBeDisabled();
  await expectWithinViewport(page, recordedInputs(page));
  const saved = await (await page.request.get('/api/state')).json();
  expect(saved.academics.semesters[1].marks['26ETBS11']).toEqual({ midterm: 15.5 });
  expect(saved.academics.policy.source).toBe(policy.source);
  expect(errors).toEqual([]);
});
