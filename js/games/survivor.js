/**
 * ============================================================================
 * RETRO RANKERS - VAMP SURVIVOR (js/games/survivor.js)
 * GAME 5: Vampire Survivors Style Pixel Auto-Battler Bullet-Heaven
 * Patch Pastel Pixel-Art Aesthetic & 360° Virtual Scrolling Arena
 * ============================================================================
 *
 * Strict Specification Compliance:
 * - Canvas Layout: 600x750 (Virtual Scrolling Arena 5400x5400)
 * - Camera: Clamped tracking following player (this.camX, this.camY)
 * - Tiled Ground: #18243E / #1E2D4D checkerboard tiles with grass/pebble pixel accents
 *   and glowing arena boundary #5B78AD
 * - Hero (Patch-styled Pixel Hero):
 *   - Rose-red spiky hair #F2546D, Navy suit #25365C, Sky-blue eyes #6EC6E6, White gloves #F8FAFC
 *   - Walking bob animation & directional facing flip
 *   - Compact HP bar (100/100) below character
 *   - 360° movement via Arrow keys / WASD (speed: 210 px/s, normalized diagonal)
 * - 4 Iconic Auto-Weapons:
 *   1. Magic Dagger (Lv.1 start): Auto-fires fast sky-blue #6EC6E6 pixel daggers toward nearest enemy
 *   2. Orbiting Grimoire (Lv.1 start with 1 blade): Mustard-gold #F4C552 rotating grimoire blades
 *   3. Soul Garlic Aura: Mint #7BE092 pulsing circle ticking AoE damage & knockback
 *   4. Thunder Ring: Rose/Gold #F2546D / #F4C552 lightning bolts striking random on-screen enemies
 * - Enemy Waves & Scaling:
 *   - Pixel Bat (#B388EB Lavender, fast, low HP)
 *   - Slime (#7BE092 Mint, medium speed/HP)
 *   - Skeleton Knight (#E2E8F0 Silver, higher HP)
 *   - Elite Boss Demon (#F2546D Rose-Red, crown, horns & boss HP bar, spawns every 30s)
 * - EXP Gems & Magnet:
 *   - Sky-Blue (+1 EXP), Mint (+3 EXP), Gold (+8 EXP), Pink Heart (+25 HP)
 *   - Magnet attraction within 100px (upgradable)
 * - 3-Card Roguelite Level-Up Modal:
 *   - Pauses gameplay (this.choosingUpgrade = true), plays sound.playPowerUp()
 *   - 3 interactive cards selectable via Arrow keys, 1/2/3, or Mouse click, confirmed via Enter/Space
 *   - +500 * level bonus score
 * - Top HUD & Game Over:
 *   - Full-width EXP bar, LV.XX, SCORE, TIME, KILLS, weapon level badges
 *   - Triggers explosion, sound.playGameOver(), and onGameOver callback
 */

(function () {
  'use strict';

  // Arena & Viewport Constants
  const WORLD_W = 5400;
  const WORLD_H = 5400;
  const VIEW_W = 600;
  const VIEW_H = 750;
  const TILE_SIZE = 60;

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

  // Helper: Format seconds to MM:SS
  function formatTime(sec) {
    const totalSec = Math.max(0, Math.floor(sec));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Math Helpers
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const distSq = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2;

  // Upgrade Definitions Pool
  const UPGRADE_POOL = [
    {
      id: 'dagger',
      title: '매직 대거 강화',
      icon: '🗡️',
      color: '#6EC6E6',
      maxLevel: 5,
      getPerk: (currLv) => {
        const nextLv = currLv + 1;
        const counts = [1, 2, 3, 4, 6];
        return `투사체 ${counts[Math.min(nextLv - 1, 4)]}발 발사 & 관통력/공격력 강화`;
      }
    },
    {
      id: 'bible',
      title: '회전 성서 강화',
      icon: '📖',
      color: '#F4C552',
      maxLevel: 5,
      getPerk: (currLv) => {
        const nextLv = currLv + 1;
        const counts = [1, 2, 3, 4, 6];
        return `회전 성서 ${counts[Math.min(nextLv - 1, 4)]}권 회전 & 넉백/공격력 강화`;
      }
    },
    {
      id: 'garlic',
      title: '마늘 오라 강화',
      icon: '🧄',
      color: '#7BE092',
      maxLevel: 5,
      getPerk: (currLv) => {
        if (currLv === 0) return '신성한 수호 오라 습득! (주변 적 광역 피해 & 넉백)';
        return `오라 범위 +14px 및 지속 피해량 +35% 강화`;
      }
    },
    {
      id: 'lightning',
      title: '번개 반지 강화',
      icon: '⚡',
      color: '#F2546D',
      maxLevel: 5,
      getPerk: (currLv) => {
        if (currLv === 0) return '번개 반지 습득! (화면 내 적에게 강력한 낙뢰 강타)';
        return `낙뢰 타겟 수 +1 & 폭발 폭풍 범위 확대`;
      }
    },
    {
      id: 'boots',
      title: '자석 & 질풍 부츠',
      icon: '🧲',
      color: '#B388EB',
      maxLevel: 5,
      getPerk: (currLv) => {
        return `이동속도 +20px/s & 경험치 획득 자석 반경 +30px`;
      }
    },
    {
      id: 'heal',
      title: '응급 처치 & 활력',
      icon: '❤️',
      color: '#F2546D',
      maxLevel: 99,
      getPerk: (currLv) => `HP 40% 즉시 회복 & 최대 체력 +25 (${100 + currLv * 25} ➔ ${100 + (currLv + 1) * 25})`
    },
    {
      id: 'power',
      title: '파워 앰프',
      icon: '💥',
      color: '#F4C552',
      maxLevel: 20,
      getPerk: (currLv) => `모든 무기 공격력 +20% 영구 강화 (+${currLv * 20}% ➔ +${(currLv + 1) * 20}%)`
    }
  ];

  class PixelSurvivor {
    constructor(canvas, callbacks = {}) {
      this.canvas = canvas;
      this.callbacks = callbacks || {};
      this.sound = this.callbacks.sound || (typeof window !== 'undefined' ? window.sound : null);

      // Canvas viewport size
      this.width = canvas ? canvas.width : VIEW_W;
      this.height = canvas ? canvas.height : VIEW_H;

      // Camera coordinates (world space top-left)
      this.camX = (WORLD_W - this.width) / 2;
      this.camY = (WORLD_H - this.height) / 2;

      // Player State (Patch-styled Pixel Hero)
      this.player = {
        x: WORLD_W / 2,
        y: WORLD_H / 2,
        radius: 14,
        hitboxRadius: 9,
        baseSpeed: 210,
        speed: 210,
        hp: 100,
        maxHp: 100,
        invulnerableTimer: 0,
        flashTimer: 0,
        facing: 1, // 1: right, -1: left
        walkTimer: 0,
        isMoving: false
      };

      // Weapons Management
      this.weapons = {
        dagger: {
          level: 1,
          timer: 0,
          cooldown: 0.45,
          counts: [1, 2, 3, 4, 6],
          baseDmg: 24,
          pierce: 1
        },
        bible: {
          level: 1,
          angle: 0,
          spinSpeed: 3.2,
          counts: [1, 2, 3, 4, 6],
          radius: 78,
          baseDmg: 20
        },
        garlic: {
          level: 0, // Unlocked via upgrade
          timer: 0,
          tickInterval: 0.55,
          baseDmg: 16,
          pulseTimer: 0
        },
        lightning: {
          level: 0, // Unlocked via upgrade
          timer: 0,
          cooldown: 2.2,
          counts: [1, 2, 3, 4, 6],
          baseDmg: 90
        }
      };

      // Passive Stats
      this.magnetRadius = 100;
      this.powerBonus = 1.0;
      this.bootsLevel = 0;
      this.healLevel = 0;
      this.powerLevel = 0;

      // Level & EXP Progress
      this.level = 1;
      this.exp = 0;
      this.nextExp = 10;

      // Game Stats
      this.score = 0;
      this.kills = 0;
      this.timeSurvived = 0;
      this.gameTime = 0;
      this.running = false;
      this.gameOver = false;
      this.gameOverTimer = 0;

      // Spawning System
      this.enemySpawnTimer = 0;
      this.bossTimer = 0;
      this.bossCount = 0;
      this.bossWarningTimer = 0;

      // Collections
      this.enemies = [];
      this.projectiles = [];
      this.gems = [];
      this.particles = [];
      this.floatingTexts = [];
      this.lightningVisuals = [];
      this.auraWaves = [];

      // Level-Up Upgrade Modal State
      this.choosingUpgrade = false;
      this.upgradeCards = [];
      this.selectedCardIndex = 0;
      this.cardHoverIndex = -1;

      // Input keys
      this.keys = {
        up: false,
        down: false,
        left: false,
        right: false
      };

      // Bind canvas mouse/pointer events for card selection
      this._boundOnPointerMove = (e) => this._handlePointerMove(e);
      this._boundOnPointerDown = (e) => this._handlePointerDown(e);

      if (this.canvas) {
        this.canvas.addEventListener('mousemove', this._boundOnPointerMove);
        this.canvas.addEventListener('mousedown', this._boundOnPointerDown);
        this.canvas.addEventListener('touchstart', this._boundOnPointerDown, { passive: false });
      }

      // Pre-compute floor decoration seed table for consistent pixel ground
      this._initTileDecorations();
    }

    // -------------------------------------------------------------
    // Lifecycle Methods
    // -------------------------------------------------------------
    start() {
      this.running = true;
      this.gameOver = false;
      this._playSound('playStart');
    }

    stop() {
      this.running = false;
      if (this.canvas) {
        this.canvas.removeEventListener('mousemove', this._boundOnPointerMove);
        this.canvas.removeEventListener('mousedown', this._boundOnPointerDown);
        this.canvas.removeEventListener('touchstart', this._boundOnPointerDown);
      }
    }

    // Sound safe helper
    _playSound(name) {
      if (this.sound && typeof this.sound[name] === 'function') {
        try {
          this.sound[name]();
        } catch (e) {
          // Safe fail
        }
      }
    }

    // -------------------------------------------------------------
    // Input Handling
    // -------------------------------------------------------------
    handleKeyDown(e) {
      const code = e.code || '';
      const key = e.key || '';

      // Modal navigation if level-up modal active
      if (this.choosingUpgrade) {
        if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'w' || key === 'W' || key === 'a' || key === 'A') {
          e.preventDefault();
          this.selectedCardIndex = (this.selectedCardIndex - 1 + this.upgradeCards.length) % this.upgradeCards.length;
          this._playSound('playMove');
          return;
        }
        if (key === 'ArrowDown' || key === 'ArrowRight' || key === 's' || key === 'S' || key === 'd' || key === 'D') {
          e.preventDefault();
          this.selectedCardIndex = (this.selectedCardIndex + 1) % this.upgradeCards.length;
          this._playSound('playMove');
          return;
        }
        if (key === '1' && this.upgradeCards.length >= 1) {
          e.preventDefault();
          this._selectCard(0);
          return;
        }
        if (key === '2' && this.upgradeCards.length >= 2) {
          e.preventDefault();
          this._selectCard(1);
          return;
        }
        if (key === '3' && this.upgradeCards.length >= 3) {
          e.preventDefault();
          this._selectCard(2);
          return;
        }
        if (key === 'Enter' || code === 'Space' || key === ' ') {
          e.preventDefault();
          this._selectCard(this.selectedCardIndex);
          return;
        }
        return;
      }

      // Gameplay movement inputs
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') this.keys.left = true;
      if (key === 'ArrowRight' || key === 'd' || key === 'D') this.keys.right = true;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') this.keys.up = true;
      if (key === 'ArrowDown' || key === 's' || key === 'S') this.keys.down = true;
    }

    handleKeyUp(e) {
      const key = e.key || '';
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') this.keys.left = false;
      if (key === 'ArrowRight' || key === 'd' || key === 'D') this.keys.right = false;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') this.keys.up = false;
      if (key === 'ArrowDown' || key === 's' || key === 'S') this.keys.down = false;
    }

    _getCanvasCoords(e) {
      if (!this.canvas) return { x: 0, y: 0 };
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    _handlePointerMove(e) {
      if (!this.choosingUpgrade) return;
      const { x, y } = this._getCanvasCoords(e);
      const cardY = 220;
      const cardH = 118;
      const gap = 20;

      for (let i = 0; i < this.upgradeCards.length; i++) {
        const top = cardY + i * (cardH + gap);
        if (x >= 55 && x <= 545 && y >= top && y <= top + cardH) {
          if (this.selectedCardIndex !== i) {
            this.selectedCardIndex = i;
            this._playSound('playMove');
          }
          break;
        }
      }
    }

    _handlePointerDown(e) {
      if (!this.choosingUpgrade) return;
      const { x, y } = this._getCanvasCoords(e);
      const cardY = 220;
      const cardH = 118;
      const gap = 20;

      for (let i = 0; i < this.upgradeCards.length; i++) {
        const top = cardY + i * (cardH + gap);
        if (x >= 55 && x <= 545 && y >= top && y <= top + cardH) {
          e.preventDefault();
          this._selectCard(i);
          return;
        }
      }
    }

    // -------------------------------------------------------------
    // Ground Tile Pattern Generator
    // -------------------------------------------------------------
    _initTileDecorations() {
      this.tileDecors = {};
      const cols = Math.ceil(WORLD_W / TILE_SIZE);
      const rows = Math.ceil(WORLD_H / TILE_SIZE);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Simple pseudo-random hash based on coordinate
          const hash = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
          const val = hash - Math.floor(hash);

          if (val > 0.72) {
            // Grass tuft or stone
            this.tileDecors[`${c}_${r}`] = {
              type: val > 0.88 ? 'grass' : 'stone',
              offsetX: Math.floor((val * 100) % (TILE_SIZE - 16)) + 8,
              offsetY: Math.floor((val * 1000) % (TILE_SIZE - 16)) + 8
            };
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Main Update Loop
    // -------------------------------------------------------------
    update(dt) {
      if (!this.running) return;

      // Handle Game Over Explosion Animation sequence
      if (this.gameOver) {
        this.gameOverTimer += dt;
        this._updateParticles(dt);
        this._updateFloatingTexts(dt);

        if (this.gameOverTimer >= 1.4 && !this._gameOverFired) {
          this._gameOverFired = true;
          if (typeof this.callbacks.onGameOver === 'function') {
            this.callbacks.onGameOver(Math.floor(this.score), {
              gameId: 'survivor',
              stage: `LV.${this.level}`,
              timeSurvived: this.timeSurvived,
              kills: this.kills
            });
          }
        }
        return;
      }

      // If choosing upgrade modal is open, pause simulation
      if (this.choosingUpgrade) return;

      // Cap delta time to prevent physics tunneling
      dt = Math.min(dt, 0.08);

      this.gameTime += dt;
      this.timeSurvived += dt;

      // Passive score generation for surviving
      this.score += dt * 28;
      if (this.callbacks.onScoreChange) {
        this.callbacks.onScoreChange(Math.floor(this.score));
      }

      // Update Player
      this._updatePlayer(dt);

      // Update Weapons
      this._updateWeapons(dt);

      // Update Spawner
      this._updateSpawner(dt);

      // Update Enemies
      this._updateEnemies(dt);

      // Update Projectiles & Attacks
      this._updateProjectiles(dt);

      // Update Gems & Attraction
      this._updateGems(dt);

      // Update Visuals
      this._updateParticles(dt);
      this._updateFloatingTexts(dt);
      this._updateAuraWaves(dt);

      // Update Boss Warning Timer
      if (this.bossWarningTimer > 0) {
        this.bossWarningTimer -= dt;
      }

      // Check Level Up Condition
      if (this.exp >= this.nextExp && !this.choosingUpgrade) {
        this._triggerLevelUp();
      }
    }

    // -------------------------------------------------------------
    // Player Update & Camera Tracking
    // -------------------------------------------------------------
    _updatePlayer(dt) {
      const p = this.player;

      // Movement vector
      let dx = 0;
      let dy = 0;

      if (this.keys.left) dx -= 1;
      if (this.keys.right) dx += 1;
      if (this.keys.up) dy -= 1;
      if (this.keys.down) dy += 1;

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }

      if (dx !== 0 || dy !== 0) {
        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;
        p.isMoving = true;
        p.walkTimer += dt * 14;

        if (dx < 0) p.facing = -1;
        if (dx > 0) p.facing = 1;
      } else {
        p.isMoving = false;
      }

      // Clamp player within arena boundaries
      const margin = 28;
      p.x = clamp(p.x, margin, WORLD_W - margin);
      p.y = clamp(p.y, margin, WORLD_H - margin);

      // Invulnerability & damage flash timers
      if (p.invulnerableTimer > 0) p.invulnerableTimer -= dt;
      if (p.flashTimer > 0) p.flashTimer -= dt;

      // Smooth Camera tracking following player
      const targetCamX = clamp(p.x - this.width / 2, 0, WORLD_W - this.width);
      const targetCamY = clamp(p.y - this.height / 2, 0, WORLD_H - this.height);

      this.camX += (targetCamX - this.camX) * Math.min(1, dt * 12);
      this.camY += (targetCamY - this.camY) * Math.min(1, dt * 12);
    }

    // -------------------------------------------------------------
    // Weapons Auto-Fire & Mechanics
    // -------------------------------------------------------------
    _updateWeapons(dt) {
      const p = this.player;

      // 1. Magic Dagger (Auto-fires sky-blue daggers toward nearest enemy)
      const wDagger = this.weapons.dagger;
      if (wDagger.level > 0) {
        wDagger.timer += dt;
        const cd = Math.max(0.24, wDagger.cooldown - (wDagger.level - 1) * 0.04);

        if (wDagger.timer >= cd) {
          wDagger.timer = 0;
          this._fireMagicDagger();
        }
      }

      // 2. Orbiting Grimoire (Rotates blades continuously around player)
      const wBible = this.weapons.bible;
      if (wBible.level > 0) {
        const speedMultiplier = 1 + (wBible.level - 1) * 0.22;
        wBible.angle += dt * wBible.spinSpeed * speedMultiplier;
        if (wBible.angle > Math.PI * 2) wBible.angle -= Math.PI * 2;

        this._checkGrimoireCollisions();
      }

      // 3. Garlic Aura (Pastel mint pulsing circle)
      const wGarlic = this.weapons.garlic;
      if (wGarlic.level > 0) {
        wGarlic.pulseTimer += dt * 4;
        wGarlic.timer += dt;
        const tickRate = Math.max(0.38, wGarlic.tickInterval - (wGarlic.level - 1) * 0.04);

        if (wGarlic.timer >= tickRate) {
          wGarlic.timer = 0;
          this._tickGarlicAura();
        }
      }

      // 4. Thunder Ring (Strikes random visible enemies with lightning)
      const wLightning = this.weapons.lightning;
      if (wLightning.level > 0) {
        wLightning.timer += dt;
        const cd = Math.max(1.3, wLightning.cooldown - (wLightning.level - 1) * 0.18);

        if (wLightning.timer >= cd) {
          wLightning.timer = 0;
          this._strikeThunderRing();
        }
      }

      // Update active lightning visual fading
      for (let i = this.lightningVisuals.length - 1; i >= 0; i--) {
        const l = this.lightningVisuals[i];
        l.life -= dt;
        if (l.life <= 0) {
          this.lightningVisuals.splice(i, 1);
        }
      }
    }

    _fireMagicDagger() {
      const p = this.player;
      const count = this.weapons.dagger.counts[Math.min(this.weapons.dagger.level - 1, 4)];
      const baseDmg = (this.weapons.dagger.baseDmg + (this.weapons.dagger.level - 1) * 8) * this.powerBonus;
      const pierce = 1 + Math.floor((this.weapons.dagger.level - 1) / 2);

      // Find nearest enemy in range (up to 580px)
      let nearest = null;
      let minD = 580 * 580;

      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        const d = distSq(p.x, p.y, e.x, e.y);
        if (d < minD) {
          minD = d;
          nearest = e;
        }
      }

      // Default angle if no enemy in range
      let targetAngle = p.facing > 0 ? 0 : Math.PI;
      if (nearest) {
        targetAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      }

      // Fire fan or volley of daggers
      const spread = 0.14; // radians
      const startAngle = targetAngle - ((count - 1) * spread) / 2;

      for (let i = 0; i < count; i++) {
        const angle = startAngle + i * spread;
        this.projectiles.push({
          type: 'dagger',
          x: p.x,
          y: p.y,
          vx: Math.cos(angle) * 560,
          vy: Math.sin(angle) * 560,
          angle: angle,
          radius: 6,
          damage: baseDmg,
          pierce: pierce,
          hitEnemies: new Set(),
          life: 1.6
        });
      }

      this._playSound('playShoot');
    }

    _checkGrimoireCollisions() {
      const p = this.player;
      const w = this.weapons.bible;
      const count = w.counts[Math.min(w.level - 1, 4)];
      const radius = w.radius + (w.level - 1) * 4;
      const dmg = (w.baseDmg + (w.level - 1) * 7) * this.powerBonus;

      for (let i = 0; i < count; i++) {
        const bladeAngle = w.angle + (i * Math.PI * 2) / count;
        const bx = p.x + Math.cos(bladeAngle) * radius;
        const by = p.y + Math.sin(bladeAngle) * radius;

        // Check against enemies
        for (let j = 0; j < this.enemies.length; j++) {
          const enemy = this.enemies[j];
          const hitDistSq = (18 + enemy.radius) ** 2;

          if (distSq(bx, by, enemy.x, enemy.y) < hitDistSq) {
            // Apply cooldown per enemy
            if (!enemy.lastBibleHit || this.gameTime - enemy.lastBibleHit > 0.28) {
              enemy.lastBibleHit = this.gameTime;
              this._damageEnemy(enemy, dmg, true);

              // Apply knockback
              const kx = enemy.x - p.x;
              const ky = enemy.y - p.y;
              const len = Math.hypot(kx, ky) || 1;
              enemy.x += (kx / len) * 32;
              enemy.y += (ky / len) * 32;

              // Sparkle effect
              this._createSparks(bx, by, '#F4C552', 5);
              this._playSound('playHit');
            }
          }
        }
      }
    }

    _tickGarlicAura() {
      const p = this.player;
      const w = this.weapons.garlic;
      const radius = 68 + w.level * 14;
      const radiusSq = radius * radius;
      const dmg = (w.baseDmg + (w.level - 1) * 9) * this.powerBonus;

      let hitAny = false;

      // Trigger expanding wave ring
      this.auraWaves.push({
        x: p.x,
        y: p.y,
        currentRadius: 10,
        maxRadius: radius,
        alpha: 0.8
      });

      for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i];
        if (distSq(p.x, p.y, enemy.x, enemy.y) <= radiusSq) {
          this._damageEnemy(enemy, dmg, false);

          // Slight knockback away from player
          const kx = enemy.x - p.x;
          const ky = enemy.y - p.y;
          const len = Math.hypot(kx, ky) || 1;
          enemy.x += (kx / len) * 14;
          enemy.y += (ky / len) * 14;

          hitAny = true;
        }
      }

      if (hitAny) {
        this._playSound('playHit');
      }
    }

    _strikeThunderRing() {
      const p = this.player;
      const w = this.weapons.lightning;
      const targetCount = w.counts[Math.min(w.level - 1, 4)];
      const dmg = (w.baseDmg + (w.level - 1) * 28) * this.powerBonus;
      const blastRadius = 52 + (w.level - 1) * 5;
      const blastRadiusSq = blastRadius * blastRadius;

      // Find visible enemies within camera viewport
      const visibleEnemies = this.enemies.filter(e => {
        return (
          e.x >= this.camX - 40 &&
          e.x <= this.camX + this.width + 40 &&
          e.y >= this.camY - 40 &&
          e.y <= this.camY + this.height + 40
        );
      });

      if (visibleEnemies.length === 0) return;

      // Pick random unique targets
      const shuffled = [...visibleEnemies].sort(() => Math.random() - 0.5);
      const chosen = shuffled.slice(0, targetCount);

      chosen.forEach(target => {
        // Create jagged lightning bolt visual
        const segments = [];
        let currX = target.x + (Math.random() - 0.5) * 80;
        let currY = this.camY - 60;
        segments.push({ x: currX, y: currY });

        const steps = 7;
        const dy = (target.y - currY) / steps;
        for (let s = 1; s < steps; s++) {
          currY += dy;
          currX += (Math.random() - 0.5) * 44;
          segments.push({ x: currX, y: currY });
        }
        segments.push({ x: target.x, y: target.y });

        this.lightningVisuals.push({
          segments: segments,
          life: 0.22,
          targetX: target.x,
          targetY: target.y,
          color: Math.random() > 0.5 ? '#F2546D' : '#F4C552'
        });

        // Area of Effect damage around lightning strike
        for (let j = 0; j < this.enemies.length; j++) {
          const e = this.enemies[j];
          if (distSq(target.x, target.y, e.x, e.y) <= blastRadiusSq) {
            this._damageEnemy(e, dmg, true, true);
          }
        }

        // Blast sparks and explosion
        this._createSparks(target.x, target.y, '#F4C552', 14);
        this._createSparks(target.x, target.y, '#F2546D', 10);
      });

      this._playSound('playExplosion');
    }

    // -------------------------------------------------------------
    // Projectiles Movement & Hit Detection
    // -------------------------------------------------------------
    _updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.life -= dt;

        // Trail particle
        if (Math.random() > 0.4) {
          this.particles.push({
            x: pr.x,
            y: pr.y,
            vx: -pr.vx * 0.08 + (Math.random() - 0.5) * 20,
            vy: -pr.vy * 0.08 + (Math.random() - 0.5) * 20,
            color: '#6EC6E6',
            size: Math.random() * 2 + 1,
            life: 0.25,
            maxLife: 0.25
          });
        }

        // Out of world or life expired
        if (pr.life <= 0 || pr.x < 0 || pr.x > WORLD_W || pr.y < 0 || pr.y > WORLD_H) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Enemy collision check
        for (let j = 0; j < this.enemies.length; j++) {
          const enemy = this.enemies[j];
          if (pr.hitEnemies.has(enemy)) continue;

          const hitDistSq = (pr.radius + enemy.radius) ** 2;
          if (distSq(pr.x, pr.y, enemy.x, enemy.y) < hitDistSq) {
            pr.hitEnemies.add(enemy);
            this._damageEnemy(enemy, pr.damage, false);

            this._createSparks(pr.x, pr.y, '#6EC6E6', 4);
            pr.pierce--;

            if (pr.pierce <= 0) {
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Enemies Spawning & Behavior
    // -------------------------------------------------------------
    _updateSpawner(dt) {
      this.enemySpawnTimer += dt;
      this.bossTimer += dt;
      if (this.bossTimer >= 30) {
        this.bossTimer -= 30;
        this.bossCount++;
        this._spawnEliteBoss();
      }

      // Spawn rate ramps up with level and survival time (1.584x steeper slope)
      const levelRamp = (this.level - 1) * (0.025 * 1.584);
      const timeRamp = this.timeSurvived * (0.007 * 1.584);
      const spawnInterval = Math.max(0.14, 0.90 - levelRamp - timeRamp);

      if (this.enemySpawnTimer >= spawnInterval) {
        this.enemySpawnTimer = 0;
        const spawnCount = (this.level >= 10 && Math.random() < 0.45) || (this.level >= 5 && Math.random() < 0.25) ? 2 : 1;
        for (let i = 0; i < spawnCount; i++) {
          this._spawnEnemyWave();
        }
      }
    }

    _spawnEnemyWave() {
      // Limit active enemies to 120 to preserve silky 60fps
      if (this.enemies.length >= 120) return;

      const p = this.player;
      // Spawn at radius ~420px around player
      const angle = Math.random() * Math.PI * 2;
      const spawnDist = 410 + Math.random() * 60;
      let sx = p.x + Math.cos(angle) * spawnDist;
      let sy = p.y + Math.sin(angle) * spawnDist;

      // Keep within arena
      sx = clamp(sx, 40, WORLD_W - 40);
      sy = clamp(sy, 40, WORLD_H - 40);

      // Determine enemy type based on survival time and level (1.584x progress scaling)
      const effectiveProgress = (this.timeSurvived + (this.level - 1) * 6) * 1.584;
      let type = 'bat';
      const roll = Math.random();

      if (effectiveProgress < 28) {
        type = roll < 0.82 ? 'bat' : 'slime';
      } else if (effectiveProgress < 60) {
        if (roll < 0.45) type = 'bat';
        else if (roll < 0.8) type = 'slime';
        else type = 'skeleton';
      } else {
        if (roll < 0.3) type = 'bat';
        else if (roll < 0.6) type = 'slime';
        else type = 'skeleton';
      }

      const enemy = this._createEnemy(type, sx, sy);
      this.enemies.push(enemy);
    }

    _createEnemy(type, x, y) {
      // Early-game base lowered by 10%, mid/late-game slope kept at 1.584x (1.44 * 1.1)
      const hpScale = 1.14 + ((this.level - 1) * 0.12 + this.timeSurvived * 0.012) * 1.584;
      const speedScale = Math.min(1.70, 1.04 + (this.level - 1) * (0.015 * 1.584));
      const dmgScale = 1.14 + (this.level - 1) * (0.05 * 1.584);

      switch (type) {
        case 'bat':
          return {
            type: 'bat',
            x: x,
            y: y,
            radius: 11,
            hp: Math.floor(18 * hpScale),
            maxHp: Math.floor(18 * hpScale),
            speed: Math.round(148 * speedScale),
            color: '#B388EB',
            scoreVal: 120,
            gemType: Math.random() > 0.15 ? 'blue' : 'mint',
            touchDmg: Math.round(10 * dmgScale),
            animTimer: Math.random() * 10
          };

        case 'slime':
          return {
            type: 'slime',
            x: x,
            y: y,
            radius: 14,
            hp: Math.floor(42 * hpScale),
            maxHp: Math.floor(42 * hpScale),
            speed: Math.round(102 * speedScale),
            color: '#7BE092',
            scoreVal: 176,
            gemType: Math.random() > 0.3 ? 'mint' : 'gold',
            touchDmg: Math.round(14 * dmgScale),
            animTimer: Math.random() * 10
          };

        case 'skeleton':
          return {
            type: 'skeleton',
            x: x,
            y: y,
            radius: 16,
            hp: Math.floor(85 * hpScale),
            maxHp: Math.floor(85 * hpScale),
            speed: Math.round(78 * speedScale),
            color: '#E2E8F0',
            scoreVal: 304,
            gemType: Math.random() > 0.35 ? 'mint' : 'gold',
            touchDmg: Math.round(20 * dmgScale),
            animTimer: Math.random() * 10
          };

        default:
          return this._createEnemy('bat', x, y);
      }
    }

    _spawnEliteBoss() {
      const p = this.player;
      const angle = Math.random() * Math.PI * 2;
      const sx = clamp(p.x + Math.cos(angle) * 380, 60, WORLD_W - 60);
      const sy = clamp(p.y + Math.sin(angle) * 380, 60, WORLD_H - 60);

      const bossHp = Math.floor((420 + this.bossCount * 312 + (this.level - 1) * 30) * 1.32);
      const bossSpeed = Math.min(141, Math.round((92 + (this.bossCount - 1) * 6) * 1.1));
      const bossTouchDmg = Math.round((28 + (this.bossCount - 1) * 6) * 1.32);

      const boss = {
        type: 'boss',
        isBoss: true,
        x: sx,
        y: sy,
        radius: 26,
        hp: bossHp,
        maxHp: bossHp,
        speed: bossSpeed,
        color: '#F2546D',
        scoreVal: 2400,
        gemType: 'gold',
        hasHeart: true,
        touchDmg: bossTouchDmg,
        animTimer: 0
      };

      this.enemies.push(boss);
      this.bossWarningTimer = 2.8; // Show dramatic warning on HUD
      this._playSound('playExplosion');
    }

    _updateEnemies(dt) {
      const p = this.player;

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.animTimer += dt;

        // Move directly toward player
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;

        e.x += (dx / dist) * e.speed * dt;
        e.y += (dy / dist) * e.speed * dt;

        // Soft separation push against neighboring enemies
        for (let j = 0; j < Math.min(this.enemies.length, 18); j++) {
          const other = this.enemies[(i + j + 1) % this.enemies.length];
          if (other !== e) {
            const ox = e.x - other.x;
            const oy = e.y - other.y;
            const odistSq = ox * ox + oy * oy;
            const minSpace = e.radius + other.radius;
            if (odistSq < minSpace * minSpace && odistSq > 0) {
              const odist = Math.sqrt(odistSq);
              e.x += (ox / odist) * 22 * dt;
              e.y += (oy / odist) * 22 * dt;
            }
          }
        }

        // Touch collision with player
        if (p.invulnerableTimer <= 0) {
          const hitDistSq = (p.hitboxRadius + e.radius) ** 2;
          if (distSq(p.x, p.y, e.x, e.y) < hitDistSq) {
            this._damagePlayer(e.touchDmg);
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Damage, Death & Drops System
    // -------------------------------------------------------------
    _damageEnemy(enemy, amount, isCrit = false, isLightning = false) {
      enemy.hp -= amount;
      enemy.flashTimer = 0.12;

      // Floating damage number
      this.floatingTexts.push({
        x: enemy.x + (Math.random() - 0.5) * 16,
        y: enemy.y - 12,
        text: isCrit ? `-${Math.ceil(amount)}!` : `-${Math.ceil(amount)}`,
        color: isCrit ? '#F4C552' : isLightning ? '#F2546D' : '#F8FAFC',
        scale: isCrit ? 1.3 : 1.0,
        vy: -48,
        alpha: 1.0,
        life: 0.65
      });

      // Defeated
      if (enemy.hp <= 0) {
        this._destroyEnemy(enemy);
      }
    }

    _destroyEnemy(enemy) {
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) {
        this.enemies.splice(idx, 1);
      }

      this.kills++;
      this.score += enemy.scoreVal;

      // Enemy death explosion particles
      const count = enemy.isBoss ? 28 : 10;
      this._createSparks(enemy.x, enemy.y, enemy.color, count);

      // Score popup
      this.floatingTexts.push({
        x: enemy.x,
        y: enemy.y - 20,
        text: `+${enemy.scoreVal}`,
        color: enemy.isBoss ? '#F4C552' : '#7BE092',
        scale: enemy.isBoss ? 1.4 : 1.0,
        vy: -35,
        alpha: 1.0,
        life: 0.8
      });

      // Drop EXP Gem
      this._dropGem(enemy.x, enemy.y, enemy.gemType);

      // Boss guaranteed heart drop
      if (enemy.hasHeart || (Math.random() < 0.05 && this.player.hp < this.player.maxHp * 0.7)) {
        this._dropGem(enemy.x + 12, enemy.y, 'heart');
      }

      this._playSound(enemy.isBoss ? 'playExplosion' : 'playHit');
    }

    _dropGem(x, y, type) {
      let expVal = 1;
      let healVal = 0;
      let color = '#6EC6E6';

      if (type === 'mint') {
        expVal = 3;
        color = '#7BE092';
      } else if (type === 'gold') {
        expVal = 8;
        color = '#F4C552';
      } else if (type === 'heart') {
        expVal = 0;
        healVal = 25;
        color = '#F2546D';
      }

      this.gems.push({
        x: x,
        y: y,
        type: type,
        expVal: expVal,
        healVal: healVal,
        color: color,
        radius: type === 'heart' ? 8 : 6,
        isFlying: false,
        vx: 0,
        vy: 0,
        sparkleTimer: Math.random() * 5
      });
    }

    _damagePlayer(amount) {
      const p = this.player;
      p.hp -= amount;
      p.invulnerableTimer = 0.42; // i-frames
      p.flashTimer = 0.22;

      this._createSparks(p.x, p.y, '#F2546D', 8);
      this._playSound('playHit');

      // Floating damage number on hero
      this.floatingTexts.push({
        x: p.x,
        y: p.y - 20,
        text: `-${Math.ceil(amount)}`,
        color: '#F2546D',
        scale: 1.2,
        vy: -55,
        alpha: 1.0,
        life: 0.8
      });

      // Check Game Over
      if (p.hp <= 0) {
        p.hp = 0;
        this.gameOver = true;
        this.gameOverTimer = 0;
        this._gameOverFired = false;

        // Big death burst
        this._createSparks(p.x, p.y, '#F2546D', 30);
        this._createSparks(p.x, p.y, '#6EC6E6', 20);
        this._createSparks(p.x, p.y, '#F4C552', 15);
        this._playSound('playGameOver');
      }
    }

    // -------------------------------------------------------------
    // EXP Gems Attraction & Collection
    // -------------------------------------------------------------
    _updateGems(dt) {
      const p = this.player;
      const magnetSq = this.magnetRadius * this.magnetRadius;

      for (let i = this.gems.length - 1; i >= 0; i--) {
        const gem = this.gems[i];
        gem.sparkleTimer += dt;

        const dSq = distSq(p.x, p.y, gem.x, gem.y);

        // Check magnet reach
        if (dSq <= magnetSq || gem.isFlying) {
          gem.isFlying = true;
          const dist = Math.sqrt(dSq) || 1;
          const speed = Math.max(380, (1 - dist / this.magnetRadius) * 620 + 260);

          gem.x += ((p.x - gem.x) / dist) * speed * dt;
          gem.y += ((p.y - gem.y) / dist) * speed * dt;

          // Pickup check
          if (dist < 18) {
            this._collectGem(gem);
            this.gems.splice(i, 1);
          }
        }
      }
    }

    _collectGem(gem) {
      const p = this.player;

      if (gem.type === 'heart') {
        const prevHp = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + gem.healVal);
        const healed = Math.ceil(p.hp - prevHp);

        this.floatingTexts.push({
          x: p.x,
          y: p.y - 22,
          text: `+${healed} HP!`,
          color: '#F2546D',
          scale: 1.15,
          vy: -40,
          alpha: 1.0,
          life: 0.7
        });
        this._playSound('playPowerUp');
      } else {
        this.exp += gem.expVal;
        this.score += gem.expVal * 12;

        this.floatingTexts.push({
          x: gem.x,
          y: gem.y - 12,
          text: `+${gem.expVal} EXP`,
          color: gem.color,
          scale: 0.9,
          vy: -35,
          alpha: 1.0,
          life: 0.5
        });

        this._playSound('playScore');
      }
    }

    // -------------------------------------------------------------
    // Visual Effects & Particles
    // -------------------------------------------------------------
    _createSparks(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 160 + 40;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color: color,
          size: Math.random() * 3 + 1.5,
          life: Math.random() * 0.35 + 0.15,
          maxLife: 0.45
        });
      }
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.92;
        pt.vy *= 0.92;
        pt.life -= dt;
        if (pt.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    _updateFloatingTexts(dt) {
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.life -= dt;
        ft.alpha = Math.max(0, ft.life / 0.7);
        if (ft.life <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }
    }

    _updateAuraWaves(dt) {
      for (let i = this.auraWaves.length - 1; i >= 0; i--) {
        const w = this.auraWaves[i];
        w.currentRadius += (w.maxRadius - w.currentRadius) * dt * 8 + 30 * dt;
        w.alpha -= dt * 2.2;
        if (w.alpha <= 0 || w.currentRadius >= w.maxRadius) {
          this.auraWaves.splice(i, 1);
        }
      }
    }

    // -------------------------------------------------------------
    // Level Up Roguelite Modal System
    // -------------------------------------------------------------
    _triggerLevelUp() {
      this.exp -= this.nextExp;
      this.level++;
      // Crisp EXP scaling curve (balanced 1.375x)
      this.nextExp = Math.floor((8 + this.level * 5) * 1.375);

      // Score reward
      const levelBonus = 400 * this.level;
      this.score += levelBonus;
      if (this.callbacks.onScoreChange) {
        this.callbacks.onScoreChange(Math.floor(this.score));
      }

      this.choosingUpgrade = true;
      this.selectedCardIndex = 0;

      // Filter upgrade pool to available options
      const available = UPGRADE_POOL.filter(opt => {
        if (opt.id === 'dagger') return this.weapons.dagger.level < opt.maxLevel;
        if (opt.id === 'bible') return this.weapons.bible.level < opt.maxLevel;
        if (opt.id === 'garlic') return this.weapons.garlic.level < opt.maxLevel;
        if (opt.id === 'lightning') return this.weapons.lightning.level < opt.maxLevel;
        if (opt.id === 'boots') return this.bootsLevel < opt.maxLevel;
        if (opt.id === 'power') return this.powerLevel < opt.maxLevel;
        return true;
      });

      // Pick 3 random cards
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      this.upgradeCards = shuffled.slice(0, 3);

      this._playSound('playPowerUp');
    }

    _selectCard(index) {
      if (!this.choosingUpgrade || index < 0 || index >= this.upgradeCards.length) return;

      const card = this.upgradeCards[index];
      this._applyUpgrade(card.id);

      this.choosingUpgrade = false;
      this._playSound('playPowerUp');

      // Floating congratulatory message
      this.floatingTexts.push({
        x: this.player.x,
        y: this.player.y - 35,
        text: `UPGRADED: ${card.title}!`,
        color: '#F4C552',
        scale: 1.3,
        vy: -50,
        alpha: 1.0,
        life: 0.9
      });
    }

    _applyUpgrade(id) {
      switch (id) {
        case 'dagger':
          this.weapons.dagger.level++;
          break;
        case 'bible':
          this.weapons.bible.level++;
          break;
        case 'garlic':
          this.weapons.garlic.level++;
          break;
        case 'lightning':
          this.weapons.lightning.level++;
          break;
        case 'boots':
          this.bootsLevel++;
          this.player.speed = this.player.baseSpeed + this.bootsLevel * 20;
          this.magnetRadius = 100 + this.bootsLevel * 30;
          break;
        case 'heal': {
          this.healLevel++;
          this.player.maxHp += 25;
          const healAmount = Math.round(this.player.maxHp * 0.4);
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmount);
          this.floatingTexts.push({
            x: this.player.x,
            y: this.player.y - 52,
            text: `+${healAmount} HP! (MAX ${this.player.maxHp})`,
            color: '#7BE092',
            scale: 1.2,
            vy: -45,
            alpha: 1.0,
            life: 1.1
          });
          break;
        }
        case 'power': {
          this.powerLevel = Math.min(20, this.powerLevel + 1);
          this.powerBonus = +(1.0 + this.powerLevel * 0.20).toFixed(2);
          this.floatingTexts.push({
            x: this.player.x,
            y: this.player.y - 52,
            text: `ATK +${Math.round(this.powerLevel * 20)}%!`,
            color: '#F4C552',
            scale: 1.2,
            vy: -45,
            alpha: 1.0,
            life: 1.1
          });
          break;
        }
      }
    }

    // -------------------------------------------------------------
    // Render Master Method
    // -------------------------------------------------------------
    render(ctx) {
      if (!ctx) return;

      ctx.save();

      // Clear Screen with deep midnight navy
      ctx.fillStyle = '#101827';
      ctx.fillRect(0, 0, this.width, this.height);

      // 1. World Rendering (Camera Offset)
      ctx.save();
      ctx.translate(-Math.floor(this.camX), -Math.floor(this.camY));

      // Draw Tiled Ground & Details
      this._renderGround(ctx);

      // Draw Gems & Pickups
      this._renderGems(ctx);

      // Draw Garlic Aura & Expanding Waves
      this._renderGarlicAura(ctx);

      // Draw Enemies
      this._renderEnemies(ctx);

      // Draw Player & Orbiting Grimoire Blades
      this._renderPlayer(ctx);
      this._renderGrimoires(ctx);

      // Draw Projectiles
      this._renderProjectiles(ctx);

      // Draw Lightning Bolt Visuals
      this._renderLightning(ctx);

      // Draw Particles
      this._renderParticles(ctx);

      // Draw World Floating Damage/EXP Numbers
      this._renderFloatingTexts(ctx);

      // Draw Arena Borders & Glowing Brackets
      this._renderArenaBounds(ctx);

      ctx.restore();

      // 2. Screen Space HUD
      this._renderHUD(ctx);

      // 3. Boss Warning Banner Overlay
      if (this.bossWarningTimer > 0) {
        this._renderBossWarning(ctx);
      }

      // 4. Level-Up 3-Card Modal Overlay
      if (this.choosingUpgrade) {
        this._renderUpgradeModal(ctx);
      }

      // 5. Game Over Screen Overlay
      if (this.gameOver) {
        this._renderGameOver(ctx);
      }

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Ground & Arena Rendering
    // -------------------------------------------------------------
    _renderGround(ctx) {
      const startCol = Math.max(0, Math.floor(this.camX / TILE_SIZE));
      const endCol = Math.min(Math.ceil(WORLD_W / TILE_SIZE), Math.ceil((this.camX + this.width) / TILE_SIZE) + 1);
      const startRow = Math.max(0, Math.floor(this.camY / TILE_SIZE));
      const endRow = Math.min(Math.ceil(WORLD_H / TILE_SIZE), Math.ceil((this.camY + this.height) / TILE_SIZE) + 1);

      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          const x = c * TILE_SIZE;
          const y = r * TILE_SIZE;

          // Checkerboard alternating tiles
          ctx.fillStyle = (c + r) % 2 === 0 ? '#18243E' : '#1E2D4D';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

          // Subtle grid line accent
          ctx.strokeStyle = '#141F35';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

          // Render subtle grass/stone decorations
          const decor = this.tileDecors[`${c}_${r}`];
          if (decor) {
            const dx = x + decor.offsetX;
            const dy = y + decor.offsetY;

            if (decor.type === 'grass') {
              ctx.fillStyle = '#263D66';
              ctx.fillRect(dx, dy, 2, 4);
              ctx.fillRect(dx + 2, dy - 2, 2, 6);
              ctx.fillRect(dx + 4, dy + 1, 2, 3);
            } else {
              ctx.fillStyle = '#223454';
              ctx.fillRect(dx, dy, 4, 3);
              ctx.fillRect(dx + 1, dy - 1, 2, 1);
            }
          }
        }
      }
    }

    _renderArenaBounds(ctx) {
      // Outer Void
      ctx.fillStyle = '#0B111D';
      // Left
      ctx.fillRect(-600, -600, 600, WORLD_H + 1200);
      // Right
      ctx.fillRect(WORLD_W, -600, 600, WORLD_H + 1200);
      // Top
      ctx.fillRect(-600, -600, WORLD_W + 1200, 600);
      // Bottom
      ctx.fillRect(-600, WORLD_H, WORLD_W + 1200, 600);

      // Glowing Arena Border
      ctx.save();
      ctx.strokeStyle = '#5B78AD';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#6EC6E6';
      ctx.shadowBlur = 8;
      ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

      // Corner Glowing Notches
      const s = 40;
      ctx.strokeStyle = '#6EC6E6';
      ctx.lineWidth = 3;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(s, 0); ctx.lineTo(0, 0); ctx.lineTo(0, s);
      // Top-Right
      ctx.moveTo(WORLD_W - s, 0); ctx.lineTo(WORLD_W, 0); ctx.lineTo(WORLD_W, s);
      // Bottom-Left
      ctx.moveTo(0, WORLD_H - s); ctx.lineTo(0, WORLD_H); ctx.lineTo(s, WORLD_H);
      // Bottom-Right
      ctx.moveTo(WORLD_W - s, WORLD_H); ctx.lineTo(WORLD_W, WORLD_H); ctx.lineTo(WORLD_W, WORLD_H - s);
      ctx.stroke();

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Player Rendering (Patch Pixel Hero)
    // -------------------------------------------------------------
    _renderPlayer(ctx) {
      const p = this.player;

      // If dead, skip rendering body
      if (this.gameOver && p.hp <= 0) return;

      ctx.save();
      ctx.translate(Math.floor(p.x), Math.floor(p.y));

      // Flip sprite based on horizontal facing direction
      ctx.scale(p.facing, 1);

      // Walking vertical bobbing animation
      const bobY = p.isMoving ? Math.sin(p.walkTimer) * 2 : 0;
      const legStride = p.isMoving ? Math.cos(p.walkTimer) * 3 : 0;

      // Invulnerability blink
      if (p.invulnerableTimer > 0 && Math.floor(this.gameTime * 20) % 2 === 0) {
        ctx.globalAlpha = 0.45;
      }

      // Damage Flash silhouette
      if (p.flashTimer > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, -6 + bobY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        this._renderPlayerHPBar(ctx, p);
        return;
      }

      // 1. Shadow underneath
      ctx.fillStyle = 'rgba(10, 16, 30, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 12, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Legs / Shoes (#162035)
      ctx.fillStyle = '#162035';
      ctx.fillRect(-6 + legStride, 8 + bobY, 4, 6);
      ctx.fillRect(2 - legStride, 8 + bobY, 4, 6);

      // 3. Body: Navy Suit (#25365C)
      ctx.fillStyle = '#25365C';
      ctx.fillRect(-7, -2 + bobY, 14, 11);

      // White Shirt Collar & Gold Pin (#F8FAFC, #F4C552)
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(-3, -2 + bobY, 6, 4);
      ctx.fillStyle = '#F4C552';
      ctx.fillRect(-1, 0 + bobY, 2, 2);

      // 4. White Gloves (#F8FAFC)
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(-9, 2 + bobY - legStride * 0.5, 3, 3);
      ctx.fillRect(6, 2 + bobY + legStride * 0.5, 3, 3);

      // 5. Head / Skin (#FCD3A1)
      ctx.fillStyle = '#FCD3A1';
      ctx.fillRect(-7, -15 + bobY, 14, 13);

      // 6. Sky-Blue Eyes (#6EC6E6)
      ctx.fillStyle = '#18243E';
      ctx.fillRect(1, -11 + bobY, 3, 4);
      ctx.fillStyle = '#6EC6E6';
      ctx.fillRect(2, -11 + bobY, 2, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(2, -11 + bobY, 1, 1);

      // 7. Spiky Rose-Red Hair (#F2546D)
      ctx.fillStyle = '#F2546D';
      // Main crown & side burns
      ctx.fillRect(-8, -17 + bobY, 16, 5);
      ctx.fillRect(-8, -14 + bobY, 4, 8);
      // Rose-Red Bangs
      ctx.fillRect(-4, -14 + bobY, 5, 3);
      // Spikes on top
      ctx.fillRect(-6, -21 + bobY, 3, 4);
      ctx.fillRect(-1, -22 + bobY, 4, 5);
      ctx.fillRect(4, -20 + bobY, 3, 4);

      ctx.restore();

      // Render Compact HP Bar in world space right below character
      this._renderPlayerHPBar(ctx, p);
    }

    _renderPlayerHPBar(ctx, p) {
      const barW = 38;
      const barH = 5;
      const barX = Math.floor(p.x - barW / 2);
      const barY = Math.floor(p.y + 18);

      // Background
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(barX, barY, barW, barH);

      // Inner HP Fill
      const ratio = clamp(p.hp / p.maxHp, 0, 1);
      const fillW = Math.floor(barW * ratio);

      let hpColor = '#7BE092'; // Mint green
      if (ratio < 0.25) hpColor = '#F2546D'; // Rose red
      else if (ratio < 0.5) hpColor = '#F4C552'; // Gold yellow

      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, fillW, barH);

      // Border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // Current/Max HP numeric label
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillStyle = '#E2E8F0';
      ctx.textAlign = 'center';
      ctx.fillText(`HP ${Math.ceil(p.hp)}/${p.maxHp}`, Math.floor(p.x), barY + 12);
    }

    // -------------------------------------------------------------
    // Grimoires & Garlic Aura Rendering
    // -------------------------------------------------------------
    _renderGrimoires(ctx) {
      const w = this.weapons.bible;
      if (w.level <= 0) return;

      const p = this.player;
      const count = w.counts[Math.min(w.level - 1, 4)];
      const radius = w.radius + (w.level - 1) * 4;

      for (let i = 0; i < count; i++) {
        const angle = w.angle + (i * Math.PI * 2) / count;
        const bx = p.x + Math.cos(angle) * radius;
        const by = p.y + Math.sin(angle) * radius;

        ctx.save();
        ctx.translate(Math.floor(bx), Math.floor(by));
        ctx.rotate(angle + Math.PI / 2);

        // Golden glow
        ctx.shadowColor = '#F4C552';
        ctx.shadowBlur = 6;

        // Grimoire Book Cover (#F4C552)
        ctx.fillStyle = '#F4C552';
        ctx.fillRect(-8, -10, 16, 20);

        // Binding spine
        ctx.fillStyle = '#D97706';
        ctx.fillRect(-8, -10, 3, 20);

        // Pages (#F8FAFC)
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(-4, -8, 10, 16);

        // Mystical rune mark (#6EC6E6)
        ctx.fillStyle = '#6EC6E6';
        ctx.fillRect(-1, -2, 4, 4);

        ctx.restore();
      }
    }

    _renderGarlicAura(ctx) {
      const w = this.weapons.garlic;

      // Render expanding aura waves
      for (let i = 0; i < this.auraWaves.length; i++) {
        const wave = this.auraWaves[i];
        ctx.save();
        ctx.strokeStyle = hexToRgba('#7BE092', wave.alpha);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (w.level <= 0) return;

      const p = this.player;
      const radius = 68 + w.level * 14;
      const pulse = Math.sin(w.pulseTimer) * 3;

      ctx.save();
      // Translucent inner forcefield fill
      ctx.fillStyle = 'rgba(123, 224, 146, 0.08)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + pulse, 0, Math.PI * 2);
      ctx.fill();

      // Outer dashed/pulsing boundary
      ctx.strokeStyle = 'rgba(123, 224, 146, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Enemies Rendering
    // -------------------------------------------------------------
    _renderEnemies(ctx) {
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];

        // Skip enemies far outside camera viewport
        if (
          e.x < this.camX - 60 ||
          e.x > this.camX + this.width + 60 ||
          e.y < this.camY - 60 ||
          e.y > this.camY + this.height + 60
        ) {
          continue;
        }

        ctx.save();
        ctx.translate(Math.floor(e.x), Math.floor(e.y));

        // Damage flash
        if (e.flashTimer > 0) {
          e.flashTimer -= 0.016;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
          ctx.fill();

          if (e.type === 'boss') {
            this._renderEliteBossHpBar(ctx, e);
          } else {
            this._renderEnemyHpBar(ctx, e);
          }

          ctx.restore();
          continue;
        }

        switch (e.type) {
          case 'bat':
            this._renderBat(ctx, e);
            break;
          case 'slime':
            this._renderSlime(ctx, e);
            break;
          case 'skeleton':
            this._renderSkeleton(ctx, e);
            break;
          case 'boss':
            this._renderEliteBoss(ctx, e);
            break;
        }

        if (e.type !== 'boss') {
          this._renderEnemyHpBar(ctx, e);
        }

        ctx.restore();
      }
    }

    _renderBat(ctx, e) {
      const wingY = Math.sin(e.animTimer * 16) * 5;

      // Shadow
      ctx.fillStyle = 'rgba(10, 16, 30, 0.4)';
      ctx.fillRect(-6, 9, 12, 3);

      // Wings (#B388EB Lavender)
      ctx.fillStyle = '#B388EB';
      // Left wing
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(-12, -4 + wingY);
      ctx.lineTo(-6, 4 + wingY);
      ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(12, -4 + wingY);
      ctx.lineTo(6, 4 + wingY);
      ctx.fill();

      // Body & Ears
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillRect(-4, -7, 2, 3);
      ctx.fillRect(2, -7, 2, 3);

      // Glowing Eyes (#F2546D)
      ctx.fillStyle = '#F2546D';
      ctx.fillRect(-3, -2, 2, 2);
      ctx.fillRect(1, -2, 2, 2);
    }

    _renderSlime(ctx, e) {
      const squishX = 1 + Math.sin(e.animTimer * 9) * 0.14;
      const squishY = 1 - Math.sin(e.animTimer * 9) * 0.14;

      ctx.scale(squishX, squishY);

      // Shadow
      ctx.fillStyle = 'rgba(10, 16, 30, 0.4)';
      ctx.fillRect(-9, 8, 18, 4);

      // Slime Body (#7BE092 Mint)
      ctx.fillStyle = '#7BE092';
      ctx.fillRect(-10, -6, 20, 14);
      ctx.fillRect(-7, -10, 14, 4);

      // Highlight
      ctx.fillStyle = '#A7F3D0';
      ctx.fillRect(-6, -8, 3, 3);

      // Cute Big Eyes
      ctx.fillStyle = '#18243E';
      ctx.fillRect(-5, -3, 3, 4);
      ctx.fillRect(2, -3, 3, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-4, -3, 1, 1);
      ctx.fillRect(3, -3, 1, 1);
    }

    _renderSkeleton(ctx, e) {
      const bob = Math.sin(e.animTimer * 10) * 1.5;

      // Shadow
      ctx.fillStyle = 'rgba(10, 16, 30, 0.4)';
      ctx.fillRect(-8, 11, 16, 3);

      // Bone Body (#E2E8F0)
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(-5, 0 + bob, 10, 10);
      // Legs
      ctx.fillRect(-4, 9 + bob, 2, 5);
      ctx.fillRect(2, 9 + bob, 2, 5);

      // Skull
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-7, -12 + bob, 14, 11);

      // Red Eye sockets (#F2546D)
      ctx.fillStyle = '#18243E';
      ctx.fillRect(-5, -8 + bob, 3, 3);
      ctx.fillRect(2, -8 + bob, 3, 3);
      ctx.fillStyle = '#F2546D';
      ctx.fillRect(-4, -7 + bob, 1, 1);
      ctx.fillRect(3, -7 + bob, 1, 1);

      // Small Iron Shield
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-11, -3 + bob, 4, 8);
    }

    _renderEliteBoss(ctx, e) {
      const pulse = Math.sin(this.gameTime * 6) * 2;

      // Glowing aura
      ctx.fillStyle = 'rgba(242, 84, 109, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 6 + pulse, 0, Math.PI * 2);
      ctx.fill();

      // Shadow
      ctx.fillStyle = 'rgba(10, 16, 30, 0.6)';
      ctx.fillRect(-18, 20, 36, 6);

      // Large Demon Body (#F2546D Rose-Red)
      ctx.fillStyle = '#C4324B';
      ctx.fillRect(-16, -10, 32, 28);
      ctx.fillStyle = '#F2546D';
      ctx.fillRect(-14, -8, 28, 24);

      // Horns (#E2E8F0)
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-15, -24, 4, 14);
      ctx.fillRect(11, -24, 4, 14);

      // Royal Gold Crown (#F4C552)
      ctx.fillStyle = '#F4C552';
      ctx.fillRect(-10, -20, 20, 6);
      ctx.fillRect(-10, -24, 4, 4);
      ctx.fillRect(-2, -26, 4, 6);
      ctx.fillRect(6, -24, 4, 4);

      // Glowing Golden Eyes
      ctx.fillStyle = '#F4C552';
      ctx.fillRect(-8, -2, 5, 4);
      ctx.fillRect(3, -2, 5, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-6, -1, 2, 2);
      ctx.fillRect(5, -1, 2, 2);

      // Overhead Boss HP Bar
      this._renderEliteBossHpBar(ctx, e);
    }

    _renderEliteBossHpBar(ctx, e) {
      const bw = 50;
      const bh = 5;
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-bw / 2, -32, bw, bh);
      ctx.fillStyle = '#F2546D';
      ctx.fillRect(-bw / 2, -32, bw * ratio, bh);
      ctx.strokeStyle = '#F4C552';
      ctx.lineWidth = 1;
      ctx.strokeRect(-bw / 2, -32, bw, bh);
    }

    _renderEnemyHpBar(ctx, e) {
      let bw = 24;
      let by = -16;
      if (e.type === 'bat') {
        bw = 22;
        by = -14;
      } else if (e.type === 'slime') {
        bw = 26;
        by = -16;
      } else if (e.type === 'skeleton') {
        bw = 28;
        by = -19;
      }

      const bh = 4;
      const ratio = clamp(e.hp / e.maxHp, 0, 1);

      // Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(-bw / 2, by, bw, bh);

      // Fill color based on ratio
      let fillColor = '#7BE092';
      if (ratio > 0.5) {
        fillColor = '#7BE092';
      } else if (ratio > 0.25) {
        fillColor = '#F4C552';
      } else {
        fillColor = '#F2546D';
      }

      // Draw fill
      ctx.fillStyle = fillColor;
      ctx.fillRect(-bw / 2, by, Math.max(1, Math.floor(bw * ratio)), bh);

      // Border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(-bw / 2, by, bw, bh);
    }

    // -------------------------------------------------------------
    // Projectiles & Lightning Rendering
    // -------------------------------------------------------------
    _renderProjectiles(ctx) {
      for (let i = 0; i < this.projectiles.length; i++) {
        const pr = this.projectiles[i];

        ctx.save();
        ctx.translate(Math.floor(pr.x), Math.floor(pr.y));
        ctx.rotate(pr.angle);

        // Sky-Blue Magic Dagger (#6EC6E6)
        ctx.fillStyle = '#6EC6E6';
        ctx.shadowColor = '#6EC6E6';
        ctx.shadowBlur = 5;

        // Dagger blade polygon
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();

        // Tip shine
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(6, -1, 4, 2);

        ctx.restore();
      }
    }

    _renderLightning(ctx) {
      for (let i = 0; i < this.lightningVisuals.length; i++) {
        const l = this.lightningVisuals[i];

        ctx.save();
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = l.color;
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(l.segments[0].x, l.segments[0].y);
        for (let j = 1; j < l.segments.length; j++) {
          ctx.lineTo(l.segments[j].x, l.segments[j].y);
        }
        ctx.stroke();

        // Impact shockwave ring
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(l.targetX, l.targetY, (1 - l.life / 0.22) * 45, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }

    // -------------------------------------------------------------
    // Gems & Pickups Rendering
    // -------------------------------------------------------------
    _renderGems(ctx) {
      for (let i = 0; i < this.gems.length; i++) {
        const gem = this.gems[i];

        // Skip off-screen gems
        if (
          gem.x < this.camX - 30 ||
          gem.x > this.camX + this.width + 30 ||
          gem.y < this.camY - 30 ||
          gem.y > this.camY + this.height + 30
        ) {
          continue;
        }

        const bob = Math.sin(gem.sparkleTimer * 6) * 2;

        ctx.save();
        ctx.translate(Math.floor(gem.x), Math.floor(gem.y + bob));

        if (gem.type === 'heart') {
          // Pink Heart (#F2546D)
          ctx.fillStyle = '#F2546D';
          ctx.shadowColor = '#F2546D';
          ctx.shadowBlur = 5;

          ctx.beginPath();
          ctx.moveTo(0, 4);
          ctx.lineTo(-6, -3);
          ctx.arc(-3, -5, 3, Math.PI, 0);
          ctx.arc(3, -5, 3, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          // Diamond EXP Gem
          ctx.fillStyle = gem.color;
          ctx.shadowColor = gem.color;
          ctx.shadowBlur = 4;

          const r = gem.radius;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r, 0);
          ctx.lineTo(0, r);
          ctx.lineTo(-r, 0);
          ctx.closePath();
          ctx.fill();

          // Highlight dot
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-1, -2, 2, 2);
        }

        ctx.restore();
      }
    }

    // -------------------------------------------------------------
    // Particles & Floating Numbers Rendering
    // -------------------------------------------------------------
    _renderParticles(ctx) {
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillRect(Math.floor(pt.x), Math.floor(pt.y), pt.size, pt.size);
      }
      ctx.globalAlpha = 1.0;
    }

    _renderFloatingTexts(ctx) {
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';

      for (let i = 0; i < this.floatingTexts.length; i++) {
        const ft = this.floatingTexts[i];
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.fillStyle = ft.color;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 3;
        ctx.fillText(ft.text, Math.floor(ft.x), Math.floor(ft.y));
        ctx.restore();
      }
    }

    // -------------------------------------------------------------
    // Screen Space HUD
    // -------------------------------------------------------------
    _renderHUD(ctx) {
      // 1. Top Full-Width EXP Bar
      const expBarH = 14;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, this.width, expBarH);

      const expRatio = clamp(this.exp / this.nextExp, 0, 1);
      const fillW = Math.floor(this.width * expRatio);

      // Mint to Sky-Blue Gradient Fill
      const grad = ctx.createLinearGradient(0, 0, this.width, 0);
      grad.addColorStop(0, '#7BE092');
      grad.addColorStop(1, '#6EC6E6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, fillW, expBarH);

      // EXP Bar Border
      ctx.strokeStyle = '#25365C';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, this.width, expBarH);

      // EXP Text
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'center';
      ctx.fillText(`EXP ${this.exp} / ${this.nextExp}`, this.width / 2, 10);

      // 2. HUD Status Panel Bar (y: 18..58)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(10, 18, this.width - 20, 38);
      ctx.strokeStyle = '#25365C';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(10, 18, this.width - 20, 38);

      // Level Badge
      ctx.fillStyle = '#F4C552';
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`LV.${String(this.level).padStart(2, '0')}`, 24, 42);

      // Score
      ctx.fillStyle = '#6EC6E6';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`SCORE ${Math.floor(this.score).toLocaleString()}`, 115, 42);

      // Survival Time
      ctx.fillStyle = '#7BE092';
      ctx.textAlign = 'center';
      ctx.fillText(formatTime(this.timeSurvived), 350, 42);

      // Kills Count
      ctx.fillStyle = '#F2546D';
      ctx.textAlign = 'right';
      ctx.fillText(`☠ ${this.kills}`, this.width - 24, 42);

      // 3. Weapon Level Badges (y: 62..82)
      this._renderWeaponBadges(ctx);
    }

    _renderWeaponBadges(ctx) {
      const badges = [];
      if (this.weapons.dagger.level > 0) badges.push({ icon: '🗡️', name: 'DAGGER', lv: this.weapons.dagger.level, color: '#6EC6E6' });
      if (this.weapons.bible.level > 0) badges.push({ icon: '📖', name: 'BIBLE', lv: this.weapons.bible.level, color: '#F4C552' });
      if (this.weapons.garlic.level > 0) badges.push({ icon: '🧄', name: 'AURA', lv: this.weapons.garlic.level, color: '#7BE092' });
      if (this.weapons.lightning.level > 0) badges.push({ icon: '⚡', name: 'BOLT', lv: this.weapons.lightning.level, color: '#F2546D' });
      if (this.bootsLevel > 0) badges.push({ icon: '🧲', name: 'BOOTS', lv: this.bootsLevel, color: '#B388EB' });
      if (this.powerLevel > 0) badges.push({ icon: '💥', name: 'POWER', lv: this.powerLevel, color: '#F4C552' });
      if (this.healLevel > 0) badges.push({ icon: '❤️', name: 'VITAL', lv: this.healLevel, color: '#F2546D' });

      ctx.font = '7px "Press Start 2P", monospace';
      let startX = 12;

      for (let i = 0; i < badges.length; i++) {
        const b = badges[i];
        const w = 68;
        const h = 20;

        ctx.fillStyle = 'rgba(24, 36, 62, 0.9)';
        ctx.fillRect(startX, 62, w, h);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(startX, 62, w, h);

        ctx.fillStyle = b.color;
        ctx.textAlign = 'left';
        ctx.fillText(`${b.icon} L.${b.lv}`, startX + 5, 75);

        startX += w + 6;
      }
    }

    // -------------------------------------------------------------
    // Boss Warning Banner Overlay
    // -------------------------------------------------------------
    _renderBossWarning(ctx) {
      const bannerH = 46;
      const bannerY = 110;

      ctx.save();
      // Pulsing red background
      const pulse = Math.abs(Math.sin(this.gameTime * 8));
      ctx.fillStyle = `rgba(242, 84, 109, ${0.45 + pulse * 0.4})`;
      ctx.fillRect(0, bannerY, this.width, bannerH);

      ctx.strokeStyle = '#F4C552';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, bannerY, this.width, bannerH);

      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#F2546D';
      ctx.shadowBlur = 6;
      ctx.fillText(`⚠ LV.${this.level} BOSS: ELITE DEMON APPROACHING! ⚠`, this.width / 2, bannerY + 28);

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Level-Up 3-Card Roguelite Modal
    // -------------------------------------------------------------
    _renderUpgradeModal(ctx) {
      // 1. Dark Backdrop
      ctx.fillStyle = 'rgba(10, 16, 30, 0.88)';
      ctx.fillRect(0, 0, this.width, this.height);

      // 2. Banner Header
      ctx.save();
      ctx.shadowColor = '#F4C552';
      ctx.shadowBlur = 8;
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.fillStyle = '#F4C552';
      ctx.textAlign = 'center';
      ctx.fillText('★ LEVEL UP! ★', this.width / 2, 130);

      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#6EC6E6';
      ctx.fillText(`CHOOSE AN UPGRADE (LV.${this.level})`, this.width / 2, 165);
      ctx.restore();

      // 3. Render 3 Upgrade Cards
      const cardX = 55;
      const cardW = 490;
      const cardH = 118;
      const startY = 220;
      const gap = 20;

      for (let i = 0; i < this.upgradeCards.length; i++) {
        const card = this.upgradeCards[i];
        const y = startY + i * (cardH + gap);
        const isSelected = i === this.selectedCardIndex;

        // Card Box Background
        ctx.save();
        ctx.fillStyle = isSelected ? '#1E2D4D' : '#141E34';
        ctx.fillRect(cardX, y, cardW, cardH);

        // Border & Glow
        if (isSelected) {
          ctx.strokeStyle = card.color;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = card.color;
          ctx.shadowBlur = 10;
        } else {
          ctx.strokeStyle = '#25365C';
          ctx.lineWidth = 1.5;
        }
        ctx.strokeRect(cardX, y, cardW, cardH);
        ctx.restore();

        // Key Badge [1], [2], [3]
        ctx.fillStyle = isSelected ? card.color : '#64748B';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`[${i + 1}]`, cardX + cardW - 14, y + 26);

        // Large Icon
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(card.icon, cardX + 16, y + 54);

        // Korean Weapon Title
        ctx.font = '13px "Press Start 2P", monospace';
        ctx.fillStyle = isSelected ? '#FFFFFF' : '#E2E8F0';
        ctx.textAlign = 'left';
        ctx.fillText(card.title, cardX + 68, y + 36);

        // Level Transition Badge
        const currLv = this._getCurrentLevel(card.id);
        const lvText = currLv === 0 ? 'NEW!' : `LV.${currLv} ➔ LV.${currLv + 1}`;
        ctx.fillStyle = card.color;
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText(`[${lvText}]`, cardX + 68, y + 58);

        // Perk Description
        ctx.fillStyle = isSelected ? '#F8FAFC' : '#94A3B8';
        ctx.font = '9px sans-serif';
        const perkText = card.getPerk(currLv);
        ctx.fillText(perkText, cardX + 68, y + 84);

        // Selection Cursor Arrow
        if (isSelected) {
          ctx.fillStyle = card.color;
          ctx.font = '14px "Press Start 2P", monospace';
          ctx.textAlign = 'right';
          ctx.fillText('►', cardX - 10, y + cardH / 2 + 5);
        }
      }

      // 4. Footer Instructions
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = '#6EC6E6';
      ctx.textAlign = 'center';
      ctx.fillText('[↑ / ↓ / 1-3]: 선택    [ENTER / SPACE]: 결정', this.width / 2, 675);
    }

    _getCurrentLevel(id) {
      if (id === 'dagger') return this.weapons.dagger.level;
      if (id === 'bible') return this.weapons.bible.level;
      if (id === 'garlic') return this.weapons.garlic.level;
      if (id === 'lightning') return this.weapons.lightning.level;
      if (id === 'boots') return this.bootsLevel;
      if (id === 'heal') return this.healLevel;
      if (id === 'power') return this.powerLevel;
      return 0;
    }

    // -------------------------------------------------------------
    // Game Over Overlay
    // -------------------------------------------------------------
    _renderGameOver(ctx) {
      const cx = this.width / 2;
      const cy = this.height / 2;

      ctx.save();

      // Red tinted translucent backdrop
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(0, 0, this.width, this.height);

      // Center Game Over Dialog Box
      const boxW = 460;
      const boxH = 340;
      const boxX = cx - boxW / 2;
      const boxY = cy - boxH / 2;

      ctx.fillStyle = '#18243E';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      ctx.strokeStyle = '#F2546D';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#F2546D';
      ctx.shadowBlur = 10;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Title Banner
      ctx.font = '18px "Press Start 2P", monospace';
      ctx.fillStyle = '#F2546D';
      ctx.textAlign = 'center';
      ctx.fillText('SURVIVAL TERMINATED', cx, boxY + 45);

      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = '#6EC6E6';
      ctx.fillText('HERO HAS FALLEN', cx, boxY + 75);

      // Horizontal Divider
      ctx.strokeStyle = '#25365C';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX + 30, boxY + 95);
      ctx.lineTo(boxX + boxW - 30, boxY + 95);
      ctx.stroke();

      // Stats Summary
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'left';

      const statY = boxY + 130;
      const gapY = 32;

      // Final Score
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('FINAL SCORE:', boxX + 45, statY);
      ctx.fillStyle = '#F4C552';
      ctx.textAlign = 'right';
      ctx.fillText(Math.floor(this.score).toLocaleString(), boxX + boxW - 45, statY);

      // Survival Time
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText('TIME SURVIVED:', boxX + 45, statY + gapY);
      ctx.fillStyle = '#7BE092';
      ctx.textAlign = 'right';
      ctx.fillText(formatTime(this.timeSurvived), boxX + boxW - 45, statY + gapY);

      // Level Reached
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText('LEVEL REACHED:', boxX + 45, statY + gapY * 2);
      ctx.fillStyle = '#6EC6E6';
      ctx.textAlign = 'right';
      ctx.fillText(`LV.${this.level}`, boxX + boxW - 45, statY + gapY * 2);

      // Enemies Defeated
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText('ENEMIES SLAIN:', boxX + 45, statY + gapY * 3);
      ctx.fillStyle = '#F2546D';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.kills} KILLS`, boxX + boxW - 45, statY + gapY * 3);

      // Prompt
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#CBD5E1';
      ctx.textAlign = 'center';
      ctx.fillText('SAVING RECORD TO HALL OF FAME...', cx, boxY + boxH - 24);

      ctx.restore();
    }
  }

  // Export to global window object
  if (typeof window !== 'undefined') {
    window.PixelSurvivor = PixelSurvivor;
  }

  // Export for module systems if present
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixelSurvivor;
  }
})();
