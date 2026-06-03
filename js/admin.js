// admin.js — 관리자 페이지 (비주얼 에디터 + 선착순 로그 + 랜덤 뽑기)
import {
  buildLayout,
  renderGrid,
  packComponents,
  splitSyllables,
} from "./crossword.js?v=23";
import {
  listPuzzles,
  loadPuzzle,
  createPuzzle,
  updatePuzzle,
  deletePuzzle,
  getActiveId,
  setActiveId,
  listSubmissions,
  clearSubmissions,
  isConfigured,
} from "./store.js?v=23";
import { ADMIN_PASSWORD } from "./firebase-config.js?v=23";

const $ = (id) => document.getElementById(id);

// ── 에디터 상태 ───────────────────────────────────────────────────────
let editorWords = []; // [{answer, clue, dir, row, col}]
let hintEnabled = true;
let currentPuzzleId = null; // 편집 중 퍼즐
let activeId = null; // 진행 중 퍼즐

// 서로 교차하지 않는데 칸이 맞붙은 곳 + 글자 충돌을 찾아 표시용 Set/메시지 반환
function analyze(words) {
  const layout = buildLayout(words);
  const cellWords = new Map(); // "r,c" -> [placed...]
  for (const p of layout.placed)
    for (const cell of p.cells) {
      const k = cell.r + "," + cell.c;
      if (!cellWords.has(k)) cellWords.set(k, []);
      cellWords.get(k).push(p);
    }
  const bad = new Set();
  const msgs = [];
  // 1) 무관한 단어가 맞붙은 경우
  for (const [k, ws] of cellWords) {
    const [r, c] = k.split(",").map(Number);
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const nk = r + dr + "," + (c + dc);
      const ns = cellWords.get(nk);
      if (!ns) continue;
      if (!ws.some((p) => ns.includes(p))) {
        bad.add(k);
        bad.add(nk);
      }
    }
  }
  if (bad.size > 0)
    msgs.push("서로 이어지지 않는 단어가 맞붙어 있습니다(빨간 칸). 위치를 옮기거나 🧩 자동 정렬을 누르세요.");

  // 2) 교차 지점 글자 불일치
  const chAt = new Map();
  for (const w of words) {
    if (!w.answer || !(w.dir === "across" || w.dir === "down")) continue;
    const dr = w.dir === "down" ? 1 : 0,
      dc = w.dir === "across" ? 1 : 0;
    splitSyllables(w.answer).forEach((ch, i) => {
      const k = w.row + dr * i + "," + (w.col + dc * i);
      if (chAt.has(k) && chAt.get(k) !== ch)
        msgs.push(`교차 지점 글자가 어긋납니다: "${w.answer}"`);
      else chAt.set(k, ch);
    });
  }
  return { layout, bad, msgs: [...new Set(msgs)] };
}

// 정규화 좌표 기준 "칸 -> 그 칸을 지나는 단어 index 목록"
function normCellMap(words) {
  let minR = Infinity,
    minC = Infinity;
  const cellsList = words.map((w) => {
    if (!w.answer || !(w.dir === "across" || w.dir === "down")) return [];
    const dr = w.dir === "down" ? 1 : 0,
      dc = w.dir === "across" ? 1 : 0;
    return splitSyllables(w.answer).map((ch, i) => ({
      r: w.row + dr * i,
      c: w.col + dc * i,
    }));
  });
  for (const cells of cellsList)
    for (const cl of cells) {
      minR = Math.min(minR, cl.r);
      minC = Math.min(minC, cl.c);
    }
  if (!isFinite(minR)) {
    minR = 0;
    minC = 0;
  }
  const byKey = new Map();
  cellsList.forEach((cells, idx) =>
    cells.forEach((cl) => {
      const k = cl.r - minR + "," + (cl.c - minC);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(idx);
    })
  );
  return byKey;
}

// 드래그 상태(미리보기 재생성과 무관하게 유지되도록 모듈 스코프)
let drag = null;
function onDragMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (drag.sel === null) {
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    const wantDown = Math.abs(dy) > Math.abs(dx);
    let pick = drag.cands.find(
      (i) => editorWords[i].dir === (wantDown ? "down" : "across")
    );
    if (pick === undefined) pick = drag.cands[0];
    drag.sel = pick;
    drag.orig = { row: editorWords[pick].row, col: editorWords[pick].col };
  }
  const w = editorWords[drag.sel];
  const nr = drag.orig.row + Math.round(dy / drag.size);
  const nc = drag.orig.col + Math.round(dx / drag.size);
  if (w.row !== nr || w.col !== nc) {
    w.row = nr;
    w.col = nc;
    renderPreview();
  }
}
function onDragUp() {
  window.removeEventListener("pointermove", onDragMove);
  drag = null;
  renderWordList();
}

function renderPreview() {
  const { layout, bad, msgs } = analyze(editorWords);
  const r = renderGrid(layout, {
    interactive: false,
    reveal: true,
    dirTint: true,
  });
  for (const k of bad) {
    const inp = r.inputs.get(k);
    if (inp) inp.parentElement.classList.add("cw-conflict");
  }
  // 마우스 드래그로 단어 통째로 이동
  r.gridEl.classList.add("cw-draggable");
  const byKey = normCellMap(editorWords);
  r.gridEl.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (!t.classList.contains("cw-input")) return;
    const cands = (byKey.get(t.dataset.r + "," + t.dataset.c) || []).slice();
    if (cands.length === 0) return;
    e.preventDefault();
    const rect = t.getBoundingClientRect();
    drag = {
      cands,
      sel: cands.length === 1 ? cands[0] : null,
      x0: e.clientX,
      y0: e.clientY,
      size: rect.width || 44,
      orig:
        cands.length === 1
          ? { row: editorWords[cands[0]].row, col: editorWords[cands[0]].col }
          : null,
    };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp, { once: true });
  });

  $("preview").innerHTML = "";
  $("preview").appendChild(r.gridEl);
  $("conflictWarn").innerHTML = msgs.length
    ? `<div class="conflict-warn">⚠️ ${msgs.join("<br>")}</div>`
    : "";
}

// 단어 목록 행 렌더 (카드형 — 힌트는 전체 너비 여러 줄로 잘리지 않게)
function renderWordList() {
  const list = $("wordList");
  list.innerHTML = "";
  editorWords.forEach((w, idx) => {
    const card = document.createElement("div");
    card.className = "word-card";

    const top = document.createElement("div");
    top.className = "wc-top";

    const ans = document.createElement("input");
    ans.type = "text";
    ans.className = "ans";
    ans.value = w.answer;
    ans.placeholder = "정답";
    ans.addEventListener("input", () => {
      w.answer = ans.value;
      renderPreview();
    });

    const dir = document.createElement("button");
    dir.className = "dirbtn" + (w.dir === "down" ? " down" : "");
    dir.textContent = w.dir === "down" ? "세로" : "가로";
    dir.title = "방향 바꾸기";
    dir.addEventListener("click", () => {
      w.dir = w.dir === "down" ? "across" : "down";
      renderWordList();
      renderPreview();
    });

    const nudge = document.createElement("span");
    nudge.className = "nudge";
    const mk = (label, dr, dc) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", () => {
        w.row += dr;
        w.col += dc;
        renderPreview();
        updatePos();
      });
      return b;
    };
    nudge.append(mk("◀", 0, -1), mk("▲", -1, 0), mk("▼", 1, 0), mk("▶", 0, 1));

    const pos = document.createElement("span");
    pos.className = "muted";
    pos.style.fontSize = "12px";
    function updatePos() {
      pos.textContent = `행${w.row} 열${w.col}`;
    }
    updatePos();

    const rm = document.createElement("button");
    rm.className = "rm";
    rm.textContent = "삭제";
    rm.addEventListener("click", () => {
      editorWords.splice(idx, 1);
      renderWordList();
      renderPreview();
    });

    top.append(ans, dir, nudge, pos, rm);

    const clueWrap = document.createElement("div");
    clueWrap.className = "wc-clue";
    const clue = document.createElement("textarea");
    clue.rows = 2;
    clue.value = w.clue;
    clue.placeholder = "힌트(설명) — 길게 적어도 잘리지 않습니다";
    clue.addEventListener("input", () => {
      w.clue = clue.value;
    });
    clueWrap.append(clue);

    card.append(top, clueWrap);
    list.appendChild(card);
  });
}

function addWord() {
  editorWords.push({ answer: "", clue: "", dir: "across", row: 0, col: 0 });
  renderWordList();
  renderPreview();
}

// 자동 정렬: 단어를 글자 교차로 맞물리게(십자말풀이) 새로 만들고,
// 클러스터를 여러 폭으로 묶어 가로:세로 비율이 설정값을 넘지 않도록 균형 배치.
// 누를 때마다 랜덤이라 매번 다른 배치가 나온다.
function arrange() {
  const base = editorWords
    .filter((w) => w.answer && w.answer.trim())
    .map((w) => ({ answer: w.answer.trim(), clue: w.clue }));
  if (base.length === 0) return;
  const maxRatio = Math.max(1, parseFloat($("maxRatio").value) || 1.6);

  const toWords = (placedOrWords) =>
    placedOrWords.map((p) => ({
      answer: p.answer,
      clue: p.clue,
      dir: p.dir,
      row: p.row,
      col: p.col,
    }));

  let best = null; // 전체 중 최소 점수(폴백)
  let within = null; // maxRatio 이내 중 최소 점수
  for (let t = 0; t < 16; t++) {
    const auto = buildLayout(base, { random: true });
    const autoWords = toWords(auto.placed);
    const totalCells = auto.placed.reduce((s, p) => s + p.cells.length, 0);
    const widths = new Set();
    for (let f = 0.8; f <= 2.4; f += 0.2)
      widths.add(Math.max(4, Math.round(Math.sqrt(totalCells) * f)));
    for (const W of widths) {
      const packed = packComponents(autoWords, { maxWidth: W });
      const L = buildLayout(packed);
      const lo = Math.max(1, Math.min(L.rows, L.cols));
      const ratio = Math.max(L.rows, L.cols) / lo;
      const score = Math.abs(ratio - 1) + (L.rows * L.cols) / 900;
      const cand = { score, ratio, words: toWords(packed) };
      if (!best || score < best.score) best = cand;
      if (ratio <= maxRatio && (!within || score < within.score)) within = cand;
    }
  }
  editorWords = (within || best).words;
  renderWordList();
  renderPreview();
}

async function doSave() {
  const words = editorWords.filter((w) => w.answer && w.answer.trim());
  if (words.length === 0) {
    setStatus("saveStatus", "단어를 한 개 이상 입력해주세요.", "bad");
    return;
  }
  setStatus("saveStatus", "저장 중…", "");
  try {
    await updatePuzzle(currentPuzzleId, {
      title: $("puzzleTitle").value.trim() || "제목 없는 퍼즐",
      hintEnabled,
      hintLimit: Math.max(0, parseInt($("hintLimit").value, 10) || 0),
      words,
    });
    setStatus("saveStatus", "저장되었습니다.", "ok");
    await refreshPuzzleSelect(); // 제목 변경 반영
  } catch (e) {
    console.error(e);
    setStatus("saveStatus", "저장 실패: " + e.message, "bad");
  }
}

// ── 로그 / 뽑기 ───────────────────────────────────────────────────────
let lastLog = [];
let sortMode = "order";

function sortedLog() {
  if (sortMode === "time")
    return [...lastLog].sort(
      (a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity)
    );
  return lastLog;
}

async function loadLog() {
  setStatus("logStatus", "불러오는 중…", "");
  try {
    lastLog = await listSubmissions(currentPuzzleId);
    renderLog();
    setStatus("logStatus", `이 퍼즐 제출 ${lastLog.length}명`, "");
  } catch (e) {
    console.error(e);
    setStatus("logStatus", "로그 조회 실패: " + e.message, "");
  }
}

function renderLog() {
  const subs = sortedLog();
  const body = $("logBody");
  if (subs.length === 0) {
    body.innerHTML =
      '<tr><td colspan="5" class="muted">아직 제출된 정답이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = subs
    .map(
      (s, i) => `
    <tr class="${i === 0 ? "first" : ""}">
      <td><span class="rank-badge">${i + 1}</span>${i === 0 ? " 🏆" : ""}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.department)}</td>
      <td>${fmtTime(s.createdAtMs)}</td>
      <td>${fmtDuration(s.durationMs)}</td>
    </tr>`
    )
    .join("");
}

async function resetLog() {
  if (
    !confirm("이 퍼즐의 정답 로그(순위)를 모두 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?")
  )
    return;
  setStatus("logStatus", "초기화 중…", "");
  try {
    await clearSubmissions(currentPuzzleId);
    lastLog = [];
    renderLog();
    $("drawBox").classList.add("hidden");
    setStatus("logStatus", "순위가 초기화되었습니다.", "");
  } catch (e) {
    console.error(e);
    setStatus("logStatus", "초기화 실패: " + e.message, "");
  }
}

// 제출자 중 랜덤 당첨자 뽑기(룰렛 느낌의 짧은 연출 후 확정)
function drawWinner() {
  if (lastLog.length === 0) {
    setStatus("logStatus", "제출자가 없습니다.", "");
    return;
  }
  const box = $("drawBox");
  box.classList.remove("hidden");
  let ticks = 0;
  const spin = setInterval(() => {
    const r = lastLog[Math.floor(Math.random() * lastLog.length)];
    $("winnerName").textContent = r.name;
    $("winnerDept").textContent = r.department;
    if (++ticks > 16) {
      clearInterval(spin);
      const win = lastLog[Math.floor(Math.random() * lastLog.length)];
      $("winnerName").textContent = "🎉 " + win.name;
      $("winnerDept").textContent = win.department;
    }
  }, 80);
}

function downloadCsv() {
  const list = sortedLog();
  if (list.length === 0) return;
  const rows = [["순위", "이름", "소속/부서", "제출시각", "풀이시간(초)"]];
  list.forEach((s, i) => {
    rows.push([
      i + 1,
      s.name,
      s.department,
      fmtTime(s.createdAtMs),
      s.durationMs != null ? Math.round(s.durationMs / 1000) : "",
    ]);
  });
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `정답로그_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── 유틸 ──────────────────────────────────────────────────────────────
function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtDuration(ms) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`;
}
function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function setStatus(id, msg, kind) {
  const el = $(id);
  el.textContent = msg;
  el.className = (id === "logStatus" ? "muted " : "status ") + (kind || "");
}

// ── 퍼즐 선택/관리 ─────────────────────────────────────────────────────
async function refreshPuzzleSelect() {
  const list = await listPuzzles();
  activeId = await getActiveId();
  const sel = $("puzzleSelect");
  sel.innerHTML = list
    .map(
      (p) =>
        `<option value="${p.id}">${p.id === activeId ? "▶ " : ""}${escapeHtml(
          p.title
        )}</option>`
    )
    .join("");
  if (!currentPuzzleId || !list.find((p) => p.id === currentPuzzleId))
    currentPuzzleId = (list[0] && list[0].id) || null;
  sel.value = currentPuzzleId || "";
  updateActiveBadge();
  return list;
}
function updateActiveBadge() {
  const isActive = currentPuzzleId && currentPuzzleId === activeId;
  $("activeBadge").textContent = isActive
    ? "✅ 지금 진행 중인 퍼즐"
    : "이 퍼즐은 진행 중이 아닙니다";
  $("activeBadge").className = "muted" + (isActive ? " is-active" : "");
}

async function selectPuzzle(id) {
  currentPuzzleId = id;
  const puzzle = await loadPuzzle(id);
  $("puzzleTitle").value = puzzle.title || "";
  hintEnabled = puzzle.hintEnabled !== false;
  $("hintToggle").checked = hintEnabled;
  $("hintLimit").value = Number.isFinite(puzzle.hintLimit) ? puzzle.hintLimit : 3;
  editorWords = (puzzle.words || []).map((w) => ({
    answer: w.answer || "",
    clue: w.clue || "",
    dir: w.dir === "down" ? "down" : "across",
    row: Number.isFinite(w.row) ? w.row : 0,
    col: Number.isFinite(w.col) ? w.col : 0,
  }));
  if (editorWords.length && editorWords.some((w) => !Number.isFinite(w.row)))
    arrange();
  updateActiveBadge();
  renderWordList();
  renderPreview();
  await loadLog();
}

async function newPuzzle() {
  const id = await createPuzzle({ title: "새 퍼즐", words: [], hintEnabled: true });
  await refreshPuzzleSelect();
  $("puzzleSelect").value = id;
  await selectPuzzle(id);
  $("puzzleTitle").focus();
}

async function removePuzzle() {
  const list = await listPuzzles();
  if (list.length <= 1) {
    setStatus("saveStatus", "마지막 퍼즐은 삭제할 수 없어요.", "bad");
    return;
  }
  if (!confirm("이 퍼즐을 삭제할까요? 되돌릴 수 없습니다.")) return;
  await deletePuzzle(currentPuzzleId);
  if (activeId === currentPuzzleId) {
    const rest = list.filter((p) => p.id !== currentPuzzleId);
    if (rest[0]) await setActiveId(rest[0].id);
  }
  currentPuzzleId = null;
  await refreshPuzzleSelect();
  await selectPuzzle($("puzzleSelect").value);
}

async function activatePuzzle() {
  if (!currentPuzzleId) return;
  await setActiveId(currentPuzzleId);
  activeId = currentPuzzleId;
  await refreshPuzzleSelect();
  setStatus("saveStatus", "이 퍼즐을 진행 중으로 설정했습니다.", "ok");
}

// ── 진입 ──────────────────────────────────────────────────────────────
async function enterAdmin() {
  $("loginCard").classList.add("hidden");
  $("adminBody").classList.remove("hidden");
  if (!isConfigured()) $("demoBanner").classList.remove("hidden");
  const list = await refreshPuzzleSelect();
  // 진행 중 퍼즐을 우선 편집 대상으로
  const startId = (activeId && list.find((p) => p.id === activeId) && activeId) ||
    (list[0] && list[0].id);
  $("puzzleSelect").value = startId;
  await selectPuzzle(startId);
}

function init() {
  $("loginBtn").addEventListener("click", () => {
    if ($("pw").value === ADMIN_PASSWORD) enterAdmin();
    else setStatus("loginStatus", "비밀번호가 올바르지 않습니다.", "bad");
  });
  $("pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("loginBtn").click();
  });
  $("hintToggle").addEventListener("change", (e) => {
    hintEnabled = e.target.checked;
  });
  $("puzzleSelect").addEventListener("change", (e) => selectPuzzle(e.target.value));
  $("newPuzzleBtn").addEventListener("click", newPuzzle);
  $("deletePuzzleBtn").addEventListener("click", removePuzzle);
  $("activateBtn").addEventListener("click", activatePuzzle);
  $("addWordBtn").addEventListener("click", addWord);
  $("arrangeBtn").addEventListener("click", arrange);
  $("saveBtn").addEventListener("click", doSave);
  $("refreshBtn").addEventListener("click", loadLog);
  $("csvBtn").addEventListener("click", downloadCsv);
  $("drawBtn").addEventListener("click", drawWinner);
  $("resetBtn").addEventListener("click", resetLog);
  $("sortSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-sort]");
    if (!btn) return;
    sortMode = btn.dataset.sort;
    $("sortSeg")
      .querySelectorAll("button")
      .forEach((b) => b.classList.toggle("active", b === btn));
    renderLog();
  });
}

init();
