import { test, expect } from '@playwright/test';

test('실제 API·DB로 추천 목록과 상세를 연다', async ({ page }) => {
  test.skip(process.env.LIVE_API !== '1', 'LIVE_API=1일 때 실제 로컬 서버를 검증합니다');
  await page.goto('/?regionCode=1168000000&preset=value&priceMax=300000');
  await expect(page.locator('.recommendation-score').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('.complex-card').first().click();
  await expect(page.locator('.detail-panel__title')).not.toHaveText('불러오는 중…');
  await expect(page.getByText('최근 실거래', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/live-${test.info().project.name}.png`,
    fullPage: false,
  });
});
