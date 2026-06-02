// firebase-config.js
// ───────────────────────────────────────────────────────────────────────────
//  ⚙️  여기에 Firebase 프로젝트 설정을 붙여넣으세요.
//  설정 방법은 README.md 의 "Firebase 설정" 단계를 참고하세요.
//  (Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성 > "구성")
// ───────────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyAeRPtdzTs001DENNpG7Gj4K5xEzylzVK8",
  authDomain: "tna-edu.firebaseapp.com",
  projectId: "tna-edu",
  storageBucket: "tna-edu.firebasestorage.app",
  messagingSenderId: "688778693149",
  appId: "1:688778693149:web:be492d8e3ad149d4f594f4",
};

// 관리자 페이지(admin.html) 접속 비밀번호.
// ⚠️ 클라이언트에 노출되는 "약한" 보호장치입니다. 사내 행사용 간이 잠금 용도이며
//    민감 정보를 다루지 않습니다. 행사 전에 반드시 바꿔서 사용하세요.
export const ADMIN_PASSWORD = "tna2026";

// 행사 제목 등 기본 화면 문구
export const EVENT = {
  org: "CJ ENM · T&A사업부",
  title: "컴플라이언스 가로세로 낱말퀴즈",
  subtitle: "2026년 협력사 교육 · 선착순 정답자 이벤트",
};
