PARK SANGBEOM · SALES DESK v5.0 STABLE

배포:
1) 이 폴더 전체(index.html, api, vercel.json)를 기존 Vercel salesdesk11 프로젝트에 배포
2) Settings > Environment Variables 확인
   필수: FOODSAFETY_API_KEY
   필수: DATA_GO_KR_SERVICE_KEY
   선택: KAKAO_REST_API_KEY
3) 환경변수 수정 후 Redeploy
4) 신규업체 발굴 탭 > API 연결점검 실행

설계:
- 기존 Supabase 고객/CRM 데이터 구조 변경 없음
- 식품안전나라, HACCP, 프랜차이즈를 독립 호출: 한 소스 오류가 다른 소스에 영향 없음
- 전화 없는 업체는 행안부/HACCP 공공데이터로 자동 보강
- 카카오는 공공데이터 보강 후에도 연락처가 없을 때만 사용
- 바로 실행은 내 고객 등록 / 제외 2개만 유지
