/**
 * Global Teardown for Playwright E2E Tests
 *
 * Runs after all tests complete.
 * Cleans up test data created during the test run.
 */
import { cleanupTestData } from './fixtures/test-utils';

export default async function globalTeardown() {
  console.log('\n🧹 Running global test cleanup...');

  const apiUrl = process.env.API_URL || 'http://localhost:3000';

  try {
    const result = await cleanupTestData(apiUrl);
    if (result?.success) {
      console.log('✅ Test cleanup complete:', result.deleted || result.message);
    } else {
      console.log('⚠️  Cleanup may have partially failed:', result?.error || 'Unknown error');
    }
  } catch (err) {
    // Don't fail the test run if cleanup fails - just log it
    console.error('⚠️  Global cleanup error (non-fatal):', err);
  }
}
