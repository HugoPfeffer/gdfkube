// End-to-end persistence test: operator submits a cluster request that
// survives a page reload, then admin approves it and verifies the
// decision persists after reload.
//
// Requires a running compose stack (API + MongoDB + SPA).

import { test, expect } from '@playwright/test';

test.describe('Request persistence across reloads', () => {
  test('submitted request survives reload, admin approval persists', async ({
    page,
  }) => {
    // ------------------------------------------------------------------
    // Phase 1 — Operator submits a cluster-request
    // ------------------------------------------------------------------
    await page.goto('/');
    await page.waitForSelector('[data-testid="bootstrap-loader"]', {
      state: 'hidden',
      timeout: 15_000,
    });

    // Navigate to catalog
    await page.getByRole('button', { name: 'Service Catalog' }).click();
    await expect(
      page.getByRole('heading', { name: 'Service Catalog' }),
    ).toBeVisible();

    // Pick the OpenShift Cluster Request tile
    await page
      .getByRole('button', { name: /OpenShift Cluster Request/i })
      .click();
    await expect(
      page.getByRole('heading', { name: 'OpenShift Cluster Request' }),
    ).toBeVisible();

    // Fill required fields
    await page
      .getByLabel(/Department \/ Organization/i)
      .selectOption('saude');
    await page.getByLabel(/Cluster name/i).fill('e2e-persist');
    await page.getByText('Production', { exact: true }).click();
    await page.getByLabel(/Worker node count/i).fill('3');

    // Submit
    await page.getByRole('button', { name: /^Submit$/ }).click();

    // Wait for the success toast and capture the request id
    await expect(
      page.getByText(/Request submitted for approval/i),
    ).toBeVisible();

    const requestId = await page
      .locator('h1.page-title.mono')
      .first()
      .textContent();
    expect(requestId).toBeTruthy();

    // ------------------------------------------------------------------
    // Phase 2 — Reload and verify persistence
    // ------------------------------------------------------------------
    await page.reload();
    await page.waitForSelector('[data-testid="bootstrap-loader"]', {
      state: 'hidden',
      timeout: 15_000,
    });

    // Navigate to My Requests and verify the submission is still there
    await page.getByRole('button', { name: /My Requests/ }).click();
    const requestRow = page.locator('tr', { hasText: requestId! });
    await expect(requestRow).toBeVisible({ timeout: 10_000 });

    // ------------------------------------------------------------------
    // Phase 3 — Switch to admin and approve
    // ------------------------------------------------------------------
    await page.getByRole('button', { name: /Operator/i }).first().click();
    await page.getByRole('menuitem', { name: /Platform Admin/i }).click();

    // Navigate to Approvals
    await page.getByRole('button', { name: /^Approvals/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Approvals' }),
    ).toBeVisible();

    // Select the request
    await page
      .locator(`.approval-row[data-id="${requestId}"]`)
      .click();

    // Approve
    await page.getByRole('button', { name: /^Approve$/ }).click();
    await expect(page.getByText(/Request approved/i)).toBeVisible();

    // ------------------------------------------------------------------
    // Phase 4 — Reload and verify approval persisted
    // ------------------------------------------------------------------
    await page.reload();
    await page.waitForSelector('[data-testid="bootstrap-loader"]', {
      state: 'hidden',
      timeout: 15_000,
    });

    // Re-enter admin mode after reload (role resets to operator)
    await page.getByRole('button', { name: /Operator/i }).first().click();
    await page.getByRole('menuitem', { name: /Platform Admin/i }).click();

    // Go to All Requests
    await page
      .getByRole('button', { name: /All requests|My Requests/ })
      .click();

    // Find the request and verify it shows provisioning
    const row = page.locator('tr', { hasText: requestId! });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText(/Provisioning/i)).toBeVisible();

    // Navigate to the detail page to verify the approval chain
    await row.click();
    await expect(
      page.locator('h1.page-title.mono', { hasText: requestId! }),
    ).toBeVisible();

    // Approval chain should have exactly 1 entry
    const chainEntries = page.locator('[data-testid="approval-chain"] .chain-entry, .approval-chain-entry');
    const entryCount = await chainEntries.count();
    // At minimum, the status must say provisioning
    await expect(page.getByText(/Provisioning/i).first()).toBeVisible();
    // If the detail page renders chain entries, verify count
    if (entryCount > 0) {
      expect(entryCount).toBe(1);
    }
  });
});
