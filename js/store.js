// store.js
// 데이터 저장 추상화 (Firebase Firestore, 미설정 시 localStorage 폴백)
// 여러 개의 퍼즐을 만들고, 그중 하나를 "진행 중(active)"으로 지정할 수 있다.
//   puzzles/{id}      : { title, words, hintEnabled, updatedAt }
//   config/active     : { activeId }
//   submissions/{id}  : { name, department, durationMs, puzzleId, createdAt }

import { firebaseConfig } from "./firebase-config.js?v=17";
import { DEFAULT_PUZZLE } from "../data/sample-puzzle.js?v=17";

const SDK = "https://www.gstatic.com/firebasejs/10.12.0";

export function isConfigured() {
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_")
  );
}

let _db = null;
let _fs = null;
async function db() {
  if (_db) return _db;
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  _fs = await import(`${SDK}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  _db = _fs.getFirestore(app);
  return _db;
}

const norm = (p) => ({
  title: (p && p.title) || "제목 없는 퍼즐",
  words: (p && p.words) || [],
  hintEnabled: !p || p.hintEnabled !== false,
});

// ── 로컬 폴백 헬퍼 ─────────────────────────────────────────────────────
const lsGet = () => JSON.parse(localStorage.getItem("tna_puzzles") || "[]");
const lsSet = (a) => localStorage.setItem("tna_puzzles", JSON.stringify(a));
const uid = () => "p" + Date.now() + Math.floor(Math.random() * 1000);

// ── 퍼즐 목록 ──────────────────────────────────────────────────────────
export async function listPuzzles() {
  if (!isConfigured()) {
    let arr = lsGet();
    if (arr.length === 0) {
      const id = uid();
      arr = [{ id, ...norm(DEFAULT_PUZZLE), updatedAt: Date.now() }];
      lsSet(arr);
      localStorage.setItem("tna_activeId", id);
    }
    return arr.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt || 0 }));
  }
  try {
    const d = await db();
    const snap = await _fs.getDocs(_fs.collection(d, "puzzles"));
    let list = snap.docs.map((x) => ({
      id: x.id,
      title: x.data().title || "제목 없는 퍼즐",
      updatedAt: x.data().updatedAt || 0,
    }));
    if (list.length === 0) {
      const id = await createPuzzle(DEFAULT_PUZZLE);
      await setActiveId(id);
      list = [{ id, title: DEFAULT_PUZZLE.title, updatedAt: Date.now() }];
    }
    list.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    return list;
  } catch (e) {
    console.warn("퍼즐 목록 로드 실패 — 기본 퍼즐 사용", e);
    return [{ id: "_default", title: DEFAULT_PUZZLE.title, updatedAt: 0 }];
  }
}

export async function loadPuzzle(id) {
  if (!isConfigured()) {
    const arr = lsGet();
    const p = arr.find((x) => x.id === id) || arr[0];
    return p ? norm(p) : structuredClone(DEFAULT_PUZZLE);
  }
  if (!id || id === "_default") return structuredClone(DEFAULT_PUZZLE);
  try {
    const d = await db();
    const snap = await _fs.getDoc(_fs.doc(d, "puzzles", id));
    return snap.exists() ? snap.data() : structuredClone(DEFAULT_PUZZLE);
  } catch (e) {
    console.warn("퍼즐 로드 실패 — 기본 퍼즐 사용", e);
    return structuredClone(DEFAULT_PUZZLE);
  }
}

export async function createPuzzle(data) {
  const p = { ...norm(data), updatedAt: Date.now() };
  if (!isConfigured()) {
    const arr = lsGet();
    const id = uid();
    arr.push({ id, ...p });
    lsSet(arr);
    return id;
  }
  const d = await db();
  const ref = await _fs.addDoc(_fs.collection(d, "puzzles"), p);
  return ref.id;
}

export async function updatePuzzle(id, data) {
  const p = { ...norm(data), updatedAt: Date.now() };
  if (!isConfigured()) {
    const arr = lsGet();
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr[i] = { id, ...p };
    else arr.push({ id, ...p });
    lsSet(arr);
    return;
  }
  const d = await db();
  await _fs.setDoc(_fs.doc(d, "puzzles", id), p);
}

export async function deletePuzzle(id) {
  if (!isConfigured()) {
    lsSet(lsGet().filter((x) => x.id !== id));
    if (localStorage.getItem("tna_activeId") === id)
      localStorage.removeItem("tna_activeId");
    return;
  }
  const d = await db();
  await _fs.deleteDoc(_fs.doc(d, "puzzles", id));
}

// ── 진행 중(active) 퍼즐 ───────────────────────────────────────────────
export async function getActiveId() {
  if (!isConfigured()) return localStorage.getItem("tna_activeId") || null;
  try {
    const d = await db();
    const s = await _fs.getDoc(_fs.doc(d, "config", "active"));
    return s.exists() ? s.data().activeId : null;
  } catch (_) {
    return null;
  }
}
export async function setActiveId(id) {
  if (!isConfigured()) {
    localStorage.setItem("tna_activeId", id);
    return;
  }
  const d = await db();
  await _fs.setDoc(_fs.doc(d, "config", "active"), { activeId: id });
}

// 참가자: 진행 중 퍼즐 → { id, title, words, hintEnabled }
export async function loadActivePuzzle() {
  const list = await listPuzzles();
  if (list.length === 0) return { id: null, ...structuredClone(DEFAULT_PUZZLE) };
  let id = await getActiveId();
  if (!id || !list.find((p) => p.id === id)) {
    id = list[0].id;
    try {
      await setActiveId(id);
    } catch (_) {}
  }
  const data = await loadPuzzle(id);
  return { id, ...data };
}

// ── 정답 제출 ──────────────────────────────────────────────────────────
export async function addSubmission(record) {
  if (!isConfigured()) {
    const list = JSON.parse(localStorage.getItem("tna_subs") || "[]");
    const item = { ...record, createdAt: Date.now(), id: "local-" + Date.now() };
    list.push(item);
    localStorage.setItem("tna_subs", JSON.stringify(list));
    return { id: item.id };
  }
  const d = await db();
  const ref = await _fs.addDoc(_fs.collection(d, "submissions"), {
    name: record.name,
    department: record.department,
    durationMs: record.durationMs ?? null,
    puzzleId: record.puzzleId || null,
    createdAt: _fs.serverTimestamp(),
  });
  return { id: ref.id };
}

// puzzleId 주어지면 그 퍼즐 제출만, 없으면 전체. 제출 시각 오름차순(선착순).
export async function listSubmissions(puzzleId) {
  if (!isConfigured()) {
    let list = JSON.parse(localStorage.getItem("tna_subs") || "[]").map((x) => ({
      ...x,
      createdAtMs: x.createdAt,
    }));
    if (puzzleId) list = list.filter((s) => s.puzzleId === puzzleId);
    return list.sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
  }
  const d = await db();
  const snap = await _fs.getDocs(_fs.collection(d, "submissions"));
  let list = snap.docs.map((x) => {
    const data = x.data();
    const ts = data.createdAt;
    return {
      id: x.id,
      name: data.name,
      department: data.department,
      durationMs: data.durationMs,
      puzzleId: data.puzzleId || null,
      createdAtMs: ts && ts.toMillis ? ts.toMillis() : null,
    };
  });
  if (puzzleId) list = list.filter((s) => s.puzzleId === puzzleId);
  return list.sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
}

// puzzleId 주어지면 그 퍼즐 로그만 삭제, 없으면 전체 삭제
export async function clearSubmissions(puzzleId) {
  if (!isConfigured()) {
    if (!puzzleId) {
      localStorage.removeItem("tna_subs");
      return;
    }
    const list = JSON.parse(localStorage.getItem("tna_subs") || "[]").filter(
      (s) => s.puzzleId !== puzzleId
    );
    localStorage.setItem("tna_subs", JSON.stringify(list));
    return;
  }
  const d = await db();
  const snap = await _fs.getDocs(_fs.collection(d, "submissions"));
  const targets = snap.docs.filter(
    (x) => !puzzleId || (x.data().puzzleId || null) === puzzleId
  );
  await Promise.all(targets.map((x) => _fs.deleteDoc(x.ref)));
}
