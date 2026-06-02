// app.js — 플레이어 페이지 로직
import { buildLayout, renderGrid } from "./crossword.js";
import { loadPuzzle, addSubmission, listSubmissions, isConfigured } from "./store.js";
import { EVENT } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

let layout = null;
let render = null;
let startedAt = Date.now();
let submitted = false;

function setHeader() {
  $("org").textContent = EVENT.org;
  $("title").textContent = EVENT.title;
  $("subtitle").textContent = EVENT.subtitle;
  document.title = `${EVENT.org} · ${EVENT.title}`;
}

function renderClues() {
  const across = layout.placed
    .filter((p) => p.dir === "across")
    .sort((a, b) => a.number - b.number);
  const down = layout.placed
    .filter((p) => p.dir === "down")
    .sort((a, b) => a.number - b.number);
  const li = (p) => `<li><b>${p.number}.</b>${p.clue || "(힌트 없음)"}</li>`;
  $("acrossClues").innerHTML = across.map(li).join("");
  $("downClues").innerHTML = down.map(li).join("");
}

// 모든 단어가 정답인지 확인. 정답인 단어 칸은 초록색 표시.
function checkAll(markCells = false) {
  let allCorrect = true;
  // 먼저 표시 초기화
  if (markCells) {
    render.gridEl
      .querySelectorAll(".cw-cell.correct")
      .forEach((el) => el.classList.remove("correct"));
  }
  for (const p of layout.placed) {
    const val = render.getWordValue(p);
    const correct = val === p.answer;
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

function onGridChange() {
  // 입력할 때마다 제출 버튼 활성/비활성 갱신
  if (submitted) return;
  const all = checkAll(false);
  $("submitBtn").disabled = !all;
  if (all) {
    $("checkStatus").textContent = "🎉 모든 칸 정답! 아래에서 제출하세요.";
    $("checkStatus").className = "status ok";
  }
}

async function onSubmit() {
  if (submitted) return;
  const name = $("name").value.trim();
  const dept = $("dept").value.trim();
  if (!checkAll(true)) {
    setSubmitStatus("아직 정답이 아닌 칸이 있어요.", "bad");
    return;
  }
  if (!name || !dept) {
    setSubmitStatus("이름과 소속을 모두 입력해주세요.", "bad");
    return;
  }
  $("submitBtn").disabled = true;
  setSubmitStatus("제출 중…", "");
  try {
    await addSubmission({
      name,
      department: dept,
      durationMs: Date.now() - startedAt,
    });
    submitted = true;
    // 내 순위 계산(이름+소속 기준으로 방금 제출 찾기)
    let rankText = "제출이 기록되었습니다!";
    try {
      const subs = await listSubmissions();
      const idx = subs.findIndex(
        (s) => s.name === name && s.department === dept
      );
      if (idx >= 0) rankText = `${idx + 1}등으로 기록되었습니다!`;
    } catch (_) {}
    showDone(rankText, name);
  } catch (err) {
    console.error(err);
    setSubmitStatus(
      "제출 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
      "bad"
    );
    $("submitBtn").disabled = false;
  }
}

function setSubmitStatus(msg, kind) {
  const el = $("submitStatus");
  el.textContent = msg;
  el.className = "status " + (kind || "");
}

function showDone(rankText, name) {
  $("submitCard").classList.add("hidden");
  $("doneCard").classList.remove("hidden");
  $("doneRank").textContent = rankText;
  $("doneMsg").textContent = `${name}님, 참여해주셔서 감사합니다. 당첨 결과는 별도로 안내드립니다.`;
  $("doneCard").scrollIntoView({ behavior: "smooth" });
}

async function init() {
  setHeader();
  if (!isConfigured()) $("demoBanner").classList.remove("hidden");

  const puzzle = await loadPuzzle();
  if (puzzle.title) $("title").textContent = puzzle.title;
  layout = buildLayout(puzzle.words || []);
  render = renderGrid(layout, { interactive: true });
  $("grid").appendChild(render.gridEl);
  render.gridEl.addEventListener("cw-change", onGridChange);
  renderClues();
  startedAt = Date.now();

  $("checkBtn").addEventListener("click", () => {
    const all = checkAll(true);
    if (all) {
      $("checkStatus").textContent = "🎉 모두 정답입니다! 제출해주세요.";
      $("checkStatus").className = "status ok";
      $("submitBtn").disabled = false;
    } else {
      $("checkStatus").textContent =
        "초록색이 아닌 칸을 다시 확인해보세요.";
      $("checkStatus").className = "status bad";
    }
  });
  $("submitBtn").addEventListener("click", onSubmit);
}

init().catch((e) => {
  console.error(e);
  alert("퍼즐을 불러오지 못했습니다. 새로고침 해주세요.");
});
