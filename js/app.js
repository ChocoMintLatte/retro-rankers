/**
 * ============================================================================
 * RETRO RANKERS - MAIN ARCADE APPLICATION (js/app.js)
 * State Machine: ATTRACT | PLAYING | INITIAL_ENTRY | HIGHLIGHT
 * Cartridge Selector, Web Audio Synth, CRT Attract Starfield/Grid,
 * Unified 60fps Game Loop & Input Router, 3-Slot Initial Entry System
 * ============================================================================
 */

(function (window) {
  'use strict';

  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  const GAME_META = {
    tetris: {
      name: 'NEON TETRIS',
      desc: '당신이 아는 그 테트리스 맞습니다.',
      classKey: 'NeonTetris',
      controls: [
        { keys: ['←', '→'], desc: '좌우 이동' },
        { keys: ['↑', 'Z'], desc: '시계 / 반시계 회전' },
        { keys: ['↓'], desc: '소프트 드롭' },
        { keys: ['SPACE'], desc: '하드 드롭' },
        { keys: ['C', 'SHIFT'], desc: '블록 홀드 (HOLD)' },
        { keys: ['ENTER'], desc: '게임 시작 / 입력 확인' },
        { keys: ['ESC'], desc: '일시정지 / 메인 화면' }
      ]
    },
    dodge: {
      name: 'CYBER DODGE',
      desc: '이 총알을 과연 당신이 피할 수 있을까?',
      classKey: 'CyberDodge',
      controls: [
        { keys: ['←', '↑', '→', '↓'], desc: '360° 기체 이동' },
        { keys: ['CORE'], desc: '녹색 코어 획득 (+보너스 & EMP)' },
        { keys: ['ENTER'], desc: '게임 시작 / 입력 확인' },
        { keys: ['ESC'], desc: '일시정지 / 메인 화면' }
      ]
    },
    mathRunner: {
      name: 'MATH RUNNER',
      desc: '당신이 광고에서 본 그 게임 맞습니다.',
      classKey: 'MathRunner',
      controls: [
        { keys: ['←', '→'], desc: '좌우 이동' },
        { keys: ['AUTO'], desc: '전방 자동 사격' },
        { keys: ['GATE'], desc: '유리한 연산 관문 통과' },
        { keys: ['ENTER'], desc: '게임 시작 / 입력 확인' },
        { keys: ['ESC'], desc: '일시정지 / 메인 화면' }
      ]
    }
  };

  class RetroArcadeApp {
    constructor() {
      this.state = 'ATTRACT'; // 'ATTRACT' | 'PLAYING' | 'INITIAL_ENTRY' | 'HIGHLIGHT'
      this.selectedGame = 'tetris';
      this.currentGame = null;
      this.currentSession = null;
      this.pendingResult = null;

      // 3-Slot Initial Entry State (A A A)
      this.dialChars = ['A', 'A', 'A'];
      this.currentDialSlot = 0;

      // 60fps Loop Timing
      this.lastFrameTime = performance.now();
      this.animId = null;

      // Attract Background Animation State
      this.gridOffset = 0;
      this.stars = [];

      this._cacheDOMElements();
      this._initStarfield();
      this._bindEvents();
      this._bindDialButtons();

      // Setup Initial State & Leaderboard
      this.selectCartridge('tetris', false);
      this.renderLeaderboard();
      this.renderLiveFeed();

      // Cloud Real-Time Ranking Synchronization Listener
      if (window.rankingService && typeof window.rankingService.onSync === 'function') {
        window.rankingService.onSync(() => {
          this.renderLeaderboard();
          this.renderLiveFeed();
        });
      }

      // Launch Unified 60fps Animation & Update Loop
      this._startMainLoop();
    }

    /**
     * Cache all interactive DOM elements
     */
    _cacheDOMElements() {
      this.soundToggleBtn = document.getElementById('soundToggleBtn');
      this.soundStateSpan = this.soundToggleBtn ? this.soundToggleBtn.querySelector('.sound-state') : null;
      this.soundIconSpan = this.soundToggleBtn ? this.soundToggleBtn.querySelector('.btn-icon') : null;

      this.cartridgeList = document.getElementById('cartridgeList');
      this.cartridgeItems = document.querySelectorAll('.cartridge-item[data-game]');
      this.controlsGuide = document.getElementById('controlsGuide');

      this.gameCanvas = document.getElementById('gameCanvas');
      this.ctx = this.gameCanvas ? this.gameCanvas.getContext('2d') : null;

      this.attractOverlay = document.getElementById('attractOverlay');
      this.attractGameTitle = document.getElementById('attractGameTitle');
      this.attractGameDesc = document.getElementById('attractGameDesc');
      this.attractHighScore = document.getElementById('attractHighScore');

      this.initialModal = document.getElementById('initialModal');
      this.modalFinalScore = document.getElementById('modalFinalScore');
      this.modalValidationBadge = document.getElementById('modalValidationBadge');
      this.dialSlots = document.querySelectorAll('.dial-slot[data-slot]');

      this.leaderboardGameTitle = document.getElementById('leaderboardGameTitle');
      this.leaderboardBody = document.getElementById('leaderboardBody');
      this.liveFeedList = document.getElementById('liveFeedList');
    }

    /**
     * Initialize Starfield for Attract Mode Retro Background
     */
    _initStarfield() {
      const count = 75;
      this.stars = [];
      const w = this.gameCanvas ? this.gameCanvas.width : 600;
      const h = this.gameCanvas ? this.gameCanvas.height : 750;
      const starColors = ['#F8FAFC', '#6EC6E6', '#F4C552'];

      for (let i = 0; i < count; i++) {
        this.stars.push({
          x: Math.random() * w,
          y: Math.random() * h * 0.65,
          size: Math.random() * 2 + 0.8,
          speed: Math.random() * 0.65 + 0.2,
          brightness: Math.random(),
          color: starColors[i % starColors.length]
        });
      }
    }

    /**
     * Bind UI and Global Event Handlers
     */
    _bindEvents() {
      // Sound Toggle Button
      if (this.soundToggleBtn) {
        this.soundToggleBtn.addEventListener('click', () => {
          if (window.sound) {
            const isEnabled = window.sound.toggle();
            if (this.soundStateSpan) this.soundStateSpan.textContent = isEnabled ? 'ON' : 'OFF';
            if (this.soundIconSpan) this.soundIconSpan.textContent = isEnabled ? '🔊' : '🔇';
          }
        });
      }

      // Cartridge Selection Clicks
      if (this.cartridgeItems) {
        this.cartridgeItems.forEach(item => {
          item.addEventListener('click', () => {
            const gameId = item.getAttribute('data-game');
            if (gameId && gameId !== this.selectedGame) {
              this.selectCartridge(gameId, true);
            }
          });
        });
      }

      // Attract Overlay Click to Start
      if (this.attractOverlay) {
        this.attractOverlay.addEventListener('click', () => {
          if (this.state === 'ATTRACT' || this.state === 'HIGHLIGHT') {
            this.startGame();
          }
        });
      }

      // Global Keyboard Handlers
      window.addEventListener('keydown', (e) => this._handleKeyDown(e));
      window.addEventListener('keyup', (e) => this._handleKeyUp(e));
    }

    /**
     * Bind 3-Slot Initial Entry Buttons and Clicks
     */
    _bindDialButtons() {
      if (!this.dialSlots) return;

      this.dialSlots.forEach(slotEl => {
        const slotIdx = parseInt(slotEl.getAttribute('data-slot'), 10);

        // Click slot box to focus
        slotEl.addEventListener('click', (e) => {
          if (this.state !== 'INITIAL_ENTRY') return;
          if (!e.target.classList.contains('dial-arrow')) {
            this.currentDialSlot = slotIdx;
            this.renderDials();
            if (window.sound) window.sound.playMove();
          }
        });

        // Dial Up button (▲)
        const upBtn = slotEl.querySelector('.dial-up');
        if (upBtn) {
          upBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state !== 'INITIAL_ENTRY') return;
            this.currentDialSlot = slotIdx;
            this._changeDialChar(1);
          });
        }

        // Dial Down button (▼)
        const downBtn = slotEl.querySelector('.dial-down');
        if (downBtn) {
          downBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state !== 'INITIAL_ENTRY') return;
            this.currentDialSlot = slotIdx;
            this._changeDialChar(-1);
          });
        }
      });
    }

    /**
     * Unified 60fps Animation and Game Update Loop
     */
    _startMainLoop() {
      const loop = (timestamp) => {
        const dt = Math.min(Math.max((timestamp - this.lastFrameTime) / 1000, 0), 0.1);
        this.lastFrameTime = timestamp;

        try {
          if (this.state === 'ATTRACT' || this.state === 'HIGHLIGHT') {
            this._drawAttractScreen();
          } else if (this.state === 'PLAYING' && this.currentGame) {
            if (typeof this.currentGame.update === 'function') {
              this.currentGame.update(dt);
            }
            if (this.currentGame && this.state === 'PLAYING' && typeof this.currentGame.render === 'function') {
              this.currentGame.render(this.ctx);
            }
          }
        } catch (err) {
          console.error('[App] Frame loop error:', err);
        }

        this.animId = requestAnimationFrame(loop);
      };

      this.animId = requestAnimationFrame(loop);
    }

    /**
     * Switch Active Cartridge
     * @param {string} gameId
     * @param {boolean} playSound
     */
    selectCartridge(gameId, playSound = false) {
      if (!GAME_META[gameId]) return;

      // If currently playing, stop game cleanly
      if (this.state === 'PLAYING') {
        this.stopCurrentGame();
        this.setAttractMode();
      }

      this.selectedGame = gameId;
      const meta = GAME_META[gameId];

      // Update Cartridge List UI
      if (this.cartridgeItems) {
        this.cartridgeItems.forEach(item => {
          if (item.getAttribute('data-game') === gameId) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }

      // Update Attract Overlay Text
      if (this.attractGameTitle) this.attractGameTitle.textContent = meta.name;
      if (this.attractGameDesc) this.attractGameDesc.textContent = meta.desc;

      // Update Controls Guide Box
      this._renderControlsGuide(meta.controls);

      // Update Leaderboard Header and Rows
      if (this.leaderboardGameTitle) this.leaderboardGameTitle.textContent = meta.name;
      this.renderLeaderboard();

      if (playSound && window.sound) {
        window.sound.playMove();
      }
    }

    /**
     * Render tailored keyboard icon badges in Controls Guide Box
     * @param {Array<object>} controls
     */
    _renderControlsGuide(controls) {
      if (!this.controlsGuide) return;

      this.controlsGuide.innerHTML = controls.map(ctrl => {
        const keycapsHtml = ctrl.keys
          .map(k => `<kbd class="keycap">${k}</kbd>`)
          .join('');
        return `
          <div class="control-row">
            <div class="keycap-group">${keycapsHtml}</div>
            <span class="key-desc">${ctrl.desc}</span>
          </div>
        `;
      }).join('');
    }

    /**
     * Global KeyDown Router
     * @param {KeyboardEvent} e
     */
    _handleKeyDown(e) {
      // 1. Initial Entry State
      if (this.state === 'INITIAL_ENTRY') {
        this._handleInitialEntryKeys(e);
        return;
      }

      // 2. Attract / Highlight Mode
      if (this.state === 'ATTRACT' || this.state === 'HIGHLIGHT') {
        if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.startGame();
          return;
        }

        // Cartridge Quick Switch via 1, 2, 3
        if (e.key === '1') this.selectCartridge('tetris', true);
        if (e.key === '2') this.selectCartridge('dodge', true);
        if (e.key === '3') this.selectCartridge('mathRunner', true);

        // ArrowUp / ArrowDown cartridge cycle
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const keys = ['tetris', 'dodge', 'mathRunner'];
          const idx = keys.indexOf(this.selectedGame);
          const next = keys[(idx - 1 + keys.length) % keys.length];
          this.selectCartridge(next, true);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const keys = ['tetris', 'dodge', 'mathRunner'];
          const idx = keys.indexOf(this.selectedGame);
          const next = keys[(idx + 1) % keys.length];
          this.selectCartridge(next, true);
        }
        return;
      }

      // 3. Playing Mode: Route inputs to active game
      if (this.state === 'PLAYING') {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.stopCurrentGame();
          this.setAttractMode();
          if (window.sound) window.sound.playMove();
          return;
        }

        // Prevent browser window scroll on game action keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
          e.preventDefault();
        }

        // Forward to active game instance
        if (this.currentGame && typeof this.currentGame.handleKeyDown === 'function') {
          this.currentGame.handleKeyDown(e);
        }
      }
    }

    /**
     * Global KeyUp Router
     * @param {KeyboardEvent} e
     */
    _handleKeyUp(e) {
      if (this.state === 'PLAYING') {
        if (this.currentGame && typeof this.currentGame.handleKeyUp === 'function') {
          this.currentGame.handleKeyUp(e);
        }
      }
    }

    /**
     * 3-Slot Initial Entry Keypad Navigation
     * @param {KeyboardEvent} e
     */
    _handleInitialEntryKeys(e) {
      const key = e.key;

      if (key === 'ArrowUp') {
        e.preventDefault();
        this._changeDialChar(1);
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        this._changeDialChar(-1);
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        if (this.currentDialSlot > 0) {
          this.currentDialSlot--;
          this.renderDials();
          if (window.sound) window.sound.playMove();
        }
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        if (this.currentDialSlot < 2) {
          this.currentDialSlot++;
          this.renderDials();
          if (window.sound) window.sound.playMove();
        }
      } else if (key === 'Backspace') {
        e.preventDefault();
        if (this.currentDialSlot > 0) {
          this.currentDialSlot--;
          this.renderDials();
          if (window.sound) window.sound.playMove();
        }
      } else if (/^[a-zA-Z0-9]$/.test(key)) {
        // Direct character typing
        e.preventDefault();
        this.dialChars[this.currentDialSlot] = key.toUpperCase();
        if (window.sound) window.sound.playDialTick();

        // Advance to next slot automatically
        this.currentDialSlot = Math.min(2, this.currentDialSlot + 1);
        this.renderDials();
      } else if (key === 'Enter') {
        e.preventDefault();
        this.submitInitials();
      }
    }

    /**
     * Increment or decrement character in active slot
     * @param {number} delta (+1 or -1)
     */
    _changeDialChar(delta) {
      const char = this.dialChars[this.currentDialSlot];
      const idx = CHARSET.indexOf(char);
      const newIdx = (idx + delta + CHARSET.length) % CHARSET.length;
      this.dialChars[this.currentDialSlot] = CHARSET[newIdx];

      if (window.sound) window.sound.playDialTick();
      this.renderDials();
    }

    /**
     * Render the 3 Dial Slots UI
     */
    renderDials() {
      if (!this.dialSlots) return;

      this.dialSlots.forEach((slotEl, idx) => {
        if (idx === this.currentDialSlot) {
          slotEl.classList.add('active');
        } else {
          slotEl.classList.remove('active');
        }

        const charEl = slotEl.querySelector('.dial-char');
        if (charEl) {
          charEl.textContent = this.dialChars[idx] || 'A';
        }
      });
    }

    /**
     * Start the currently selected game
     */
    startGame() {
      if (this.state === 'PLAYING') return;

      if (this.highlightTimer) {
        clearTimeout(this.highlightTimer);
        this.highlightTimer = null;
      }

      // Play Classic Arcade Coin / Start Sound
      if (window.sound) {
        window.sound.playStart();
      }

      // Hide Attract Overlay
      if (this.attractOverlay) {
        this.attractOverlay.classList.add('hidden');
      }

      // Start Validated Session in Ranking Service
      if (window.rankingService) {
        this.currentSession = window.rankingService.startSession(this.selectedGame);
      }

      this.state = 'PLAYING';

      // Find Game Class
      const meta = GAME_META[this.selectedGame];
      const GameClass = window[meta.classKey];

      if (typeof GameClass === 'function') {
        this.stopCurrentGame();

        this.currentGame = new GameClass(this.gameCanvas, {
          onScoreChange: (score) => {
            // Live score update hook
          },
          onGameOver: (finalScore, stageOrLog, details) => {
            this.handleGameOver(finalScore, stageOrLog, details);
          },
          sound: window.sound
        });

        if (typeof this.currentGame.start === 'function') {
          this.currentGame.start();
        }
      } else {
        // Fallback notice on canvas if game script is loading or unavailable
        this._renderGamePlaceholder(meta.name);
      }
    }

    /**
     * Fallback placeholder if game class is not yet loaded
     */
    _renderGamePlaceholder(gameName) {
      if (!this.ctx || !this.gameCanvas) return;
      const ctx = this.ctx;
      const w = this.gameCanvas.width;
      const h = this.gameCanvas.height;

      ctx.fillStyle = '#18243E';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#6EC6E6';
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(gameName, w / 2, h / 2 - 30);

      ctx.fillStyle = '#F2546D';
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillText('INSERTING CARTRIDGE...', w / 2, h / 2 + 10);

      ctx.fillStyle = '#B8CBE8';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillText('PRESS [ESC] TO RETURN', w / 2, h / 2 + 50);
    }

    /**
     * Safely stop active game instance
     */
    stopCurrentGame() {
      if (this.currentGame) {
        try {
          if (typeof this.currentGame.stop === 'function') {
            this.currentGame.stop();
          } else if (typeof this.currentGame.destroy === 'function') {
            this.currentGame.destroy();
          }
        } catch (e) {
          console.warn('[App] Error stopping game:', e);
        }
        this.currentGame = null;
      }
    }

    /**
     * Handle Game Over Triggered by any Game
     * Supports both signature styles: onGameOver(score, stage) and onGameOver(score, gameLog)
     * @param {number} finalScore
     * @param {string|object} stageOrLog
     * @param {object} [details]
     */
    handleGameOver(finalScore, stageOrLog, details) {
      if (this.currentGame && typeof this.currentGame.render === 'function') {
        try {
          this.currentGame.render(this.ctx);
        } catch (e) {
          // Ignore final frame render error
        }
      }
      this.stopCurrentGame();

      const scoreNum = Math.max(0, Math.floor(Number(finalScore) || 0));
      const durMs = this.currentSession ? (Date.now() - this.currentSession.startTime) : 10000;

      // Extract stage label and game log
      let stageStr = 'CLEAR';
      let gameLog = this.currentSession ? this.currentSession.gameLog : null;

      if (typeof stageOrLog === 'string') {
        stageStr = stageOrLog;
        if (details && typeof details === 'object') gameLog = details;
      } else if (stageOrLog && typeof stageOrLog === 'object') {
        gameLog = stageOrLog;
        if (gameLog.maxLevel !== undefined) {
          stageStr = `LV.${String(gameLog.maxLevel).padStart(2, '0')}`;
        } else if (gameLog.timeSurvived !== undefined) {
          stageStr = `${Math.floor(gameLog.timeSurvived)}s`;
        } else if (gameLog.gatesPassed !== undefined) {
          stageStr = `G.${String(gameLog.gatesPassed).padStart(2, '0')}`;
        } else if (gameLog.stage) {
          stageStr = String(gameLog.stage);
        }
      }

      // Anti-Cheat Pre-validation
      const validation = window.rankingService
        ? window.rankingService.validateScore(scoreNum, durMs, gameLog)
        : { valid: true, reason: 'VERIFIED' };

      // Cache pending result for submission
      this.pendingResult = {
        gameId: this.selectedGame,
        score: scoreNum,
        durationMs: durMs,
        gameLog: gameLog,
        stage: stageStr
      };

      // Play Game Over Melody
      if (window.sound) {
        window.sound.playGameOver();
      }

      // Update Modal Final Score
      if (this.modalFinalScore) {
        this.modalFinalScore.textContent = window.rankingService
          ? window.rankingService.formatScore(scoreNum)
          : String(scoreNum);
      }

      // Update Anti-Cheat Badge
      if (this.modalValidationBadge) {
        if (validation.valid) {
          this.modalValidationBadge.className = 'modal-badge-verified';
          this.modalValidationBadge.style.borderColor = '';
          this.modalValidationBadge.style.color = '';
          this.modalValidationBadge.innerHTML = '<span class="badge-dot">✔</span> ANTI-CHEAT: VERIFIED';
        } else {
          this.modalValidationBadge.className = 'modal-badge-verified';
          this.modalValidationBadge.style.borderColor = 'var(--neon-red)';
          this.modalValidationBadge.style.color = 'var(--neon-red)';
          this.modalValidationBadge.innerHTML = `<span class="badge-dot">✖</span> ANTI-CHEAT: ${validation.reason}`;
        }
      }

      // Reset 3-Slot Initial Dial
      this.dialChars = ['A', 'A', 'A'];
      this.currentDialSlot = 0;
      this.renderDials();

      // Show Initial Entry Modal
      if (this.initialModal) {
        this.initialModal.classList.remove('hidden');
      }

      this.state = 'INITIAL_ENTRY';
    }

    /**
     * Submit Initials into Ranking Service
     */
    submitInitials() {
      if (this.state !== 'INITIAL_ENTRY' || !this.pendingResult) return;

      const initials = this.dialChars.join('');
      const { gameId, score, durationMs, gameLog, stage } = this.pendingResult;

      let submitRes = { valid: true, rank: null, entryId: null };

      if (window.rankingService) {
        submitRes = window.rankingService.submitScore(gameId, initials, score, durationMs, gameLog, stage);
      }

      // Hide Modal
      if (this.initialModal) {
        this.initialModal.classList.add('hidden');
      }

      // Play Celebratory Fanfare
      if (window.sound) {
        window.sound.playRecordSaved();
      }

      // Re-render Leaderboard & Live Feed
      this.renderLeaderboard();
      this.renderLiveFeed();

      // Check if new score entered Hall of Fame TOP 10
      this.setAttractMode();

      if (submitRes && submitRes.rank && submitRes.rank <= 10) {
        // Apply 3-second golden flashing animation (.new-record)
        this.highlightedEntryId = submitRes.entryId;
        const rows = this.leaderboardBody ? this.leaderboardBody.querySelectorAll('.rank-row') : [];
        const targetRow = rows[submitRes.rank - 1];

        if (targetRow) {
          targetRow.classList.add('new-record');
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (this.highlightTimer) clearTimeout(this.highlightTimer);
        this.highlightTimer = setTimeout(() => {
          if (targetRow) targetRow.classList.remove('new-record');
          this.highlightedEntryId = null;
          this.highlightTimer = null;
        }, 3000);
      }
    }

    /**
     * Switch to ATTRACT Mode (show overlay, resume background canvas loop)
     */
    setAttractMode() {
      this.state = 'ATTRACT';
      if (this.attractOverlay) {
        this.attractOverlay.classList.remove('hidden');
      }
    }

    /**
     * Render Hall of Fame Top 10 rows
     */
    renderLeaderboard() {
      if (!this.leaderboardBody || !window.rankingService) return;

      const scores = window.rankingService.getScores(this.selectedGame);
      const topScore = scores.length > 0 ? scores[0].score : 0;

      // Update High Score badge in Attract Overlay
      if (this.attractHighScore) {
        this.attractHighScore.textContent = window.rankingService.formatScore(topScore);
      }

      this.leaderboardBody.innerHTML = scores.map((entry, idx) => {
        const rankNum = idx + 1;
        let rankClass = '';
        if (rankNum === 1) rankClass = 'rank-1';
        else if (rankNum === 2) rankClass = 'rank-2';
        else if (rankNum === 3) rankClass = 'rank-3';

        const isHighlighted = (this.highlightTimer && this.highlightedEntryId && entry.id === this.highlightedEntryId) ? ' new-record' : '';

        return `
          <div class="rank-row ${rankClass}${isHighlighted}" data-id="${entry.id}">
            <span class="col-rank">#${String(rankNum).padStart(2, '0')}</span>
            <span class="col-init">${entry.initials}</span>
            <span class="col-score">${window.rankingService.formatScore(entry.score)}</span>
            <span class="col-date">${entry.stage || '-'}</span>
          </div>
        `;
      }).join('');
    }

    /**
     * Render Live Feed Ticker List
     */
    renderLiveFeed() {
      if (!this.liveFeedList || !window.rankingService) return;

      const feed = window.rankingService.getFeed();

      this.liveFeedList.innerHTML = feed.map(item => {
        // Highlight initials with neon cyan
        let msgHtml = item.msg || '';
        if (item.initials) {
          msgHtml = msgHtml.replace(item.initials, `<strong class="cyan">${item.initials}</strong>`);
        }

        return `
          <div class="feed-item">
            <span class="feed-time">${item.time || '12:00'}</span>
            <span class="feed-msg">${msgHtml}</span>
          </div>
        `;
      }).join('');
    }

    /**
     * Draw 60fps Retro Synthwave Starfield & 3D Perspective Grid
     */
    _drawAttractScreen() {
      if (!this.ctx || !this.gameCanvas) return;
      const ctx = this.ctx;
      const w = this.gameCanvas.width;
      const h = this.gameCanvas.height;

      // 1. Patch Pastel Night-Sky Slate-Blue Gradient Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#18243E');
      bgGrad.addColorStop(0.55, '#24365E');
      bgGrad.addColorStop(1, '#1B2947');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Starfield with Soft Pastel Colors
      for (const s of this.stars) {
        s.y += s.speed;
        if (s.y > h * 0.62) {
          s.y = 0;
          s.x = Math.random() * w;
        }
        s.brightness += (Math.random() - 0.5) * 0.1;
        s.brightness = Math.max(0.2, Math.min(1.0, s.brightness));

        ctx.fillStyle = s.color || '#F8FAFC';
        ctx.globalAlpha = s.brightness * 0.85;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1.0;

      // 3. Horizon Glow in Soft Pastel Rose / Sky-Blue
      const horizonY = h * 0.60;
      const sunGrad = ctx.createRadialGradient(w / 2, horizonY, 10, w / 2, horizonY, 130);
      sunGrad.addColorStop(0, 'rgba(242, 84, 109, 0.35)');
      sunGrad.addColorStop(0.5, 'rgba(110, 198, 230, 0.2)');
      sunGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, horizonY - 120, w, 180);

      // 4. Subtle Horizon Line (Reduced Blur)
      ctx.shadowColor = '#6EC6E6';
      ctx.shadowBlur = 3;
      ctx.strokeStyle = '#6EC6E6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(w, horizonY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 5. 3D Moving Perspective Grid Floor in Soft Pastel Rose & Sky-Blue
      this.gridOffset = (this.gridOffset + 1.2) % 36;
      const vpX = w / 2; // Vanishing point
      const vpY = horizonY;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizonY, w, h - horizonY);
      ctx.clip();

      // Perspective Vertical (Converging) Lines (Soft Pastel Rose)
      ctx.strokeStyle = 'rgba(242, 84, 109, 0.35)';
      ctx.lineWidth = 1.5;
      const lineCount = 18;
      for (let i = -lineCount; i <= lineCount; i++) {
        const bottomX = vpX + i * 45;
        ctx.beginPath();
        ctx.moveTo(vpX + i * 5, vpY);
        ctx.lineTo(bottomX, h);
        ctx.stroke();
      }

      // Scrolling Horizontal Lines (Soft Pastel Sky-Blue Grid)
      ctx.strokeStyle = 'rgba(110, 198, 230, 0.4)';
      ctx.lineWidth = 1.5;
      for (let y = 0; y < 14; y++) {
        const progress = Math.pow((y * 24 + this.gridOffset) / 336, 2.2);
        const currentY = vpY + progress * (h - vpY);
        if (currentY > horizonY && currentY <= h) {
          ctx.beginPath();
          ctx.moveTo(0, currentY);
          ctx.lineTo(w, currentY);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  // Initialize App on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new RetroArcadeApp();
  });

})(typeof window !== 'undefined' ? window : this);
