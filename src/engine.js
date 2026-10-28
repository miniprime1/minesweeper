export const presets = Object.freeze({
  beginner: Object.freeze({ rows: 9, cols: 9, mines: 10 }),
  intermediate: Object.freeze({ rows: 16, cols: 16, mines: 40 }),
  expert: Object.freeze({ rows: 16, cols: 30, mines: 99 }),
});

export const PRESETS = presets;

/** The rules of classic WinMine, independent of its display and clock. */
export class Minefield {
  constructor({ rows = 16, cols = 16, mines = 40 } = {}, rng = Math.random) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
      throw new RangeError('Rows and columns must be positive integers.');
    }
    if (!Number.isInteger(mines) || mines < 0 || mines >= rows * cols) {
      throw new RangeError('Mines must leave at least one safe cell.');
    }
    if (typeof rng !== 'function') throw new TypeError('The random source must be a function.');

    this.rows = rows;
    this.cols = cols;
    this.mines = mines;
    this.state = 'ready';
    this.revealedCount = 0;
    this.flags = 0;
    this.explodedIndex = -1;
    this.cells = Array.from({ length: rows * cols }, () => ({
      mine: false, adjacent: 0, revealed: false, mark: 0,
    }));

    // A partial shuffle avoids rejection loops even with a deterministic source.
    const positions = Array.from({ length: this.cells.length }, (_, index) => index);
    for (let i = 0; i < mines; i += 1) {
      const sample = rng();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new RangeError('The random source must return values in [0, 1).');
      }
      const selected = i + Math.floor(sample * (positions.length - i));
      [positions[i], positions[selected]] = [positions[selected], positions[i]];
      this.cells[positions[i]].mine = true;
    }
    this._countAdjacent();
  }

  get remaining() {
    return this.mines - this.flags;
  }

  neighbors(index) {
    if (!this._valid(index)) return [];
    const row = Math.floor(index / this.cols);
    const col = index % this.cols;
    const result = [];
    for (let y = Math.max(0, row - 1); y <= Math.min(this.rows - 1, row + 1); y += 1) {
      for (let x = Math.max(0, col - 1); x <= Math.min(this.cols - 1, col + 1); x += 1) {
        const neighbor = y * this.cols + x;
        if (neighbor !== index) result.push(neighbor);
      }
    }
    return result;
  }

  reveal(index) {
    if (!this._active() || !this._valid(index)) return false;
    const cell = this.cells[index];
    if (cell.revealed || cell.mark === 1) return false;

    if (this.state === 'ready') {
      // WinMine protects only the first cell, rather than its entire neighborhood.
      if (cell.mine) {
        const replacement = this.cells.findIndex((candidate) => !candidate.mine);
        cell.mine = false;
        this.cells[replacement].mine = true;
        this._countAdjacent();
      }
      this.state = 'playing';
    }

    if (cell.mine) {
      this._explode(index);
    } else {
      this._expand([index]);
      this._checkWin();
    }
    return true;
  }

  mark(index, allowQuestion = true) {
    if (!this._active() || !this._valid(index)) return false;
    const cell = this.cells[index];
    if (cell.revealed) return false;
    const previous = cell.mark;
    cell.mark = previous === 0 ? 1 : previous === 1 && allowQuestion ? 2 : 0;
    this.flags += Number(cell.mark === 1) - Number(previous === 1);
    return true;
  }

  chord(index) {
    if (this.state !== 'playing' || !this._valid(index)) return false;
    const cell = this.cells[index];
    if (!cell.revealed || cell.mine) return false;
    const surrounding = this.neighbors(index);
    if (surrounding.filter((neighbor) => this.cells[neighbor].mark === 1).length !== cell.adjacent) {
      return false;
    }
    const targets = surrounding.filter((neighbor) => {
      const target = this.cells[neighbor];
      return !target.revealed && target.mark !== 1;
    });
    if (!targets.length) return false;

    this._expand(targets.filter((target) => !this.cells[target].mine));
    const detonated = targets.filter((target) => this.cells[target].mine);
    if (detonated.length) {
      this._explode(detonated[0]);
      for (const target of detonated) {
        this.cells[target].revealed = true;
        this.cells[target].mark = 0;
      }
    } else {
      this._checkWin();
    }
    return true;
  }

  _valid(index) {
    return Number.isInteger(index) && index >= 0 && index < this.cells.length;
  }

  _active() {
    return this.state === 'ready' || this.state === 'playing';
  }

  _countAdjacent() {
    this.cells.forEach((cell, index) => {
      cell.adjacent = this.neighbors(index).reduce((sum, neighbor) => sum + Number(this.cells[neighbor].mine), 0);
    });
  }

  _expand(initial) {
    const pending = [...initial];
    while (pending.length) {
      const index = pending.pop();
      const cell = this.cells[index];
      if (cell.revealed || cell.mine || cell.mark === 1) continue;
      cell.revealed = true;
      cell.mark = 0;
      this.revealedCount += 1;
      if (cell.adjacent === 0) pending.push(...this.neighbors(index));
    }
  }

  _explode(index) {
    this.cells[index].revealed = true;
    this.cells[index].mark = 0;
    this.explodedIndex = index;
    this.state = 'lost';
  }

  _checkWin() {
    if (this.revealedCount !== this.cells.length - this.mines) return;
    this.state = 'won';
    for (const cell of this.cells) {
      if (cell.mine) cell.mark = 1;
    }
    this.flags = this.mines;
  }
}
