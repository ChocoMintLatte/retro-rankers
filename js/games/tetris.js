/**
 * ============================================================================
 * RETRO RANKERS - NEON TETRIS (js/games/tetris.js)
 * Classic 10x20 Grid Tetris with Cyberpunk Neon Aesthetic & Rush Mechanics
 * ============================================================================
 * 
 * Strict Specification Compliance:
 * - 600x750 Canvas Layout:
 *   - Main 10x20 board on left (cell size 32px -> 320x640px at x=40, y=55)
 *   - Glowing cyan neon frame & dark cyberpunk grid
 *   - Right HUD panel (x=390, y=55, width=170): 6-digit SCORE, LEVEL, LINES,
 *     NEXT tetromino preview box, and key hints
 * - 7 standard tetrominoes (I, O, T, S, Z, J, L) via 7-bag randomizer
 * - Vibrant neon colors (#00FFFF, #FFFF00, #B026FF, #39FF14, #FF0055, #3366FF, #FF8800)
 *   with beveled highlights & outer glow
 * - Ghost Piece: lowest valid Y position rendered as semi-transparent dashed outline
 * - Controls:
 *   - ArrowLeft / ArrowRight: move left/right (sound.playMove())
 *   - ArrowUp: clockwise rotation with [0, -1, 1, -2, 2] wall kicks (sound.playRotate())
 *   - ArrowDown: soft drop (+1 pt/cell)
 *   - Space: hard drop (+2 pts/cell, impact particles, immediate lock, sound.playHit())
 * - Line Clear: 1/2/3/4 lines = 100 / 300 / 500 / 800 * level points (sound.playScore())
 * - Level increases every 10 lines; drop speed accelerates:
 *   Math.max(0.08, 0.8 - (level - 1) * 0.065) seconds
 * - GameLog tracking: { gameId: 'tetris', linesCleared, maxLevel, hardDrops }
 *   calling callbacks.onGameOver(finalScore, gameLog)
 */

(function () {
  'use strict';

  // --- Tetromino Definitions ---
  const TETROMINOES = {
    I: {
      color: '#00FFFF', // Cyan
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
      color: '#FFFF00', // Yellow
      matrix: [
        [1, 1],
        [1, 1]
      ],
      spawnX: 4,
      spawnY: 0
    },
    T: {
      color: '#B026FF', // Purple
      matrix: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    S: {
      color: '#39FF14', // Neon Green
      matrix: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    Z: {
      color: '#FF0055', // Neon Pink/Red
      matrix: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    J: {
      color: '#3366FF', // Neon Blue
      matrix: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      spawnX: 3,
      spawnY: 0
    },
    L: {
      color: '#FF8800', // Neon Orange
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

      // HUD Configuration
      this.hudX = 390;
      this.hudY = 55;
      this.hudWidth = 170;

      // Game state
      this.board = [];
      this.bag = [];
      this.currentPiece = null;
      this.nextPiece = null;

      this.score = 0;
      this.level = 1;
      this.linesCleared = 0;
      this.maxLevel = 1;
      this.hardDrops = 0;

      this.dropTimer = 0;
      this.running = false;
      this.gameOver = false;

      // Auto-repeat / Soft drop controls state
      this.keyState = {
        ArrowLeft: false,
        ArrowRight: false,
        ArrowDown: false
      };
      this.dasTimer = 0;
      this.dasDelay = 0.16;
      this.dasInterval = 0.05;
      this.softDropTimer = 0;
      this.softDropInterval = 0.045;

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
        // Safe fail: audio should never crash gameplay
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

      this.particles = [];
      this.floatingTexts = [];
      this.lineClearEffects = [];
      this.screenShake = 0;

      this.keyState.ArrowLeft = false;
      this.keyState.ArrowRight = false;
      this.keyState.ArrowDown = false;

      // Fill initial 7-bag and pull initial pieces
      this.fillBag();
      this.currentPiece = this.pullNextPiece();
      this.nextPiece = this.pullNextPiece();
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
    // Collision Detection
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
            // Overlap with locked cells (allow cells above board y < 0)
            if (by >= 0 && this.board[by][bx] !== null) {
              return false;
            }
          }
        }
      }
      return true;
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
    // Rotation & Movement Actions
    // -------------------------------------------------------------
    move(dir) {
      if (!this.running || this.gameOver || !this.currentPiece) return;
      if (this.isValid(this.currentPiece.matrix, this.currentPiece.x + dir, this.currentPiece.y)) {
        this.currentPiece.x += dir;
        this.playSound('playMove');
      }
    }

    rotateClockwise() {
      if (!this.running || this.gameOver || !this.currentPiece) return;
      const rotated = rotateMatrix(this.currentPiece.matrix);
      // Basic wall-kick offsets [0, -1, 1, -2, 2]
      const offsets = [0, -1, 1, -2, 2];
      for (const offset of offsets) {
        if (this.isValid(rotated, this.currentPiece.x + offset, this.currentPiece.y)) {
          this.currentPiece.matrix = rotated;
          this.currentPiece.x += offset;
          this.playSound('playRotate');
          return;
        }
      }
    }

    softDropStep() {
      if (!this.running || this.gameOver || !this.currentPiece) return;
      if (this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
        this.currentPiece.y += 1;
        this.score += 1;
        this.callbacks?.onScoreChange?.(this.score);
        this.dropTimer = 0;
      } else {
        this.lockPiece();
      }
    }

    hardDrop() {
      if (!this.running || this.gameOver || !this.currentPiece) return;
      const ghostY = this.getGhostY();
      const dropDistance = ghostY - this.currentPiece.y;

      this.currentPiece.y = ghostY;
      this.score += dropDistance * 2;
      this.hardDrops++;
      this.callbacks?.onScoreChange?.(this.score);

      this.playSound('playHit');
      this.spawnHardDropParticles(this.currentPiece);
      this.screenShake = 0.12;

      this.lockPiece();
    }

    // -------------------------------------------------------------
    // Locking & Line Clear Logic
    // -------------------------------------------------------------
    lockPiece() {
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

      // Spawn next piece
      this.currentPiece = this.nextPiece;
      this.nextPiece = this.pullNextPiece();

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

      // Visual animations: flash effect, floating text, particles
      const textMap = { 1: '+100 SINGLE', 2: '+300 DOUBLE', 3: '+500 TRIPLE', 4: '+800 TETRIS!' };
      const clearText = `${textMap[count] || `+${pts}`} (LV.${this.level})`;
      const avgY = this.boardY + (rows[Math.floor(rows.length / 2)] + 0.5) * this.cellSize;

      this.floatingTexts.push({
        text: clearText,
        x: this.boardX + this.boardWidth / 2,
        y: avgY,
        vy: -40,
        color: count === 4 ? '#FF007F' : '#00FFFF',
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
              color: count === 4 ? '#FF007F' : '#00FFFF',
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
                vx: (Math.random() - 0.5) * 120,
                vy: -Math.random() * 80 - 20,
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
    // Input Handlers
    // -------------------------------------------------------------
    handleKeyDown(e) {
      const code = e.code || e.key;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code) || e.key === ' ') {
        e.preventDefault();
      }

      if (!this.running || this.gameOver) return;

      if (code === 'ArrowLeft' || code === 'KeyA') {
        if (!this.keyState.ArrowLeft) {
          this.move(-1);
          this.dasTimer = -this.dasDelay;
        }
        this.keyState.ArrowLeft = true;
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        if (!this.keyState.ArrowRight) {
          this.move(1);
          this.dasTimer = -this.dasDelay;
        }
        this.keyState.ArrowRight = true;
      } else if (code === 'ArrowUp' || code === 'KeyW') {
        this.rotateClockwise();
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        if (!this.keyState.ArrowDown) {
          this.softDropStep();
          this.softDropTimer = 0;
        }
        this.keyState.ArrowDown = true;
      } else if (code === 'Space' || code === 'Spacebar' || e.key === ' ') {
        this.hardDrop();
      }
    }

    handleKeyUp(e) {
      const code = e.code || e.key;
      if (code === 'ArrowLeft' || code === 'KeyA') {
        this.keyState.ArrowLeft = false;
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        this.keyState.ArrowRight = false;
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        this.keyState.ArrowDown = false;
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

      if (!this.running || this.gameOver) return;

      // Handle continuous DAS (Delayed Auto Shift)
      if (this.keyState.ArrowLeft && !this.keyState.ArrowRight) {
        this.dasTimer += dt;
        if (this.dasTimer >= this.dasInterval) {
          this.move(-1);
          this.dasTimer = 0;
        }
      } else if (this.keyState.ArrowRight && !this.keyState.ArrowLeft) {
        this.dasTimer += dt;
        if (this.dasTimer >= this.dasInterval) {
          this.move(1);
          this.dasTimer = 0;
        }
      }

      // Handle continuous soft drop
      if (this.keyState.ArrowDown) {
        this.softDropTimer += dt;
        if (this.softDropTimer >= this.softDropInterval) {
          this.softDropStep();
          this.softDropTimer = 0;
        }
      }

      // Normal gravity drop speed
      // Math.max(0.08, 0.8 - (level - 1) * 0.065) seconds
      const dropSpeed = Math.max(0.08, 0.8 - (this.level - 1) * 0.065);
      this.dropTimer += dt;
      if (this.dropTimer >= dropSpeed) {
        this.dropTimer = 0;
        if (this.currentPiece) {
          if (this.isValid(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
            this.currentPiece.y += 1;
          } else {
            this.lockPiece();
          }
        }
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
      ctx.fillStyle = '#080a14';
      ctx.fillRect(0, 0, this.width, this.height);

      // Subtle cyber background grid
      this.renderBackgroundGrid(ctx);

      // 2. Render Left 10x20 Board
      this.renderBoard(ctx);

      // 3. Render Ghost Piece
      this.renderGhostPiece(ctx);

      // 4. Render Active Tetromino
      this.renderCurrentPiece(ctx);

      // 5. Render Line Clear Flash
      this.renderLineClearEffects(ctx);

      // 6. Render Right HUD Panel
      this.renderHUD(ctx);

      // 7. Render Particles & Floating Texts
      this.renderParticles(ctx);
      this.renderFloatingTexts(ctx);

      // 8. Render Game Over overlay if triggered
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
      ctx.strokeStyle = '#10162a';
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

      // Board Background
      ctx.fillStyle = '#060812';
      ctx.fillRect(this.boardX, this.boardY, this.boardWidth, this.boardHeight);

      // Subtle interior grid
      ctx.strokeStyle = '#12192e';
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
            this.drawBlockCell(ctx, px, py, color, false);
          }
        }
      }

      // Outer Glowing Cyan Neon Border
      const glow = 8 + Math.sin(this.ambientGlowTimer * 3) * 3;
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = glow;
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(this.boardX - 2, this.boardY - 2, this.boardWidth + 4, this.boardHeight + 4);

      // Cyber Corner Brackets
      this.drawCornerBrackets(ctx, this.boardX - 6, this.boardY - 6, this.boardWidth + 12, this.boardHeight + 12, '#00FFFF');

      ctx.restore();
    }

    drawBlockCell(ctx, px, py, color, isGhost = false) {
      const size = this.cellSize;
      const pad = 1.5;
      const w = size - pad * 2;
      const h = size - pad * 2;
      const x = px + pad;
      const y = py + pad;

      ctx.save();

      if (isGhost) {
        // Semi-transparent dashed outline with neon glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.fillStyle = hexToRgba(color, 0.12);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      } else {
        // Vibrant neon block with beveled highlight & core glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        // Base fill
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

        // Top/Left highlight bevel
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
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
              this.drawBlockCell(ctx, px, py, color, true);
            }
          }
        }
      }
    }

    renderCurrentPiece(ctx) {
      if (!this.currentPiece || !this.running || this.gameOver) return;
      const { matrix, x, y, color } = this.currentPiece;
      const size = matrix.length;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const by = y + r;
            const bx = x + c;
            if (by >= 0 && by < this.rows) {
              const px = this.boardX + bx * this.cellSize;
              const py = this.boardY + by * this.cellSize;
              this.drawBlockCell(ctx, px, py, color, false);
            }
          }
        }
      }
    }

    renderLineClearEffects(ctx) {
      ctx.save();
      for (const eff of this.lineClearEffects) {
        const y = this.boardY + eff.row * this.cellSize;
        ctx.fillStyle = `rgba(255, 255, 255, ${eff.alpha * 0.85})`;
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 16;
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

      // 1. SCORE Box
      this.drawHUDCard(ctx, x, y, this.hudWidth, 75, 'SCORE');
      const scoreStr = String(this.score).padStart(6, '0');
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 8;
      ctx.textAlign = 'center';
      ctx.fillText(scoreStr, x + this.hudWidth / 2, y + 52);
      ctx.shadowBlur = 0;

      // 2. LEVEL & LINES Box
      y += 88;
      this.drawHUDCard(ctx, x, y, this.hudWidth, 75, 'LEVEL / LINES');
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#00FFFF';
      ctx.fillText(`LV: ${String(this.level).padStart(2, '0')}`, x + 16, y + 42);
      ctx.fillStyle = '#39FF14';
      ctx.fillText(`LN: ${String(this.linesCleared).padStart(3, '0')}`, x + 16, y + 62);

      // 3. NEXT Tetromino Preview Box
      y += 88;
      this.drawHUDCard(ctx, x, y, this.hudWidth, 130, 'NEXT');
      this.renderNextPiecePreview(ctx, x, y + 25, this.hudWidth, 100);

      // 4. CONTROLS GUIDE Box
      y += 143;
      this.drawHUDCard(ctx, x, y, this.hudWidth, 230, 'CONTROLS');
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#E2E8F0';

      const hints = [
        { key: '▲', label: 'ROTATE' },
        { key: '◄ ►', label: 'MOVE' },
        { key: '▼', label: 'SOFT DROP' },
        { key: 'SPACE', label: 'HARD DROP' }
      ];

      let hintY = y + 40;
      for (const h of hints) {
        // Keycap badge
        ctx.fillStyle = '#1B2236';
        ctx.fillRect(x + 14, hintY - 12, 60, 16);
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 14, hintY - 12, 60, 16);

        ctx.fillStyle = '#00FFFF';
        ctx.textAlign = 'center';
        ctx.fillText(h.key, x + 44, hintY);

        ctx.fillStyle = '#94A3B8';
        ctx.textAlign = 'left';
        ctx.fillText(h.label, x + 82, hintY);

        hintY += 32;
      }

      // Sub-hint
      ctx.fillStyle = '#39FF14';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPEED RUSH LV.10+', x + this.hudWidth / 2, hintY + 14);

      ctx.restore();
    }

    drawHUDCard(ctx, x, y, w, h, label) {
      // Dark translucent background
      ctx.fillStyle = '#0B0F1E';
      ctx.fillRect(x, y, w, h);

      // Border with subtle magenta/cyan glow
      ctx.strokeStyle = '#22304F';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);

      // Top title bar
      ctx.fillStyle = '#141C32';
      ctx.fillRect(x, y, w, 20);

      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#00FFFF';
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 10, y + 14);
      ctx.shadowBlur = 0;

      // Small accent dot
      ctx.fillStyle = '#FF007F';
      ctx.fillRect(x + w - 12, y + 6, 6, 6);
    }

    renderNextPiecePreview(ctx, boxX, boxY, boxW, boxH) {
      if (!this.nextPiece) return;
      const { matrix, color } = this.nextPiece;
      const size = matrix.length;
      const pCellSize = 22; // preview cell size

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

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            const px = startX + c * pCellSize;
            const py = startY + r * pCellSize;

            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            ctx.fillStyle = color;
            ctx.fillRect(px + 1, py + 1, pCellSize - 2, pCellSize - 2);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(px + 3, py + 3, pCellSize - 6, 3);
            ctx.restore();
          }
        }
      }
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
        ctx.shadowBlur = 4;
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
        ctx.shadowBlur = 8;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.restore();
    }

    renderGameOver(ctx) {
      ctx.save();
      // Dark translucent overlay over board
      ctx.fillStyle = 'rgba(5, 7, 15, 0.85)';
      ctx.fillRect(this.boardX, this.boardY, this.boardWidth, this.boardHeight);

      // Neon warning box in center of board
      const cx = this.boardX + this.boardWidth / 2;
      const cy = this.boardY + this.boardHeight / 2;

      ctx.font = '20px "Press Start 2P", monospace';
      ctx.fillStyle = '#FF0055';
      ctx.shadowColor = '#FF0055';
      ctx.shadowBlur = 12;
      ctx.textAlign = 'center';
      ctx.fillText('SYSTEM LOCK', cx, cy - 40);

      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#00FFFF';
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 6;
      ctx.fillText('GAME OVER', cx, cy);

      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`SCORE: ${this.score}`, cx, cy + 35);
      ctx.fillText(`LINES: ${this.linesCleared}`, cx, cy + 55);

      ctx.fillStyle = '#39FF14';
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
