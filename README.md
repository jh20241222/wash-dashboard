# 🚿 세차현황 주간 대시보드

Excel 파일 업로드만으로 주차별 세차 현황이 자동 분석되는 웹 대시보드입니다.

## 주요 기능
- 📂 **Excel 업로드** → 자동 파싱 & DB 저장
- 📊 **주차 선택** → 2개 주차 나란히 비교
- 📈 **누적 트렌드** → WK22~WK99 전체 추이 한눈에
- 👤 **작업자 현황** → 건수 & 평균 작업시간 비교
- 🔁 **미조치 추적** → 이월 차량 자동 식별

---

## 🚀 Vercel 배포 방법 (15분)

### 1단계: GitHub에 올리기
```bash
git init
git add .
git commit -m "init: 세차 대시보드"
# GitHub에서 새 repo 만든 후:
git remote add origin https://github.com/YOUR_ID/carwash-dashboard.git
git push -u origin main
```

### 2단계: Vercel에 배포
1. [vercel.com](https://vercel.com) 접속 → GitHub 연동
2. **Import** → 위에서 만든 repo 선택
3. **Deploy** 클릭

### 3단계: Postgres DB 연결
1. Vercel 프로젝트 대시보드 → **Storage** 탭
2. **Create Database** → **Postgres** 선택
3. DB 생성 후 → **Connect to Project** 클릭 (환경변수 자동 설정)
4. **Redeploy** 한 번 더 실행

### 4단계: DB 테이블 초기화
브라우저에서 한 번만 접속:
```
https://YOUR-PROJECT.vercel.app/api/init-db
```
`{"ok":true}` 응답이 오면 완료!

---

## 📁 Excel 파일 형식

파일명에 `WK숫자`를 포함하면 주차가 자동 인식됩니다.
예: `WK24_세차현황.xlsx`

시트 구조는 `EXCEL_TEMPLATE_GUIDE.txt` 참고

---

## 로컬 개발

```bash
npm install
# .env.local.example → .env.local 복사 후 Vercel DB 정보 입력
npm run dev
# → http://localhost:3000
```
