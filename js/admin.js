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
// 한 줄 = "정답, 힌트"  (첫 번째 쉼표만 구분자로 사용)
function parseWords(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const i = line.indexOf(",");
      if (i === -1) return { answer: line.trim(), clue: "" };
      return {
        answer: line.slice(0, i).trim(),
        clue: line.slice(i + 1).trim(),
      };
    })
    .filter((w) => w.answer.length > 0);
}

function wordsToText(words) {
  return (words || [])
    .map((w) => (w.clue ? `${w.answer}, ${w.clue}` : w.answer))
    .join("\n");
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
