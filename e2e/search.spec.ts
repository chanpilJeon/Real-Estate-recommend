import { test, expect } from '@playwright/test';

const complex = {
  id: 1,
  name: '테스트아파트',
  address: '서울특별시 강남구 역삼동',
  regionCode: '1168010100',
  lat: null,
  lng: null,
  households: 500,
  builtYear: 2020,
  medianPriceManwon: 80000,
  nearestSubwayM: null,
  nearestSchoolM: null,
};
test.beforeEach(async ({ page }) => {
  // UI 동작은 고정 응답으로 검증한다. 실제 DB/API 연결 검증은 별도 smoke 절차로 수행한다.
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname.endsWith('/health')) body = { status: 'ok', database: { ok: true } };
    else if (url.pathname.endsWith('/collected-regions')) body = [];
    else if (url.pathname.endsWith('/regions/search'))
      body = {
        keyword: '강남',
        candidates: [
          {
            code: '1168000000',
            fullName: '서울특별시 강남구',
            level: 'sigungu',
            matchType: 'partial',
            sigunguCode: '11680',
          },
        ],
      };
    else if (url.pathname.includes('/regions/'))
      body = { code: '1168000000', fullName: '서울특별시 강남구', level: 'sigungu' };
    else if (url.pathname.endsWith('/trades'))
      body = {
        items: [
          {
            contractedAt: '2026-08-01',
            exclusiveSqm: 84.97,
            areaLabel: '84㎡',
            priceManwon: 80000,
            priceText: '8억원',
            floor: 5,
            isCanceled: false,
          },
        ],
        areas: [84.97],
      };
    else if (url.pathname.endsWith('/statistics')) body = { trend: [], jeonseRatio: 0.6 };
    else if (url.pathname.endsWith('/complexes/1'))
      body = {
        ...complex,
        buildingCount: 5,
        ageYears: 6,
        parkingPerHousehold: null,
        heatingType: null,
        qualityReasons: [],
      };
    else
      body = {
        items: [
          {
            ...complex,
            score: 72,
            reasons: ['예산 상한 대비 20% 여유'],
            breakdown: { price: 70, liquidity: 50, location: 50, quality: 80 },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      };
    await route.fulfill({ json: body });
  });
});
test('지역 선택 → 목록 → 상세 → 닫기', async ({ page }) => {
  await page.goto('/');
  await page
    .getByPlaceholder(/강남|지역/)
    .first()
    .fill('강남');
  await page.getByRole('button', { name: /서울특별시 강남구/ }).click();
  await expect(page).toHaveURL(/regionCode=1168000000/);
  await page.getByRole('button', { name: /테스트아파트/ }).click();
  await expect(page.getByRole('heading', { name: '테스트아파트' })).toBeVisible();
  await expect(page.getByText('최근 실거래', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '테스트아파트' })).toHaveCount(0);
});
test('문제 신고는 조건을 담은 초안만 만든다', async ({ page }) => {
  await page.goto('/?regionCode=1168000000&priceMax=100000&token=private');
  await page.getByRole('button', { name: '문제 신고', exact: true }).click();
  await page.getByLabel('어떤 문제가 있었나요?').fill('지도가 보이지 않습니다');
  await page.getByRole('button', { name: '신고 초안 만들기' }).click();
  const href = await page.getByRole('link', { name: /GitHub에서 검토하기/ }).getAttribute('href');
  expect(decodeURIComponent(href!)).toContain('priceMax=100000');
  expect(href).not.toContain('private');
});

test('추천 프리셋과 예산을 새로고침 후에도 유지한다', async ({ page }) => {
  await page.goto('/?regionCode=1168000000&priceMax=100000');
  await page.getByLabel('추천 기준').selectOption('value');
  await expect(page).toHaveURL(/preset=value/);
  await expect(page.getByText('추천 72.0점')).toBeVisible();
  await expect(page.getByText('예산 상한 대비 20% 여유')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('추천 기준')).toHaveValue('value');
  await expect(page).toHaveURL(/priceMax=100000/);
  await page.getByLabel('추천 기준').selectOption('location');
  await expect(page).toHaveURL(/preset=location/);
});
