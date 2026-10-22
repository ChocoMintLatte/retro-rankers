/**
 * ============================================================================
 * RETRO RANKERS - NEON TETRIS (js/games/tetris.js)
 * High-Performance Competitive Cyberpunk Tetris Benchmarked Against TETR.IO
 * ============================================================================
 * 
 * TETR.IO Benchmark Specifications & Handling:
 * - 600x750 Canvas Layout:
 *   - Main 10x20 Board (32px cells -> 320x640px at x=40, y=55)
 *   - Dynamic Vertical Board Spring Reaction on Hard Drops & Line Clears
 *   - Right HUD Panel (x=390, y=55, width=170) containing SCORE, LEVEL/LINES,
 *     HOLD box (with lock state indicator), NEXT box, and full CONTROLS card.
 * - HOLD Feature (`C` or `Shift` key):
 *   - Stores piece key ('I', 'T', etc.) in `this.holdPiece`, once per piece lock.
 *   - Clean swap or pull from nextPiece, resets drop/lock timers and moves.
 * - TETR.IO Rotation & Super Rotation System (SRS) Wall/Floor Kicks:
 *   - Clockwise Rotation: `ArrowUp`, `KeyX`, `KeyW`
 *   - Counter-Clockwise Rotation: `KeyZ`, `ControlLeft`, `ControlRight`
 *   - 180° Rotation: `KeyA`
 *   - Comprehensive SRS kicks: [[0,0], [-1,0], [1,0], [0,-1], [-1,-1], [1,-1], [-2,0], [2,0], [0,-2]]
 * - Extended Placement Lock Delay & Anti-Stall Mechanics:
 *   - Grounded detection does NOT immediately lock pieces on gravity or soft drop.
 *   - `lockDelay = 0.5s`, resets on grounded moves/rotations up to `maxLockMoves = 15`.
 *   - Real-time subtle Lock Delay gauge and piece pulse glow when grounded.
 * - Instantaneous DAS / ARR / Soft Drop:
 *   - Zero dead-zone direction switching with `moveDir` tracking (-1, 1, 0).
 *   - `dasDelay = 0.11` (110ms), `dasInterval = 0.025` (25ms fast ARR).
 *   - `softDropInterval = 0.025` (fast TETR.IO SDF).
 * - Exact class interface: `window.NeonTetris(canvas, callbacks)` with
 *   `start()`, `stop()`, `update(dt)`, `render(ctx)`, `handleKeyDown(e)`, `handleKeyUp(e)`.
 */

(function () {
  'use strict';

  // --- Tetromino Definitions (Standard SRS Orientations) ---
  const TETROMINOES = {
    I: {
      color: '#6EC6E6', // Pastel Sky Blue
      matrix: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      spawnX: 3,
      spawnY: -1
    },
    O: {
      color: '#F4C552', // Mustard Gold
      matrix: [
        [1, 1],
        [1, 1]
      ],
      spawnX: 4,
      spawnY: 0
    },
    T: {
      color: '#B388EB', // Pastel Lavender
      matrix: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    S: {
      color: '#7BE092', // Pastel Mint Green
      matrix: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    Z: {
      color: '#F2546D', // Patch Rose Red
      matrix: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    J: {
      color: '#5C85D6', // Soft Royal Blue
      matrix: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    L: {
      color: '#F7A072', // Warm Peach/Apricot
      matrix: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    }
  };

  const TETROMINO_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  // Helper: Hex color to RGBA string
  function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Helper: Rotate NxN matrix clockwise
  function rotateMatrix(matrix) {
    const N = matrix.length;
    const rotated = [];
    for (let r = 0; r < N; r++) {
      rotated[r] = [];
      for (let c = 0; c < N; c++) {
        rotated[r][c] = matrix[N - 1 - c][r];
      }
    }
    return rotated;
  }

  // Helper: Rotate NxN matrix counter-clockwise
  function rotateMatrixCCW(matrix) {
    const N = matrix.length;
    const rotated = [];
    for (let r = 0; r < N; r++) {
      rotated[r] = [];
      for (let c = 0; c < N; c++) {
        rotated[r][c] = matrix[c][N - 1 - r];
      }
    }
    return rotated;
  }

  // Helper: Rotate NxN matrix 180 degrees
  function rotateMatrix180(matrix) {
    const N = matrix.length;
    const rotated = [];
    for (let r = 0; r < N; r++) {
      rotated[r] = [];
      for (let c = 0; c < N; c++) {
        rotated[r][c] = matrix[N - 1 - r][N - 1 - c];
      }
    }
    return rotated;
  }

  // SRS Kick Offsets (Testing wall, floor, and corner kicks)
  const SRS_KICKS = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
    [-2, 0],
    [2, 0],
    [0, -2]
  ];

  class NeonTetris {
    constructor(canvas, callbacks = {}) {
      this.canvas = canvas;
      this.callbacks = callbacks || {};

      // Canvas dimensions
      this.width = canvas ? canvas.width : 600;
      this.height = canvas ? canvas.height : 750;

      // Board configuration (10 columns x 20 rows, 32px cell size)
      this.cols = 10;
      this.rows = 20;
      this.cellSize = 32;
      this.boardX = 40;
      this.boardY = 55;
      this.boardWidth = this.cols * this.cellSize;   // 320px
      this.boardHeight = this.rows * this.cellSize; // 640px

      // Right HUD Configuration
      this.hudX = 390;
      this.hudY = 55;
      this.hudWidth = 170;

      // Game state
      this.board = [];
      this.bag = [];
      this.currentPiece = null;
      this.nextPiece = null;

      // HOLD System
      this.holdPiece = null;
      this.canHold = true;

      // Stats
      this.score = 0;
      this.level = 1;
      this.linesCleared = 0;
      this.maxLevel = 1;
      this.hardDrops = 0;

      // Timers & State
      this.dropTimer = 0;
      this.running = false;
      this.gameOver = false;

      // TETR.IO Lock Delay Mechanics (0.5s lock window, max 15 move resets)
      this.lockDelay = 0.5;
      this.maxLockMoves = 15;
      this.lockTimer = 0;
      this.lockMoves = 0;
      this.lowestY = 0;

      // TETR.IO Handling: Instantaneous DAS / ARR / Soft Drop
      this.moveDir = 0; // -1 = left, 1 = right, 0 = neutral
      this.leftPressed = false;
      this.rightPressed = false;
      this.keyState = {
        ArrowLeft: false,
        ArrowRight: false,
        ArrowDown: false
      };
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.dasDelay = 0.11;        // 110ms snappy DAS
      this.dasInterval = 0.025;    // 25ms fast ARR
      this.softDropTimer = 0;
      this.softDropInterval = 0.025; // 25ms fast TETR.IO SDF

      // Physical Board Spring Simulation
      this.boardBounceY = 0;
      this.boardBounceVy = 0;

      // Visual effects & Juice
      this.particles = [];
      this.floatingTexts = [];
      this.lineClearEffects = [];
      this.screenShake = 0;
      this.ambientGlowTimer = 0;

      this.reset();
    }

    // -------------------------------------------------------------
    // Sound Trigger Helper
    // -------------------------------------------------------------
    playSound(soundName) {
      try {
        const sound = this.callbacks?.sound || window.sound || window.soundManager;
        if (sound && typeof sound[soundName] === 'function') {
          sound[soundName]();
        }
      } catch (e) {
        // Audio errors should never crash game loop
      }
    }

    // -------------------------------------------------------------
    // State Reset & Start
    // -------------------------------------------------------------
    reset() {
      // 10x20 grid filled with null
      this.board = [];
      for (let r = 0; r < this.rows; r++) {
        this.board.push(new Array(this.cols).fill(null));
      }

      this.bag = [];
      this.score = 0;
      this.level = 1;
      this.linesCleared = 0;
      this.maxLevel = 1;
      this.hardDrops = 0;

      this.dropTimer = 0;
      this.running = false;
      this.gameOver = false;

      // Reset HOLD
      this.holdPiece = null;
      this.canHold = true;

      // Reset Lock Delay
      this.lockTimer = 0;
      this.lockMoves = 0;
      this.lowestY = 0;

      // Reset Movement & Handling
      this.moveDir = 0;
      this.leftPressed = false;
      this.rightPressed = false;
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.softDropTimer = 0;
      this.keyState.ArrowLeft = false;
      this.keyState.ArrowRight = false;
      this.keyState.ArrowDown = false;

      // Reset Board Spring
      this.boardBounceY = 0;
      this.boardBounceVy = 0;

      // Reset Effects
      this.particles = [];
      this.floatingTexts = [];
      this.lineClearEffects = [];
      this.screenShake = 0;

      // Fill initial 7-bag and pull initial pieces
      this.fillBag();
      this.currentPiece = this.pullNextPiece();
      this.nextPiece = this.pullNextPiece();
      this.lowestY = this.currentPiece ? this.currentPiece.y : 0;
    }

    start() {
      this.reset();
      this.running = true;
      this.gameOver = false;
      this.callbacks?.onScoreChange?.(0);
    }

    stop() {
      this.running = false;
    }

    // -------------------------------------------------------------
    // 7-Bag Randomizer
    // -------------------------------------------------------------
    fillBag() {
      const bag = [...TETROMINO_KEYS];
      // Fisher-Yates shuffle
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.bag.push(...bag);
    }

    pullNextPiece() {
      if (this.bag.length < 7) {
        this.fillBag();
      }
      const key = this.bag.shift();
      const def = TETROMINOES[key];
      return {
        key,
        color: def.color,
        matrix: def.matrix.map(row => [...row]),
        x: def.spawnX,
        y: def.spawnY
      };
    }

    // -------------------------------------------------------------
    // Collision Detection & Ground Status
    // -------------------------------------------------------------
    isValid(matrix, posX, posY) {
      const size = matrix.length;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const bx = posX + c;
            const by = posY + r;

            // Horizontal bounds
            if (bx < 0 || bx >= this.cols) {
              return false;
            }
            // Bottom bound
            if (by >= this.rows) {
              return false;
            }
            // Overlap with locked cells (cells above board by < 0 are allowed)
            if (by >= 0 && this.board[by][bx] !== null) {
              return false;
            }
          }
        }
      }
      return true;
    }

    isGrounded() {
      if (!this.currentPiece) return false;
      return !this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1);
    }

    // -------------------------------------------------------------
    // Ghost Piece Calculation
    // -------------------------------------------------------------
    getGhostY() {
      if (!this.currentPiece) return 0;
      let gy = this.currentPiece.y;
      while (this.isValid(this.currentPiece.matrix, this.currentPiece.x, gy + 1)) {
        gy++;
      }
      return gy;
    }

    // -------------------------------------------------------------
    // Extended Placement Lock Delay Management
    // -------------------------------------------------------------
    onPieceManipulated(wasGrounded) {
      if (!this.currentPiece) return;
      const isGroundedNow = this.isGrounded();

      // If piece was grounded or is now grounded, perform move-reset
      if (wasGrounded || isGroundedNow) {
        if (this.lockMoves < this.maxLockMoves) {
          this.lockTimer = 0;
          this.lockMoves++;
        }
      } else {
        // If piece is suspended in air, lockTimer stays cleared
        this.lockTimer = 0;
      }
    }

    // -------------------------------------------------------------
    // Movement Actions
    // -------------------------------------------------------------
    move(dir) {
      if (!this.running || this.gameOver || !this.currentPiece) return false;
      const wasGrounded = this.isGrounded();
      if (this.isValid(this.currentPiece.matrix, this.currentPiece.x + dir, this.currentPiece.y)) {
        this.currentPiece.x += dir;
        this.onPieceManipulated(wasGrounded);
        this.playSound('playMove');
        return true;
      }
      return false;
    }

    // -------------------------------------------------------------
    // SRS Rotations (CW, CCW, 180° with Wall/Floor Kicks)
    // -------------------------------------------------------------
    rotateClockwise() {
      if (!this.running || this.gameOver || !this.currentPiece) return false;
      const wasGrounded = this.isGrounded();
      const rotated = rotateMatrix(this.currentPiece.matrix);

      for (const [dx, dy] of SRS_KICKS) {
        if (this.isValid(rotated, this.currentPiece.x + dx, this.currentPiece.y + dy)) {
          this.currentPiece.matrix = rotated;
          this.currentPiece.x += dx;
          this.currentPiece.y += dy;
          this.onPieceManipulated(wasGrounded);
          this.playSound('playRotate');
          return true;
        }
      }
      return false;
    }

    rotateCounterClockwise() {
      if (!this.running || this.gameOver || !this.currentPiece) return false;
      const wasGrounded = this.isGrounded();
      const rotated = rotateMatrixCCW(this.currentPiece.matrix);

      for (const [dx, dy] of SRS_KICKS) {
        if (this.isValid(rotated, this.currentPiece.x + dx, this.currentPiece.y + dy)) {
          this.currentPiece.matrix = rotated;
          this.currentPiece.x += dx;
          this.currentPiece.y += dy;
          this.onPieceManipulated(wasGrounded);
          this.playSound('playRotate');
          return true;
        }
      }
      return false;
    }

    rotate180() {
      if (!this.running || this.gameOver || !this.currentPiece) return false;
      const wasGrounded = this.isGrounded();
      const rotated = rotateMatrix180(this.currentPiece.matrix);

      for (const [dx, dy] of SRS_KICKS) {
        if (this.isValid(rotated, this.currentPiece.x + dx, this.currentPiece.y + dy)) {
          this.currentPiece.matrix = rotated;
          this.currentPiece.x += dx;
          this.currentPiece.y += dy;
          this.onPieceManipulated(wasGrounded);
          this.playSound('playRotate');
          return true;
        }
      }
      return false;
    }

    // -------------------------------------------------------------
    // HOLD Action (C or Shift)
    // -------------------------------------------------------------
    hold() {
      if (!this.running || this.gameOver || !this.currentPiece || !this.canHold) return;

      const currentKey = this.currentPiece.key;

      if (this.holdPiece === null) {
        // Move current piece to hold and spawn next piece
        this.holdPiece = currentKey;
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.pullNextPiece();
      } else {
        // Swap current piece with hold piece, spawn unrotated at top
        const toSpawnKey = this.holdPiece;
        this.holdPiece = currentKey;
        const def = TETROMINOES[toSpawnKey];
        this.currentPiece = {
          key: toSpawnKey,
          color: def.color,
          matrix: def.matrix.map(row => [...row]),
          x: def.spawnX,
          y: def.spawnY
        };
      }

      this.canHold = false;
      this.dropTimer = 0;
      this.lockTimer = 0;
      this.lockMoves = 0;
      this.lowestY = this.currentPiece ? this.currentPiece.y : 0;
      this.playSound('playRotate');

      // Check immediate spawn collision -> Game Over
      if (!this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y)) {
        this.triggerGameOver();
      }
    }

    // -------------------------------------------------------------
    // Drops: Soft Drop & Hard Drop
    // -------------------------------------------------------------
    softDropStep() {
      if (!this.running || this.gameOver || !this.currentPiece) return;
      if (this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
        this.currentPiece.y += 1;
        this.score += 1;
        this.callbacks?.onScoreChange?.(this.score);
        this.dropTimer = 0;

        // Reset lock timer and moves if falling below lowest point
        if (this.currentPiece.y > this.lowestY) {
          this.lowestY = this.currentPiece.y;
          this.lockMoves = 0;
          this.lockTimer = 0;
        }
      }
      // Note: If grounded, soft drop does NOT instantly lock! Lock delay handles it.
    }

    hardDrop() {
      if (!this.running || this.gameOver || !this.currentPiece) return;
      const ghostY = this.getGhostY();
      const dropDistance = Math.max(0, ghostY - this.currentPiece.y);

      this.currentPiece.y = ghostY;
      this.score += dropDistance * 2;
      this.hardDrops++;
      this.callbacks?.onScoreChange?.(this.score);

      this.playSound('playHit');
      this.spawnHardDropParticles(this.currentPiece);
      this.screenShake = 0.12;

      // Board spring downward physical reaction
      this.boardBounceVy = Math.min(180, 75 + dropDistance * 5);

      this.lockPiece();
    }

    // -------------------------------------------------------------
    // Locking & Line Clear Logic
    // -------------------------------------------------------------
    lockPiece() {
      if (!this.currentPiece) return;
      const { matrix, x, y, color } = this.currentPiece;
      const size = matrix.length;

      let pieceLockedAbove = false;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const bx = x + c;
            const by = y + r;
            if (by < 0) {
              pieceLockedAbove = true;
            } else if (by < this.rows && bx >= 0 && bx < this.cols) {
              this.board[by][bx] = color;
            }
          }
        }
      }

      if (pieceLockedAbove) {
        this.triggerGameOver();
        return;
      }

      // Check full lines
      const fullRows = [];
      for (let r = 0; r < this.rows; r++) {
        if (this.board[r].every(cell => cell !== null)) {
          fullRows.push(r);
        }
      }

      if (fullRows.length > 0) {
        this.handleLineClears(fullRows);
      }

      // Reset hold permission and lock state for new piece
      this.canHold = true;
      this.lockTimer = 0;
      this.lockMoves = 0;

      // Spawn next piece
      this.currentPiece = this.nextPiece;
      this.nextPiece = this.pullNextPiece();
      this.lowestY = this.currentPiece ? this.currentPiece.y : 0;

      // Check if newly spawned piece collides immediately -> Game Over
      if (!this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y)) {
        this.triggerGameOver();
      }
    }

    handleLineClears(rows) {
      const count = rows.length;
      // 100 / 300 / 500 / 800 * level
      const baseScores = [0, 100, 300, 500, 800];
      const pts = (baseScores[count] || count * 200) * this.level;

      this.score += pts;
      this.linesCleared += count;

      // Level progression every 10 lines
      this.level = Math.floor(this.linesCleared / 10) + 1;
      if (this.level > this.maxLevel) {
        this.maxLevel = this.level;
      }

      this.playSound('playScore');
      this.callbacks?.onScoreChange?.(this.score);

      // Physical impulse on board spring
      this.boardBounceVy = Math.min(220, this.boardBounceVy + 65 + count * 30);

      // Visual animations: flash effect, floating text, particles
      const textMap = { 1: '+100 SINGLE', 2: '+300 DOUBLE', 3: '+500 TRIPLE', 4: '+800 TETRIS!' };
      const clearText = `${textMap[count] || `+${pts}`} (LV.${this.level})`;
      const avgY = this.boardY + (rows[Math.floor(rows.length / 2)] + 0.5) * this.cellSize;

      this.floatingTexts.push({
        text: clearText,
        x: this.boardX + this.boardWidth / 2,
        y: avgY,
        vy: -40,
        color: count === 4 ? '#F2546D' : '#6EC6E6',
        alpha: 1.0,
        maxLife: 1.2,
        life: 1.2,
        size: count === 4 ? 18 : 14
      });

      // Line clear flash ribbons
      for (const r of rows) {
        this.lineClearEffects.push({
          row: r,
          alpha: 1.0,
          timer: 0.28
        });

        // Spawn sparkling row burst particles
        for (let c = 0; c < this.cols; c++) {
          const px = this.boardX + (c + 0.5) * this.cellSize;
          const py = this.boardY + (r + 0.5) * this.cellSize;
          for (let p = 0; p < 3; p++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 140;
            this.particles.push({
              x: px,
              y: py,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd,
              color: count === 4 ? '#F2546D' : '#6EC6E6',
              size: 2 + Math.random() * 3,
              alpha: 1.0,
              life: 0.5 + Math.random() * 0.4
            });
          }
        }
      }

      if (count === 4) {
        this.screenShake = 0.22;
      }

      // Remove cleared rows and push empty rows to top
      for (const r of rows) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(this.cols).fill(null));
      }
    }

    triggerGameOver() {
      if (this.gameOver) return;
      this.gameOver = true;
      this.running = false;

      this.playSound('playGameOver');

      const gameLog = {
        gameId: 'tetris',
        linesCleared: this.linesCleared,
        maxLevel: this.maxLevel,
        hardDrops: this.hardDrops
      };

      this.callbacks?.onGameOver?.(this.score, gameLog);
    }

    // -------------------------------------------------------------
    // Particles & Visual Helpers
    // -------------------------------------------------------------
    spawnHardDropParticles(piece) {
      const { matrix, x, y, color } = piece;
      const size = matrix.length;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const px = this.boardX + (x + c + 0.5) * this.cellSize;
            const py = this.boardY + (y + r + 1) * this.cellSize;
            for (let i = 0; i < 4; i++) {
              this.particles.push({
                x: px,
                y: py,
                vx: (Math.random() - 0.5) * 140,
                vy: -Math.random() * 90 - 20,
                color: color,
                size: 2 + Math.random() * 2.5,
                alpha: 1.0,
                life: 0.35 + Math.random() * 0.25
              });
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Input Handlers (TETR.IO Snappy Controls)
    // -------------------------------------------------------------
    handleKeyDown(e) {
      const code = e.code || '';
      const key = e.key || '';

      // Prevent browser scrolling and shortcut collisions
      const gameCodes = [
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space',
        'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX', 'KeyZ', 'KeyC',
        'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'
      ];
      const gameKeys = [
        ' ', 'Shift', 'Control', 'c', 'C', 'z', 'Z', 'x', 'X', 'a', 'A', 'w', 'W', 's', 'S'
      ];

      if (gameCodes.includes(code) || gameKeys.includes(key)) {
        e.preventDefault();
      }

      if (!this.running || this.gameOver) return;

      // 1. HOLD: C, Shift
      if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight' || key === 'c' || key === 'C' || key === 'Shift') {
        this.hold();
        return;
      }

      // 2. HARD DROP: Space
      if (code === 'Space' || code === 'Spacebar' || key === ' ') {
        this.hardDrop();
        return;
      }

      // 3. 180° ROTATION: KeyA
      if (code === 'KeyA' || key === 'a' || key === 'A') {
        this.rotate180();
        return;
      }

      // 4. COUNTER-CLOCKWISE ROTATION: KeyZ, Control
      if (code === 'KeyZ' || code === 'ControlLeft' || code === 'ControlRight' || key === 'z' || key === 'Z' || key === 'Control') {
        this.rotateCounterClockwise();
        return;
      }

      // 5. CLOCKWISE ROTATION: ArrowUp, KeyX, KeyW
      if (code === 'ArrowUp' || code === 'KeyX' || code === 'KeyW' || key === 'ArrowUp' || key === 'x' || key === 'X' || key === 'w' || key === 'W') {
        this.rotateClockwise();
        return;
      }

      // 6. SOFT DROP: ArrowDown, KeyS
      if (code === 'ArrowDown' || code === 'KeyS' || key === 'ArrowDown' || key === 's' || key === 'S') {
        if (!this.keyState.ArrowDown) {
          this.softDropStep();
          this.softDropTimer = 0;
        }
        this.keyState.ArrowDown = true;
        return;
      }

      // 7. HORIZONTAL MOVEMENT: ArrowLeft (Instant zero dead-zone DAS reset)
      if (code === 'ArrowLeft' || key === 'ArrowLeft') {
        this.leftPressed = true;
        this.keyState.ArrowLeft = true;
        this.moveDir = -1;
        this.move(-1);
        this.dasTimer = 0;
        this.arrTimer = 0;
        return;
      }

      // 8. HORIZONTAL MOVEMENT: ArrowRight
      if (code === 'ArrowRight' || key === 'ArrowRight') {
        this.rightPressed = true;
        this.keyState.ArrowRight = true;
        this.moveDir = 1;
        this.move(1);
        this.dasTimer = 0;
        this.arrTimer = 0;
        return;
      }
    }

    handleKeyUp(e) {
      const code = e.code || '';
      const key = e.key || '';

      // Soft drop release
      if (code === 'ArrowDown' || code === 'KeyS' || key === 'ArrowDown' || key === 's' || key === 'S') {
        this.keyState.ArrowDown = false;
        this.softDropTimer = 0;
      }

      // ArrowLeft release: switch to right if right is still held
      if (code === 'ArrowLeft' || key === 'ArrowLeft') {
        this.leftPressed = false;
        this.keyState.ArrowLeft = false;
        if (this.rightPressed) {
          this.moveDir = 1;
          this.move(1);
          this.dasTimer = 0;
          this.arrTimer = 0;
        } else {
          this.moveDir = 0;
          this.dasTimer = 0;
          this.arrTimer = 0;
        }
      }

      // ArrowRight release: switch to left if left is still held
      if (code === 'ArrowRight' || key === 'ArrowRight') {
        this.rightPressed = false;
        this.keyState.ArrowRight = false;
        if (this.leftPressed) {
          this.moveDir = -1;
          this.move(-1);
          this.dasTimer = 0;
          this.arrTimer = 0;
        } else {
          this.moveDir = 0;
          this.dasTimer = 0;
          this.arrTimer = 0;
        }
      }
    }

    // -------------------------------------------------------------
    // Game Loop: Update (dt in seconds)
    // -------------------------------------------------------------
    update(dt) {
      // Clamp dt to prevent massive jump after tab blur
      dt = Math.min(dt, 0.1);
      this.ambientGlowTimer += dt;

      // Screen shake decay
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt);
      }

      // Board Spring Physics (Damped Harmonic Oscillator)
      const springK = 380;
      const damping = 26;
      const springAcc = -springK * this.boardBounceY - damping * this.boardBounceVy;
      this.boardBounceVy += springAcc * dt;
      this.boardBounceY += this.boardBounceVy * dt;

      if (Math.abs(this.boardBounceY) < 0.05 && Math.abs(this.boardBounceVy) < 0.5) {
        this.boardBounceY = 0;
        this.boardBounceVy = 0;
      }

      // Update line clear visual flash
      for (let i = this.lineClearEffects.length - 1; i >= 0; i--) {
        const eff = this.lineClearEffects[i];
        eff.timer -= dt;
        eff.alpha = Math.max(0, eff.timer / 0.28);
        if (eff.timer <= 0) {
          this.lineClearEffects.splice(i, 1);
        }
      }

      // Update floating texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.life -= dt;
        ft.y += ft.vy * dt;
        ft.alpha = Math.max(0, ft.life / ft.maxLife);
        if (ft.life <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }

      // Update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 180 * dt; // gravity
        p.alpha = Math.max(0, p.life / 0.6);
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      if (!this.running || this.gameOver || !this.currentPiece) return;

      // 1. Continuous DAS / ARR Horizontal Shift
      if (this.moveDir !== 0) {
        this.dasTimer += dt;
        if (this.dasTimer >= this.dasDelay) {
          this.arrTimer += dt;
          while (this.arrTimer >= this.dasInterval) {
            this.move(this.moveDir);
            this.arrTimer -= this.dasInterval;
          }
        }
      } else {
        this.dasTimer = 0;
        this.arrTimer = 0;
      }

      // 2. Continuous Soft Drop (Fast TETR.IO SDF)
      if (this.keyState.ArrowDown) {
        this.softDropTimer += dt;
        while (this.softDropTimer >= this.softDropInterval) {
          this.softDropStep();
          this.softDropTimer -= this.softDropInterval;
        }
      }

      // 3. Grounded Check & Lock Delay (0.5s)
      const grounded = this.isGrounded();
      if (grounded) {
        this.lockTimer += dt;
        if (this.lockTimer >= this.lockDelay) {
          this.lockPiece();
          return;
        }
      } else {
        // In air: clear lockTimer so piece has full lock window when it touches down
        if (this.lockTimer > 0) {
          this.lockTimer = 0;
        }
      }

      // 4. Gravity Drop Speed
      // Math.max(0.08, 0.8 - (level - 1) * 0.065) seconds
      const dropSpeed = Math.max(0.08, 0.8 - (this.level - 1) * 0.065);
      this.dropTimer += dt;
      if (this.dropTimer >= dropSpeed) {
        this.dropTimer = 0;
        if (this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
          this.currentPiece.y += 1;
          if (this.currentPiece.y > this.lowestY) {
            this.lowestY = this.currentPiece.y;
            this.lockMoves = 0;
            this.lockTimer = 0;
          }
        }
        // If grounded on gravity drop, do NOT instantly lock! Handled smoothly by lockTimer.
      }
    }

    // -------------------------------------------------------------
    // Game Loop: Render onto 600x750 ctx
    // -------------------------------------------------------------
    render(ctx) {
      if (!ctx) return;

      ctx.save();

      // Screen shake translation
      if (this.screenShake > 0) {
        const shakeMag = this.screenShake * 14;
        const sx = (Math.random() - 0.5) * shakeMag;
        const sy = (Math.random() - 0.5) * shakeMag;
        ctx.translate(sx, sy);
      }

      // 1. Clear background
      ctx.fillStyle = '#18243E';
      ctx.fillRect(0, 0, this.width, this.height);

      // Subtle cyber background grid
      this.renderBackgroundGrid(ctx);

      // 2. Render Board & Playfield with Physical Board Spring Reaction
      ctx.save();
      ctx.translate(0, this.boardBounceY);

      // 2a. Board background, grid, and locked blocks
      this.renderBoard(ctx);

      // 2b. Ghost Piece
      this.renderGhostPiece(ctx);

      // 2c. Active Tetromino + Lock Delay Bar
      this.renderCurrentPiece(ctx);

      // 2d. Line clear flash ribbons
      this.renderLineClearEffects(ctx);

      ctx.restore();

      // 3. Render Right HUD Panel (SCORE, LEVEL/LINES, HOLD, NEXT, CONTROLS)
      this.renderHUD(ctx);

      // 4. Particles & Floating Texts
      this.renderParticles(ctx);
      this.renderFloatingTexts(ctx);

      // 5. Render Game Over overlay if triggered
      if (this.gameOver) {
        this.renderGameOver(ctx);
      }

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Board & Cell Rendering Details
    // -------------------------------------------------------------
    renderBackgroundGrid(ctx) {
      ctx.save();
      ctx.strokeStyle = '#2A3E66';
      ctx.lineWidth = 1;
      const step = 25;
      for (let x = 0; x < this.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = 0; y < this.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    renderBoard(ctx) {
      ctx.save();

      // Board Background (Soft Slate-Navy)
      ctx.fillStyle = '#16223A';
      ctx.fillRect(this.boardX, this.boardY, this.boardWidth, this.boardHeight);

      // Subtle interior grid
      ctx.strokeStyle = '#2A3E66';
      ctx.lineWidth = 1;
      for (let c = 1; c < this.cols; c++) {
        const x = this.boardX + c * this.cellSize;
        ctx.beginPath();
        ctx.moveTo(x, this.boardY);
        ctx.lineTo(x, this.boardY + this.boardHeight);
        ctx.stroke();
      }
      for (let r = 1; r < this.rows; r++) {
        const y = this.boardY + r * this.cellSize;
        ctx.beginPath();
        ctx.moveTo(this.boardX, y);
        ctx.lineTo(this.boardX + this.boardWidth, y);
        ctx.stroke();
      }

      // Locked Blocks
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const color = this.board[r][c];
          if (color) {
            const px = this.boardX + c * this.cellSize;
            const py = this.boardY + r * this.cellSize;
            this.drawBlockCell(ctx, px, py, color, false, false, 0);
          }
        }
      }

      // Outer Pastel Border with minimal shadowBlur
      ctx.shadowColor = '#6EC6E6';
      ctx.shadowBlur = 3;
      ctx.strokeStyle = '#5B78AD';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(this.boardX - 2, this.boardY - 2, this.boardWidth + 4, this.boardHeight + 4);

      // Cyber Corner Brackets in Sky-Blue
      this.drawCornerBrackets(ctx, this.boardX - 6, this.boardY - 6, this.boardWidth + 12, this.boardHeight + 12, '#6EC6E6');

      ctx.restore();
    }

    drawBlockCell(ctx, px, py, color, isGhost = false, isGrounded = false, lockProgress = 0) {
      const size = this.cellSize;
      const pad = 1.5;
      const w = size - pad * 2;
      const h = size - pad * 2;
      const x = px + pad;
      const y = py + pad;

      ctx.save();

      if (isGhost) {
        // Semi-transparent dashed outline with subtle pastel glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      } else {
        // Crisp pastel pixel-art block with beveled highlight & core glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 2;

        // Base fill
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

        // Top/Left highlight bevel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - 4, y + 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.lineTo(x + 4, y + h - 4);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();

        // Bottom/Right dark bevel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + 4, y + h - 4);
        ctx.lineTo(x + w - 4, y + h - 4);
        ctx.lineTo(x + w - 4, y + 4);
        ctx.closePath();
        ctx.fill();

        // Inner glowing core
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillRect(x + 7, y + 7, w - 14, h - 14);

        // Grounded Lock Delay Pulse & Warning Shimmer
        if (isGrounded) {
          const pulse = Math.sin(this.ambientGlowTimer * 16) * 0.15;
          const shimmer = Math.min(0.65, 0.18 + lockProgress * 0.42 + pulse);
          ctx.fillStyle = `rgba(255, 255, 255, ${shimmer})`;
          ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        }
      }

      ctx.restore();
    }

    renderGhostPiece(ctx) {
      if (!this.currentPiece || !this.running || this.gameOver) return;
      const ghostY = this.getGhostY();
      const { matrix, x, color } = this.currentPiece;
      const size = matrix.length;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const by = ghostY + r;
            const bx = x + c;
            if (by >= 0 && by < this.rows) {
              const px = this.boardX + bx * this.cellSize;
              const py = this.boardY + by * this.cellSize;
              this.drawBlockCell(ctx, px, py, color, true, false, 0);
            }
          }
        }
      }
    }

    renderCurrentPiece(ctx) {
      if (!this.currentPiece || !this.running || this.gameOver) return;
      const { matrix, x, y, color } = this.currentPiece;
      const size = matrix.length;

      const grounded = this.isGrounded();
      const lockProgress = grounded ? Math.min(1, this.lockTimer / this.lockDelay) : 0;

      let minBx = Infinity;
      let maxBx = -Infinity;
      let maxBy = -Infinity;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const by = y + r;
            const bx = x + c;
            if (by >= 0 && by < this.rows) {
              const px = this.boardX + bx * this.cellSize;
              const py = this.boardY + by * this.cellSize;
              this.drawBlockCell(ctx, px, py, color, false, grounded, lockProgress);

              if (bx < minBx) minBx = bx;
              if (bx > maxBx) maxBx = bx;
              if (by > maxBy) maxBy = by;
            }
          }
        }
      }

      // Render TETR.IO style lock delay gauge below the piece when grounded
      if (grounded && maxBy >= 0 && minBx <= maxBx) {
        this.renderLockDelayBar(ctx, minBx, maxBx, maxBy, lockProgress);
      }
    }

    renderLockDelayBar(ctx, minBx, maxBx, maxBy, lockProgress) {
      ctx.save();
      const barW = (maxBx - minBx + 1) * this.cellSize;
      const barH = 3;
      const barX = this.boardX + minBx * this.cellSize;
      let barY = this.boardY + (maxBy + 1) * this.cellSize + 1;

      // Keep within board bottom
      if (barY + barH > this.boardY + this.boardHeight) {
        barY = this.boardY + this.boardHeight - barH - 1;
      }

      // Gauge background track
      ctx.fillStyle = 'rgba(22, 34, 58, 0.95)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = '#5B78AD';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barW, barH);

      // Remaining lock window width
      const remProgress = Math.max(0, 1 - lockProgress);
      let barColor = '#6EC6E6';
      if (lockProgress > 0.75) {
        barColor = '#F2546D'; // Danger Patch Rose Red
      } else if (lockProgress > 0.45) {
        barColor = '#F4C552'; // Warning Mustard Gold
      }

      ctx.fillStyle = barColor;
      ctx.shadowColor = barColor;
      ctx.shadowBlur = 2;
      ctx.fillRect(barX, barY, barW * remProgress, barH);

      ctx.restore();
    }

    renderLineClearEffects(ctx) {
      ctx.save();
      for (const eff of this.lineClearEffects) {
        const y = this.boardY + eff.row * this.cellSize;
        ctx.fillStyle = `rgba(255, 255, 255, ${eff.alpha * 0.8})`;
        ctx.shadowColor = '#6EC6E6';
        ctx.shadowBlur = 4;
        ctx.fillRect(this.boardX, y, this.boardWidth, this.cellSize);
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // Right HUD Panel Rendering (x=390, y=55, width=170)
    // -------------------------------------------------------------
    renderHUD(ctx) {
      ctx.save();
      const x = this.hudX;
      let y = this.hudY;

      // 1. SCORE Box (h = 56)
      this.drawHUDCard(ctx, x, y, this.hudWidth, 56, 'SCORE');
      const scoreStr = String(this.score).padStart(6, '0');
      ctx.font = '15px "Press Start 2P", monospace';
      ctx.fillStyle = '#F4C552';
      ctx.shadowColor = '#F4C552';
      ctx.shadowBlur = 2;
      ctx.textAlign = 'center';
      ctx.fillText(scoreStr, x + this.hudWidth / 2, y + 40);
      ctx.shadowBlur = 0;

      // 2. LEVEL & LINES Box (h = 58)
      y += 63;
      this.drawHUDCard(ctx, x, y, this.hudWidth, 58, 'LEVEL / LINES');
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#6EC6E6';
      ctx.fillText(`LV: ${String(this.level).padStart(2, '0')}`, x + 14, y + 36);
      ctx.fillStyle = '#7BE092';
      ctx.fillText(`LN: ${String(this.linesCleared).padStart(3, '0')}`, x + 14, y + 50);

      // 3. HOLD Box (h = 88)
      y += 65;
      const holdDimmed = !this.canHold;
      const holdLabel = holdDimmed ? 'HOLD [LOCK]' : 'HOLD';
      this.drawHUDCard(ctx, x, y, this.hudWidth, 88, holdLabel, holdDimmed);
      this.renderPiecePreview(ctx, this.holdPiece, x, y + 20, this.hudWidth, 68, holdDimmed);

      // 4. NEXT Tetromino Preview Box (h = 88)
      y += 95;
      this.drawHUDCard(ctx, x, y, this.hudWidth, 88, 'NEXT');
      this.renderPiecePreview(ctx, this.nextPiece?.key, x, y + 20, this.hudWidth, 68, false);

      // 5. CONTROLS GUIDE Box (h = 295)
      y += 95;
      this.drawHUDCard(ctx, x, y, this.hudWidth, 295, 'CONTROLS');
      ctx.font = '7px "Press Start 2P", monospace';

      const hints = [
        { key: '◄ ►', label: 'MOVE' },
        { key: '▲/X/W', label: 'ROT CW' },
        { key: 'Z/CTRL', label: 'ROT CCW' },
        { key: 'A', label: '180° ROT' },
        { key: 'C/SHIFT', label: 'HOLD' },
        { key: '▼', label: 'SOFT DROP' },
        { key: 'SPACE', label: 'HARD DROP' }
      ];

      let hintY = y + 38;
      for (const h of hints) {
        // Keycap badge
        ctx.fillStyle = '#18243E';
        ctx.fillRect(x + 10, hintY - 11, 68, 17);
        ctx.strokeStyle = '#5B78AD';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 10, hintY - 11, 68, 17);

        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = '#6EC6E6';
        ctx.textAlign = 'center';
        ctx.fillText(h.key, x + 44, hintY + 1);

        ctx.fillStyle = '#F8FAFC';
        ctx.textAlign = 'left';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText(h.label, x + 84, hintY + 1);

        hintY += 26;
      }

      // Sub-hint badge
      ctx.fillStyle = '#7BE092';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TETR.IO SRS READY', x + this.hudWidth / 2, y + 248);
      ctx.fillStyle = '#F2546D';
      ctx.fillText('SPEED RUSH LV.10+', x + this.hudWidth / 2, y + 268);

      ctx.restore();
    }

    drawHUDCard(ctx, x, y, w, h, label, isDimmed = false) {
      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.65;
      }

      // Slate-Navy card background
      ctx.fillStyle = '#233457';
      ctx.fillRect(x, y, w, h);

      // Border
      ctx.strokeStyle = isDimmed ? '#2A3E66' : '#5B78AD';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);

      // Top title bar
      ctx.fillStyle = isDimmed ? '#1E2D4D' : '#324875';
      ctx.fillRect(x, y, w, 20);

      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = isDimmed ? '#64748B' : '#6EC6E6';
      if (!isDimmed) {
        ctx.shadowColor = '#6EC6E6';
        ctx.shadowBlur = 2;
      }
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 8, y + 14);
      ctx.shadowBlur = 0;

      // Small accent dot in Patch Rose Red
      ctx.fillStyle = isDimmed ? '#475569' : '#F2546D';
      ctx.fillRect(x + w - 12, y + 7, 6, 6);

      ctx.restore();
    }

    renderPiecePreview(ctx, pieceKey, boxX, boxY, boxW, boxH, isDimmed = false) {
      if (!pieceKey) {
        ctx.save();
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.fillText('-- EMPTY --', boxX + boxW / 2, boxY + boxH / 2 + 3);
        ctx.restore();
        return;
      }

      const def = TETROMINOES[pieceKey];
      if (!def) return;

      const matrix = def.matrix;
      const color = def.color;
      const size = matrix.length;
      const pCellSize = 16;

      // Calculate bounding box of active piece cells
      let minR = size, maxR = -1, minC = size, maxC = -1;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
          }
        }
      }

      const pW = (maxC - minC + 1) * pCellSize;
      const pH = (maxR - minR + 1) * pCellSize;
      const startX = boxX + (boxW - pW) / 2 - minC * pCellSize;
      const startY = boxY + (boxH - pH) / 2 - minR * pCellSize;

      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.35;
      }

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const px = startX + c * pCellSize;
            const py = startY + r * pCellSize;

            ctx.shadowColor = color;
            ctx.shadowBlur = 2;
            ctx.fillStyle = color;
            ctx.fillRect(px + 1, py + 1, pCellSize - 2, pCellSize - 2);

            // Subtle highlight bevel
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillRect(px + 2, py + 2, pCellSize - 4, 3);
          }
        }
      }

      ctx.restore();
    }

    drawCornerBrackets(ctx, x, y, w, h, color) {
      const len = 12;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x, y + len);
      ctx.lineTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x + w - len, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + len);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x, y + h - len);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + len, y + h);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x + w - len, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - len);
      ctx.stroke();

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Particles & Floating Text Rendering
    // -------------------------------------------------------------
    renderParticles(ctx) {
      ctx.save();
      for (const p of this.particles) {
        ctx.fillStyle = hexToRgba(p.color, p.alpha);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 2;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }

    renderFloatingTexts(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      for (const ft of this.floatingTexts) {
        ctx.font = `${ft.size}px "Press Start 2P", monospace`;
        ctx.fillStyle = hexToRgba(ft.color, ft.alpha);
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 3;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.restore();
    }

    renderGameOver(ctx) {
      ctx.save();
      // Soft Slate-Navy translucent overlay over board
      ctx.fillStyle = 'rgba(22, 34, 58, 0.92)';
      ctx.fillRect(this.boardX, this.boardY, this.boardWidth, this.boardHeight);

      // Warning box in center of board
      const cx = this.boardX + this.boardWidth / 2;
      const cy = this.boardY + this.boardHeight / 2;

      ctx.font = '20px "Press Start 2P", monospace';
      ctx.fillStyle = '#F2546D';
      ctx.shadowColor = '#F2546D';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'center';
      ctx.fillText('SYSTEM LOCK', cx, cy - 40);

      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#6EC6E6';
      ctx.shadowColor = '#6EC6E6';
      ctx.shadowBlur = 2;
      ctx.fillText('GAME OVER', cx, cy);

      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#F4C552';
      ctx.fillText(`SCORE: ${this.score}`, cx, cy + 35);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(`LINES: ${this.linesCleared}`, cx, cy + 55);

      ctx.fillStyle = '#7BE092';
      ctx.fillText('ENTER INITIALS ON RIGHT', cx, cy + 95);

      ctx.restore();
    }
  }

  // Export to global window object
  if (typeof window !== 'undefined') {
    window.NeonTetris = NeonTetris;
  }

  // Export for module systems if present
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeonTetris;
  }
})();
