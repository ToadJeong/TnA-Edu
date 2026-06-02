// app.js — 참가자 페이지 로직
import { buildLayout, renderGrid, revealRandomCell } from "./crossword.js?v=8";
import { loadPuzzle, addSubmission, listSubmissions, isConfigured } from "./store.js?v=8";
import { EVENT } from "./firebase-config.js?v=8";

const $ = (id) => document.getElementById(id);

let puzzle = null;
let layout = null;
let render = null;
let startedAt = 0;
let timerId = null;
let submitted = false;
let player = { name: "", department: "" };

function setHeader() {
  $("org").textContent = EVENT.org;
  $("title").textContent = EVENT.title;
  $("subtitle").textContent = EVENT.subtitle;
  document.title = `CJ ENM · ${EVENT.org} ${EVENT.title}`;
}

function renderClues() {
  const li = (p) =>
    `<li><span class="qn">${p.number}</span><span>${escapeHtml(
      p.clue || "(힌트 없음)"
    )}</span></li>`;
  const sort = (a, b) => a.number - b.number;
  $("acrossClues").innerHTML = layout.placed
    .filter((p) => p.dir === "across")
    .sort(sort)
    .map(li)
    .join("");
  $("downClues").innerHTML = layout.placed
    .filter((p) => p.dir === "down")
    .sort(sort)
    .map(li)
    .join("");
}

// 모든 단어가 정답인지 확인. markCells=true 면 정답 단어 칸을 초록색 표시.
function checkAll(markCells = false) {
  let allCorrect = true;
  if (markCells) {
    render.gridEl
      .querySelectorAll(".cw-cell.correct")
      .forEach((el) => el.classList.remove("correct"));
  }
  for (const p of layout.placed) {
    const correct = render.getWordValue(p) === p.answer;
    if (!correct) allCorrect = false;
    if (markCells && correct) {
      for (const cell of p.cells) {
        const inp = render.inputs.get(cell.r + "," + cell.c);
        if (inp) inp.parentElement.classList.add("correct");
      }
    }
  }
  return allCorrect;
}

let celebrated = false;
function onGridChange() {
  if (submitted) return;
  const all = checkAll(false);
  $("submitBtn").disabled = !all;
  if (all) {
    $("checkStatus").textContent = "🎉 모든 칸 정답! 아래에서 제출하세요.";
    $("checkStatus").className = "status ok";
    if (!celebrated) {
      celebrated = true;
      checkAll(true);
      confetti();
    }
  }
}

// 타이머
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s % 60)}`;
}
function startTimer() {
  startedAt = Date.now();
  $("timer").classList.add("run");
  timerId = setInterval(() => {
    $("timer").textContent = fmtClock(Date.now() - startedAt);
  }, 500);
}
function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  $("timer").classList.remove("run");
}

// 컨페티 효과
function confetti() {
  const colors = ["#1668d6", "#f7a300", "#e8330d", "#15803d", "#ffd23d"];
  const box = document.createElement("div");
  box.className = "confetti";
  for (let i = 0; i < 90; i++) {
    const piece = document.createElement("i");
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = 2.4 + Math.random() * 1.8 + "s";
    piece.style.animationDelay = Math.random() * 0.6 + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(piece);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4800);
}

function startGame() {
  const name = $("name").value.trim();
  const dept = $("dept").value.trim();
  if (!name || !dept) {
    const el = $("startStatus");
    el.textContent = "이름과 소속을 먼저 입력해주세요.";
    el.className = "status bad";
    return;
  }
  player = { name, department: dept };

  $("introCard").classList.add("hidden");
  $("gameArea").classList.remove("hidden");
  $("submitWho").textContent = `${name} · ${dept} 님으로 제출됩니다.`;

  // 시작 시점에 퍼즐 렌더링(시작 전에는 보이지 않도록)
  layout = buildLayout(puzzle.words || []);
  render = renderGrid(layout, { interactive: true, hintIntersections: true });
  $("grid").appendChild(render.gridEl);
  render.gridEl.addEventListener("cw-change", onGridChange);
  renderClues();

  // 글자 힌트 버튼(관리자가 켰을 때만)
  if (puzzle.hintEnabled !== false) {
    const hintBtn = $("hintBtn");
    hintBtn.classList.remove("hidden");
    hintBtn.addEventListener("click", () => {
      const ok = revealRandomCell(render);
      if (!ok) {
        hintBtn.disabled = true;
        hintBtn.textContent = "더 공개할 칸이 없어요";
      }
    });
  }

  startTimer();
  $("gameArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function onSubmit() {
  if (submitted) return;
  const name = player.name;
  const dept = player.department;
  if (!checkAll(true)) {
    setSubmitStatus("아직 정답이 아닌 칸이 있어요.", "bad");
    return;
  }
  const durationMs = Date.now() - startedAt;
  $("submitBtn").disabled = true;
  setSubmitStatus("제출 중…", "");
  try {
    await addSubmission({ name, department: dept, durationMs });
    submitted = true;
    stopTimer();
    let rankText = "제출이 기록되었습니다!";
    try {
      const subs = await listSubmissions();
      const idx = subs.findIndex((s) => s.name === name && s.department === dept);
      if (idx >= 0) rankText = `${idx + 1}등으로 기록되었습니다!`;
    } catch (_) {}
    showDone(rankText, name, durationMs);
  } catch (err) {
    console.error(err);
    setSubmitStatus("제출 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.", "bad");
    $("submitBtn").disabled = false;
  }
}

function setSubmitStatus(msg, kind) {
  const el = $("submitStatus");
  el.textContent = msg;
  el.className = "status " + (kind || "");
}

function showDone(rankText, name, durationMs) {
  $("submitCard").classList.add("hidden");
  $("doneCard").classList.remove("hidden");
  $("doneRank").textContent = rankText;
  $("doneMsg").textContent = `${name}님, 참여해주셔서 감사합니다. (풀이 시간 ${fmtClock(
    durationMs
  )}) 당첨 결과는 별도로 안내드립니다.`;
  $("doneCard").scrollIntoView({ behavior: "smooth" });
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function init() {
  setHeader();
  if (!isConfigured()) $("demoBanner").classList.remove("hidden");
  puzzle = await loadPuzzle();
  if (puzzle.title) {
    $("title").textContent = puzzle.title;
    $("introTitle").textContent = puzzle.title;
  }
  $("startBtn").addEventListener("click", startGame);
  $("checkBtn").addEventListener("click", () => {
    if (checkAll(true)) {
      $("checkStatus").textContent = "🎉 모두 정답입니다! 제출해주세요.";
      $("checkStatus").className = "status ok";
      $("submitBtn").disabled = false;
      if (!celebrated) {
        celebrated = true;
        confetti();
      }
    } else {
      $("checkStatus").textContent = "초록색이 아닌 칸을 다시 확인해보세요.";
      $("checkStatus").className = "status bad";
    }
  });
  $("submitBtn").addEventListener("click", onSubmit);
}

init().catch((e) => {
  console.error(e);
  alert("퍼즐을 불러오지 못했습니다. 새로고침 해주세요.");
});
