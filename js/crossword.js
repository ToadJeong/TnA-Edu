// crossword.js
// 한글 음절(글자) 단위 가로세로 낱말퍼즐 레이아웃 생성 + 렌더링 엔진
// 외부 의존성 없음. index.html(플레이어), admin.html(관리자) 공용.

export function splitSyllables(word) {
  return Array.from((word || "").trim());
}

// words: [{ answer, clue, dir?, row?, col?, num? }]
// 반환: { placed:[{answer, clue, row, col, dir, number, cells:[{r,c,ch}]}], rows, cols }
export function buildLayout(words, opts = {}) {
  const rand = !!opts.random;
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

  // random 모드: 같은 길이 단어 순서를 섞어 매번 다른 배치가 나오게 함
  if (rand)
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
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

  // 한 단어가 이미 놓인 단어들과 교차할 수 있는 최적 위치 탐색
  function bestPlacement(item) {
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
          if (
            res &&
            res.ok &&
            (!best ||
              res.intersections > best.score ||
              (rand && res.intersections === best.score && Math.random() < 0.5))
          ) {
            best = { row, col, dir, score: res.intersections };
          }
        }
      }
    }
    return best;
  }

  // 다중 패스: 매 단계 "교차 가능한 단어 중 교차가 가장 많은 것"을 먼저 배치.
  // 어떤 단어도 교차할 수 없으면, 남은 단어 하나를 아래쪽에 새 묶음으로 시드.
  const unplaced = items.slice(1);
  while (unplaced.length) {
    let bestGlobal = null;
    let bestWi = -1;
    for (let wi = 0; wi < unplaced.length; wi++) {
      const cand = bestPlacement(unplaced[wi]);
      if (
        cand &&
        (!bestGlobal ||
          cand.score > bestGlobal.score ||
          (rand && cand.score === bestGlobal.score && Math.random() < 0.5))
      ) {
        bestGlobal = cand;
        bestWi = wi;
      }
    }
    if (bestGlobal) {
      const item = unplaced.splice(bestWi, 1)[0];
      doPlace(item, bestGlobal.row, bestGlobal.col, bestGlobal.dir);
    } else {
      let maxR = 0;
      for (const k of occupied.keys())
        maxR = Math.max(maxR, parseInt(k.split(",")[0], 10));
      const item = unplaced.shift();
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
// opts: { interactive, reveal, hintIntersections, dirTint, onActive }
// 입력형(interactive) 그리드는 "단일 캐럿 입력" 방식: 화면엔 글자 칸(div)만 두고,
// 입력은 활성 칸 위로 옮겨다니는 하나의 input 으로 처리 → 한글 조합이 칸 사이에서
// 깨지지 않음.
export function renderGrid(layout, opts = {}) {
  const {
    interactive = true,
    reveal = false,
    hintIntersections = false,
    dirTint = false,
    onActive = null,
  } = opts;
  const editable = interactive && !reveal;
  const wrap = document.createElement("div");
  wrap.className = "cw-grid";
  wrap.style.gridTemplateColumns = `repeat(${layout.cols}, var(--cell))`;

  const cellMap = new Map();
  const acrossOf = new Map();
  const downOf = new Map();
  for (const p of layout.placed) {
    p.cells.forEach((cell, i) => {
      const k = cell.r + "," + cell.c;
      if (!cellMap.has(k))
        cellMap.set(k, { ch: cell.ch, number: null, count: 0, startA: false, startD: false });
      const info = cellMap.get(k);
      info.count++;
      if (i === 0) {
        info.number = p.number;
        if (p.dir === "across") info.startA = true;
        else info.startD = true;
      }
      if (p.dir === "across") acrossOf.set(k, p);
      else downOf.set(k, p);
    });
  }

  const inputs = new Map(); // 비입력형(미리보기) 전용
  const cellByKey = new Map();
  const chByKey = new Map(); // 입력형: key -> 글자 span
  const values = new Map(); // 입력형: key -> 확정 글자
  const locked = new Set(); // 입력형: 미리 주어진/공개된 칸(편집 불가)

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
      cellEl.dataset.k = k;
      cellByKey.set(k, cellEl);
      if (dirTint) {
        const a = acrossOf.has(k),
          d = downOf.has(k);
        cellEl.classList.add(a && d ? "dir-ad" : d ? "dir-d" : "dir-a");
      }
      if (info.number) {
        const numEl = document.createElement("span");
        numEl.className =
          "cw-num " +
          (info.startA && info.startD ? "num-both" : info.startD ? "num-d" : "num-a");
        numEl.textContent = info.number;
        cellEl.appendChild(numEl);
      }
      const isHint = hintIntersections && info.count >= 2;
      if (editable) {
        const ch = document.createElement("span");
        ch.className = "cw-ch";
        cellEl.appendChild(ch);
        chByKey.set(k, ch);
        if (isHint) {
          values.set(k, info.ch);
          ch.textContent = info.ch;
          locked.add(k);
          cellEl.classList.add("cw-hint");
        }
      } else {
        const input = document.createElement("input");
        input.className = "cw-input";
        input.dataset.r = r;
        input.dataset.c = c;
        input.readOnly = true;
        if (reveal) input.value = info.ch;
        cellEl.appendChild(input);
        inputs.set(k, input);
      }
      wrap.appendChild(cellEl);
    }
  }

  // 비입력형(미리보기/관리자): 입력 엔진 없이 반환
  if (!editable) {
    const getWordValueRO = (p) =>
      p.cells
        .map((cell) => {
          const i = inputs.get(cell.r + "," + cell.c);
          return (i && i.value.trim()) || "";
        })
        .join("");
    return { gridEl: wrap, getWordValue: getWordValueRO, inputs, cellMap, cellByKey };
  }

  // ── 입력형: 단어 단위 입력기 ───────────────────────────────────────
  // 칸마다 입력값을 다루지 않고, "현재 단어 전체"를 투명 입력창 하나가 담당한다.
  // 조합(IME) 중에는 값을 절대 건드리지 않고 입력값을 칸에 '그리기'만 하므로
  // 받침/이중모음이 칸 사이에서 깨지지 않는다.
  const caret = document.createElement("input");
  caret.className = "cw-caret";
  caret.setAttribute("inputmode", "text");
  caret.autocomplete = "off";
  caret.autocapitalize = "off";
  caret.spellcheck = false;
  caret.style.display = "none";
  wrap.style.position = "relative";
  wrap.appendChild(caret);

  let composing = false;
  let activeWord = null;
  let activeDir = "across";
  let lastTapKey = null;

  const parseK = (k) => k.split(",").map(Number);
  const has = (k) => cellByKey.has(k);
  const isEditable = (k) => chByKey.has(k) && !locked.has(k);
  const getVal = (k) => values.get(k) || "";
  function setVal(k, ch) {
    if (ch) {
      values.set(k, ch);
      chByKey.get(k).textContent = ch;
    } else {
      values.delete(k);
      if (chByKey.get(k)) chByKey.get(k).textContent = "";
    }
  }
  function pop(k) {
    const cell = cellByKey.get(k);
    if (!cell) return;
    cell.classList.remove("pop");
    void cell.offsetWidth;
    cell.classList.add("pop");
  }
  const wordAt = (k, dir) => (dir === "across" ? acrossOf.get(k) : downOf.get(k));
  const editKeys = (p) =>
    p ? p.cells.map((c) => c.r + "," + c.c).filter(isEditable) : [];

  function highlightWord() {
    wrap
      .querySelectorAll(".cw-cell.in-word, .cw-cell.caretcell, .cw-cell.active")
      .forEach((el) => el.classList.remove("in-word", "caretcell", "active"));
    if (!activeWord) return;
    for (const c of activeWord.cells) {
      const el = cellByKey.get(c.r + "," + c.c);
      if (el) el.classList.add("in-word");
    }
  }
  // 커서(다음 입력 칸) 강조 + 캐럿을 그 칸 위치로
  function markCaretCell() {
    wrap
      .querySelectorAll(".cw-cell.caretcell")
      .forEach((el) => el.classList.remove("caretcell"));
    const ek = editKeys(activeWord);
    if (ek.length === 0) return;
    const sel = caret.selectionStart == null ? caret.value.length : caret.selectionStart;
    const idx = Math.min(Math.max(0, sel), ek.length - 1);
    const cell = cellByKey.get(ek[idx]);
    if (cell) {
      cell.classList.add("caretcell");
      caret.style.left = cell.offsetLeft + "px";
      caret.style.top = cell.offsetTop + "px";
      caret.style.width = cell.offsetWidth + "px";
      caret.style.height = cell.offsetHeight + "px";
      caret.style.display = "block";
    }
  }
  function fireActive() {
    if (!onActive || !activeWord) return;
    const k = activeWord.cells[0].r + "," + activeWord.cells[0].c;
    onActive({
      key: k,
      cellEl: cellByKey.get(k),
      across: acrossOf.get(k) || null,
      down: downOf.get(k) || null,
      dir: activeDir,
    });
  }
  // 입력값을 단어 칸에 그린다(조합 중에도 안전 — 값을 바꾸지 않음)
  function paint() {
    if (!activeWord) return;
    const ek = editKeys(activeWord);
    let chars = Array.from(caret.value);
    if (chars.length > ek.length) {
      chars = chars.slice(0, ek.length);
      if (!composing) caret.value = chars.join("");
    }
    for (let i = 0; i < ek.length; i++) {
      const want = chars[i] || "";
      if (getVal(ek[i]) !== want) {
        setVal(ek[i], want);
        if (want) pop(ek[i]);
      }
    }
    markCaretCell();
    wrap.dispatchEvent(new CustomEvent("cw-change"));
  }
  // 칸 탭 → 그 칸이 속한 단어를 입력 대상으로, 커서를 그 칸에
  function focusCellAt(k, toggle) {
    if (!has(k)) return;
    const hasA = acrossOf.has(k),
      hasD = downOf.has(k);
    if (toggle && lastTapKey === k && hasA && hasD)
      activeDir = activeDir === "across" ? "down" : "across";
    if (activeDir === "across" && !hasA && hasD) activeDir = "down";
    else if (activeDir === "down" && !hasD && hasA) activeDir = "across";
    lastTapKey = k;
    activeWord = wordAt(k, activeDir);
    if (!activeWord) return;
    const ek = editKeys(activeWord);
    caret.style.display = "block";
    caret.value = ek.map(getVal).join("");
    const idx = ek.indexOf(k);
    const pos = idx >= 0 ? Math.min(idx, caret.value.length) : caret.value.length;
    highlightWord();
    fireActive();
    caret.focus({ preventScroll: true });
    try {
      caret.setSelectionRange(pos, pos);
    } catch (_) {}
    markCaretCell();
  }

  caret.addEventListener("compositionstart", () => {
    composing = true;
  });
  caret.addEventListener("compositionupdate", () => {
    composing = true;
    paint();
  });
  caret.addEventListener("compositionend", () => {
    composing = false;
    paint();
  });
  caret.addEventListener("input", () => paint());
  caret.addEventListener("keyup", () => markCaretCell());
  caret.addEventListener("keydown", (e) => {
    if (!activeWord) return;
    const dirMove = (dir, delta) => {
      const ek0 = editKeys(activeWord);
      const sel = caret.selectionStart == null ? ek0.length - 1 : caret.selectionStart;
      const baseKey = ek0[Math.min(Math.max(0, sel), ek0.length - 1)] || ek0[0];
      if (!baseKey) return;
      let [r, c] = parseK(baseKey);
      const dr = dir === "down" ? delta : 0,
        dc = dir === "across" ? delta : 0;
      for (let g = 0; g < 64; g++) {
        r += dr;
        c += dc;
        if (r < 0 || c < 0 || r >= layout.rows || c >= layout.cols) return;
        const nk = r + "," + c;
        if (has(nk)) {
          activeDir = dir;
          focusCellAt(nk, false);
          return;
        }
      }
    };
    if (e.key === "ArrowRight") { e.preventDefault(); dirMove("across", 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); dirMove("across", -1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); dirMove("down", 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); dirMove("down", -1); }
  });

  // 칸 탭(캐럿은 pointer-events:none 이라 탭은 칸으로 전달됨)
  wrap.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cw-cell");
    if (!cell || !cell.dataset.k) return;
    const k = cell.dataset.k;
    if (isEditable(k)) {
      e.preventDefault();
      focusCellAt(k, true);
    } else if (has(k)) {
      activeWord = wordAt(k, acrossOf.has(k) ? "across" : "down") || activeWord;
      activeDir = acrossOf.has(k) ? "across" : "down";
      highlightWord();
      fireActive();
    }
  });

  // 첫 편집 칸이 있는 단어를 기본 활성으로(포커스 없이)
  for (const p of layout.placed) {
    if (editKeys(p).length) {
      activeWord = p;
      activeDir = p.dir;
      break;
    }
  }

  function getWordValue(p) {
    return p.cells.map((cell) => getVal(cell.r + "," + cell.c)).join("");
  }
  function revealRandom() {
    const empties = [];
    for (const k of chByKey.keys()) {
      if (locked.has(k) || getVal(k) !== "") continue;
      const info = cellMap.get(k);
      if (info) empties.push({ k, ch: info.ch });
    }
    if (empties.length === 0) return false;
    const pick = empties[Math.floor(Math.random() * empties.length)];
    setVal(pick.k, pick.ch);
    locked.add(pick.k);
    cellByKey.get(pick.k).classList.add("cw-revealed");
    pop(pick.k);
    wrap.dispatchEvent(new CustomEvent("cw-change"));
    return true;
  }

  return { gridEl: wrap, getWordValue, cellByKey, values, revealRandom, cellMap };
}

// 전체 맵에서 비어 있는 칸 하나를 골라 정답 글자를 공개.
export function revealRandomCell(render) {
  return render.revealRandom ? render.revealRandom() : false;
}
