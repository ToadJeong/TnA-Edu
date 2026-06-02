// crossword.js
// 한글 음절(글자) 단위 가로세로 낱말퍼즐 레이아웃 생성 + 렌더링 엔진
// 외부 의존성 없음. index.html(플레이어), admin.html(관리자) 공용.

export function splitSyllables(word) {
  return Array.from((word || "").trim());
}

// words: [{ answer, clue, dir?, row?, col?, num? }]
// 반환: { placed:[{answer, clue, row, col, dir, number, cells:[{r,c,ch}]}], rows, cols }
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

  items.sort((a, b) => b.syl.length - a.syl.length);

  const occupied = new Map();
  const placed = [];
  const key = (r, c) => r + "," + c;

  function canPlace(syl, row, col, dir) {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    if (occupied.has(key(row - dr, col - dc))) return false;
    if (occupied.has(key(row + dr * syl.length, col + dc * syl.length)))
      return false;
    let intersections = 0;
    for (let i = 0; i < syl.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const ex = occupied.get(key(r, c));
      if (ex !== undefined) {
        if (ex !== syl[i]) return false;
        intersections++;
      } else {
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
    placed.push({ answer: item.answer, clue: item.clue, row, col, dir, cells });
  }

  if (items.length === 0) return { placed: [], rows: 0, cols: 0 };
  doPlace(items[0], 0, 0, "across");

  for (let idx = 1; idx < items.length; idx++) {
    const item = items[idx];
    let best = null;
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
          if (res && res.ok && (!best || res.intersections > best.score)) {
            best = { row, col, dir, score: res.intersections };
          }
        }
      }
    }
    if (best) {
      doPlace(item, best.row, best.col, best.dir);
    } else {
      let maxR = 0;
      for (const k of occupied.keys())
        maxR = Math.max(maxR, parseInt(k.split(",")[0], 10));
      doPlace(item, maxR + 2, 0, "across");
    }
  }
  return finalizeLayout(placed);
}

// 수동 배치: dir/row/col 좌표를 그대로 사용
function manualLayout(items) {
  const placed = [];
  for (const item of items) {
    const dr = item.dir === "down" ? 1 : 0;
    const dc = item.dir === "across" ? 1 : 0;
    const cells = [];
    for (let i = 0; i < item.syl.length; i++) {
      cells.push({ r: item.row + dr * i, c: item.col + dc * i, ch: item.syl[i] });
    }
    placed.push({
      answer: item.answer,
      clue: item.clue,
      row: item.row,
      col: item.col,
      dir: item.dir,
      cells,
    });
  }
  // 번호는 항상 읽기 순서(행→열)로 자동 부여해 일관성 유지
  return finalizeLayout(placed);
}

// 좌표 정규화 + 번호 부여(공용)
function finalizeLayout(placed, keepNums = false) {
  let minR = Infinity,
    minC = Infinity,
    maxR = -Infinity,
    maxC = -Infinity;
  for (const p of placed)
    for (const cell of p.cells) {
      minR = Math.min(minR, cell.r);
      minC = Math.min(minC, cell.c);
      maxR = Math.max(maxR, cell.r);
      maxC = Math.max(maxC, cell.c);
    }
  if (placed.length === 0) return { placed: [], rows: 0, cols: 0 };
  for (const p of placed) {
    p.row -= minR;
    p.col -= minC;
    for (const cell of p.cells) {
      cell.r -= minR;
      cell.c -= minC;
    }
  }
  const hasAllNums = keepNums && placed.every((p) => Number.isFinite(p.num));
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
      if (!numAt.has(k)) numAt.set(k, ++num);
      s.p.number = numAt.get(k);
    }
  }
  return { placed, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

// 연결되지 않은(교차하지 않는) 단어 묶음 사이에 항상 1칸 이상 공백이 생기도록 재배치.
// 각 묶음(연결요소)의 내부 교차는 그대로 유지하고, 묶음끼리만 띄워서 배치한다.
// 반환: 새 좌표가 적용된 words 배열(answer/clue/dir/num 유지)
export function packComponents(words, opts = {}) {
  const items = (words || []).filter(
    (w) =>
      w.answer &&
      (w.dir === "across" || w.dir === "down") &&
      Number.isFinite(w.row) &&
      Number.isFinite(w.col)
  );
  if (items.length === 0) return words;

  const wcells = items.map((w) => {
    const dr = w.dir === "down" ? 1 : 0;
    const dc = w.dir === "across" ? 1 : 0;
    return splitSyllables(w.answer).map((ch, i) => ({
      r: w.row + dr * i,
      c: w.col + dc * i,
    }));
  });

  // union-find: 같은 칸을 공유(교차)하면 한 묶음
  const parent = items.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const cellOwner = new Map();
  wcells.forEach((cells, i) => {
    for (const cell of cells) {
      const k = cell.r + "," + cell.c;
      if (cellOwner.has(k)) parent[find(i)] = find(cellOwner.get(k));
      else cellOwner.set(k, i);
    }
  });

  const groups = new Map();
  items.forEach((_, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });

  const comps = [];
  for (const idxs of groups.values()) {
    let minR = Infinity,
      minC = Infinity,
      maxR = -Infinity,
      maxC = -Infinity;
    for (const i of idxs)
      for (const cell of wcells[i]) {
        minR = Math.min(minR, cell.r);
        minC = Math.min(minC, cell.c);
        maxR = Math.max(maxR, cell.r);
        maxC = Math.max(maxC, cell.c);
      }
    comps.push({ idxs, minR, minC, h: maxR - minR + 1, w: maxC - minC + 1 });
  }

  const maxWidth = opts.maxWidth || 13;
  comps.sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0,
    y = 0,
    shelfH = 0;
  const result = items.map((w) => ({ ...w }));
  for (const comp of comps) {
    if (x > 0 && x + comp.w > maxWidth) {
      y += shelfH + 1;
      x = 0;
      shelfH = 0;
    }
    const offR = y - comp.minR;
    const offC = x - comp.minC;
    for (const i of comp.idxs) {
      result[i].row = items[i].row + offR;
      result[i].col = items[i].col + offC;
    }
    x += comp.w + 1;
    shelfH = Math.max(shelfH, comp.h);
  }
  return result;
}

// ── 렌더링 ────────────────────────────────────────────────────────────
// opts: { interactive, reveal, hintIntersections }
export function renderGrid(layout, opts = {}) {
  const { interactive = true, reveal = false, hintIntersections = false } = opts;
  const wrap = document.createElement("div");
  wrap.className = "cw-grid";
  wrap.style.gridTemplateColumns = `repeat(${layout.cols}, var(--cell))`;

  const cellMap = new Map(); // "r,c" -> {ch, number, count}
  const acrossOf = new Map(); // "r,c" -> placed(가로)
  const downOf = new Map(); // "r,c" -> placed(세로)
  for (const p of layout.placed) {
    p.cells.forEach((cell, i) => {
      const k = cell.r + "," + cell.c;
      if (!cellMap.has(k)) cellMap.set(k, { ch: cell.ch, number: null, count: 0 });
      cellMap.get(k).count++;
      if (i === 0) cellMap.get(k).number = p.number;
      if (p.dir === "across") acrossOf.set(k, p);
      else downOf.set(k, p);
    });
  }

  const inputs = new Map();
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
      input.dataset.r = r;
      input.dataset.c = c;
      input.setAttribute("inputmode", "text");
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
      const isHint = hintIntersections && info.count >= 2;
      if (reveal) {
        input.value = info.ch;
        input.readOnly = true;
      } else if (isHint) {
        input.value = info.ch;
        input.readOnly = true;
        cellEl.classList.add("cw-hint");
      }
      if (!interactive) input.readOnly = true;
      cellEl.appendChild(input);
      inputs.set(k, input);
      wrap.appendChild(cellEl);
    }
  }

  const get = (r, c) => inputs.get(r + "," + c);
  let activeDir = "across";

  // 한 방향으로 한 칸 이동(읽기전용 칸은 건너뜀). 격자 밖이면 null.
  function step(r, c, dir, delta, skipReadonly = true) {
    const dr = dir === "down" ? delta : 0;
    const dc = dir === "across" ? delta : 0;
    let nr = r + dr,
      nc = c + dc;
    for (let guard = 0; guard < 64; guard++) {
      const cell = get(nr, nc);
      if (!cell) return null;
      if (skipReadonly && cell.readOnly) {
        nr += dr;
        nc += dc;
        continue;
      }
      return cell;
    }
    return null;
  }

  // 방향키: 빈 칸(검은 칸)은 건너뛰며 다음 입력칸으로
  function move(r, c, dir, delta) {
    const dr = dir === "down" ? delta : 0;
    const dc = dir === "across" ? delta : 0;
    let nr = r + dr,
      nc = c + dc;
    for (let guard = 0; guard < 64; guard++) {
      if (nr < 0 || nc < 0 || nr >= layout.rows || nc >= layout.cols) return null;
      const cell = get(nr, nc);
      if (cell) return cell;
      nr += dr;
      nc += dc;
    }
    return null;
  }

  function wordCells(p) {
    return p ? p.cells.map((cell) => get(cell.r, cell.c)).filter(Boolean) : [];
  }

  function setActive(inp) {
    wrap.querySelectorAll(".cw-cell.active, .cw-cell.in-word").forEach((el) =>
      el.classList.remove("active", "in-word")
    );
    if (!inp) return;
    const r = +inp.dataset.r,
      c = +inp.dataset.c;
    const k = r + "," + c;
    // 방향 결정: 현재 방향에 단어가 없으면 가능한 방향으로 전환
    const hasA = acrossOf.has(k),
      hasD = downOf.has(k);
    if (activeDir === "across" && !hasA && hasD) activeDir = "down";
    else if (activeDir === "down" && !hasD && hasA) activeDir = "across";
    const p = activeDir === "across" ? acrossOf.get(k) : downOf.get(k);
    for (const cel of wordCells(p)) cel.parentElement.classList.add("in-word");
    inp.parentElement.classList.add("active");
  }

  if (interactive && !reveal) {
    let composing = false;
    let lastFocusKey = null;

    function popCell(inp) {
      const cell = inp.parentElement;
      cell.classList.remove("pop");
      void cell.offsetWidth; // 리플로우로 애니메이션 재시작
      cell.classList.add("pop");
    }

    function finalize(inp) {
      if (inp.readOnly) return;
      const chars = Array.from(inp.value);
      if (chars.length === 0) {
        wrap.dispatchEvent(new CustomEvent("cw-change"));
        return;
      }
      inp.value = chars[0];
      popCell(inp);
      let curR = +inp.dataset.r,
        curC = +inp.dataset.c;
      // 넘치는 글자는 진행 방향으로 밀어 넣기
      for (let i = 1; i < chars.length; i++) {
        const nxt = step(curR, curC, activeDir, 1);
        if (!nxt) break;
        nxt.value = chars[i];
        curR = +nxt.dataset.r;
        curC = +nxt.dataset.c;
      }
      const after = step(curR, curC, activeDir, 1);
      if (after) after.focus();
      wrap.dispatchEvent(new CustomEvent("cw-change"));
    }

    wrap.addEventListener("pointerdown", (e) => {
      const t = e.target;
      if (!t.classList.contains("cw-input")) return;
      const k = t.dataset.r + "," + t.dataset.c;
      // 같은 칸을 다시 누르면 가로/세로 방향 토글
      if (lastFocusKey === k && acrossOf.has(k) && downOf.has(k)) {
        activeDir = activeDir === "across" ? "down" : "across";
      }
    });

    wrap.addEventListener("focusin", (e) => {
      const t = e.target;
      if (!t.classList.contains("cw-input")) return;
      lastFocusKey = t.dataset.r + "," + t.dataset.c;
      setActive(t);
    });

    wrap.addEventListener("compositionstart", (e) => {
      if (e.target.classList.contains("cw-input")) composing = true;
    });
    wrap.addEventListener("compositionend", (e) => {
      if (!e.target.classList.contains("cw-input")) return;
      composing = false;
      finalize(e.target);
    });
    wrap.addEventListener("input", (e) => {
      const t = e.target;
      if (!t.classList.contains("cw-input")) return;
      if (e.isComposing || composing) return;
      finalize(t);
    });

    wrap.addEventListener("keydown", (e) => {
      const t = e.target;
      if (!t.classList.contains("cw-input")) return;
      const r = +t.dataset.r,
        c = +t.dataset.c;
      const key = e.key;
      if (key === "ArrowRight") {
        e.preventDefault();
        activeDir = "across";
        const n = move(r, c, "across", 1);
        if (n) n.focus();
      } else if (key === "ArrowLeft") {
        e.preventDefault();
        activeDir = "across";
        const n = move(r, c, "across", -1);
        if (n) n.focus();
      } else if (key === "ArrowDown") {
        e.preventDefault();
        activeDir = "down";
        const n = move(r, c, "down", 1);
        if (n) n.focus();
      } else if (key === "ArrowUp") {
        e.preventDefault();
        activeDir = "down";
        const n = move(r, c, "down", -1);
        if (n) n.focus();
      } else if (key === "Tab") {
        e.preventDefault();
        const n = step(r, c, activeDir, e.shiftKey ? -1 : 1);
        if (n) n.focus();
      } else if (key === "Backspace") {
        if (t.value !== "") {
          // 내용 있으면 지우고 그대로
          e.preventDefault();
          t.value = "";
          wrap.dispatchEvent(new CustomEvent("cw-change"));
        } else {
          // 비어 있으면 이전 칸으로 이동하며 지움
          e.preventDefault();
          const prev = step(r, c, activeDir, -1);
          if (prev && !prev.readOnly) {
            prev.value = "";
            prev.focus();
            wrap.dispatchEvent(new CustomEvent("cw-change"));
          }
        }
      } else if (key === "Delete") {
        e.preventDefault();
        if (!t.readOnly) {
          t.value = "";
          wrap.dispatchEvent(new CustomEvent("cw-change"));
        }
      }
    });
  }

  function getWordValue(p) {
    return p.cells
      .map((cell) => {
        const inp = get(cell.r, cell.c);
        return (inp && inp.value.trim()) || "";
      })
      .join("");
  }

  return { gridEl: wrap, getWordValue, inputs, cellMap };
}

// 전체 맵에서 아직 비어 있는(그리고 미리 주어지지 않은) 칸 하나를 골라 정답 글자를 공개.
// 반환: 공개했으면 true, 더 공개할 칸이 없으면 false
export function revealRandomCell(render) {
  const empties = [];
  for (const [k, inp] of render.inputs) {
    if (inp.readOnly) continue;
    if (inp.value.trim() !== "") continue;
    const info = render.cellMap.get(k);
    if (info) empties.push({ inp, ch: info.ch });
  }
  if (empties.length === 0) return false;
  const pick = empties[Math.floor(Math.random() * empties.length)];
  pick.inp.value = pick.ch;
  pick.inp.readOnly = true;
  const cell = pick.inp.parentElement;
  cell.classList.add("cw-revealed");
  cell.classList.remove("pop");
  void cell.offsetWidth;
  cell.classList.add("pop");
  render.gridEl.dispatchEvent(new CustomEvent("cw-change"));
  return true;
}
