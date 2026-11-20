PARK SANGBEOM · SALES DESK v7.0 PROSPECT

기준: GitHub salesdesk-main v6.9 전체 파일. 기존 고객 DB 구조 및 CRM 테이블 변경 없음.

신규: 카카오 지역발굴 탭 /api/kakao-discover.js (지역+업종 검색, 최대 15건/페이지, 3페이지, 기존 CRM/과거거래 중복 표시, 전화번호 및 카카오맵 링크, 네이버 교차 검색).
검색 응답은 임시 화면에서만 보며 자동 CRM 등록하지 않습니다. 직접 확인한 영업정보를 수동 입력할 수 있습니다.
수정: fetchWithTimeout 누락 함수 보완 (식품안전나라 상세·공공데이터 연락처 보강 기능).

배포:
1. 기존 GitHub 저장소에 이 ZIP의 내용물 전체 덮어쓰기(기존 api 폴더 유지).
2. Vercel > Project > Settings > Environment Variables: KAKAO_REST_API_KEY, FOODSAFETY_API_KEY, DATA_GO_KR_SERVICE_KEY 설정 확인.
3. Vercel 배포 완료 후 /api/health 및 새 카카오 지역발굴 탭 확인.
4. 원래 CRM/매출 데이터의 백업을 별도 보관. Supabase SQL 마이그레이션 불필요.

주의: 네이버 연동은 공식 API 자동수집 기능이 아닌 새 탭에서 검색 페이지를 열어 교차검증하는 방식입니다.
카카오 검색 결과의 별도 저장/재배포는 하지 않습니다. 검색량과 이용조건을 준수하세요.
실제 API 연결·로그인·DB 쓰기 동작은 운영환경에서 검증 필요.

[v7.0 HACCP TIMEOUT PATCH - 2026-11-17]
- HACCP 원기관 인증업체 API 요청 30초 대기. 실패 시 제조가공 대체 API 요청도 30초 대기.
- 클라이언트 HACCP 조회 제한 75초, Vercel HACCP 함수 실행 한도 70초.
- 타 API와 CRM 및 Supabase 테이블 변경 없음. 원기관의 응답 자체가 없으면 504 오류를 표시합니다.
