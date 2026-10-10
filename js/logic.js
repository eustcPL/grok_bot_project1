/*
 * Match-3 rules. No DOM, no rendering.
 * Coordinates: row 0 is the top of the board, column 0 is the left.
 * Empty cells are null. Gem types are integers in [0, GEM_TYPES).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.Match3Logic = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ROWS = 8;
  var COLS = 8;
  var GEM_TYPES = 6;
  var MOVES_PER_GAME = 30;

  function createRng(seed) {
    var a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cloneBoard(board) {
    return board.map(function (row) {
      return row.slice();
    });
  }

  function inBounds(r, c) {
    return r >= 0 && c >= 0 && r < ROWS && c < COLS;
  }

  function areAdjacent(a, b) {
    if (!a || !b) return false;
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function randomType(rng) {
    return Math.min(GEM_TYPES - 1, Math.floor(rng() * GEM_TYPES));
  }

  function findMatches(board) {
    var matched = new Set();
    var groups = [];

    function addGroup(dir, type, cells) {
      groups.push({ dir: dir, type: type, cells: cells, length: cells.length });
      for (var i = 0; i < cells.length; i++) {
        matched.add(cells[i].r + "," + cells[i].c);
      }
    }

    var r;
    var c;
    var start;
    var len;
    var cells;

    for (r = 0; r < ROWS; r++) {
      start = 0;
      for (c = 1; c <= COLS; c++) {
        var continues =
          c < COLS &&
          board[r][c] !== null &&
          board[r][c] === board[r][start];
        if (!continues) {
          len = c - start;
          if (board[r][start] !== null && len >= 3) {
            cells = [];
            for (var k = start; k < c; k++) cells.push({ r: r, c: k });
            addGroup("h", board[r][start], cells);
          }
          start = c;
        }
      }
    }

    for (c = 0; c < COLS; c++) {
      start = 0;
      for (r = 1; r <= ROWS; r++) {
        var continuesV =
          r < ROWS &&
          board[r][c] !== null &&
          board[r][c] === board[start][c];
        if (!continuesV) {
          len = r - start;
          if (board[start][c] !== null && len >= 3) {
            cells = [];
            for (var k2 = start; k2 < r; k2++) cells.push({ r: k2, c: c });
            addGroup("v", board[start][c], cells);
          }
          start = r;
        }
      }
    }

    var list = [];
    matched.forEach(function (key) {
      var parts = key.split(",");
      list.push({ r: Number(parts[0]), c: Number(parts[1]) });
    });
    list.sort(function (a, b) {
      return a.r - b.r || a.c - b.c;
    });
    return { cells: list, groups: groups };
  }

  function lineScore(length) {
    var score = length * 10;
    if (length === 4) score += 30;
    else if (length >= 5) score += 80;
    return score;
  }

  function scoreGroups(groups, combo) {
    var points = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].length >= 3) points += lineScore(groups[i].length);
    }
    var multiplier = Math.max(1, combo || 1);
    return points * multiplier;
  }

  function clearCells(board, cells) {
    var next = cloneBoard(board);
    for (var i = 0; i < cells.length; i++) {
      next[cells[i].r][cells[i].c] = null;
    }
    return next;
  }

  function applyGravity(board) {
    var next = [];
    var falls = [];
    var r;
    var c;
    for (r = 0; r < ROWS; r++) {
      next.push(new Array(COLS).fill(null));
    }
    for (c = 0; c < COLS; c++) {
      var dest = ROWS - 1;
      for (r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== null) {
          next[dest][c] = board[r][c];
          if (dest !== r) {
            falls.push({
              fromR: r,
              fromC: c,
              toR: dest,
              toC: c,
              type: board[r][c],
            });
          }
          dest -= 1;
        }
      }
    }
    return { board: next, falls: falls };
  }

  /*
   * Fills nulls in place. fromR is the visual start row above the board,
   * and is only meaningful after applyGravity (nulls packed at the top).
   */
  function refill(board, rng) {
    var next = cloneBoard(board);
    var spawned = [];
    for (var c = 0; c < COLS; c++) {
      var holes = [];
      for (var r = 0; r < ROWS; r++) {
        if (next[r][c] === null) holes.push(r);
      }
      var n = holes.length;
      for (var i = 0; i < n; i++) {
        var row = holes[i];
        var type = randomType(rng);
        next[row][c] = type;
        spawned.push({ r: row, c: c, type: type, fromR: row - n });
      }
    }
    return { board: next, spawned: spawned };
  }

  function swapBoard(board, a, b) {
    var next = cloneBoard(board);
    var tmp = next[a.r][a.c];
    next[a.r][a.c] = next[b.r][b.c];
    next[b.r][b.c] = tmp;
    return next;
  }

  function swapCreatesMatch(board, a, b) {
    if (!areAdjacent(a, b)) return false;
    if (!inBounds(a.r, a.c) || !inBounds(b.r, b.c)) return false;
    if (board[a.r][a.c] === null || board[b.r][b.c] === null) return false;
    return findMatches(swapBoard(board, a, b)).cells.length > 0;
  }

  function findHint(board) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var neighbors = [
          { r: r, c: c + 1 },
          { r: r + 1, c: c },
        ];
        for (var i = 0; i < neighbors.length; i++) {
          var n = neighbors[i];
          if (n.r < ROWS && n.c < COLS && swapCreatesMatch(board, { r: r, c: c }, n)) {
            return [
              { r: r, c: c },
              { r: n.r, c: n.c },
            ];
          }
        }
      }
    }
    return null;
  }

  function hasValidMoves(board) {
    return findHint(board) !== null;
  }

  function fallbackBoard() {
    var board = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push((r * 2 + c) % GEM_TYPES);
      board.push(row);
    }
    // A guaranteed swap: exchange (0,1) with (1,1) to line up three 0s.
    board[0][0] = 0;
    board[0][1] = 1;
    board[0][2] = 0;
    board[1][0] = 1;
    board[1][1] = 0;
    board[1][2] = 1;
    return board;
  }

  function createBoard(rng) {
    var random = rng || Math.random;
    var last = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      var board = [];
      for (var r = 0; r < ROWS; r++) {
        var row = new Array(COLS).fill(null);
        for (var c = 0; c < COLS; c++) {
          var forbidden = new Set();
          if (c >= 2 && row[c - 1] !== null && row[c - 1] === row[c - 2]) {
            forbidden.add(row[c - 1]);
          }
          if (
            r >= 2 &&
            board[r - 1][c] !== null &&
            board[r - 1][c] === board[r - 2][c]
          ) {
            forbidden.add(board[r - 1][c]);
          }
          var options = [];
          for (var t = 0; t < GEM_TYPES; t++) {
            if (!forbidden.has(t)) options.push(t);
          }
          row[c] = options[Math.floor(random() * options.length)];
        }
        board.push(row);
      }
      last = board;
      if (findMatches(board).cells.length === 0 && hasValidMoves(board)) {
        return board;
      }
    }
    if (last && findMatches(last).cells.length === 0 && hasValidMoves(last)) {
      return last;
    }
    return fallbackBoard();
  }

  function shuffleBoard(board, rng) {
    var random = rng || Math.random;
    var types = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c] !== null) types.push(board[r][c]);
      }
    }
    if (types.length !== ROWS * COLS) return createBoard(random);
    for (var attempt = 0; attempt < 100; attempt++) {
      var bag = types.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(random() * (i + 1));
        var tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      var next = [];
      var k = 0;
      for (var rr = 0; rr < ROWS; rr++) {
        var row = [];
        for (var cc = 0; cc < COLS; cc++) row.push(bag[k++]);
        next.push(row);
      }
      if (findMatches(next).cells.length === 0 && hasValidMoves(next)) return next;
    }
    return createBoard(random);
  }

  function resolve(board, rng, maxSteps) {
    var random = rng || Math.random;
    var limit = maxSteps || 40;
    var current = cloneBoard(board);
    var steps = [];
    var totalScore = 0;
    var combo = 0;
    for (var i = 0; i < limit; i++) {
      var found = findMatches(current);
      if (found.cells.length === 0) break;
      combo += 1;
      var score = scoreGroups(found.groups, combo);
      totalScore += score;
      var cleared = clearCells(current, found.cells);
      var grav = applyGravity(cleared);
      var filled = refill(grav.board, random);
      current = filled.board;
      steps.push({
        matches: found.cells,
        groups: found.groups,
        score: score,
        combo: combo,
        falls: grav.falls,
        spawned: filled.spawned,
        board: cloneBoard(current),
      });
    }
    return { board: current, steps: steps, totalScore: totalScore, combo: combo };
  }

  function createGame(rng) {
    var random = rng || Math.random;
    return {
      board: createBoard(random),
      score: 0,
      movesLeft: MOVES_PER_GAME,
      status: "playing",
    };
  }

  return {
    ROWS: ROWS,
    COLS: COLS,
    GEM_TYPES: GEM_TYPES,
    MOVES_PER_GAME: MOVES_PER_GAME,
    createRng: createRng,
    cloneBoard: cloneBoard,
    inBounds: inBounds,
    areAdjacent: areAdjacent,
    findMatches: findMatches,
    lineScore: lineScore,
    scoreGroups: scoreGroups,
    clearCells: clearCells,
    applyGravity: applyGravity,
    refill: refill,
    swapBoard: swapBoard,
    swapCreatesMatch: swapCreatesMatch,
    findHint: findHint,
    hasValidMoves: hasValidMoves,
    fallbackBoard: fallbackBoard,
    createBoard: createBoard,
    shuffleBoard: shuffleBoard,
    resolve: resolve,
    createGame: createGame,
  };
});
