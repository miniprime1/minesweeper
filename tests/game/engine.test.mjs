import test from 'node:test';
import assert from 'node:assert/strict';
import { Minefield, presets } from '../../src/engine.js';

function fieldWithMines(rows, cols, positions) {
  // Select known positions through the public random-source injection.
  const remaining = Array.from({ length: rows * cols }, (_, index) => index);
  let draw = 0;
  return new Minefield({ rows, cols, mines: positions.length }, () => {
    const selected = remaining.indexOf(positions[draw], draw);
    const sample = (selected - draw + 0.1) / (remaining.length - draw);
    [remaining[draw], remaining[selected]] = [remaining[selected], remaining[draw]];
    draw += 1;
    return sample;
  });
}

test('presets and board generation preserve all mine and adjacency counts', () => {
  for (const preset of Object.values(presets)) {
    let seed = 17;
    const game = new Minefield(preset, () => ((seed = (seed * 48271) % 2147483647) / 2147483647));
    assert.equal(game.cells.length, preset.rows * preset.cols);
    assert.equal(game.cells.filter((cell) => cell.mine).length, preset.mines);
    game.cells.forEach((cell, index) => {
      assert.equal(cell.adjacent, game.neighbors(index).filter((neighbor) => game.cells[neighbor].mine).length);
    });
    assert.equal(game.state, 'ready');
    assert.equal(game.remaining, preset.mines);
  }
});

test('the first reveal relocates only the clicked mine and may show a number', () => {
  const game = fieldWithMines(3, 3, [4, 8]);
  assert.equal(game.reveal(4), true);
  assert.equal(game.cells[4].mine, false);
  assert.equal(game.cells[0].mine, true);
  assert.equal(game.cells[8].mine, true);
  assert.equal(game.cells[4].adjacent, 2);
  assert.equal(game.cells.filter((cell) => cell.mine).length, 2);
  assert.equal(game.revealedCount, 1);
  assert.equal(game.state, 'playing');
});

test('flag and question transitions do not start play; questions may be revealed', () => {
  const game = fieldWithMines(3, 3, [8]);
  game.mark(4);
  assert.equal(game.flags, 1);
  assert.equal(game.remaining, 0);
  assert.equal(game.reveal(4), false);
  assert.equal(game.state, 'ready');
  game.mark(4);
  assert.equal(game.cells[4].mark, 2);
  assert.equal(game.flags, 0);
  game.reveal(4);
  assert.equal(game.cells[4].revealed, true);
  assert.equal(game.cells[4].mark, 0);
  assert.equal(game.mark(4), false);
  game.mark(8, false);
  game.mark(8, false);
  assert.equal(game.cells[8].mark, 0);
});

test('zero flood respects flags, opens its numbered border, then automatically wins', () => {
  const game = fieldWithMines(4, 4, [15]);
  game.mark(1);
  game.reveal(0);
  assert.equal(game.cells[1].revealed, false);
  assert.equal(game.cells[10].revealed, true);
  assert.equal(game.cells[10].adjacent, 1);
  assert.equal(game.revealedCount, 14);
  assert.equal(game.state, 'playing');
  game.mark(1, false);
  game.reveal(1);
  assert.equal(game.state, 'won');
  assert.equal(game.revealedCount, 15);
  assert.equal(game.cells[15].mark, 1);
  assert.equal(game.flags, 1);
  assert.equal(game.remaining, 0);
  assert.equal(game.reveal(15), false);
  assert.equal(game.mark(15), false);
});

test('a correct chord requires the matching flag count and reveals remaining neighbors', () => {
  const game = fieldWithMines(3, 3, [0]);
  game.reveal(4);
  assert.equal(game.chord(4), false);
  game.mark(0);
  assert.equal(game.chord(4), true);
  assert.equal(game.state, 'won');
  assert.equal(game.revealedCount, 8);
  assert.equal(game.explodedIndex, -1);
});

test('a chord with the correct count but incorrect flags detonates a mine', () => {
  const game = fieldWithMines(3, 3, [0]);
  game.reveal(4);
  game.mark(1);
  assert.equal(game.chord(4), true);
  assert.equal(game.state, 'lost');
  assert.equal(game.explodedIndex, 0);
  assert.equal(game.cells[0].revealed, true);
  assert.equal(game.cells[1].mark, 1);
  assert.equal(game.cells[1].revealed, false);
  assert.equal(game.reveal(1), false);
  assert.equal(game.chord(4), false);
});

test('later mine clicks lose, invalid coordinates do nothing, counters can be negative', () => {
  const game = fieldWithMines(3, 3, [8]);
  assert.deepEqual(game.neighbors(0), [1, 3, 4]);
  for (const index of [-1, 9, 0.5, NaN]) {
    assert.equal(game.reveal(index), false);
    assert.equal(game.mark(index), false);
    assert.deepEqual(game.neighbors(index), []);
  }
  game.mark(0);
  game.mark(1);
  assert.equal(game.remaining, -1);
  game.reveal(4);
  game.reveal(8);
  assert.equal(game.state, 'lost');
  assert.equal(game.explodedIndex, 8);
  assert.equal(game.revealedCount, 1);
});
