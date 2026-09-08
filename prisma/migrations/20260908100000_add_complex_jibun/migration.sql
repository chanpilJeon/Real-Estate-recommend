-- 실거래와 공동주택 정보(K-apt) 를 이어붙이는 열쇠.
-- 두 API 는 같은 아파트를 다른 이름으로 부르지만("한보미도맨션2" ↔ "대치미도맨션")
-- 번지는 같다. 이름 대조로는 K-apt 233곳 중 87곳만 붙었다.
ALTER TABLE `complexes` ADD COLUMN `jibun` VARCHAR(20) NULL;

-- 보강할 때 (지역, 번지) 로 단지를 찾는다
CREATE INDEX `complexes_region_code_jibun_idx` ON `complexes`(`region_code`, `jibun`);
