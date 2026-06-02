// store.js
// 데이터 저장 추상화 계층.
//  - Firebase(Firestore)가 설정되어 있으면 실제 서버에 저장(여러 기기 공유, 선착순 기록).
//  - 아직 설정 전이면 localStorage 로 동작(같은 브라우저에서만 동작하는 테스트용).
// 플레이어/관리자 페이지는 이 모듈의 함수만 호출하면 됩니다.

import { firebaseConfig } from "./firebase-config.js?v=14";
import { DEFAULT_PUZZLE } from "../data/sample-puzzle.js?v=14";

const SDK = "https://www.gstatic.com/firebasejs/10.12.0";

export function isConfigured() {
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_")
  );
}

let _db = null;
let _fs = null; // firestore 함수 모음

async function db() {
  if (_db) return _db;
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  _fs = await import(`${SDK}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  _db = _fs.getFirestore(app);
  return _db;
}

// ── 퍼즐(문제) 불러오기 ───────────────────────────────────────────────
// 반환: { title, words:[{answer, clue}], updatedAt }
export async function loadPuzzle() {
  if (!isConfigured()) {
    const raw = localStorage.getItem("tna_puzzle");
    return raw ? JSON.parse(raw) : structuredClone(DEFAULT_PUZZLE);
  }
  try {
    const database = await db();
    const ref = _fs.doc(database, "puzzle", "current");
    const snap = await _fs.getDoc(ref);
    if (snap.exists()) return snap.data();
    // 최초 1회: 기본 퍼즐로 시드
    await savePuzzle(DEFAULT_PUZZLE);
    return structuredClone(DEFAULT_PUZZLE);
  } catch (e) {
    // Firestore 미생성/규칙 미게시/네트워크 오류 시에도 퍼즐은 보이도록 기본값 사용
    console.warn("Firestore 퍼즐 로드 실패 — 기본 퍼즐로 표시합니다.", e);
    return structuredClone(DEFAULT_PUZZLE);
  }
}

// ── 퍼즐 저장(관리자) ─────────────────────────────────────────────────
export async function savePuzzle(puzzle) {
  const data = {
    title: puzzle.title || "가로세로 낱말퀴즈",
    words: puzzle.words || [],
    hintEnabled: puzzle.hintEnabled !== false, // 기본값 ON
    updatedAt: Date.now(),
  };
  if (!isConfigured()) {
    localStorage.setItem("tna_puzzle", JSON.stringify(data));
    return;
  }
  const database = await db();
  const ref = _fs.doc(database, "puzzle", "current");
  await _fs.setDoc(ref, data);
}

// ── 정답 제출 기록 추가(플레이어) ─────────────────────────────────────
// record: { name, department, durationMs }
// 반환: { id }
export async function addSubmission(record) {
  if (!isConfigured()) {
    const list = JSON.parse(localStorage.getItem("tna_subs") || "[]");
    const item = {
      ...record,
      createdAt: Date.now(),
      id: "local-" + Date.now(),
    };
    list.push(item);
    localStorage.setItem("tna_subs", JSON.stringify(list));
    return { id: item.id };
  }
  const database = await db();
  const col = _fs.collection(database, "submissions");
  const docRef = await _fs.addDoc(col, {
    name: record.name,
    department: record.department,
    durationMs: record.durationMs ?? null,
    createdAt: _fs.serverTimestamp(), // 서버 기준 시각 = 선착순 정렬 기준
  });
  return { id: docRef.id };
}

// ── 제출 로그 전체 삭제(관리자) — 순위 초기화 ─────────────────────────
export async function clearSubmissions() {
  if (!isConfigured()) {
    localStorage.removeItem("tna_subs");
    return;
  }
  const database = await db();
  const col = _fs.collection(database, "submissions");
  const snap = await _fs.getDocs(col);
  // 문서를 하나씩 삭제(소규모 행사 기준으로 충분)
  await Promise.all(snap.docs.map((d) => _fs.deleteDoc(d.ref)));
}

// ── 제출 로그 전체 조회(관리자) — 제출 시각 오름차순(선착순) ──────────
export async function listSubmissions() {
  if (!isConfigured()) {
    const list = JSON.parse(localStorage.getItem("tna_subs") || "[]");
    return list
      .map((x) => ({ ...x, createdAtMs: x.createdAt }))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }
  const database = await db();
  const col = _fs.collection(database, "submissions");
  const q = _fs.query(col, _fs.orderBy("createdAt", "asc"));
  const snap = await _fs.getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.createdAt;
    return {
      id: d.id,
      name: data.name,
      department: data.department,
      durationMs: data.durationMs,
      createdAtMs: ts && ts.toMillis ? ts.toMillis() : null,
    };
  });
}
