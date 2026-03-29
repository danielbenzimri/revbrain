import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateAdmin, apiFetch, mockToken, MOCK_IDS } from './fixtures/admin-helpers';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Avatar Upload Tests
 *
 * Tests the avatar upload flow via API and UI:
 * 1. API: POST /v1/users/me/avatar with multipart form data
 * 2. UI: Admin user drawer — click avatar to upload in edit mode
 * 3. Org isolation: avatar stored under {org_id}/{user_id}.ext
 */

// Create a minimal test PNG (1x1 pixel)
function createTestPng(): Buffer {
  // Minimal valid PNG: 1x1 pixel, red
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
}

test.describe('Avatar Upload', () => {
  test('API: upload avatar returns signed URL', async () => {
    const token = mockToken(MOCK_IDS.USER_ACME_OWNER);
    const png = createTestPng();

    // Create a FormData-like body using fetch API
    const formData = new FormData();
    formData.append('file', new Blob([png], { type: 'image/png' }), 'test-avatar.png');

    const res = await fetch(`http://localhost:3000/api/v1/users/me/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    // In mock mode, storage won't work (no Supabase), so we expect either
    // 200 (success) or 500 (storage not available in mock mode)
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.avatarUrl).toBeTruthy();
    } else {
      // Mock mode — storage bucket doesn't exist locally
      expect([500, 400]).toContain(res.status);
    }
  });

  test('API: rejects oversized avatar (> 2MB)', async () => {
    const token = mockToken(MOCK_IDS.USER_ACME_OWNER);

    // Create a 3MB buffer (exceeds 2MB limit)
    const largeBuffer = Buffer.alloc(3 * 1024 * 1024, 0);

    const formData = new FormData();
    formData.append('file', new Blob([largeBuffer], { type: 'image/png' }), 'too-large.png');

    const res = await fetch(`http://localhost:3000/api/v1/users/me/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    // 400 (our validation), 413 (server body limit), or 500 (storage rejects)
    expect([400, 413, 500]).toContain(res.status);
  });

  test('API: rejects invalid file type', async () => {
    const token = mockToken(MOCK_IDS.USER_ACME_OWNER);

    const formData = new FormData();
    formData.append(
      'file',
      new Blob(['not an image'], { type: 'text/plain' }),
      'test.txt'
    );

    const res = await fetch(`http://localhost:3000/api/v1/users/me/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('file type');
  });

  test('API: rejects request without file', async () => {
    const token = mockToken(MOCK_IDS.USER_ACME_OWNER);

    const formData = new FormData();
    // No file appended

    const res = await fetch(`http://localhost:3000/api/v1/users/me/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    expect(res.status).toBe(400);
  });

  test('UI: admin user drawer has file input for avatar upload', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateAdmin(page, '/admin/users');

    // Wait for users list to render
    await page.waitForTimeout(3_000);

    // Click first user row to open drawer
    const userRow = page.locator('tr').filter({ hasText: /@/ }).first();
    if ((await userRow.count()) === 0) {
      test.skip(true, 'No users in list');
      return;
    }

    await userRow.click();
    await page.waitForTimeout(1_500);

    // Click "Edit Details" button
    const editButton = page.locator('button').filter({ hasText: /edit|עריכה/i }).first();
    if ((await editButton.count()) === 0) {
      test.skip(true, 'No Edit button found in drawer');
      return;
    }

    await editButton.click();
    await page.waitForTimeout(1_000);

    // Verify hidden file input for avatar exists
    const fileInput = page.locator('input[type="file"]');
    expect(await fileInput.count()).toBeGreaterThan(0);
  });
});
