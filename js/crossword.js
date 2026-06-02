// crossword.js
// 한글 음절(글자) 단위 가로세로 낱말퍼즐 레이아웃 생성 + 렌더링 엔진
// 외부 의존성 없음. index.html(플레이어), admin.html(관리자) 양쪽에서 공용으로 사용.

// "사업부" -> ["사","업","부"]
export function splitSyllables(word) {
  return Array.from((word || "").trim());
}

// words: [{ answer, clue, dir?, row?, col?, num? }]
// 반환: { placed:[{answer, clue, row, col, dir, number, cells:[{r,c,ch}]}], rows, cols }
// dir: "across"(가로) | "down"(세로)
//
// 모든 단어가 dir/row/col 좌표를 가지면 "수동 배치 모드"로 인쇄본과 동일하게 배치하고,
// 좌표가 없으면 기존처럼 글자 교차를 찾아 "자동 배치"합니다.
export function buildLayout(words) {
  const items = (words || [])
    .filter((w) => w && w.answer && w.answer.trim().length > 0)
    .map((w) => ({
      answer: w.answer.trim(),
      clue: (w.clue || "").trim(),
      syl: splitSyllables(w.answer),
      dir: w.dir,
      row: w.row,
      col: w.col,
      num: w.num,
    }));

  const isManual =
    items.length > 0 &&
    items.every(
      (w) =>
        Number.isFinite(w.row) &&
        Number.isFinite(w.col) &&
        (w.dir === "across" || w.dir === "down")
    );
  if (isManual) return manualLayout(items);

  // 긴 단어를 먼저 배치하면 교차점을 더 많이 만들 수 있음
  items.sort((a, b) => b.syl.length - a.syl.length);

  const occupied = new Map(); // "r,c" -> 글자
  const placed = [];
  const key = (r, c) => r + "," + c;

  // 해당 위치/방향에 배치 가능한지 검사. 가능하면 {ok, intersections} 반환
  function canPlace(syl, row, col, dir) {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;

    // 단어 시작 직전/끝 직후 칸이 비어 있어야 함(단어끼리 붙어서 이어지는 것 방지)
    if (occupied.has(key(row - dr, col - dc))) return false;
    if (occupied.has(key(row + dr * syl.length, col + dc * syl.length)))
      return false;

    let intersections = 0;
    for (let i = 0; i < syl.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const ex = occupied.get(key(r, c));
      if (ex !== undefined) {
        if (ex !== syl[i]) return false; // 글자 충돌
        intersections++;
      } else {
        // 새로 채우는 칸은 양 옆(수직 방향)이 비어 있어야 단어가 우연히 붙는 것을 막음
        if (occupied.has(key(r + dc, c + dr))) return false;
        if (occupied.has(key(r - dc, c - dr))) return false;
      }
    }
    return { ok: true, intersections };
  }

  function doPlace(item, row, col, dir) {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    const cells = [];
    for (let i = 0; i < item.syl.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      occupied.set(key(r, c), item.syl[i]);
      cells.push({ r, c, ch: item.syl[i] });
    }
    placed.push({
      answer: item.answer,
      clue: item.clue,
      row,
      col,
      dir,
      cells,
    });
  }

  if (items.length === 0) return { placed: [], rows: 0, cols: 0 };

  // 첫 단어는 가로로 원점에 배치
  doPlace(items[0], 0, 0, "across");

  for (let idx = 1; idx < items.length; idx++) {
    const item = items[idx];
    let best = null;

    // 이미 놓인 단어들과 교차 가능한 위치를 모두 탐색, 교차 많은 곳 우선
    for (const p of placed) {
      for (const cell of p.cells) {
        for (let i = 0; i < item.syl.length; i++) {
          if (item.syl[i] !== cell.ch) continue;
          const dir = p.dir === "across" ? "down" : "across";
          const dr = dir === "down" ? 1 : 0;
          const dc = dir === "across" ? 1 : 0;
          const row = cell.r - dr * i;
          const col = cell.c - dc * i;
          const res = canPlace(item.syl, row, col, dir);
          if (res && res.ok) {
            if (!best || res.intersections > best.score) {
              best = { row, col, dir, score: res.intersections };
            }
          }
        }
      }
    }

    if (best) {
      doPlace(item, best.row, best.col, best.dir);
    } else {
      // 교차할 곳이 없으면 맨 아래에 따로 배치
      let maxR = 0;
      for (const k of occupied.keys()) {
        maxR = Math.max(maxR, parseInt(k.split(",")[0], 10));
      }
      doPlace(item, maxR + 2, 0, "across");
    }
  }

  // 좌표를 0부터 시작하도록 정규화
  let minR = Infinity,
    minC = Infinity,
    maxR = -Infinity,
    maxC = -Infinity;
  for (const k of occupied.keys()) {
    const [r, c] = k.split(",").map(Number);
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
  }
  for (const p of placed) {
    p.row -= minR;
    p.col -= minC;
    for (const cell of p.cells) {
      cell.r -= minR;
      cell.c -= minC;
    }
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  // 번호 부여: 단어 시작 칸을 (행, 열) 순으로 정렬, 같은 칸에서 시작하면 번호 공유
  const starts = placed.map((p) => ({ r: p.row, c: p.col, p }));
  starts.sort((a, b) => a.r - b.r || a.c - b.c);
  let num = 0;
  const numAt = new Map();
  for (const s of starts) {
    const k = s.r + "," + s.c;
    if (!numAt.has(k)) {
      num++;
      numAt.set(k, num);
    }
    s.p.number = numAt.get(k);
  }

  return { placed, rows, cols };
}

// 수동 배치: 각 단어의 dir/row/col 좌표를 그대로 사용해 인쇄본과 동일하게 구성.
// 단어에 num(번호)이 있으면 그 번호를 사용하고, 없으면 읽기 순서로 자동 부여.
function manualLayout(items) {
  const placed = [];
  for (const item of items) {
    const dr = item.dir === "down" ? 1 : 0;
    const dc = item.dir === "across" ? 1 : 0;
    const cells = [];
    for (let i = 0; i < item.syl.length; i++) {
      cells.push({
        r: item.row + dr * i,
        c: item.col + dc * i,
        ch: item.syl[i],
      });
    }
    placed.push({
      answer: item.answer,
      clue: item.clue,
      row: item.row,
      col: item.col,
      dir: item.dir,
      num: item.num,
      cells,
    });
  }

  // 좌표를 0부터 시작하도록 정규화
  let minR = Infinity,
    minC = Infinity,
    maxR = -Infinity,
    maxC = -Infinity;
  for (const p of placed) {
    for (const cell of p.cells) {
      minR = Math.min(minR, cell.r);
      minC = Math.min(minC, cell.c);
      maxR = Math.max(maxR, cell.r);
      maxC = Math.max(maxC, cell.c);
    }
  }
  for (const p of placed) {
    p.row -= minR;
    p.col -= minC;
    for (const cell of p.cells) {
      cell.r -= minR;
      cell.c -= minC;
    }
  }

  // 번호: 지정된 num을 우선 사용, 없으면 읽기 순서(행→열)로 자동 부여
  const hasAllNums = placed.every((p) => Number.isFinite(p.num));
  if (hasAllNums) {
    for (const p of placed) p.number = p.num;
  } else {
    const starts = placed
      .map((p) => ({ r: p.row, c: p.col, p }))
      .sort((a, b) => a.r - b.r || a.c - b.c);
    let num = 0;
    const numAt = new Map();
    for (const s of starts) {
      const k = s.r + "," + s.c;
      if (!numAt.has(k)) {
        num++;
        numAt.set(k, num);
      }
      s.p.number = numAt.get(k);
    }
  }

  return { placed, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

// 레이아웃을 DOM 그리드로 렌더링
// opts: { interactive: 입력 가능 여부, reveal: 정답 미리 채움(관리자 미리보기) }
// 반환: { gridEl, getWordValue(placed), cellInputs }
export function renderGrid(layout, opts = {}) {
  const { interactive = true, reveal = false } = opts;
  const wrap = document.createElement("div");
  wrap.className = "cw-grid";
  wrap.style.gridTemplateColumns = `repeat(${layout.cols}, var(--cell))`;

  // 각 칸의 정보(어떤 글자인지, 시작번호 등)를 모아둠
  const cellMap = new Map(); // "r,c" -> { ch, number }
  for (const p of layout.placed) {
    p.cells.forEach((cell, i) => {
      const k = cell.r + "," + cell.c;
      if (!cellMap.has(k)) cellMap.set(k, { ch: cell.ch, number: null });
      if (i === 0) cellMap.get(k).number = p.number;
    });
  }

  const inputs = new Map(); // "r,c" -> input element

  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const k = r + "," + c;
      const info = cellMap.get(k);
      const cellEl = document.createElement("div");
      cellEl.className = "cw-cell";
      if (!info) {
        cellEl.classList.add("cw-blank");
        wrap.appendChild(cellEl);
        continue;
      }
      if (info.number) {
        const numEl = document.createElement("span");
        numEl.className = "cw-num";
        numEl.textContent = info.number;
        cellEl.appendChild(numEl);
      }
      const input = document.createElement("input");
      input.className = "cw-input";
      input.maxLength = 1;
      input.dataset.r = r;
      input.dataset.c = c;
      input.setAttribute("inputmode", "text");
      input.autocomplete = "off";
      if (reveal) {
        input.value = info.ch;
        input.readOnly = true;
      }
      if (!interactive) input.readOnly = true;
      cellEl.appendChild(input);
      inputs.set(k, input);
      wrap.appendChild(cellEl);
    }
  }

  // 한 칸 입력하면 자동으로 다음 칸으로 이동
  if (interactive && !reveal) {
    wrap.addEventListener("input", (e) => {
      const t = e.target;
      if (!t.classList.contains("cw-input")) return;
      if (t.value.length >= 1) {
        const r = +t.dataset.r;
        const c = +t.dataset.c;
        // 오른쪽 우선, 없으면 아래
        const next =
          inputs.get(r + "," + (c + 1)) || inputs.get(r + 1 + "," + c);
        if (next) next.focus();
      }
      wrap.dispatchEvent(new CustomEvent("cw-change", { bubbles: false }));
    });
  }

  function getWordValue(p) {
    return p.cells
      .map((cell) => {
        const inp = inputs.get(cell.r + "," + cell.c);
        return (inp && inp.value.trim()) || "";
      })
      .join("");
  }

  return { gridEl: wrap, getWordValue, inputs, cellMap };
}
