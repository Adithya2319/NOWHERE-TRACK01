import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:4174';
const stateOf = async context => (await context.request.get(`${origin}/api/state`)).json();
const post = (context, path, data) => context.request.post(`${origin}/api${path}`, { headers: { Origin: origin }, data });
const originalRecords = state => ({ me: state.me, academics: state.academics, tasks: state.tasks, rides: state.rides, schedule: state.schedule, notifications: state.notifications });
const statistic = (page, label) => page.getByText(label, { exact: true }).locator('..');

test('DEMO rehearsal loads, edits, submits, books, persists and resets without changing original accounts', async ({ browser }) => {
  test.setTimeout(120000);
  const legacy = await browser.newContext();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  const apiErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) apiErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  try {
    expect((await post(legacy, '/auth/demo', { userId: 'student-a' })).status()).toBe(200);
    const existingBefore = originalRecords(await stateOf(legacy));

    await page.goto('/login');
    await page.getByRole('button', { name: 'Load Demo Data', exact: true }).click();
    await page.getByRole('button', { name: /^Enter as Adithya/ }).click();
    await expect(page.getByRole('heading', { name: 'Your day plan', exact: true })).toBeVisible();
    await expect(statistic(page, 'Projected SGPA')).toContainText('8.78');
    await expect(statistic(page, 'Recorded SGPA')).toContainText('Pending');
    await expect(page.getByRole('heading', { name: 'Assignments & deadlines' })).toBeVisible();
    await expect(page.getByText('Pending: 3', { exact: true })).toBeVisible();
    await expect(page.getByText('Submitted: 3', { exact: true })).toBeVisible();
    await expect(page.getByText('Overdue: 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Graded: 2', { exact: true })).toBeVisible();
    const canonical = await stateOf(context);
    expect(canonical.me.id).toBe('demo-adithya');
    expect(canonical.me.academicDetails).toMatchObject({ college: 'VESIT, Mumbai', branch: 'EXTC', division: 'FE-A', semester: 1, academicYear: '2026-27' });
    expect(canonical.tasks).toHaveLength(10);
    expect(canonical.rides).toHaveLength(8);
    await page.screenshot({ path: 'tmp/demo-mobile-dashboard.png', fullPage: true });

    // Traverse the real mobile navigation and verify every existing section.
    for (const [label, heading] of [['Attendance', 'Attendance'], ['Marks', 'Academic planner'], ['Rides', 'Rides, with room to plan.'], ['Class board', 'Class board'], ['Directory', 'Find your way. Find help.'], ['Schedule', 'Class schedule'], ['Profile', 'Your profile'], ['Today', 'A little room to plan.']]) {
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} should fit the mobile viewport`).toBe(true);
    }

    // Attendance is an individual dated event, reflected in the saved aggregate.
    await page.goto('/attendance');
    const attendance = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Present: Mathematics-1 theory', exact: true }) });
    await attendance.getByRole('button', { name: 'Present: Mathematics-1 theory', exact: true }).click();
    await expect(attendance.getByText('14/21 attended · 66.7%', { exact: true })).toBeVisible();
    await page.reload();
    await expect(attendance.getByText('14/21 attended · 66.7%', { exact: true })).toBeVisible();
    const afterAttendance = await stateOf(context);
    expect(afterAttendance.academics.semesters[1].events).toHaveLength(canonical.academics.semesters[1].events.length + 1);

    // An actual half-mark correction changes the projection immediately.
    await page.goto('/marks');
    await expect(statistic(page, 'Projected SGPA')).toContainText('8.78');
    await page.getByLabel('Edit recorded values', { exact: true }).check();
    const mark = page.getByLabel('26ETBS11 recorded Mid-term', { exact: true });
    await mark.fill('10.5');
    await expect(statistic(page, 'Projected SGPA')).not.toContainText('8.78');
    await expect(statistic(page, 'Recorded SGPA')).toContainText('Pending');
    await page.getByRole('button', { name: 'Save recorded marks & target', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Recorded marks, target and policy saved' })).toBeVisible();
    const changedProjection = await statistic(page, 'Projected SGPA').textContent();
    await page.reload();
    await expect(mark).toHaveValue('10.5');
    await expect(statistic(page, 'Projected SGPA')).toHaveText(changedProjection);
    await expect(page.getByLabel('26ETBS11 recorded End semester', { exact: true })).toHaveValue('');

    // Submit a note honestly: no external file upload or LMS delivery is implied.
    await page.goto('/leaderboard');
    const matrices = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Matrices: engineering applications · DEMO', exact: true }) });
    const note = 'DEMO rehearsal: solved five matrix problems and checked the inverse by multiplication.';
    await matrices.getByLabel('Completion note or safe resource URL', { exact: true }).fill(note);
    await matrices.getByRole('button', { name: 'Submit completion', exact: true }).click();
    await expect(matrices.getByText('Your submission:', { exact: false })).toContainText('pending');
    await matrices.getByText('Submission history', { exact: true }).click();
    await expect(matrices.getByRole('listitem').filter({ hasText: 'submitted' })).toBeVisible();
    await page.reload();
    await expect(matrices.getByText(note, { exact: true }).first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByText('Pending: 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Submitted: 4', { exact: true })).toBeVisible();

    // Example ride booking is instant only inside the marked DEMO workspace.
    await page.goto('/rides?ride=demo-ride-1');
    const ride = page.locator('#ride-demo-ride-1');
    await expect(ride.getByText('3/3 seats available', { exact: false })).toBeVisible();
    await ride.getByRole('button', { name: 'Book DEMO Ride', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Confirm and save|Acknowledge conflicts and continue/ }).click();
    await expect(ride.getByText('2/3 seats available', { exact: false })).toBeVisible();
    await expect(ride.getByText('Confirmed — in your day plan', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'My Rides (2 upcoming bookings)', exact: true }).click();
    await expect(ride).toBeVisible();
    await page.reload();
    await expect(ride.getByText('2/3 seats available', { exact: false })).toBeVisible();
    await expect(ride.getByRole('button', { name: 'Book DEMO Ride', exact: true })).toHaveCount(0);
    await ride.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await expect(ride.getByText('3/3 seats available', { exact: false })).toBeVisible();
    await page.reload();
    await expect(ride.getByText('Previous request: cancelled', { exact: true })).toBeVisible();

    // Read/unread states and the badge come from the same private saved records.
    const notificationsBefore = (await stateOf(context)).notifications;
    const unread = notificationsBefore.filter(item => !item.readAt).length;
    await page.getByLabel(`Notifications (${unread} unread)`, { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark DEMO ride booking confirmed as read', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mark Marks updated as read', exact: true }).click();
    await expect(page.getByLabel(`Notifications (${unread - 1} unread)`, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByLabel(`Notifications (${unread - 1} unread)`, { exact: true }).click();
    await page.getByRole('button', { name: 'Mark Marks updated as unread', exact: true }).click();
    await expect(page.getByLabel(`Notifications (${unread} unread)`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
    await expect(page.getByLabel('Notifications (0 unread)', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Notifications (0 unread)', { exact: true })).toBeVisible();

    // Saved preferences are honest choices; only in-app delivery is implemented.
    await page.goto('/profile');
    await expect(page.getByText('2026-27', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Push update preference', { exact: true })).toBeChecked();
    await page.getByLabel('Email update preference', { exact: true }).check();
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Email update preference', { exact: true })).toBeChecked();
    const edited = await stateOf(context);
    await page.getByRole('button', { name: 'Load Demo Data', exact: true }).click();
    await expect(page.getByText('DEMO data is ready. Your existing records are preserved.', { exact: true })).toBeVisible();
    const reloaded = await stateOf(context);
    expect(originalRecords(reloaded)).toEqual(originalRecords(edited));
    expect(new Set(reloaded.tasks.map(task => task.id)).size).toBe(10);

    // Reset is explicit and scoped to the separate DEMO class/accounts.
    await page.getByRole('button', { name: 'Reset Demo Data', exact: true }).click();
    await expect(page.getByText(/Other local accounts are preserved/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm reset DEMO data', exact: true }).click();
    await expect(page.getByText('DEMO rehearsal restored to its starting examples.', { exact: true })).toBeVisible();
    const reset = await stateOf(context);
    expect(reset.me.id).toBe('demo-adithya');
    expect(reset.me.contactPreferences).toEqual(canonical.me.contactPreferences);
    expect(reset.academics.semesters[1].marks).toEqual(canonical.academics.semesters[1].marks);
    expect(reset.academics.semesters[1].attendance).toEqual(canonical.academics.semesters[1].attendance);
    expect(reset.academics.semesters[1].events).toEqual(canonical.academics.semesters[1].events);
    expect(reset.tasks).toHaveLength(10);
    expect(reset.tasks.find(task => task.id === 'demo-task-1').submissions).toHaveLength(0);
    expect(reset.rides.find(item => item.id === 'demo-ride-1').remainingSeats).toBe(3);
    expect(reset.notifications.filter(item => !item.readAt)).toHaveLength(4);
    expect(originalRecords(await stateOf(legacy))).toEqual(existingBefore);
    await page.reload();
    await expect(page.getByLabel('Email update preference', { exact: true })).not.toBeChecked();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(statistic(page, 'Projected SGPA')).toContainText('8.78');
    await page.screenshot({ path: 'tmp/demo-desktop-dashboard.png', fullPage: true });
    expect(runtimeErrors).toEqual([]);
    expect(apiErrors).toEqual([]);
  } finally {
    await context.close();
    await legacy.close();
  }
});
