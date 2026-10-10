const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../js/logic.js");

function blank(fill) {
  return Array.from({ length: L.ROWS }, function () {
    return Array(L.COLS).fill(fill);
  });
}

function keySet(cells) {
  return new Set(cells.map(function (p) {
    return p.r + "," + p.c;
  }));
}

test("findMatches detects a horizontal run of 3 and ignores pairs", function () {
  const board = blank(null);
  board[4][1] = 2;
  board[4][2] = 2;
  board[4][3] = 2;
  board[4][4] = 2;
  board[4][5] = 5;
  board[4][6] = 5;
  const found = L.findMatches(board);
  assert.deepEqual(
    found.cells.map(function (p) { return [p.r, p.c]; }),
    [[4, 1], [4, 2], [4, 3], [4, 4]]
  );
  assert.equal(found.groups.length, 1);
  assert.equal(found.groups[0].dir, "h");
  assert.equal(found.groups[0].length, 4);
});

test("findMatches detects vertical runs, edges, and L shapes", function () {
  const board = blank(null);
  board[0][0] = 1;
  board[1][0] = 1;
  board[2][0] = 1;
  board[5][7] = 4;
  board[6][7] = 4;
  board[7][7] = 4;
  board[3][3] = 3;
  board[3][4] = 3;
  board[3][5] = 3;
  board[4][3] = 3;
  board[5][3] = 3;
  const found = L.findMatches(board);
  const keys = keySet(found.cells);
  assert.equal(keys.size, 3 + 3 + 5);
  assert.ok(keys.has("0,0") && keys.has("7,7") && keys.has("5,3") && keys.has("3,5"));
  const dirs = found.groups.map(function (g) { return g.dir; }).sort();
  assert.deepEqual(dirs, ["h", "v", "v", "v"]);
});

test("nulls and broken runs are not matches", function () {
  const board = blank(null);
  board[2][0] = 1;
  board[2][1] = 1;
  board[2][2] = null;
  board[2][3] = 1;
  board[2][4] = 1;
  board[6][1] = 0;
  board[6][2] = 0;
  board[6][3] = 1;
  board[6][4] = 0;
  board[6][5] = 0;
  assert.equal(L.findMatches(board).cells.length, 0);
});

test("findMatches does not mutate the board", function () {
  const board = L.fallbackBoard();
  const before = JSON.stringify(board);
  L.findMatches(board);
  L.applyGravity(board);
  L.swapBoard(board, { r: 0, c: 0 }, { r: 0, c: 1 });
  assert.equal(JSON.stringify(board), before);
});

test("scoreGroups pays length bonuses and combo multipliers", function () {
  const three = [{ length: 3, dir: "h", type: 1, cells: [] }];
  const four = [{ length: 4, dir: "h", type: 1, cells: [] }];
  const five = [{ length: 5, dir: "v", type: 1, cells: [] }];
  assert.equal(L.scoreGroups(three, 1), 30);
  assert.equal(L.scoreGroups(four, 1), 70);
  assert.equal(L.scoreGroups(five, 1), 130);
  assert.equal(L.scoreGroups([three[0], { length: 3, dir: "v", type: 1, cells: [] }], 2), 120);
});

test("applyGravity packs each column downward and preserves order", function () {
  const board = blank(null);
  board[0][0] = 1;
  board[2][0] = 2;
  board[5][0] = 3;
  board[7][0] = 4;
  board[1][3] = 9;
  board[6][3] = 8;
  const before = JSON.stringify(board);
  const result = L.applyGravity(board);
  assert.equal(JSON.stringify(board), before);
  assert.deepEqual(result.board.map(function (row) { return row[0]; }), [
    null, null, null, null, 1, 2, 3, 4,
  ]);
  assert.equal(result.board[6][3], 9);
  assert.equal(result.board[7][3], 8);
  assert.equal(result.board[5][3], null);
  const moved = result.falls.filter(function (f) { return f.fromC === 0; });
  assert.equal(moved.length, 3);
  assert.ok(result.falls.every(function (f) { return f.toR > f.fromR && f.toC === f.fromC; }));
});

test("refill fills only holes and reports a drop from above", function () {
  const board = blank(1);
  board[0][0] = null;
  board[1][0] = null;
  board[7][4] = null;
  const types = [4, 2, 5];
  let i = 0;
  const rng = function () {
    return (types[i++] + 0.2) / L.GEM_TYPES;
  };
  const filled = L.refill(board, rng);
  assert.equal(filled.board[0][0], 4);
  assert.equal(filled.board[1][0], 2);
  assert.equal(filled.board[7][4], 5);
  assert.equal(filled.board[2][0], 1);
  assert.equal(filled.spawned.length, 3);
  const top = filled.spawned.find(function (s) { return s.r === 0 && s.c === 0; });
  const mid = filled.spawned.find(function (s) { return s.r === 1 && s.c === 0; });
  assert.equal(top.fromR, -2);
  assert.equal(mid.fromR, -1);
  assert.ok(top.fromR < 0 && mid.fromR < 0);
});

test("adjacency and swap matching", function () {
  const board = L.fallbackBoard();
  assert.equal(L.areAdjacent({ r: 0, c: 0 }, { r: 0, c: 1 }), true);
  assert.equal(L.areAdjacent({ r: 0, c: 0 }, { r: 1, c: 1 }), false);
  assert.equal(L.swapCreatesMatch(board, { r: 0, c: 1 }, { r: 1, c: 1 }), true);
  assert.equal(L.swapCreatesMatch(board, { r: 0, c: 0 }, { r: 0, c: 1 }), false);
  assert.equal(L.swapCreatesMatch(board, { r: 0, c: 0 }, { r: 2, c: 0 }), false);
  const swapped = L.swapBoard(board, { r: 0, c: 1 }, { r: 1, c: 1 });
  assert.ok(L.findMatches(swapped).cells.length >= 3);
  assert.equal(board[0][1], 1);
  assert.equal(swapped[0][1], 0);
});

test("fallback, random, and shuffled boards start stable and playable", function () {
  const fallback = L.fallbackBoard();
  assert.equal(L.findMatches(fallback).cells.length, 0);
  assert.equal(L.hasValidMoves(fallback), true);
  const hint = L.findHint(fallback);
  assert.deepEqual(hint, [{ r: 0, c: 1 }, { r: 1, c: 1 }]);

  for (let seed = 1; seed <= 25; seed++) {
    const board = L.createBoard(L.createRng(seed));
    assert.equal(board.length, L.ROWS);
    assert.ok(board.every(function (row) {
      return row.length === L.COLS && row.every(function (t) {
        return Number.isInteger(t) && t >= 0 && t < L.GEM_TYPES;
      });
    }));
    assert.equal(L.findMatches(board).cells.length, 0, "seed " + seed + " has a match");
    assert.equal(L.hasValidMoves(board), true, "seed " + seed + " has no move");
  }

  const again = L.createBoard(L.createRng(7));
  assert.deepEqual(again, L.createBoard(L.createRng(7)));

  const shuffled = L.shuffleBoard(fallback, L.createRng(3));
  assert.equal(L.findMatches(shuffled).cells.length, 0);
  assert.equal(L.hasValidMoves(shuffled), true);
});

test("resolve clears a match, cascades, and stops on a stable board", function () {
  const board = [];
  for (let r = 0; r < L.ROWS; r++) {
    const row = [];
    for (let c = 0; c < L.COLS; c++) row.push((r * 2 + c) % L.GEM_TYPES);
    board.push(row);
  }
  board[3][3] = 2;
  board[4][3] = 5;
  board[5][3] = 5;
  board[6][2] = 2;
  board[6][3] = 5;
  board[6][4] = 2;
  board[7][3] = 0;

  const initial = L.findMatches(board);
  assert.deepEqual(initial.cells, [
    { r: 4, c: 3 },
    { r: 5, c: 3 },
    { r: 6, c: 3 },
  ]);

  const rngTypes = [1, 3, 4, 0, 1, 2, 3, 4, 5, 0, 2];
  let i = 0;
  const rng = function () {
    const t = rngTypes[Math.min(i, rngTypes.length - 1)];
    i += 1;
    return (t + 0.15) / L.GEM_TYPES;
  };

  const result = L.resolve(board, rng);
  assert.ok(result.steps.length >= 2);
  assert.equal(result.steps[0].combo, 1);
  assert.equal(result.steps[0].score, 30);
  assert.deepEqual(result.steps[0].matches, initial.cells);
  const second = keySet(result.steps[1].matches);
  assert.ok(second.has("6,2") && second.has("6,3") && second.has("6,4"));
  assert.equal(result.steps[1].combo, 2);
  assert.ok(result.totalScore > result.steps[0].score);
  assert.equal(L.findMatches(result.board).cells.length, 0);
  assert.ok(result.board.every(function (row) {
    return row.every(function (cell) { return cell !== null; });
  }));
});

test("resolve caps runaway cascades", function () {
  const board = blank(1);
  const result = L.resolve(board, function () { return 0.01; }, 8);
  assert.equal(result.steps.length, 8);
  assert.ok(result.totalScore > 0);
});

test("a hinted swap resolves to a stable board and scores", function () {
  const rng = L.createRng(42);
  const board = L.createBoard(rng);
  const hint = L.findHint(board);
  assert.ok(hint);
  const swapped = L.swapBoard(board, hint[0], hint[1]);
  const result = L.resolve(swapped, L.createRng(99));
  assert.ok(result.steps.length >= 1);
  assert.ok(result.totalScore > 0);
  assert.equal(L.findMatches(result.board).cells.length, 0);
});

test("createGame starts with a full move budget and a quiet board", function () {
  const game = L.createGame(L.createRng(5));
  assert.equal(game.movesLeft, L.MOVES_PER_GAME);
  assert.equal(game.score, 0);
  assert.equal(game.status, "playing");
  assert.equal(L.findMatches(game.board).cells.length, 0);
  assert.equal(L.hasValidMoves(game.board), true);
});
