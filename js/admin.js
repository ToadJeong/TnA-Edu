// admin.js — 관리자 페이지 (비주얼 에디터 + 선착순 로그 + 랜덤 뽑기)
import {
  buildLayout,
  renderGrid,
  packComponents,
  splitSyllables,
} from "./crossword.js";
import {
  loadPuzzle,
  savePuzzle,
  listSubmissions,
  clearSubmissions,
  isConfigured,
} from "./store.js";
import { ADMIN_PASSWORD } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

// ── 에디터 상태 ───────────────────────────────────────────────────────
let editorWords = []; // [{answer, clue, dir, row, col}]
let hintEnabled = true;

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

function renderPreview() {
  const { layout, bad, msgs } = analyze(editorWords);
  const r = renderGrid(layout, { interactive: false, reveal: true });
  // 충돌 칸 표시
  for (const k of bad) {
    const inp = r.inputs.get(k);
    if (inp) inp.parentElement.classList.add("cw-conflict");
  }
  $("preview").innerHTML = "";
  $("preview").appendChild(r.gridEl);
  $("conflictWarn").innerHTML = msgs.length
    ? `<div class="conflict-warn">⚠️ ${msgs.join("<br>")}</div>`
    : "";
}

// 단어 목록 행 렌더
function renderWordList() {
  const list = $("wordList");
  list.innerHTML = "";
  editorWords.forEach((w, idx) => {
    const row = document.createElement("div");
    row.className = "word-row";

    const ans = document.createElement("input");
    ans.type = "text";
    ans.value = w.answer;
    ans.placeholder = "정답";
    ans.addEventListener("input", () => {
      w.answer = ans.value;
      renderPreview();
    });

    const clue = document.createElement("input");
    clue.type = "text";
    clue.value = w.clue;
    clue.placeholder = "힌트(설명)";
    clue.addEventListener("input", () => {
      w.clue = clue.value;
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

    row.append(ans, clue, dir, nudge, pos, rm);
    list.appendChild(row);
  });
}

function addWord() {
  editorWords.push({ answer: "", clue: "", dir: "across", row: 0, col: 0 });
  renderWordList();
  renderPreview();
}

function arrange() {
  editorWords = packComponents(editorWords, { maxWidth: 13 }).map((w) => ({
    answer: w.answer,
    clue: w.clue,
    dir: w.dir,
    row: w.row,
    col: w.col,
  }));
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
    await savePuzzle({
      title: $("puzzleTitle").value.trim(),
      hintEnabled,
      words,
    });
    setStatus("saveStatus", "저장되었습니다. 참가자 화면에 즉시 반영됩니다.", "ok");
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
    lastLog = await listSubmissions();
    renderLog();
    setStatus("logStatus", `총 ${lastLog.length}명 제출`, "");
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
  if (!confirm("정답 로그(순위)를 모두 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?"))
    return;
  setStatus("logStatus", "초기화 중…", "");
  try {
    await clearSubmissions();
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

// ── 진입 ──────────────────────────────────────────────────────────────
async function enterAdmin() {
  $("loginCard").classList.add("hidden");
  $("adminBody").classList.remove("hidden");
  if (!isConfigured()) $("demoBanner").classList.remove("hidden");
  const puzzle = await loadPuzzle();
  $("puzzleTitle").value = puzzle.title || "";
  hintEnabled = puzzle.hintEnabled !== false;
  $("hintToggle").checked = hintEnabled;
  editorWords = (puzzle.words || []).map((w) => ({
    answer: w.answer || "",
    clue: w.clue || "",
    dir: w.dir === "down" ? "down" : "across",
    row: Number.isFinite(w.row) ? w.row : 0,
    col: Number.isFinite(w.col) ? w.col : 0,
  }));
  // 좌표가 없던(자동배치) 데이터면 한번 정렬해 좌표 부여
  if (editorWords.some((w) => !Number.isFinite(w.row))) arrange();
  renderWordList();
  renderPreview();
  await loadLog();
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
