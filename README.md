# 컴플라이언스 가로세로 낱말퀴즈 🎯

**CJ ENM · T&A사업부** — 2026년 협력사 교육용 가로세로 낱말퀴즈 웹앱입니다.
참가자는 링크 클릭 한 번으로 모바일/PC에서 퍼즐을 풀고, **이름·소속**만 입력해
정답을 제출합니다. **먼저 제출한 순서(선착순)** 가 서버에 기록되어 1·2·3등을 가릴 수 있습니다.

현재 문제는 직접 만드신 **컴플라이언스 퍼즐**(공정거래·청탁금지법·내부통제 등 14문항)이
인쇄본과 **똑같은 칸 배치·번호**로 들어가 있습니다.

> 참고 컨셉(인쇄형 퍼즐): https://interacty.me/ko/products/crossword-puzzle

---

## 📑 목차
1. [지금 바로 미리보기 (Firebase 없이)](#1-지금-바로-미리보기-firebase-없이)
2. [Firebase 연결 (실제 행사용)](#2-firebase-연결-실제-행사용)
3. [인터넷에 올리고 링크 공유 (배포)](#3-인터넷에-올리고-링크-공유-배포)
4. [QR코드 만들기](#4-qr코드-만들기)
5. [문제 수정하는 법](#5-문제-수정하는-법)
6. [행사 당일 진행 순서](#6-행사-당일-진행-순서)
7. [행사 후 정리 / 보안](#7-행사-후-정리--보안)
8. [폴더 구성](#-폴더-구성)

---

## 1. 지금 바로 미리보기 (Firebase 없이)

Firebase 설정 전에도 화면과 퍼즐을 바로 확인할 수 있습니다(이때는 기록이 **그 브라우저에만**
저장되는 *데모 모드*입니다). 컴퓨터에 파이썬이 깔려 있다면:

```bash
# 1) 이 프로젝트 폴더로 이동
cd TnA-Edu

# 2) 간단한 웹서버 실행 (파이썬3 기준)
python3 -m http.server 8000
```

그다음 브라우저 주소창에 입력:

| 화면 | 주소 |
|---|---|
| 참가자 화면 | `http://localhost:8000/index.html` |
| 관리자 화면 | `http://localhost:8000/admin.html` (비밀번호: `tna2026`) |

> ⚠️ 파일을 더블클릭해서 `file://` 로 열면 동작하지 않습니다. **반드시 위처럼 서버로** 띄우세요.
> 파이썬이 없다면 VS Code 의 "Live Server" 확장으로 `index.html` 을 열어도 됩니다.

---

## 2. Firebase 연결 (실제 행사용)

선착순을 정확히 가리려면 **모든 참가자의 제출이 한 서버에 모여야** 합니다. 무료 Firebase로 충분합니다.
아래 순서를 그대로 따라 하세요. (구글 계정 필요 — `jws.wonseok@gmail.com` 으로 진행하면 됩니다.)

### 2-1. 프로젝트 만들기
1. https://console.firebase.google.com 접속 → 구글 로그인
2. **[프로젝트 추가]** 클릭
3. 프로젝트 이름 입력 (예: `tna-compliance-quiz`) → **[계속]**
4. "Google 애널리틱스"는 **사용 안 함**으로 두고 **[프로젝트 만들기]** → 잠시 기다린 뒤 **[계속]**

### 2-2. Firestore 데이터베이스 만들기
1. 왼쪽 메뉴에서 **빌드(Build) > Firestore Database** 클릭
2. **[데이터베이스 만들기]** 클릭
3. 위치(Location)는 **`asia-northeast3 (Seoul)`** 선택 → **[다음]**
4. 시작 모드는 **"프로덕션 모드에서 시작"** 선택 → **[만들기]**

### 2-3. 웹 앱 등록하고 설정값 복사
1. 왼쪽 위 **⚙️(톱니바퀴) > 프로젝트 설정** 클릭
2. **[일반]** 탭 아래로 스크롤 → "내 앱" 영역에서 **웹 아이콘 `</>`** 클릭
3. 앱 닉네임 입력 (예: `quiz-web`) → **[앱 등록]**
   - "Firebase 호스팅 설정"은 체크하지 않아도 됩니다.
4. 화면에 나오는 `const firebaseConfig = { ... }` 블록을 **통째로 복사**

### 2-4. 설정값 붙여넣기
`js/firebase-config.js` 파일을 열고, 맨 위 `firebaseConfig` 를 **복사한 값으로 교체**합니다.

```js
// 교체 전 (예시)
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  ...
};

// 교체 후 (Firebase에서 복사한 실제 값 — 아래는 형태 예시)
export const firebaseConfig = {
  apiKey: "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "tna-compliance-quiz.firebaseapp.com",
  projectId: "tna-compliance-quiz",
  storageBucket: "tna-compliance-quiz.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
};
```

> 같은 파일에서 **관리자 비밀번호** `ADMIN_PASSWORD` 도 행사용으로 바꿔주세요.
> (예: `export const ADMIN_PASSWORD = "원하는비밀번호";`)

### 2-5. 보안 규칙 적용
1. Firebase 콘솔에서 **Firestore Database > [규칙(Rules)] 탭** 클릭
2. 편집창의 내용을 모두 지우고, 이 프로젝트의 **`firestore.rules`** 파일 내용을 그대로 붙여넣기
3. **[게시(Publish)]** 클릭

이제 설정 끝! 화면 위의 "데모 모드" 경고가 사라지면 정상 연결된 것입니다.
(맨 처음 한 번은 퍼즐 데이터가 자동으로 서버에 저장됩니다.)

---

## 3. 인터넷에 올리고 링크 공유 (배포)

참가자가 접속할 수 있도록 인터넷에 올립니다. **택1** 하세요.

### 방법 A. Firebase Hosting (Firebase와 한 세트라 추천)
컴퓨터에 [Node.js](https://nodejs.org) 가 설치돼 있어야 합니다.

```bash
# 1) Firebase 도구 설치 (최초 1회)
npm install -g firebase-tools

# 2) 로그인 (브라우저가 열리면 구글 로그인)
firebase login

# 3) 프로젝트 폴더에서 초기화
cd TnA-Edu
firebase init hosting
#   - "Use an existing project" 선택 → 2단계에서 만든 프로젝트 선택
#   - "What do you want to use as your public directory?"  →  .  (점 하나, 현재 폴더)
#   - "Configure as a single-page app?"  →  N (아니오)
#   - "Set up automatic builds with GitHub?"  →  N
#   - "File index.html already exists. Overwrite?"  →  N (덮어쓰지 않음!)

# 4) 배포
firebase deploy
```

배포가 끝나면 `Hosting URL: https://<프로젝트>.web.app` 주소가 나옵니다. 이게 참가자에게 줄 링크입니다.
- 참가자: `https://<프로젝트>.web.app`
- 관리자: `https://<프로젝트>.web.app/admin.html`

### 방법 B. GitHub Pages
1. 이 저장소를 GitHub 에 올립니다.
2. 저장소 **Settings > Pages** 로 이동
3. "Build and deployment > Source" 를 **Deploy from a branch** 로, 브랜치를 지정하고 **Save**
4. 잠시 후 표시되는 `https://<아이디>.github.io/<저장소>/` 가 참가자 링크입니다.

> GitHub Pages 로 배포해도 데이터 기록은 Firebase 가 담당하므로, **2단계(Firebase 연결)는 반드시 먼저** 해두어야 합니다.

---

## 4. QR코드 만들기

현장에서는 참가자들이 휴대폰으로 바로 들어오게 QR코드를 띄우는 게 편합니다.
3단계에서 받은 링크(예: `https://...web.app`)를 아래 중 하나에 넣으면 QR 이미지가 나옵니다.

- 네이버/구글에서 "QR코드 생성기" 검색 후 링크 입력
- 또는 주소창에:
  `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=여기에링크`

만든 QR을 교육 자료 PPT 표지나 현장 스크린에 띄워 주세요.

---

## 5. 문제 수정하는 법

관리자 화면(`/admin.html`)에 비밀번호로 로그인 → **① 문제 편집** 에서 수정 후
**[미리보기]** 로 배치 확인 → **[저장하기]** 를 누르면 참가자 화면에 **즉시 반영**됩니다.

입력 형식은 두 가지입니다.

### 형식 1 — 자동 배치 (간단, 새 퍼즐 만들 때)
한 줄에 `정답, 힌트` 한 개씩. 정답끼리 같은 글자가 있으면 자동으로 교차됩니다.

```
교육, T&A사업부가 담당하는 핵심 활동
인재, 기업이 가장 원하는 사람
미디어, CJ ENM의 사업 영역
```

### 형식 2 — 수동 배치 (인쇄본과 똑같이, 지금 퍼즐이 이 방식)
한 줄에 `정답 | 힌트 | 방향 | 행 | 열 | 번호`. 방향은 **가로** 또는 **세로**,
행·열은 0부터 시작하는 칸 위치, 번호는 화면에 표시할 문제 번호입니다.
**힌트 안에 쉼표(,)가 있어도 됩니다**(구분자가 `|` 이기 때문).

```
공정거래 | 거래 과정에서 ... 위한 원칙 | 가로 | 0 | 3 | 1
청탁금지법 | 금품·향응 제공 및 ... 위한 법률 | 세로 | 0 | 1 | 1
리스크 | 법 위반, 부정행위, 정보 유출 등 ... 위험 요소 | 세로 | 4 | 8 | 7
```

> 한 줄이라도 `|` 를 쓰면 전체가 수동 배치로 처리됩니다.
> 글자 한 칸 = 한글 한 글자. 가로는 오른쪽으로, 세로는 아래로 글자가 채워집니다.
> 행/열을 바꿔가며 **[미리보기]** 를 누르면 어디에 놓이는지 바로 보입니다.

---

## 6. 행사 당일 진행 순서

1. (사전) 2~3단계로 Firebase 연결 + 배포를 끝내 둡니다.
2. 현장 스크린에 **QR코드 / 참가 링크**를 띄웁니다.
3. 참가자: 링크 접속 → 퍼즐 풀기 → **[정답 확인]** 으로 점검 → 이름·소속 입력 → **[정답 제출하기]**
   - 제출하면 본인 화면에 "○등으로 기록되었습니다!" 가 표시됩니다.
4. 진행자: 관리자 화면 **② 선착순 정답 로그** 에서 **[새로고침]** → 1등(🏆)부터 순서대로 확인
5. **[CSV 내려받기]** 로 전체 명단을 엑셀로 저장해 당첨자 정리/공지에 사용

---

## 7. 행사 후 정리 / 보안

- 관리자 비밀번호는 브라우저에 노출되는 **간이 잠금**입니다(사내 행사용). 민감정보는 다루지 않습니다.
- 수집 항목은 **이름·소속**뿐입니다.
- 행사가 끝나면 Firebase 콘솔 **Firestore > 규칙** 에서 쓰기를 닫는 것을 권장합니다.
  `firestore.rules` 의 `puzzle`/`submissions` 의 `allow write/create` 를 `if false;` 로 바꾸고 다시 **[게시]**.
- 제출 데이터(`submissions` 컬렉션)는 콘솔에서 직접 삭제할 수 있습니다.

---

## 📁 폴더 구성

```
index.html            참가자 화면 — 퍼즐 풀이 + 정답 제출
admin.html            관리자 화면 — 문제 편집 + 선착순 로그
js/
  crossword.js        한글 글자 단위 퍼즐 배치(자동/수동) + 렌더링 엔진
  store.js            저장 처리 (Firebase 또는 localStorage 자동 선택)
  app.js              참가자 화면 로직
  admin.js            관리자 화면 로직
  firebase-config.js  ⚙️ Firebase 설정 + 관리자 비밀번호 (여기를 수정)
data/
  sample-puzzle.js    기본 문제 = 2026 컴플라이언스 퍼즐 (관리자에서 교체 가능)
firestore.rules       Firestore 보안 규칙 (콘솔에 붙여넣기)
```

### 데이터가 저장되는 구조 (Firestore)
- `puzzle/current` — 현재 문제 `{ title, words:[...], updatedAt }`
- `submissions/{자동ID}` — 정답 제출 `{ name, department, durationMs, createdAt(서버시각) }`

선착순은 `createdAt`(서버 기준 시각) 오름차순으로 정렬해 관리자 화면에 보여줍니다.
