# T&A 가로세로 낱말퀴즈 🎯

**CJ ENM · T&A사업부** 교육 행사용 가로세로 낱말퀴즈 웹앱입니다.
참가자는 링크 클릭 한 번으로 모바일/PC에서 퍼즐을 풀고, 이름·소속만 입력해
정답을 제출합니다. **먼저 제출한 순서(선착순)** 가 서버에 기록되어 1등을 가릴 수 있습니다.

> 참고 사이트(인쇄형 퍼즐 제작): https://interacty.me/ko/products/crossword-puzzle
> 본 프로젝트는 위 컨셉을 **온라인 선착순 정답 이벤트** 로 구현한 것입니다.

## ✨ 주요 기능

- **누구나 쉽고 빠르게**: 설치·로그인 없이 링크만으로 접속, 모바일 대응
- **자동 십자말풀이**: 정답 단어들끼리 같은 글자가 있으면 자동 교차 배치
- **선착순 기록**: 정답 제출 시각이 서버(Firebase)에 저장 → 1등 자동 정렬
- **관리자 페이지**: 문제(단어·힌트)를 언제든 수정, 정답 로그 조회 및 CSV 내려받기
- **간편 입력**: 참가자는 **이름 + 소속** 두 가지만 입력하면 제출 가능
- **인쇄 지원**: 브라우저 인쇄 시 빈 퍼즐로 출력(오프라인 배포용)

## 📁 구성

```
index.html            플레이어(참가자) 화면 — 퍼즐 풀이 + 정답 제출
admin.html            관리자 화면 — 문제 편집 + 선착순 로그
js/
  crossword.js        한글 음절 단위 퍼즐 자동배치 + 렌더링 엔진
  store.js            저장 추상화(Firebase 또는 localStorage 자동 선택)
  app.js              플레이어 로직
  admin.js            관리자 로직
  firebase-config.js  ⚙️ Firebase 설정 + 관리자 비밀번호 (여기를 수정)
data/
  sample-puzzle.js    기본(샘플) 문제 — 관리자 페이지에서 교체 가능
firestore.rules       Firestore 보안 규칙(콘솔에 붙여넣기)
```

## 🚀 빠른 시작 (로컬 테스트 — Firebase 없이)

Firebase 설정 전에도 바로 동작합니다(기록은 그 브라우저에만 저장되는 **데모 모드**).

```bash
# 프로젝트 폴더에서 간단한 정적 서버 실행
python3 -m http.server 8000
```

브라우저에서 접속:

- 참가자 화면: http://localhost:8000/index.html
- 관리자 화면: http://localhost:8000/admin.html (기본 비밀번호: `tna2026`)

> `file://` 로 직접 열면 ES 모듈 로딩이 막히므로 **반드시 위처럼 서버로 실행**하세요.

## 🔥 Firebase 설정 (실제 행사 — 여러 기기에서 선착순 기록)

선착순을 정확히 가리려면 모든 참가자의 제출이 한 서버에 모여야 합니다. 무료 Firebase로 충분합니다.

1. **프로젝트 생성**: https://console.firebase.google.com → "프로젝트 추가"
2. **Firestore 만들기**: 좌측 *빌드 > Firestore Database > 데이터베이스 만들기*
   (위치는 `asia-northeast3 (서울)` 권장, "프로덕션 모드"로 시작)
3. **웹 앱 등록**: *프로젝트 설정(⚙️) > 일반 > 내 앱 > 웹(`</>`)* 추가 →
   표시되는 `firebaseConfig` 값을 복사
4. **설정 붙여넣기**: `js/firebase-config.js` 의 `firebaseConfig` 를 복사한 값으로 교체
5. **관리자 비밀번호 변경**: 같은 파일의 `ADMIN_PASSWORD` 를 행사용으로 변경
6. **보안 규칙 적용**: `firestore.rules` 내용을 *Firestore > 규칙* 탭에 붙여넣고 **게시**

설정이 끝나면 화면 상단의 "데모 모드" 경고가 사라지고 실제 서버에 기록됩니다.

### Firestore 데이터 구조

- `puzzle/current` — 현재 문제 `{ title, words:[{answer, clue}], updatedAt }`
- `submissions/{id}` — 정답 제출 `{ name, department, durationMs, createdAt(서버시각) }`

선착순은 `createdAt`(서버 타임스탬프) 오름차순으로 정렬해 관리자 화면에 표시됩니다.

## 🌐 배포 (참가자에게 링크 공유)

정적 파일만 있으므로 어디든 올릴 수 있습니다. 택1:

- **Firebase Hosting** (Firebase와 한 세트라 추천)
  ```bash
  npm i -g firebase-tools
  firebase login
  firebase init hosting   # public 디렉터리는 현재 폴더(.)로 지정
  firebase deploy
  ```
- **GitHub Pages**: 저장소 *Settings > Pages* 에서 브랜치 지정 후 게시
- **Vercel / Netlify**: 폴더를 드래그&드롭하거나 저장소 연결

배포 후 나오는 주소(예: `https://...web.app`)를 QR코드로 만들어 현장에 띄우면
참가자들이 휴대폰으로 바로 접속할 수 있습니다.

## 🛠 문제 바꾸기

관리자 화면 *① 문제 편집* 에서 한 줄에 한 단어씩 **`정답, 힌트`** 형식으로 입력 후
저장하면 참가자 화면에 즉시 반영됩니다.

```
교육, T&A사업부가 담당하는 핵심 활동 (○○)
인재, 기업이 가장 원하는 ○○
미디어, CJ ENM의 사업 영역, 매체 (○○○)
```

- 정답 단어끼리 **같은 글자**가 있으면 그 글자에서 자동으로 교차됩니다.
- 교차가 많아지도록 단어를 고르면 더 촘촘한 십자말풀이가 됩니다.

## ⚠️ 보안 안내

- 관리자 비밀번호는 브라우저에 노출되는 **간이 잠금**입니다(사내 행사용).
- 수집 정보는 **이름·소속**뿐이며 민감정보가 아닙니다. 행사 종료 후에는
  Firestore 규칙의 쓰기를 닫고(`allow write: if false;`) 데이터를 정리하세요.
