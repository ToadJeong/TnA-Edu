// admin.js — 관리자 페이지 로직 (문제 편집 + 정답 로그 조회)
import { buildLayout, renderGrid } from "./crossword.js";
import {
  loadPuzzle,
  savePuzzle,
  listSubmissions,
  isConfigured,
} from "./store.js";
import { ADMIN_PASSWORD } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

// ── 문제 텍스트 ↔ 단어배열 변환 ──────────────────────────────────────
// 두 가지 입력 형식을 지원합니다.
//  1) 자동 배치(간단)  :  정답, 힌트
//        - 글자가 겹치는 곳을 자동으로 찾아 교차 배치합니다.
//  2) 수동 배치(인쇄본과 동일):  정답 | 힌트 | 방향 | 행 | 열 | 번호
//        - 방향은 "가로" 또는 "세로", 행/열/번호는 숫자.
//        - 힌트에 쉼표(,)가 들어가도 됩니다(구분자는 | 이므로).
// 텍스트 안에 '|' 가 하나라도 있으면 전체를 수동 배치 형식으로 해석합니다.
function parseWords(text) {
  const usePipe = text.includes("|");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (usePipe) {
        const p = line.split("|").map((s) => s.trim());
        const dirKo = p[2] || "";
        const word = { answer: p[0] || "", clue: p[1] || "" };
        if (dirKo === "가로" || dirKo === "세로") {
          word.dir = dirKo === "세로" ? "down" : "across";
          word.row = Number(p[3]);
          word.col = Number(p[4]);
          if (p[5] !== undefined && p[5] !== "") word.num = Number(p[5]);
        }
        return word;
      }
      // 쉼표 형식: 첫 번째 쉼표까지가 정답, 나머지는 힌트
      const i = line.indexOf(",");
      if (i === -1) return { answer: line, clue: "" };
      return { answer: line.slice(0, i).trim(), clue: line.slice(i + 1).trim() };
    })
    .filter((w) => w.answer.length > 0);
}

function wordsToText(words) {
  const list = words || [];
  // 좌표가 지정된 단어가 하나라도 있으면 수동 배치(파이프) 형식으로 출력
  const manual = list.some(
    (w) => w.dir && Number.isFinite(w.row) && Number.isFinite(w.col)
  );
  if (manual) {
    return list
      .map((w) => {
        const dirKo = w.dir === "down" ? "세로" : "가로";
        return [w.answer, w.clue || "", dirKo, w.row, w.col, w.num ?? ""].join(
          " | "
        );
      })
      .join("\n");
  }
  return list.map((w) => (w.clue ? `${w.answer}, ${w.clue}` : w.answer)).join("\n");
}

function renderPreview() {
  const words = parseWords($("wordsArea").value);
  const layout = buildLayout(words);
  const r = renderGrid(layout, { interactive: false, reveal: true });
  $("preview").innerHTML = "";
  $("preview").appendChild(r.gridEl);
}

async function doSave() {
  const words = parseWords($("wordsArea").value);
  if (words.length === 0) {
    setStatus("saveStatus", "단어를 한 개 이상 입력해주세요.", "bad");
    return;
  }
  setStatus("saveStatus", "저장 중…", "");
  try {
    await savePuzzle({ title: $("puzzleTitle").value.trim(), words });
    setStatus("saveStatus", "저장되었습니다. 플레이어 화면에 즉시 반영됩니다.", "ok");
    renderPreview();
  } catch (e) {
    console.error(e);
    setStatus("saveStatus", "저장 실패: " + e.message, "bad");
  }
}

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

let lastLog = [];

async function loadLog() {
  setStatus("logStatus", "불러오는 중…", "");
  try {
    const subs = await listSubmissions(); // 이미 선착순 정렬됨
    lastLog = subs;
    const body = $("logBody");
    if (subs.length === 0) {
      body.innerHTML =
        '<tr><td colspan="5" class="muted">아직 제출된 정답이 없습니다.</td></tr>';
    } else {
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
    setStatus("logStatus", `총 ${subs.length}명 제출`, "");
  } catch (e) {
    console.error(e);
    setStatus("logStatus", "로그 조회 실패: " + e.message, "");
  }
}

function downloadCsv() {
  if (lastLog.length === 0) return;
  const rows = [["순위", "이름", "소속/부서", "제출시각", "소요시간(초)"]];
  lastLog.forEach((s, i) => {
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

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function setStatus(id, msg, kind) {
  const el = $(id);
  el.textContent = msg;
  el.className = (id === "logStatus" ? "muted " : "status ") + (kind || "");
}

async function enterAdmin() {
  $("loginCard").classList.add("hidden");
  $("adminBody").classList.remove("hidden");
  if (!isConfigured()) $("demoBanner").classList.remove("hidden");
  const puzzle = await loadPuzzle();
  $("puzzleTitle").value = puzzle.title || "";
  $("wordsArea").value = wordsToText(puzzle.words);
  renderPreview();
  await loadLog();
}

function init() {
  $("loginBtn").addEventListener("click", () => {
    if ($("pw").value === ADMIN_PASSWORD) {
      enterAdmin();
    } else {
      setStatus("loginStatus", "비밀번호가 올바르지 않습니다.", "bad");
    }
  });
  $("pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("loginBtn").click();
  });
  $("previewBtn").addEventListener("click", renderPreview);
  $("saveBtn").addEventListener("click", doSave);
  $("refreshBtn").addEventListener("click", loadLog);
  $("csvBtn").addEventListener("click", downloadCsv);
}

init();
