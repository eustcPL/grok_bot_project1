(function () {
  "use strict";

  var Logic = window.Match3Logic;
  var ROWS = Logic.ROWS;
  var COLS = Logic.COLS;

  var SHAPES = [
    '<svg class="gem-svg" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,2 60,24 32,62 4,24" fill="url(#g0)"/><polygon points="32,2 46,24 32,30 18,24" fill="rgba(255,255,255,0.55)"/></svg>',
    '<svg class="gem-svg" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,3 57,17 57,47 32,61 7,47 7,17" fill="url(#g1)"/><polygon points="32,3 48,16 32,24 16,16" fill="rgba(255,255,255,0.5)"/></svg>',
    '<svg class="gem-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="url(#g2)"/><ellipse cx="24" cy="22" rx="11" ry="7" fill="rgba(255,255,255,0.55)"/></svg>',
    '<svg class="gem-svg" viewBox="0 0 64 64" aria-hidden="true"><polygon points="20,3 44,3 61,20 61,44 44,61 20,61 3,44 3,20" fill="url(#g3)"/><polygon points="22,3 42,3 34,20 30,20" fill="rgba(255,255,255,0.55)"/></svg>',
    '<svg class="gem-svg" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,2 58,22 50,60 14,60 6,22" fill="url(#g4)"/><polygon points="32,2 46,22 32,26 18,22" fill="rgba(255,255,255,0.5)"/></svg>',
    '<svg class="gem-svg" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,2 39,23 61,23 43,36 50,58 32,45 14,58 21,36 3,23 25,23" fill="url(#g5)"/><polygon points="32,2 37,20 32,24 27,20" fill="rgba(255,255,255,0.75)"/></svg>',
  ];

  var FAST = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HINT_MS = 8000;
  var SWAP_MS = 190;
  var CLEAR_MS = 230;
  var BEST_KEY = "gem-match3-best-v1";
  var SWIPE_PX = 22;

  var boardEl = document.getElementById("board");
  var boardWrap = document.getElementById("board-wrap");
  var cellsEl = document.getElementById("cells");
  var gemsEl = document.getElementById("gems");
  var fxEl = document.getElementById("fx");
  var comboEl = document.getElementById("combo");
  var scoreEl = document.getElementById("score");
  var movesEl = document.getElementById("moves");
  var bestEl = document.getElementById("best");
  var scoreStat = document.getElementById("score-stat");
  var movesStat = document.getElementById("moves-stat");
  var statusEl = document.getElementById("status");
  var liveEl = document.getElementById("live");
  var overlay = document.getElementById("overlay");
  var finalScoreEl = document.getElementById("final-score");
  var recordEl = document.getElementById("record");
  var restartBtn = document.getElementById("restart");
  var againBtn = document.getElementById("again");

  var metrics = { gap: 8, cell: 48, stride: 56, pad: 8 };
  var gems = [];
  var game = null;
  var best = 0;
  var bestAtStart = 0;
  var busy = false;
  var token = 0;
  var selected = null;
  var pointer = null;
  var hintTimer = 0;

  function ms(normal) {
    return FAST ? 16 : normal;
  }

  function wait(duration) {
    return new Promise(function (resolve) {
      setTimeout(resolve, duration);
    });
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function fallDuration(dist) {
    return Math.min(520, 150 + Math.abs(dist) * 45);
  }

  function loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* private mode */
    }
  }

  function gemAt(r, c) {
    for (var i = 0; i < gems.length; i++) {
      if (gems[i].r === r && gems[i].c === c) return gems[i];
    }
    return null;
  }

  function measure() {
    var wrapW = boardWrap.clientWidth || 320;
    var max = Math.min(wrapW, Math.floor(window.innerHeight * 0.62));
    max = Math.max(240, max);
    var gap = Math.max(4, Math.round(max * 0.018));
    var cell = Math.floor((max - gap * 9) / COLS);
    var size = cell * COLS + gap * (COLS + 1);
    metrics = { gap: gap, cell: cell, stride: cell + gap, pad: gap, size: size };
    boardEl.style.setProperty("--cell", cell + "px");
    boardEl.style.setProperty("--gap", gap + "px");
    boardEl.style.setProperty("--size", size + "px");
  }

  function positionGem(gem, animate, dist) {
    var x = metrics.pad + gem.c * metrics.stride;
    var y = metrics.pad + gem.r * metrics.stride;
    gem.el.style.width = metrics.cell + "px";
    gem.el.style.height = metrics.cell + "px";
    if (!animate || FAST) {
      gem.el.style.transition = "none";
    } else {
      var duration = dist == null ? SWAP_MS : fallDuration(dist);
      gem.el.style.transition = "transform " + duration + "ms cubic-bezier(0.2, 0.85, 0.25, 1)";
    }
    gem.el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    if (gem.r >= 0) {
      gem.el.dataset.row = String(gem.r);
      gem.el.dataset.col = String(gem.c);
    }
    gem.el.dataset.type = String(gem.type);
  }

  function makeGem(type, r, c, enter) {
    var el = document.createElement("div");
    el.className = "gem" + (enter ? " enter" : "");
    el.innerHTML = '<div class="gem-inner">' + SHAPES[type] + "</div>";
    if (enter) {
      el.firstChild.style.animationDelay = (r + c) * 16 + "ms";
    }
    gemsEl.appendChild(el);
    return { type: type, r: r, c: c, el: el };
  }

  function rebuildGems(enter) {
    gemsEl.innerHTML = "";
    gems = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var gem = makeGem(game.board[r][c], r, c, enter);
        gems.push(gem);
        positionGem(gem, false);
      }
    }
  }

  function buildCells() {
    cellsEl.innerHTML = "";
    for (var i = 0; i < ROWS * COLS; i++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cellsEl.appendChild(cell);
    }
  }

  function formatScore(n) {
    return n.toLocaleString("zh-CN");
  }

  function updateHud() {
    scoreEl.textContent = formatScore(game.score);
    movesEl.textContent = String(game.movesLeft);
    bestEl.textContent = formatScore(best);
    movesStat.classList.toggle("low", game.status === "playing" && game.movesLeft <= 5);
    liveEl.textContent = "分数 " + game.score + "，剩余 " + game.movesLeft + " 步";
  }

  function bumpScore() {
    scoreStat.classList.remove("bump");
    void scoreStat.offsetWidth;
    scoreStat.classList.add("bump");
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function renderSelection() {
    for (var i = 0; i < gems.length; i++) {
      var on = selected && gems[i].r === selected.r && gems[i].c === selected.c;
      gems[i].el.classList.toggle("selected", Boolean(on));
    }
  }

  function clearHint() {
    for (var i = 0; i < gems.length; i++) gems[i].el.classList.remove("hint");
  }

  function scheduleHint() {
    clearTimeout(hintTimer);
    if (!game || game.status !== "playing") return;
    hintTimer = setTimeout(showHint, HINT_MS);
  }

  function showHint() {
    if (!game || game.status !== "playing") return;
    if (busy) {
      scheduleHint();
      return;
    }
    var hint = Logic.findHint(game.board);
    if (!hint) return;
    clearHint();
    for (var i = 0; i < hint.length; i++) {
      var gem = gemAt(hint[i].r, hint[i].c);
      if (gem) gem.el.classList.add("hint");
    }
    setStatus("提示：闪烁的两颗宝石可以交换");
  }

  function flashCombo(combo) {
    if (combo < 2) {
      comboEl.textContent = "";
      comboEl.classList.remove("show");
      return;
    }
    comboEl.textContent = "连击 ×" + combo;
    comboEl.classList.remove("show");
    void comboEl.offsetWidth;
    comboEl.classList.add("show");
  }

  function spawnScorePop(cells, gain, groups) {
    var r = 0;
    var c = 0;
    for (var i = 0; i < cells.length; i++) {
      r += cells[i].r;
      c += cells[i].c;
    }
    r /= cells.length;
    c /= cells.length;
    var label = "+" + gain;
    var long = false;
    var mid = false;
    for (var g = 0; g < groups.length; g++) {
      if (groups[g].length >= 5) long = true;
      else if (groups[g].length === 4) mid = true;
    }
    if (long) label = "五连 " + label;
    else if (mid) label = "四连 " + label;
    var el = document.createElement("div");
    el.className = "pop";
    el.textContent = label;
    el.style.left = metrics.pad + c * metrics.stride + metrics.cell / 2 + "px";
    el.style.top = metrics.pad + r * metrics.stride + metrics.cell * 0.15 + "px";
    fxEl.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 800);
  }

  function cellFromEvent(event) {
    var rect = boardEl.getBoundingClientRect();
    var x = event.clientX - rect.left - metrics.pad;
    var y = event.clientY - rect.top - metrics.pad;
    if (x < 0 || y < 0) return null;
    var c = Math.floor(x / metrics.stride);
    var r = Math.floor(y / metrics.stride);
    if (!Logic.inBounds(r, c)) return null;
    var lx = x - c * metrics.stride;
    var ly = y - r * metrics.stride;
    if (lx > metrics.cell || ly > metrics.cell) return null;
    return { r: r, c: c };
  }

  function aborted(my) {
    return my !== token;
  }

  function raise(gem) {
    gem.el.style.zIndex = "4";
  }

  function unraise(gem) {
    gem.el.style.zIndex = "";
  }

  async function animateExchange(a, b) {
    var gemA = gemAt(a.r, a.c);
    var gemB = gemAt(b.r, b.c);
    if (!gemA || !gemB) return;
    raise(gemA);
    raise(gemB);
    var r = gemA.r;
    var c = gemA.c;
    gemA.r = gemB.r;
    gemA.c = gemB.c;
    gemB.r = r;
    gemB.c = c;
    positionGem(gemA, true, 1);
    positionGem(gemB, true, 1);
    await wait(ms(SWAP_MS));
    unraise(gemA);
    unraise(gemB);
  }

  function shake(cell) {
    var gem = gemAt(cell.r, cell.c);
    if (!gem) return;
    gem.el.classList.remove("shake");
    void gem.el.offsetWidth;
    gem.el.classList.add("shake");
  }

  async function resolveLoop(my) {
    var combo = 0;
    while (combo < 40) {
      var found = Logic.findMatches(game.board);
      if (found.cells.length === 0) break;
      combo += 1;
      var gain = Logic.scoreGroups(found.groups, combo);
      game.score += gain;
      if (game.score > best) {
        best = game.score;
        saveBest(best);
      }
      updateHud();
      bumpScore();
      flashCombo(combo);
      spawnScorePop(found.cells, gain, found.groups);

      var clearing = [];
      for (var i = 0; i < found.cells.length; i++) {
        var gem = gemAt(found.cells[i].r, found.cells[i].c);
        if (!gem) continue;
        gem.el.classList.add("clearing");
        clearing.push(gem);
      }
      await wait(ms(CLEAR_MS));
      if (aborted(my)) return;
      for (var j = 0; j < clearing.length; j++) {
        clearing[j].el.remove();
        var idx = gems.indexOf(clearing[j]);
        if (idx >= 0) gems.splice(idx, 1);
      }

      var cleared = Logic.clearCells(game.board, found.cells);
      var grav = Logic.applyGravity(cleared);
      var planned = [];
      for (var f = 0; f < grav.falls.length; f++) {
        var falling = gemAt(grav.falls[f].fromR, grav.falls[f].fromC);
        if (!falling) continue;
        planned.push({
          gem: falling,
          toR: grav.falls[f].toR,
          toC: grav.falls[f].toC,
          dist: grav.falls[f].toR - grav.falls[f].fromR,
        });
      }
      for (var p = 0; p < planned.length; p++) {
        planned[p].gem.r = planned[p].toR;
        planned[p].gem.c = planned[p].toC;
      }

      var filled = Logic.refill(grav.board, Math.random);
      game.board = filled.board;
      var spawned = [];
      for (var s = 0; s < filled.spawned.length; s++) {
        var spawn = filled.spawned[s];
        var fresh = makeGem(spawn.type, spawn.fromR, spawn.c, false);
        gems.push(fresh);
        positionGem(fresh, false);
        void fresh.el.offsetWidth;
        spawned.push({
          gem: fresh,
          toR: spawn.r,
          toC: spawn.c,
          dist: spawn.r - spawn.fromR,
        });
      }

      await nextFrame();
      if (aborted(my)) return;

      var maxDist = 1;
      for (var m = 0; m < planned.length; m++) {
        maxDist = Math.max(maxDist, planned[m].dist);
        positionGem(planned[m].gem, true, planned[m].dist);
      }
      for (var n = 0; n < spawned.length; n++) {
        spawned[n].gem.r = spawned[n].toR;
        spawned[n].gem.c = spawned[n].toC;
        maxDist = Math.max(maxDist, spawned[n].dist);
        positionGem(spawned[n].gem, true, spawned[n].dist);
      }
      await wait(ms(fallDuration(maxDist)));
      if (aborted(my)) return;
    }
  }

  function audit() {
    if (gems.length !== ROWS * COLS) {
      rebuildGems(false);
      return;
    }
    var seen = new Set();
    for (var i = 0; i < gems.length; i++) {
      var gem = gems[i];
      var key = gem.r + "," + gem.c;
      if (
        !Logic.inBounds(gem.r, gem.c) ||
        seen.has(key) ||
        game.board[gem.r][gem.c] !== gem.type
      ) {
        rebuildGems(false);
        return;
      }
      seen.add(key);
    }
  }

  async function doReshuffle(my) {
    setStatus("没有可消除的走法，正在重新排列…");
    for (var i = 0; i < gems.length; i++) gems[i].el.classList.add("clearing");
    await wait(ms(220));
    if (aborted(my)) return;
    game.board = Logic.shuffleBoard(game.board, Math.random);
    rebuildGems(true);
    setStatus("没有可消除的走法，宝石已重新排列");
  }

  function endGame() {
    game.status = "over";
    clearTimeout(hintTimer);
    clearHint();
    selected = null;
    renderSelection();
    finalScoreEl.textContent = formatScore(game.score);
    var isRecord = game.score > bestAtStart && game.score > 0;
    recordEl.hidden = !isRecord;
    overlay.hidden = false;
    againBtn.focus();
    setStatus("");
    updateHud();
  }

  async function beginSwap(a, b) {
    if (busy || !game || game.status !== "playing") return;
    if (!Logic.areAdjacent(a, b)) return;
    var my = ++token;
    busy = true;
    selected = null;
    renderSelection();
    clearHint();
    await animateExchange(a, b);
    if (aborted(my)) return;

    if (!Logic.swapCreatesMatch(game.board, a, b)) {
      await animateExchange(a, b);
      if (aborted(my)) return;
      shake(a);
      busy = false;
      scheduleHint();
      return;
    }

    game.board = Logic.swapBoard(game.board, a, b);
    game.movesLeft -= 1;
    updateHud();
    await resolveLoop(my);
    if (aborted(my)) return;
    audit();

    if (game.movesLeft <= 0) {
      endGame();
      busy = false;
      return;
    }
    if (!Logic.hasValidMoves(game.board)) {
      await doReshuffle(my);
      if (aborted(my)) return;
    }
    busy = false;
    scheduleHint();
  }

  function handleTap(cell) {
    if (busy || game.status !== "playing") return;
    if (!selected) {
      selected = cell;
      renderSelection();
      return;
    }
    if (selected.r === cell.r && selected.c === cell.c) {
      selected = null;
      renderSelection();
      return;
    }
    if (Logic.areAdjacent(selected, cell)) {
      var origin = selected;
      selected = null;
      renderSelection();
      beginSwap(origin, cell);
      return;
    }
    selected = cell;
    renderSelection();
  }

  function snapGem(gem) {
    if (!gem) return;
    gem.el.classList.remove("pressing");
    positionGem(gem, true, 1);
  }

  function onDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (busy || !game || game.status !== "playing") return;
    var cell = cellFromEvent(event);
    if (!cell) return;
    var gem = gemAt(cell.r, cell.c);
    if (!gem) return;
    event.preventDefault();
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cell: cell,
      gem: gem,
      swiped: false,
    };
    gem.el.classList.add("pressing");
    clearHint();
    setStatus("");
    scheduleHint();
    try {
      boardEl.setPointerCapture(event.pointerId);
    } catch (err) {
      /* capture is optional */
    }
  }

  function onMove(event) {
    if (!pointer || event.pointerId !== pointer.id || pointer.swiped) return;
    var dx = event.clientX - pointer.x;
    var dy = event.clientY - pointer.y;
    var dist = Math.hypot(dx, dy);
    if (dist < SWIPE_PX) {
      var cap = metrics.cell * 0.28;
      var nx = Math.max(-cap, Math.min(cap, dx));
      var ny = Math.max(-cap, Math.min(cap, dy));
      var x = metrics.pad + pointer.gem.c * metrics.stride + nx;
      var y = metrics.pad + pointer.gem.r * metrics.stride + ny;
      pointer.gem.el.style.transition = "none";
      pointer.gem.el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      return;
    }
    pointer.swiped = true;
    pointer.gem.el.classList.remove("pressing");
    var cell = pointer.cell;
    var gem = pointer.gem;
    var dir = Math.abs(dx) > Math.abs(dy)
      ? { r: 0, c: dx > 0 ? 1 : -1 }
      : { r: dy > 0 ? 1 : -1, c: 0 };
    var target = { r: cell.r + dir.r, c: cell.c + dir.c };
    pointer = null;
    if (!Logic.inBounds(target.r, target.c)) {
      snapGem(gem);
      shake(cell);
      return;
    }
    beginSwap(cell, target);
  }

  function onUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    var info = pointer;
    pointer = null;
    info.gem.el.classList.remove("pressing");
    if (info.swiped) return;
    var dx = event.clientX - info.x;
    var dy = event.clientY - info.y;
    if (Math.hypot(dx, dy) > 0) positionGem(info.gem, true, 1);
    handleTap(info.cell);
  }

  function applyLayout() {
    measure();
    for (var i = 0; i < gems.length; i++) positionGem(gems[i], false);
  }

  function restart() {
    token += 1;
    busy = false;
    pointer = null;
    selected = null;
    clearTimeout(hintTimer);
    clearHint();
    comboEl.classList.remove("show");
    comboEl.textContent = "";
    fxEl.innerHTML = "";
    overlay.hidden = true;
    recordEl.hidden = true;
    setStatus("");
    bestAtStart = best;
    game = Logic.createGame(Math.random);
    measure();
    rebuildGems(true);
    updateHud();
    scheduleHint();
  }

  function init() {
    best = loadBest();
    bestAtStart = best;
    buildCells();
    measure();
    game = Logic.createGame(Math.random);
    rebuildGems(true);
    updateHud();
    scheduleHint();

    boardEl.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    boardEl.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
    restartBtn.addEventListener("click", restart);
    againBtn.addEventListener("click", restart);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && game && game.status === "over") restart();
    });
    window.addEventListener("resize", applyLayout);
    if (typeof ResizeObserver === "function") {
      var observer = new ResizeObserver(applyLayout);
      observer.observe(boardWrap);
    }
  }

  try {
    init();
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "游戏加载失败，请刷新页面。";
  }
})();
