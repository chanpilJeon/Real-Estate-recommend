# 공공 API 검증 절차

> **현재 상태: 2026-09-08 실제 키로 검증 완료.** 아래 "검증 결과"에 무엇이 틀렸고
> 어떻게 고쳤는지 적어 두었습니다. 스펙이 또 바뀌면 같은 방식으로 대조하세요.

## 검증 결과 (2026-09-08)

스펙 문서만 보고 짠 코드에서 **네 가지가 실제와 달랐습니다.**

| # | 무엇이 | 틀린 값 | 실제 |
|---|---|---|---|
| 1 | 매매 엔드포인트 | `RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev` | `RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade` |
| 2 | 단지 목록 | `AptListService3/getSigunguAptList3` | `AptListService4/getSigunguAptList4` |
| 3 | 단지 정보 | `AptBasisInfoServiceV3/getAphusBassInfoV3` | `AptBasisInfoServiceV5/getAphusBassInfoV5` |
| 4 | 단지 정보 응답 형식 | XML 로 가정 | **JSON** (단, 게이트웨이 오류만 XML) |

- 전월세(`RTMSDataSvcAptRent/getRTMSDataSvcAptRent`)는 처음부터 맞았습니다.
- 실거래 파서의 필드명(`aptNm` `dealAmount` `excluUseAr` `umdNm` `sggCd` `cdealType` …)은
  전부 실제 응답과 일치했습니다. 방어적으로 별칭을 둔 것이 낭비가 아니었습니다.
- **주차 대수는 기본정보에 없습니다.** `getAphusDtlInfoV5`(상세정보)의
  `kaptdPcnt`(지상) + `kaptdPcntu`(지하)에 있어 단지당 호출이 한 번 더 듭니다.
- `kaptAddr` 은 `"서울특별시 강남구 역삼동 761-10 대림역삼아파트"` 처럼 **끝에 단지명이 붙어 옵니다.**
  지오코딩 전에 떼어 냅니다.

### 남은 문제: 두 API 가 같은 단지를 다른 이름으로 부른다

| 실거래 API | K-apt |
|---|---|
| 한보미도맨션2 | 대치미도맨션 |
| 상록스타힐스 | 개포상록스타힐스 |
| 개포우성1 | 개포1차2차우성 |
| 테헤란아이파크 | 테헤란 IPARK |
| 삼익 (수서동) | 수서삼익 |

유사도 기준(0.85)을 넘지 못해 자동 매칭되지 않습니다. 기준을 낮추면
`래미안역삼1차` / `래미안역삼9차` 같은 **다른 단지가 붙어버리므로** 낮출 수 없습니다.

강남구 실측 미매칭률: **매매 14.2% / 전월세 36.5%**
(미매칭 거래는 버려지지 않고 `complexId = null` 로 남아, 나중에 보정하면 되살아납니다.)

---

## 1. 키 발급

1. [공공데이터포털](https://www.data.go.kr) 회원가입
2. 아래 4개를 각각 검색해 **활용신청** (심의유형: 개발·운영 모두 자동승인)

   | API | 쓰는 곳 |
   |---|---|
   | 국토교통부_아파트 매매 실거래가 자료 | 실거래 수집 |
   | 국토교통부_아파트 전월세 실거래가 자료 | 전세가율 계산 |
   | 국토교통부_공동주택 단지 목록제공 서비스 | 단지 마스터 |
   | 국토교통부_공동주택 기본 정보제공 서비스 | 세대수·주차·난방 |

   > 전부 **자동승인**이라 신청 즉시 쓸 수 있습니다. 키는 계정당 하나이고
   > 승인받은 API 전부에 통합니다.

3. [카카오 개발자](https://developers.kakao.com)에서 앱 생성 → **REST API 키** 발급
   - ⚠ 지도용 **JavaScript 키와 다른 값**입니다. 401 오류의 대부분이 이 혼동입니다.

## 2. .env 설정

```
MOLIT_API_KEY="발급받은_인코딩_키"
KAKAO_REST_KEY="카카오_REST_키"
NEXT_PUBLIC_KAKAO_JS_KEY="카카오_JavaScript_키"
DEMO_MODE=false
```

> 공공데이터포털은 **인코딩 키**와 **디코딩 키** 두 가지를 줍니다.
> 코드가 자동으로 판별해 처리하므로 어느 쪽을 넣어도 됩니다.

## 3. 확인할 항목

`DEMO_MODE=false` 로 서버를 켠 뒤 아래를 순서대로 봅니다.

### 3-1. 응답 필드명이 파서와 맞는가 ★ 가장 중요

국토부는 필드명을 한글(`거래금액`)에서 영문(`dealAmount`)으로 바꾼 이력이 있습니다.
파서는 둘 다 받도록 되어 있지만, **제3의 이름**이 오면 값이 0/빈칸으로 들어옵니다.

- [ ] 수집 후 `trades` 테이블에서 `price_manwon = 0` 인 행이 있는가 → 있으면 필드명 불일치
- [ ] `raw_name` 이 비어 있는 행이 있는가
- [ ] `contracted_at` 이 요청한 달과 맞는가

불일치 시 고칠 곳: `apps/api/src/external/domain/molit-parser.ts` 의 `pick(node, ...)` 별칭 목록

### 3-2. 값이 실제와 맞는가

`docs/TEST-CHECKLIST.md` 의 **M3** 절차대로, 국토부 실거래가 공개시스템(https://rt.molit.go.kr)과
표본 10건을 눈으로 대조합니다. **1건이라도 틀리면 불합격입니다.**

- [ ] 계약일 / 전용면적 / 층 / 거래금액 4개 항목 일치
- [ ] 해제(취소)된 거래가 목록에 섞이지 않았는가

### 3-3. 오류 처리가 실제로 동작하는가

일부러 틀린 값을 넣어 안내 문구가 나오는지 확인합니다.

- [ ] `MOLIT_API_KEY` 를 아무 값으로 바꾸고 수집 → "등록되지 않은 서비스 키입니다..." 안내
- [ ] `KAKAO_REST_KEY` 에 JavaScript 키를 넣고 호출 → "REST 키여야 합니다" 안내

### 3-4. 호출량이 세어지는가

- [ ] 수집 후 `api_quota_usage` 테이블에 오늘 날짜로 사용량이 쌓였는가
- [ ] 그 숫자가 실제 호출 횟수와 비슷한가 (페이지 수만큼 세므로 지역 수보다 많을 수 있음)

### 3-5. 단지 정보 API

공동주택 API 는 버전(`V3`, `3`)이 자주 바뀝니다.

- [ ] `fetchComplexList` 가 단지 목록을 돌려주는가
- [ ] `fetchComplexDetail` 의 세대수·주차대수·사용승인일이 채워지는가
- [ ] 404 가 나면 엔드포인트 경로 확인:
      `apps/api/src/external/http/complex-info-http.client.ts` 의 `LIST_PATH`, `DETAIL_PATH`

## 4. 검증이 끝나면

- [ ] 이 문서 맨 위의 "현재 상태" 를 **검증 완료 (날짜)** 로 바꾸기
- [ ] 실제 응답 XML 샘플을 `molit-parser.test.ts` 의 픽스처로 추가
      (다음에 스펙이 바뀌면 테스트가 먼저 잡아줍니다)
- [ ] `ToDo.md` Step 4-A 의 미검증 표시 지우기

## 부록: 데모 모드로 되돌리기

키에 문제가 생겨도 개발을 멈추지 않으려면 `.env` 에서 `DEMO_MODE=true` 로 바꾸고 서버를 다시 켜면 됩니다.
샘플 데이터로 전체 기능이 그대로 동작합니다.
