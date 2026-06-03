// app.js — 참가자 페이지 로직
import { buildLayout, renderGrid, revealRandomCell } from "./crossword.js?v=21";
import { loadActivePuzzle, addSubmission, listSubmissions, isConfigured } from "./store.js?v=21";
import { EVENT } from "./firebase-config.js?v=21";

const $ = (id) => document.getElementById(id);

let puzzle = null;
let activePuzzleId = null;
let layout = null;
let render = null;
let startedAt = 0;
let timerId = null;
let submitted = false;
let player = { name: "", department: "" };
let zoom = null; // 그리드 칸 크기(px) 확대/축소 값

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
        const el = render.cellByKey.get(cell.r + "," + cell.c);
        if (el) el.classList.add("correct");
      }
    }
  }
  return allCorrect;
}

// ── 칸 클릭 시 해당 문제(힌트) 팝업 ───────────────────────────────────
let cluePop = null;
function ensureCluePop() {
  if (cluePop) return cluePop;
  cluePop = document.createElement("div");
  cluePop.className = "clue-pop hidden";
  document.body.appendChild(cluePop);
  // 스크롤·바깥 터치·ESC 시 자동으로 닫힘
  window.addEventListener("scroll", hideCluePop, true);
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!cluePop || cluePop.classList.contains("hidden")) return;
      if (cluePop.contains(e.target) || e.target.closest(".cw-cell")) return;
      hideCluePop();
    },
    true
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCluePop();
  });
  return cluePop;
}
function hideCluePop() {
  if (cluePop) cluePop.classList.add("hidden");
}
function showCluePopup(detail) {
  const lines = [];
  if (detail.across)
    lines.push(
      `<span class="cp-a">가로 ${detail.across.number}</span> ${escapeHtml(
        detail.across.clue || ""
      )}`
    );
  if (detail.down)
    lines.push(
      `<span class="cp-d">세로 ${detail.down.number}</span> ${escapeHtml(
        detail.down.clue || ""
      )}`
    );
  if (lines.length === 0) return hideCluePop();
  const pop = ensureCluePop();
  pop.innerHTML = lines.map((l) => `<div class="cp-line">${l}</div>`).join("");
  pop.classList.remove("hidden");
  const rect = detail.cellEl.getBoundingClientRect();
  pop.style.position = "fixed";
  // 가로 위치(화면 안으로 보정)
  const w = pop.offsetWidth;
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  pop.style.left = left + "px";
  // 세로: 칸 위에, 공간 없으면 아래
  const h = pop.offsetHeight;
  let top = rect.top - h - 8;
  if (top < 8) top = rect.bottom + 8;
  pop.style.top = top + "px";
}

let celebrated = false;
function onGridChange() {
  hideCluePop();
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

// 컨페티 효과 — 라이브러리(canvas-confetti) 우선, 실패 시 CSS 폴백
let _confettiLib = null;
async function confetti() {
  try {
    if (_confettiLib === null) {
      const mod = await import(
        "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs"
      );
      _confettiLib = mod.default;
    }
    const c = _confettiLib;
    c({ particleCount: 140, spread: 75, origin: { y: 0.6 } });
    setTimeout(() => c({ particleCount: 80, angle: 60, spread: 80, origin: { x: 0 } }), 200);
    setTimeout(() => c({ particleCount: 80, angle: 120, spread: 80, origin: { x: 1 } }), 350);
  } catch (_) {
    domConfetti();
  }
}
function domConfetti() {
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
  render = renderGrid(layout, {
    interactive: true,
    hintIntersections: true,
    onActive: showCluePopup,
  });
  $("grid").appendChild(render.gridEl);
  render.gridEl.addEventListener("cw-change", onGridChange);
  renderClues();

  // 글자 힌트 버튼 — 관리자가 켰을 때만, 정해진 횟수만큼만 사용 가능
  const hintBtn = $("hintBtn");
  let hintsLeft = puzzle.hintEnabled !== false ? (puzzle.hintLimit ?? 3) : 0;
  const updateHintBtn = () => {
    hintBtn.textContent = `💡 글자 힌트 (남은 ${hintsLeft}회)`;
    hintBtn.disabled = hintsLeft <= 0;
  };
  if (hintsLeft > 0) {
    hintBtn.classList.remove("hidden");
    updateHintBtn();
    hintBtn.addEventListener("click", () => {
      if (hintsLeft <= 0) return;
      const ok = revealRandomCell(render);
      if (ok) {
        hintsLeft--;
        updateHintBtn();
        if (hintsLeft <= 0) hintBtn.textContent = "💡 힌트 모두 사용";
      } else {
        hintsLeft = 0;
        hintBtn.textContent = "더 공개할 칸이 없어요";
        hintBtn.disabled = true;
      }
    });
  }

  fitGrid(); // 화면 폭에 맞게 칸 크기 자동 조정
  startTimer();
  $("gameArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

// 퍼즐을 화면(컨테이너) 폭에 맞춰 한눈에 들어오도록 칸 크기 자동 계산
function fitGrid() {
  if (!render || !layout || zoom != null) return; // 수동 확대/축소 중이면 건드리지 않음
  const scroll = $("gridScroll");
  const avail = (scroll ? scroll.clientWidth : 320) - 6;
  if (avail <= 0 || !layout.cols) return;
  let cell = Math.floor(avail / layout.cols);
  cell = Math.max(24, Math.min(52, cell)); // 너무 작거나 크지 않게
  render.gridEl.style.setProperty("--cell", cell + "px");
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
    await addSubmission({ name, department: dept, durationMs, puzzleId: activePuzzleId });
    submitted = true;
    stopTimer();
    showDone(name, durationMs);
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

function showDone(name, durationMs) {
  $("gameArea").classList.add("hidden");
  $("doneCard").classList.remove("hidden");
  $("doneTime").textContent = fmtClock(durationMs);
  $("doneRank").textContent = "제출이 완료되었습니다!";
  $("doneMsg").textContent = `${name}님, 참여해주셔서 감사합니다. 당첨 결과는 별도로 안내드립니다.`;
  $("doneCard").scrollIntoView({ behavior: "smooth", block: "start" });
  confetti();
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function fmtDateTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

// ── 랭킹 (전체/일일 × 제출순/시간순 = 4종) ──────────────────────────
let rankAll = [];
let rankScope = "all"; // all | today
let rankSort = "order"; // order | time
let prevView = "intro";
function isToday(ms) {
  if (!ms) return false;
  const d = new Date(ms),
    n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
async function openRanking() {
  prevView = submitted
    ? "done"
    : $("gameArea").classList.contains("hidden")
    ? "intro"
    : "game";
  $("introCard").classList.add("hidden");
  $("gameArea").classList.add("hidden");
  $("doneCard").classList.add("hidden");
  $("rankCard").classList.remove("hidden");
  $("rankStatus").textContent = "불러오는 중…";
  $("rankCard").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    rankAll = await listSubmissions(activePuzzleId);
    renderRanking();
    startFireworks();
  } catch (e) {
    console.error(e);
    $("rankBody").innerHTML = "";
    $("podium").innerHTML = "";
    $("rankStatus").textContent = "랭킹을 불러오지 못했어요.";
  }
}
function renderRanking() {
  let list = rankAll.slice();
  if (rankScope === "today") list = list.filter((s) => isToday(s.createdAtMs));
  if (rankSort === "time")
    list.sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity));
  else list.sort((a, b) => (a.createdAtMs ?? Infinity) - (b.createdAtMs ?? Infinity));
  $("rankMetricHead").textContent = rankSort === "time" ? "풀이 시간" : "제출 시각";

  const metric = (s) =>
    rankSort === "time" ? fmtClock(s.durationMs || 0) : fmtDateTime(s.createdAtMs);
  const medal = ["🥇", "🥈", "🥉"];

  // 시상대(top3) — 2등·1등·3등 순으로 배치
  const top = list.slice(0, 3);
  const order = [1, 0, 2]; // 가운데가 1등
  $("podium").innerHTML =
    top.length === 0
      ? ""
      : order
          .filter((idx) => top[idx])
          .map((idx) => {
            const s = top[idx];
            return `<div class="pcard p${idx + 1}">
              <div class="medal">${medal[idx]}</div>
              <div class="pname">${escapeHtml(s.name)}</div>
              <div class="pdept">${escapeHtml(s.department)}</div>
              <div class="pmetric">${metric(s)}</div>
            </div>`;
          })
          .join("");

  // 표 — 1~3위 금/은/동, 4~10위 강조
  $("rankBody").innerHTML = list.length
    ? list
        .map((s, i) => {
          const cls =
            i < 3 ? `rank-${i + 1}` : i < 10 ? "top10" : "";
          return `<tr class="${cls}">
        <td><span class="rank-badge">${i + 1}</span>${i < 3 ? " " + medal[i] : ""}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.department)}</td>
        <td>${metric(s)}</td>
      </tr>`;
        })
        .join("")
    : '<tr><td colspan="4" class="muted">아직 기록이 없어요.</td></tr>';

  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  const today = `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  $("rankStatus").textContent =
    (rankScope === "today" ? `📅 오늘 ${today} · ` : "전체 · ") + `${list.length}명`;
}
function closeRanking() {
  stopFireworks();
  $("rankCard").classList.add("hidden");
  if (prevView === "done") $("doneCard").classList.remove("hidden");
  else if (prevView === "game") $("gameArea").classList.remove("hidden");
  else $("introCard").classList.remove("hidden");
}

// 랭킹 화면 폭죽(상단에서 계속 터짐)
let fwTimer = null;
async function startFireworks() {
  stopFireworks();
  const colors = ["#e8c356", "#cfd3da", "#cf9356", "#b06a4f", "#8c7a5e", "#c2a06a"];
  const burst = async () => {
    try {
      if (_confettiLib === null) {
        const mod = await import(
          "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.module.mjs"
        );
        _confettiLib = mod.default;
      }
      const c = _confettiLib;
      c({ particleCount: 36, spread: 60, startVelocity: 42, gravity: 0.9, ticks: 120,
        origin: { x: 0.15 + Math.random() * 0.7, y: 0.12 + Math.random() * 0.18 }, colors });
    } catch (_) {}
  };
  burst();
  fwTimer = setInterval(burst, 1100);
}
function stopFireworks() {
  if (fwTimer) clearInterval(fwTimer);
  fwTimer = null;
}

async function init() {
  setHeader();
  if (!isConfigured()) $("demoBanner").classList.remove("hidden");
  puzzle = await loadActivePuzzle();
  activePuzzleId = puzzle.id;
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

  // 확대/축소 (휴대폰에서 칸을 키우거나 줄임)
  const curCell = () => {
    if (!render) return 44;
    const v = getComputedStyle(render.gridEl).getPropertyValue("--cell");
    return parseInt(v, 10) || 44;
  };
  $("zoomIn").addEventListener("click", () => {
    if (!render) return;
    zoom = Math.min(80, (zoom || curCell()) + 6);
    render.gridEl.style.setProperty("--cell", zoom + "px");
  });
  $("zoomOut").addEventListener("click", () => {
    if (!render) return;
    zoom = Math.max(24, (zoom || curCell()) - 6);
    render.gridEl.style.setProperty("--cell", zoom + "px");
  });
  $("zoomReset").addEventListener("click", () => {
    zoom = null;
    fitGrid(); // 화면 맞춤으로 복귀
  });
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(fitGrid, 150);
  });

  // 랭킹
  $("rankBtn").addEventListener("click", openRanking);
  $("rankBtn2").addEventListener("click", openRanking);
  $("rankClose").addEventListener("click", closeRanking);
  $("rankTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-scope]");
    if (!b) return;
    rankScope = b.dataset.scope;
    rankSort = b.dataset.sort;
    $("rankTabs")
      .querySelectorAll("button")
      .forEach((x) => x.classList.toggle("active", x === b));
    renderRanking();
  });
}

init().catch((e) => {
  console.error(e);
  alert("퍼즐을 불러오지 못했습니다. 새로고침 해주세요.");
});
