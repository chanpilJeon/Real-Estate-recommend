import { Coordinate } from '@apt/shared';
import { describe, expect, it } from 'vitest';

import { nearestDistance } from './poi.service';

const center = new Coordinate(37.5, 127);
const place = (name: string, categoryCode: string, lat = 37.501) => ({
  name,
  categoryCode,
  coordinate: new Coordinate(lat, 127),
});
describe('입지 거리', () => {
  it('중학교를 초등학교로 안내하지 않는다', () => {
    expect(nearestDistance(center, [place('가까운중학교', 'SC4')], 'SC4')).toBeNull();
    expect(nearestDistance(center, [place('초등학교', 'SC4')], 'SC4')).toBe(111);
  });
  it('검색 반경 밖과 없는 자료는 미상으로 둔다', () => {
    expect(nearestDistance(center, [], 'SW8')).toBeNull();
    expect(nearestDistance(center, [place('먼 역', 'SW8', 38)], 'SW8')).toBeNull();
  });
  it('행정구역과 관계없이 가장 가까운 역을 고른다', () => {
    expect(
      nearestDistance(center, [place('먼 역', 'SW8', 37.51), place('가까운 역', 'SW8')], 'SW8'),
    ).toBe(111);
  });
});
