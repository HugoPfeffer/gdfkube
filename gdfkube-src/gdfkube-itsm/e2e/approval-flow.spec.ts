// End-to-end happy path: operator submits an OpenShift Cluster Request,
// admin approves it via the role switcher, the request lands in
// All requests with status `provisioning`.
//
// Selectors are intentionally text/role-based; CSS class names are
// implementation details and would couple the test to styling churn.

import { test, expect } from '@playwright/test';

test('operator submits cluster request, admin approves, request shows provisioning', async ({
  page,
}) => {
  await page.goto('/');

  // Operator path: open the catalog and pick the OpenShift Cluster tile.
  await page.getByRole('button', { name: 'Service Catalog' }).click();
  await expect(
    page.getByRole('heading', { name: 'Service Catalog' }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: /OpenShift Cluster Request/i })
    .click();
  await expect(
    page.getByRole('heading', { name: 'OpenShift Cluster Request' }),
  ).toBeVisible();

  // Fill required fields in the order they appear in the seed
  // (department -> cluster name -> environment -> node count).
  await page
    .getByLabel(/Department \/ Organization/i)
    .selectOption('saude');

  await page.getByLabel(/Cluster name/i).fill('e2etest');

  // environment is rendered as radio-cards, not a <select>.
  await page.getByText('Production', { exact: true }).click();

  await page.getByLabel(/Worker node count/i).fill('3');

  await page.getByRole('button', { name: /^Submit$/ }).click();

  // Lands on request-detail with a toast and the request id as the title.
  await expect(page.getByText(/Request submitted for approval/i)).toBeVisible();

  const requestId = await page.locator('h1.page-title.mono').first().textContent();
  expect(requestId).toMatch(/^REQ\d+$/);

  // Switch to admin via the topbar role switcher.
  await page.getByRole('button', { name: /Operator/i }).first().click();
  await page.getByRole('menuitem', { name: /Platform Admin/i }).click();

  // Admin sidebar exposes Approvals.
  await page.getByRole('button', { name: /^Approvals/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Approvals' }),
  ).toBeVisible();

  // Pick the newly submitted request from the queue by its id.
  await page.locator(`.approval-row[data-id="${requestId}"]`).click();

  // Approve. Decision panel surfaces a primary "Approve" button.
  await page.getByRole('button', { name: /^Approve$/ }).click();

  // Expect a success toast confirming the move.
  await expect(page.getByText(/Request approved/i)).toBeVisible();

  // Open All requests (admin label) and confirm provisioning state.
  await page.getByRole('button', { name: /All requests|My Requests/ }).click();

  const row = page.locator('tr', { hasText: requestId! });
  await expect(row).toBeVisible();
  await expect(row.getByText(/Provisioning/i)).toBeVisible();
});
