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

  // ── 입력형: 단일 캐럿 ──────────────────────────────────────────────
  // 단일 캐럿: 재부모화(DOM 이동)하면 포커스/IME 조합이 끊기므로,
  // 그리드 안에 한 번만 두고 "위치만" 옮긴다(조합 연속성 유지).
  const caret = document.createElement("input");
  caret.className = "cw-caret";
  caret.setAttribute("inputmode", "text");
  caret.autocomplete = "off";
  caret.autocapitalize = "off";
  caret.spellcheck = false;
  caret.maxLength = 4;
  caret.style.display = "none";
  wrap.style.position = "relative";
  wrap.appendChild(caret);
  function positionCaret(cell) {
    caret.style.left = cell.offsetLeft + "px";
    caret.style.top = cell.offsetTop + "px";
    caret.style.width = cell.offsetWidth + "px";
    caret.style.height = cell.offsetHeight + "px";
    caret.style.display = "block";
  }

  let activeKey = null;
  let activeDir = "across";
  let composing = false;
  let skipNextInput = false;
  let lastClickKey = null;

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
    cell.classList.remove("pop");
    void cell.offsetWidth;
    cell.classList.add("pop");
  }
  // dir 방향으로 다음 "편집 가능" 칸(없으면 null)
  function nextEditable(k, dir, delta = 1) {
    let [r, c] = parseK(k);
    const dr = dir === "down" ? delta : 0;
    const dc = dir === "across" ? delta : 0;
    for (let g = 0; g < 128; g++) {
      r += dr;
      c += dc;
      const nk = r + "," + c;
      if (!has(nk)) return null;
      if (isEditable(nk)) return nk;
    }
    return null;
  }
  // 방향키: 빈 칸 건너뛰며 다음 칸(편집불가 포함)
  function nextAny(k, dir, delta) {
    let [r, c] = parseK(k);
    const dr = dir === "down" ? delta : 0;
    const dc = dir === "across" ? delta : 0;
    let nr = r + dr,
      nc = c + dc;
    for (let g = 0; g < 128; g++) {
      if (nr < 0 || nc < 0 || nr >= layout.rows || nc >= layout.cols) return null;
      const nk = nr + "," + nc;
      if (has(nk)) return nk;
      nr += dr;
      nc += dc;
    }
    return null;
  }
  function highlight(k) {
    wrap
      .querySelectorAll(".cw-cell.active, .cw-cell.in-word")
      .forEach((el) => el.classList.remove("active", "in-word"));
    const hasA = acrossOf.has(k),
      hasD = downOf.has(k);
    if (activeDir === "across" && !hasA && hasD) activeDir = "down";
    else if (activeDir === "down" && !hasD && hasA) activeDir = "across";
    const p = activeDir === "across" ? acrossOf.get(k) : downOf.get(k);
    if (p)
      for (const cell of p.cells) {
        const el = cellByKey.get(cell.r + "," + cell.c);
        if (el) el.classList.add("in-word");
      }
    cellByKey.get(k).classList.add("active");
  }
  function fireActive(k) {
    if (!onActive) return;
    onActive({
      key: k,
      cellEl: cellByKey.get(k),
      across: acrossOf.get(k) || null,
      down: downOf.get(k) || null,
      dir: activeDir,
    });
  }
  // 편집 칸으로 캐럿 이동(showClue=true 면 힌트 팝업 표시 콜백 호출)
  function moveTo(k, showClue) {
    if (!isEditable(k)) return;
    activeKey = k;
    positionCaret(cellByKey.get(k)); // 재부모화 없이 위치만 이동
    caret.value = getVal(k);
    highlight(k);
    if (showClue) fireActive(k);
    caret.focus({ preventScroll: true });
    try {
      caret.setSelectionRange(0, caret.value.length);
    } catch (_) {}
  }

  function handleCommit() {
    if (activeKey == null) return;
    const chars = Array.from(caret.value);
    if (chars.length === 0) {
      setVal(activeKey, "");
      wrap.dispatchEvent(new CustomEvent("cw-change"));
      return;
    }
    setVal(activeKey, chars[0]);
    pop(activeKey);
    let k = activeKey;
    for (let i = 1; i < chars.length; i++) {
      const nk = nextEditable(k, activeDir);
      if (!nk) break;
      setVal(nk, chars[i]);
      pop(nk);
      k = nk;
    }
    const after = nextEditable(k, activeDir);
    caret.value = "";
    if (after) moveTo(after, false);
    else caret.value = getVal(activeKey); // 마지막 칸: 확정 글자 유지
    wrap.dispatchEvent(new CustomEvent("cw-change"));
  }

  // 모바일 등에서 한 칸에 글자가 쌓일 때: 마지막(입력 중) 글자만 남기고
  // 앞 글자들을 진행 방향으로 한 칸씩 확정하며 흘려보낸다.
  function spillOver(chars) {
    let k = activeKey;
    for (let i = 0; i < chars.length - 1; i++) {
      if (k == null) break;
      setVal(k, chars[i]);
      pop(k);
      k = nextEditable(k, activeDir);
    }
    const last = chars[chars.length - 1];
    if (k != null) {
      activeKey = k;
      positionCaret(cellByKey.get(k));
      setVal(k, last);
      caret.value = last;
      highlight(k);
      caret.focus({ preventScroll: true });
      try {
        caret.setSelectionRange(last.length, last.length);
      } catch (_) {}
    } else {
      caret.value = "";
    }
    wrap.dispatchEvent(new CustomEvent("cw-change"));
  }

  caret.addEventListener("compositionstart", () => {
    composing = true;
  });
  caret.addEventListener("compositionupdate", () => {
    composing = true; // compositionstart 를 안 보내는 키보드 대비
  });
  caret.addEventListener("compositionend", () => {
    composing = false;
    skipNextInput = true;
    handleCommit();
    setTimeout(() => {
      skipNextInput = false;
    }, 0);
  });
  caret.addEventListener("input", (e) => {
    // 조합(IME) 중에는 절대 건드리지 않음 → 받침/이중모음이 깨지지 않음
    if (e.isComposing || composing) return;
    if (skipNextInput) {
      skipNextInput = false;
      return;
    }
    // 조합이 아닌데 2글자 이상 쌓였으면(조합 이벤트가 없는 키보드/붙여넣기)
    // 앞 글자부터 다음 칸으로 흘려보냄
    const chars = Array.from(caret.value);
    if (chars.length >= 2) {
      spillOver(chars);
      return;
    }
    handleCommit();
  });
  caret.addEventListener("keydown", (e) => {
    const k = activeKey;
    if (k == null) return;
    const key = e.key;
    if (key === "ArrowRight") {
      e.preventDefault();
      activeDir = "across";
      const n = nextAny(k, "across", 1);
      if (n && isEditable(n)) moveTo(n, true);
    } else if (key === "ArrowLeft") {
      e.preventDefault();
      activeDir = "across";
      const n = nextAny(k, "across", -1);
      if (n && isEditable(n)) moveTo(n, true);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      activeDir = "down";
      const n = nextAny(k, "down", 1);
      if (n && isEditable(n)) moveTo(n, true);
    } else if (key === "ArrowUp") {
      e.preventDefault();
      activeDir = "down";
      const n = nextAny(k, "down", -1);
      if (n && isEditable(n)) moveTo(n, true);
    } else if (key === "Tab") {
      e.preventDefault();
      const n = nextEditable(k, activeDir, e.shiftKey ? -1 : 1);
      if (n) moveTo(n, true);
    } else if (key === "Backspace") {
      if (caret.value === "") {
        e.preventDefault();
        const prev = nextEditable(k, activeDir, -1);
        if (prev) {
          setVal(prev, "");
          moveTo(prev, false);
          wrap.dispatchEvent(new CustomEvent("cw-change"));
        }
      }
      // 값이 있으면 기본 동작(삭제) → input 이벤트로 setVal('') 처리
    } else if (key === "Delete") {
      e.preventDefault();
      setVal(k, "");
      caret.value = "";
      wrap.dispatchEvent(new CustomEvent("cw-change"));
    }
  });

  // 칸 클릭(탭): 편집 칸이면 캐럿 이동 + 힌트 팝업, 같은 칸 재클릭 시 방향 토글.
  // 편집 불가(미리 주어진) 번호 칸이라도 힌트 팝업은 띄움.
  wrap.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cw-cell");
    if (!cell || !cell.dataset.k) return;
    const k = cell.dataset.k;
    if (isEditable(k)) {
      if (lastClickKey === k && acrossOf.has(k) && downOf.has(k))
        activeDir = activeDir === "across" ? "down" : "across";
      lastClickKey = k;
      e.preventDefault();
      moveTo(k, true);
    } else if (has(k)) {
      highlight(k);
      fireActive(k);
    }
  });

  // 첫 편집 칸을 기본 활성으로(포커스/팝업 없이). 실제 위치는 첫 클릭 시 계산.
  for (const k of chByKey.keys()) {
    if (isEditable(k)) {
      activeKey = k;
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
