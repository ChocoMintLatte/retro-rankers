/**
 * MathRunner - Fake Ad Math Gate Shooter Runner
 * Recreates the viral "Number Multiplier Gate Shooter" meme in a vibrant Cyberpunk aesthetic.
 * 
 * Features:
 * - 3D-perspective scrolling cyber-highway grid (x: 50..550, y: 0..750)
 * - Real-time squad scaling (up to 25 mini cyber-drones clustered around player)
 * - Scaled auto-fire streams (1 up to 9 fan streams based on firepower)
 * - Dual Math Gates (+, -, ×, ÷) with glowing holographic barriers & sound triggers
 * - Enemy blocks & Boss waves with visible HP numbers, health bars, and destruction bonuses
 * - Danger Defense Line at y = 650 with warning alerts
 */

(function () {
  'use strict';

  // Math helper
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const lerp = (a, b, t) => a + (b - a) * t;

  class MathRunner {
    constructor(canvas, callbacks = {}) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.callbacks = callbacks;

      // Canvas dimensions
      this.width = canvas ? canvas.width : 600;
      this.height = canvas ? canvas.height : 750;

      // Highway Lane Boundaries
      this.roadLeft = 50;
      this.roadRight = 550;
      this.roadWidth = 500;
      this.defenseLineY = 650;
      this.playerY = 665;

      // Input tracking
      this.keys = {
        left: false,
        right: false
      };

      // Sound throttling helper to prevent audio clipping
      this.lastShootSoundTime = 0;

      // Mouse/touch dragging support
      this.isPointerDown = false;
      this.pointerTargetX = null;
      this._bindEvents();

      // Initialize state
      this.reset();
    }

    // -------------------------------------------------------------
    // Input Handling
    // -------------------------------------------------------------
    _bindEvents() {
      if (!this.canvas) return;

      const getCanvasX = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const scaleX = this.canvas.width / rect.width;
        return (clientX - rect.left) * scaleX;
      };

      this.canvas.addEventListener('mousedown', (e) => {
        this.isPointerDown = true;
        this.pointerTargetX = getCanvasX(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isPointerDown) {
          this.pointerTargetX = getCanvasX(e);
        }
      });

      window.addEventListener('mouseup', () => {
        this.isPointerDown = false;
        this.pointerTargetX = null;
      });

      this.canvas.addEventListener('touchstart', (e) => {
        this.isPointerDown = true;
        this.pointerTargetX = getCanvasX(e);
      }, { passive: true });

      this.canvas.addEventListener('touchmove', (e) => {
        if (this.isPointerDown) {
          this.pointerTargetX = getCanvasX(e);
        }
      }, { passive: true });

      this.canvas.addEventListener('touchend', () => {
        this.isPointerDown = false;
        this.pointerTargetX = null;
      });
    }

    handleKeyDown(e) {
      const code = e.code;
      const key = e.key;

      if (code === 'ArrowLeft' || code === 'KeyA' || key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.keys.left = true;
      }
      if (code === 'ArrowRight' || code === 'KeyD' || key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.keys.right = true;
      }
    }

    handleKeyUp(e) {
      const code = e.code;
      const key = e.key;

      if (code === 'ArrowLeft' || code === 'KeyA' || key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.keys.left = false;
      }
      if (code === 'ArrowRight' || code === 'KeyD' || key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.keys.right = false;
      }
    }

    // -------------------------------------------------------------
    // Audio Safe Wrapper
    // -------------------------------------------------------------
    playSound(name) {
      try {
        const snd = this.callbacks?.sound;
        if (snd && typeof snd[name] === 'function') {
          snd[name]();
        }
      } catch (err) {
        // Ignore audio playback exceptions safely
      }
    }

    // -------------------------------------------------------------
    // Lifecycle Methods
    // -------------------------------------------------------------
    start() {
      this.reset();
      this.isRunning = true;
      this.isGameOver = false;

      // Initial score callback notification
      this.callbacks.onScoreChange?.(Math.floor(this.score));

      // Spawn initial wave
      this.spawnWave(this.wave);
    }

    stop() {
      this.isRunning = false;
    }

    reset() {
      this.isRunning = false;
      this.isGameOver = false;
      this.score = 0;
      this.power = 10;
      this.maxPower = 10;
      this.wave = 1;
      this.kills = 0;
      this.gatesPassed = 0;

      // Player Position & Movement
      this.x = 300;
      this.vx = 0;
      this.playerSpeed = 440; // px/sec

      // Auto-fire timing
      this.fireTimer = 0;

      // Animation & Visual Timers
      this.gameTime = 0;
      this.gridOffset = 0;
      this.badgeScale = 1.0;
      this.screenShake = 0;
      this.screenShakeX = 0;
      this.screenShakeY = 0;
      this.warningPulse = 0;

      // Entities
      this.bullets = [];
      this.gatePairs = [];
      this.enemies = [];
      this.particles = [];
      this.floatingTexts = [];

      // Wave state
      this.waveState = 'ACTIVE'; // 'ACTIVE' | 'CLEARED'
      this.waveTransitionTimer = 0;
      this.highwaySpeed = 120; // base descending speed

      // Game Log summary
      this.gameLog = {
        gameId: 'mathRunner',
        score: 0,
        wave: 1,
        maxPower: 10,
        finalPower: 10,
        kills: 0,
        gatesPassed: 0,
        reason: ''
      };
    }

    // -------------------------------------------------------------
    // Power & Stream Calculations
    // -------------------------------------------------------------
    getStreamCount() {
      if (this.power < 15) return 1;
      if (this.power < 35) return 2;
      if (this.power < 70) return 3;
      if (this.power < 120) return 4;
      if (this.power < 190) return 5;
      if (this.power < 280) return 6;
      if (this.power < 400) return 7;
      if (this.power < 550) return 8;
      return 9;
    }

    getFireInterval() {
      // Scales from 0.17s down to 0.075s at high power
      return Math.max(0.075, 0.175 - Math.min(this.power, 200) * 0.00045);
    }

    getBulletDamage() {
      // Scales with power so dense enemy blocks are conquerable at high power
      return Math.max(1, Math.floor(1 + Math.sqrt(this.power) * 0.75));
    }

    getVisualSquadCount() {
      // Squad visually scales up to 25 units neatly clustered
      return Math.min(25, Math.max(1, Math.round(Math.pow(this.power, 0.68))));
    }

    // -------------------------------------------------------------
    // Wave Generation
    // -------------------------------------------------------------
    spawnWave(waveNum) {
      this.waveState = 'ACTIVE';

      // 1. Gentler Highway Speed Scaling
      this.highwaySpeed = 120 + Math.min(waveNum * 12, 130) + Math.min(Math.floor(this.power / 150) * 6, 35);

      const isBossWave = (waveNum % 3 === 0);

      // 2. Generate Primary Gate Pair at y = -70 (1 primary pair per wave, no blocking second gate)
      const primaryGate = this.createGatePair(waveNum, -70);
      this.gatePairs.push(primaryGate);

      // 3. Fairer Enemy & Boss HP Scaling
      // Because multi-stream fan shots spread out horizontally, calculate single-column effective DPS
      const streamCount = this.getStreamCount();
      const bulletDmg = this.getBulletDamage();
      const fireInterval = this.getFireInterval();
      const playerDps = (streamCount * bulletDmg) / fireInterval;
      const singleColStreams = Math.min(streamCount, 2.5 + streamCount * 0.25);
      const singleColDps = (singleColStreams * bulletDmg) / fireInterval;

      if (isBossWave) {
        // Boss Wave: A massive dreadnought spanning the highway
        const bossScreenTime = 620 / this.highwaySpeed;
        const bossFocusTime = bossScreenTime * (0.52 + Math.min(waveNum * 0.015, 0.16));
        const bossHp = Math.max(120 + waveNum * 65, Math.round(playerDps * 0.75 * bossFocusTime));

        this.enemies.push({
          x: 110,
          y: -460,
          width: 380,
          height: 90,
          hp: bossHp,
          maxHp: bossHp,
          initialHp: bossHp,
          isBoss: true,
          bossName: `★ SECTOR DREADNOUGHT MK-${waveNum / 3} ★`,
          color: '#F2546D',
          flashTimer: 0,
          coreAngle: 0
        });
      } else {
        // Normal Wave Blocks: max 3 rows, no 4-row walls
        const rows = waveNum >= 4 ? 3 : 2;
        const colWidth = 112;
        const gap = 12;
        const startX = 58;
        let lastWeakCol = -1;

        for (let r = 0; r < rows; r++) {
          const rowY = -440 - r * 185;

          // Distinct weak column position per row so the player must weave left/right
          let weakCol;
          do {
            weakCol = Math.floor(Math.random() * 4);
          } while (weakCol === lastWeakCol);
          lastWeakCol = weakCol;

          // Weak column breakthrough HP (~0.42s to 0.62s of single-column fire)
          const weakFocusTime = 0.42 + Math.random() * 0.20;
          const rowWeakHp = Math.max(8 + waveNum * 5, Math.round(singleColDps * weakFocusTime));

          for (let c = 0; c < 4; c++) {
            const isWeak = (c === weakCol);
            let blockHp;
            let color;

            if (isWeak) {
              blockHp = rowWeakHp;
              // Clean pastel tier 1 or 2 (Sky-Blue or Pastel Mint)
              color = rowWeakHp < 60 ? '#6EC6E6' : '#7BE092';
            } else {
              // Armored columns have 1.6x to 2.4x higher HP
              const armorMultiplier = 1.6 + Math.random() * 0.8;
              blockHp = Math.round(rowWeakHp * armorMultiplier);
              // Clean pastel tier 3 or 4 (Mustard-Gold or Patch Rose Red)
              color = armorMultiplier > 2.0 ? '#F2546D' : '#F4C552';
            }

            this.enemies.push({
              x: startX + c * (colWidth + gap),
              y: rowY,
              width: colWidth,
              height: 60,
              hp: blockHp,
              maxHp: blockHp,
              initialHp: blockHp,
              isBoss: false,
              color: color,
              flashTimer: 0
            });
          }
        }
      }
    }

    createGatePair(waveNum, yPos) {
      const p = Math.max(1, this.power);
      const isHighPowerOrWave = (p >= 100 || waveNum >= 5);

      // Helper: Generate positive math op (+ or ×) with anti-snowball constraints
      const getPositiveOp = () => {
        if (isHighPowerOrWave) {
          // Allow ×2 positive multiplier 20% of the time, and additive boosts from [15, 20, 25, 30, 40, 50]
          const allowMult = Math.random() < 0.20;
          if (allowMult) {
            return { type: '×', value: 2, isMult: true };
          }
          const addChoices = [15, 20, 25, 30, 40, 50];
          return { type: '+', value: addChoices[Math.floor(Math.random() * addChoices.length)], isMult: false };
        } else {
          // Early waves: normal multiplier chance (35%)
          const allowMult = Math.random() < 0.35;
          if (allowMult) {
            const multVal = Math.random() < 0.25 ? 3 : 2;
            return { type: '×', value: multVal, isMult: true };
          }
          const addChoices = [10, 15, 20, 25, 30, 35, 50];
          return { type: '+', value: addChoices[Math.floor(Math.random() * addChoices.length)], isMult: false };
        }
      };

      // Helper: Generate negative math op (- or ÷) scaled proportionally to power & wave
      const getNegativeOp = (forceDiv = false, forceSub = false) => {
        let isDiv = forceDiv;
        if (!forceDiv && !forceSub) {
          const divChance = waveNum >= 4 ? 0.45 : 0.35;
          isDiv = Math.random() < divChance;
        }

        if (isDiv) {
          // Division gates: use ÷2 (or rare ÷3 on wave 6+), remove ÷4
          const divVal = (waveNum >= 6 && Math.random() < 0.25) ? 3 : 2;
          return { type: '÷', value: divVal, isMult: true };
        } else {
          // Subtraction: scaled proportionally to player's power AND waveNum (22% to 45%)
          const subRatio = 0.22 + Math.min(0.23, waveNum * 0.02);
          let subVal = Math.max(10, Math.floor(p * subRatio));
          if (p <= 20 && waveNum <= 2) {
            subVal = Math.min(subVal, Math.max(5, p - 3));
          }
          return { type: '-', value: subVal, isMult: false };
        }
      };

      // Two-Red Gates chance: 10% on Wave 1-2, 18% on Wave 3, max 28% on Wave 4+
      let twoRedChance = 0.10;
      if (waveNum >= 4) {
        twoRedChance = Math.min(0.28, 0.20 + (waveNum - 4) * 0.02);
      } else if (waveNum === 3) {
        twoRedChance = 0.18;
      }

      // Two-Blue Gates chance: reduced when power is high or wave is advanced
      let twoBlueChance = 0.20;
      if (isHighPowerOrWave) {
        twoBlueChance = Math.max(0.06, 0.16 - (waveNum - 2) * 0.03);
      }

      let leftOp, rightOp;
      const roll = Math.random();

      if (roll < twoRedChance) {
        // Scenario 3: Two Reds (Survival Damage-Control Dilemma: -sub vs ÷div)
        const subOp = getNegativeOp(false, true);
        const divOp = getNegativeOp(true, false);

        // Ensure at least one choice leaves power > 0 if power was already low
        if (p - subOp.value <= 0 && Math.floor(p / divOp.value) <= 0) {
          if (p > 1) {
            subOp.value = Math.max(1, p - 1);
          }
        }

        leftOp = subOp;
        rightOp = divOp;
        if (Math.random() < 0.5) {
          leftOp = divOp;
          rightOp = subOp;
        }
      } else if (roll < twoRedChance + twoBlueChance) {
        // Scenario 2: Two Blues (Calculation dilemma)
        const addChoices = isHighPowerOrWave ? [15, 20, 25, 30, 40] : [15, 25, 30, 50];
        const addVal = addChoices[Math.floor(Math.random() * addChoices.length)];
        const multVal = (isHighPowerOrWave && p >= 120) ? 2 : (Math.random() < 0.25 ? 3 : 2);

        leftOp = { type: '+', value: addVal, isMult: false };
        rightOp = { type: '×', value: multVal, isMult: true };
        if (Math.random() < 0.5) {
          leftOp = rightOp;
          rightOp = { type: '+', value: addVal, isMult: false };
        }
      } else {
        // Scenario 1: One Blue, One Red
        const posOp = getPositiveOp();
        const negOp = getNegativeOp();

        const leftIsPositive = Math.random() < 0.5;
        leftOp = leftIsPositive ? posOp : negOp;
        rightOp = leftIsPositive ? negOp : posOp;
      }

      // Moving gates: starts on Wave 3 with gentler speed & sway amplitude
      const isMovable = waveNum >= 3 && Math.random() < Math.min(0.55, 0.20 + waveNum * 0.06);
      const oscSpeed = 1.8 + Math.min(waveNum * 0.15, 1.5);
      const swayAmp = Math.min(34, 14 + waveNum * 2.5);
      const swayPhase = Math.random() * Math.PI * 2;

      return {
        y: yPos,
        height: 56,
        triggered: false,
        active: true,
        isMovable: isMovable,
        oscSpeed: oscSpeed,
        swayAmp: swayAmp,
        swayPhase: swayPhase,
        baseLeftX: 55,
        baseRightX: 305,
        swayOffset: 0,
        left: {
          x: 55,
          width: 240,
          ...leftOp,
          isPositive: leftOp.type === '+' || leftOp.type === '×'
        },
        right: {
          x: 305,
          width: 240,
          ...rightOp,
          isPositive: rightOp.type === '+' || rightOp.type === '×'
        }
      };
    }

    // -------------------------------------------------------------
    // Gate Trigger Execution
    // -------------------------------------------------------------
    applyGate(gatePair, chosenSide) {
      if (gatePair.triggered) return;
      gatePair.triggered = true;

      const chosen = chosenSide === 'left' ? gatePair.left : gatePair.right;
      const oldPower = this.power;

      // Apply math operation
      if (chosen.type === '+') {
        this.power += chosen.value;
      } else if (chosen.type === '-') {
        this.power -= chosen.value;
      } else if (chosen.type === '×') {
        this.power *= chosen.value;
      } else if (chosen.type === '÷') {
        this.power = Math.floor(this.power / chosen.value);
      }

      this.gatesPassed++;
      this.badgeScale = 1.45; // Pulse the power badge

      if (this.power > this.maxPower) {
        this.maxPower = this.power;
      }

      // Visual floating text & sounds
      const powerDiff = this.power - oldPower;
      const isIncrease = powerDiff > 0;
      const textX = chosen.x + chosen.width / 2;
      const textY = gatePair.y + gatePair.height / 2;

      if (isIncrease) {
        const label = chosen.isMult ? `×${chosen.value} POWER CRIT!` : `+${powerDiff} FIREPOWER!`;
        this.addFloatingText(textX, textY, label, '#6EC6E6', 26);
        this.playSound('playPowerUp');
        this.createShockwave(textX, textY, '#6EC6E6');
      } else {
        const label = chosen.isMult ? `÷${chosen.value} POWER DRAIN!` : `${powerDiff} POWER LOST!`;
        this.addFloatingText(textX, textY, label, '#F2546D', 24);
        this.playSound('playHit');
        this.createShockwave(textX, textY, '#F2546D');
      }

      // Keep highway speed dynamically updated with power and wave
      this.highwaySpeed = 120 + Math.min(this.wave * 12, 130) + Math.min(Math.floor(this.power / 150) * 6, 35);

      // Check for Game Over on zero power
      if (this.power <= 0) {
        this.power = 0;
        this.triggerGameOver('POWER_DEPLETED');
      }
    }

    // -------------------------------------------------------------
    // Projectiles & Shooting
    // -------------------------------------------------------------
    shoot() {
      const streamCount = this.getStreamCount();
      const damage = this.getBulletDamage();
      const bulletSpeed = 820;

      // Define stream fan angles and offsets
      const streamConfigs = this.getStreamOffsets(streamCount);

      for (let i = 0; i < streamConfigs.length; i++) {
        const cfg = streamConfigs[i];
        const angle = cfg.angle;
        const vx = Math.sin(angle) * bulletSpeed;
        const vy = -Math.cos(angle) * bulletSpeed;

        this.bullets.push({
          x: this.x + cfg.dx,
          y: this.playerY - 20,
          vx: vx,
          vy: vy,
          damage: damage,
          radius: 4.5,
          color: this.power >= 100 ? '#B388EB' : (this.power >= 35 ? '#6EC6E6' : '#7BE092')
        });
      }

      // Subtle audio feedback throttled to 80ms
      const now = performance.now();
      if (now - this.lastShootSoundTime > 80) {
        this.lastShootSoundTime = now;
        this.playSound('playShoot');
      }
    }

    getStreamOffsets(count) {
      if (count === 1) {
        return [{ dx: 0, angle: 0 }];
      }
      if (count === 2) {
        return [
          { dx: -12, angle: -0.02 },
          { dx: 12, angle: 0.02 }
        ];
      }
      if (count === 3) {
        return [
          { dx: -18, angle: -0.08 },
          { dx: 0, angle: 0 },
          { dx: 18, angle: 0.08 }
        ];
      }
      if (count === 4) {
        return [
          { dx: -24, angle: -0.12 },
          { dx: -8, angle: -0.04 },
          { dx: 8, angle: 0.04 },
          { dx: 24, angle: 0.12 }
        ];
      }
      if (count === 5) {
        return [
          { dx: -30, angle: -0.16 },
          { dx: -15, angle: -0.08 },
          { dx: 0, angle: 0 },
          { dx: 15, angle: 0.08 },
          { dx: 30, angle: 0.16 }
        ];
      }
      if (count === 6) {
        return [
          { dx: -35, angle: -0.20 },
          { dx: -21, angle: -0.12 },
          { dx: -7, angle: -0.04 },
          { dx: 7, angle: 0.04 },
          { dx: 21, angle: 0.12 },
          { dx: 35, angle: 0.20 }
        ];
      }
      if (count === 7) {
        return [
          { dx: -42, angle: -0.22 },
          { dx: -28, angle: -0.14 },
          { dx: -14, angle: -0.07 },
          { dx: 0, angle: 0 },
          { dx: 14, angle: 0.07 },
          { dx: 28, angle: 0.14 },
          { dx: 42, angle: 0.22 }
        ];
      }
      if (count === 8) {
        return [
          { dx: -48, angle: -0.25 },
          { dx: -34, angle: -0.18 },
          { dx: -20, angle: -0.10 },
          { dx: -6, angle: -0.03 },
          { dx: 6, angle: 0.03 },
          { dx: 20, angle: 0.10 },
          { dx: 34, angle: 0.18 },
          { dx: 48, angle: 0.25 }
        ];
      }
      // 9 streams (ultimate spread)
      return [
        { dx: -54, angle: -0.28 },
        { dx: -40, angle: -0.21 },
        { dx: -27, angle: -0.14 },
        { dx: -13, angle: -0.07 },
        { dx: 0, angle: 0 },
        { dx: 13, angle: 0.07 },
        { dx: 27, angle: 0.14 },
        { dx: 40, angle: 0.21 },
        { dx: 54, angle: 0.28 }
      ];
    }

    // -------------------------------------------------------------
    // FX: Floating Text & Particles
    // -------------------------------------------------------------
    addFloatingText(x, y, text, color = '#6EC6E6', size = 20) {
      this.floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        size: size,
        life: 1.0,
        maxLife: 1.0,
        vy: -45
      });
    }

    createShockwave(x, y, color) {
      for (let i = 0; i < 16; i++) {
        const ang = (Math.PI * 2 / 16) * i;
        const spd = 80 + Math.random() * 120;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          color: color,
          size: 3 + Math.random() * 2,
          life: 0.5,
          maxLife: 0.5
        });
      }
    }

    createHitParticles(x, y, color) {
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 80;
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 30,
          color: color,
          size: 2 + Math.random() * 2,
          life: 0.3,
          maxLife: 0.3
        });
      }
    }

    createExplosion(x, y, color, isBoss = false) {
      const count = isBoss ? 45 : 18;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (isBoss ? 100 : 60) + Math.random() * (isBoss ? 260 : 160);
        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          color: Math.random() < 0.4 ? '#FFFFFF' : color,
          size: (isBoss ? 4 : 2.5) + Math.random() * 3,
          life: isBoss ? 0.9 : 0.55,
          maxLife: isBoss ? 0.9 : 0.55
        });
      }
      this.triggerShake(isBoss ? 10 : 4);
    }

    triggerShake(amount) {
      this.screenShake = Math.max(this.screenShake, amount);
    }

    // -------------------------------------------------------------
    // Game Over Trigger
    // -------------------------------------------------------------
    triggerGameOver(reason) {
      if (this.isGameOver) return;
      this.isGameOver = true;
      this.isRunning = false;

      this.gameLog = {
        gameId: 'mathRunner',
        score: Math.floor(this.score),
        wave: this.wave,
        maxPower: this.maxPower,
        finalPower: this.power,
        kills: this.kills,
        gatesPassed: this.gatesPassed,
        reason: reason || 'DEFENSE_BREACHED'
      };

      this.triggerShake(14);
      this.playSound('playHit');
      this.playSound('playGameOver');

      if (typeof this.callbacks.onGameOver === 'function') {
        this.callbacks.onGameOver(Math.floor(this.score), this.gameLog);
      }
    }

    // -------------------------------------------------------------
    // Main Update Loop (dt in seconds)
    // -------------------------------------------------------------
    update(dt) {
      if (!this.isRunning || this.isGameOver) return;

      // Cap delta time for frame stability
      const delta = Math.min(dt, 0.08);
      this.gameTime += delta;
      this.gridOffset = (this.gridOffset + this.highwaySpeed * delta) % 40;
      this.warningPulse = Math.sin(this.gameTime * 6);

      // Badge scale decay
      if (this.badgeScale > 1.0) {
        this.badgeScale = Math.max(1.0, this.badgeScale - delta * 2.2);
      }

      // Screen shake decay
      if (this.screenShake > 0) {
        this.screenShakeX = (Math.random() - 0.5) * this.screenShake * 2;
        this.screenShakeY = (Math.random() - 0.5) * this.screenShake * 2;
        this.screenShake = Math.max(0, this.screenShake - delta * 22);
      } else {
        this.screenShakeX = 0;
        this.screenShakeY = 0;
      }

      // 1. Update Player Movement
      let moveDir = 0;
      if (this.keys.left) moveDir -= 1;
      if (this.keys.right) moveDir += 1;

      // Pointer drag support
      if (this.isPointerDown && this.pointerTargetX !== null) {
        const diff = this.pointerTargetX - this.x;
        if (Math.abs(diff) > 4) {
          moveDir = Math.sign(diff);
        }
      }

      this.vx = lerp(this.vx, moveDir * this.playerSpeed, 18 * delta);
      this.x += this.vx * delta;

      // Clamp player within road boundaries (with squad margin)
      const squadMargin = 35;
      this.x = clamp(this.x, this.roadLeft + squadMargin, this.roadRight - squadMargin);

      // 2. Continuous Auto-fire
      this.fireTimer -= delta;
      if (this.fireTimer <= 0) {
        this.shoot();
        this.fireTimer = this.getFireInterval();
      }

      // 3. Update Bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += b.vx * delta;
        b.y += b.vy * delta;

        // Prune off-screen bullets
        if (b.y < -20 || b.x < this.roadLeft - 20 || b.x > this.roadRight + 20) {
          this.bullets.splice(i, 1);
        }
      }

      // 4. Update Gate Pairs (Descend)
      for (let i = this.gatePairs.length - 1; i >= 0; i--) {
        const gp = this.gatePairs[i];
        gp.y += this.highwaySpeed * delta;

        // Tricky moving gate pair oscillation
        if (gp.isMovable) {
          const oscSpeed = gp.oscSpeed || (2.6 + Math.min(this.wave * 0.25, 3.0));
          const swayAmp = gp.swayAmp || Math.min(50, 18 + this.wave * 4);
          const phase = gp.swayPhase || 0;
          gp.swayOffset = Math.sin(this.gameTime * oscSpeed + phase) * swayAmp;
          gp.left.x = gp.baseLeftX + gp.swayOffset;
          gp.right.x = gp.baseRightX + gp.swayOffset;
        }

        // Check if player passes through gate row (at playerY = 665)
        if (!gp.triggered && gp.y + gp.height >= this.playerY - 14 && gp.y <= this.playerY + 14) {
          const dividerX = 300 + (gp.swayOffset || 0);
          const chosenSide = this.x < dividerX ? 'left' : 'right';
          this.applyGate(gp, chosenSide);
          if (this.isGameOver) return;
        }

        // Prune off-screen gates
        if (gp.y > this.height + 60) {
          this.gatePairs.splice(i, 1);
        }
      }

      // 5. Update Enemies & Check Defense Line Breach
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        enemy.y += this.highwaySpeed * delta;

        if (enemy.flashTimer > 0) {
          enemy.flashTimer -= delta;
        }

        // Core animation for boss
        if (enemy.isBoss) {
          enemy.coreAngle = (enemy.coreAngle || 0) + delta * 2;
        }

        // Boss defense line breach check (only Boss blocks span the full defense perimeter)
        if (enemy.isBoss && enemy.y + enemy.height >= 645) {
          this.triggerGameOver('DEFENSE_BREACHED');
          return;
        }

        // Direct player collision check (for blocks in the player's lane)
        if (
          enemy.y + enemy.height >= this.playerY - 15 &&
          enemy.y <= this.playerY + 15 &&
          Math.abs(this.x - (enemy.x + enemy.width / 2)) < (enemy.width / 2 + 14)
        ) {
          if (this.power > enemy.hp && !enemy.isBoss) {
            // Squad rams through remaining weak block HP at the cost of power
            const dmg = enemy.hp;
            this.power -= dmg;
            this.badgeScale = 1.35;
            this.addFloatingText(this.x, this.playerY - 30, `-${dmg} POWER!`, '#F2546D', 22);
            this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color, false);
            this.playSound('playHit');
            this.enemies.splice(i, 1);
            continue;
          } else {
            this.power = 0;
            this.triggerGameOver('PLAYER_COLLISION');
            return;
          }
        }

        // Prune side-lane blocks that safely passed behind the player
        if (enemy.y > this.height + 20) {
          this.enemies.splice(i, 1);
          continue;
        }

        // 6. Bullet vs Enemy Collisions
        for (let j = this.bullets.length - 1; j >= 0; j--) {
          const b = this.bullets[j];

          // Simple AABB check
          if (
            b.x >= enemy.x &&
            b.x <= enemy.x + enemy.width &&
            b.y >= enemy.y &&
            b.y <= enemy.y + enemy.height
          ) {
            // Hit enemy
            enemy.hp -= b.damage;
            enemy.flashTimer = 0.08;
            this.createHitParticles(b.x, b.y, enemy.color);

            // Award hit points
            this.score += 10;
            this.callbacks.onScoreChange?.(Math.floor(this.score));

            // Remove bullet
            this.bullets.splice(j, 1);

            // Check if enemy destroyed
            if (enemy.hp <= 0) {
              const bonusScore = enemy.initialHp * 15;
              this.score += bonusScore;
              this.kills++;
              this.callbacks.onScoreChange?.(Math.floor(this.score));

              this.createExplosion(
                enemy.x + enemy.width / 2,
                enemy.y + enemy.height / 2,
                enemy.color,
                enemy.isBoss
              );

              this.playSound('playScore');
              if (enemy.isBoss) {
                this.playSound('playExplosion');
              }

              const bonusText = enemy.isBoss
                ? `BOSS DOWN! +${bonusScore}`
                : `+${bonusScore}`;
              this.addFloatingText(
                enemy.x + enemy.width / 2,
                enemy.y + enemy.height / 2,
                bonusText,
                enemy.isBoss ? '#F4C552' : '#7BE092',
                enemy.isBoss ? 26 : 20
              );

              // Remove enemy
              this.enemies.splice(i, 1);
              break;
            }
          }
        }
      }

      // 7. Check Wave Progression
      if (this.enemies.length === 0 && this.gatePairs.length === 0 && this.waveState === 'ACTIVE') {
        this.waveState = 'CLEARED';
        this.waveTransitionTimer = 1.0;
        this.addFloatingText(300, 320, `WAVE ${this.wave} CLEARED!`, '#7BE092', 30);
      }

      if (this.waveState === 'CLEARED') {
        this.waveTransitionTimer -= delta;
        if (this.waveTransitionTimer <= 0) {
          this.wave++;
          this.spawnWave(this.wave);
        }
      }

      // 8. Update Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.life -= delta;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // 9. Update Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y += ft.vy * delta;
        ft.life -= delta;
        if (ft.life <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }
    }

    // -------------------------------------------------------------
    // Render Pipeline
    // -------------------------------------------------------------
    render(ctx) {
      if (!ctx) ctx = this.ctx;
      if (!ctx) return;

      ctx.save();

      // Apply screen shake
      if (this.screenShake > 0) {
        ctx.translate(this.screenShakeX, this.screenShakeY);
      }

      // 1. Cyber Highway Background & 3D Perspective Grid
      this.drawCyberHighway(ctx);

      // 2. Danger Defense Line at y = 650
      this.drawDefenseLine(ctx);

      // 3. Math Gate Pairs
      this.drawGatePairs(ctx);

      // 4. Enemy Blocks & Bosses
      this.drawEnemies(ctx);

      // 5. Energy Projectiles
      this.drawBullets(ctx);

      // 6. Player Squad & Floating Badge
      this.drawPlayerSquad(ctx);

      // 7. Hit FX & Particles
      this.drawParticles(ctx);

      // 8. Floating Combat Text
      this.drawFloatingTexts(ctx);

      // 9. Top Cyberpunk HUD
      this.drawHUD(ctx);

      // 10. Game Over Overlay (if triggered)
      if (this.isGameOver) {
        this.drawGameOverOverlay(ctx);
      }

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Cyber Highway & Grid
    // -------------------------------------------------------------
    drawCyberHighway(ctx) {
      // Soft Slate-Navy background
      ctx.fillStyle = '#18243E';
      ctx.fillRect(0, 0, this.width, this.height);

      // Outer cyber grid lines & side abyss
      ctx.fillStyle = 'rgba(110, 198, 230, 0.04)';
      ctx.fillRect(0, 0, this.roadLeft, this.height);
      ctx.fillRect(this.roadRight, 0, this.width - this.roadRight, this.height);

      // Highway surface gradient (#1F2F50 down to #18243E)
      const roadGrad = ctx.createLinearGradient(0, 0, 0, this.height);
      roadGrad.addColorStop(0, '#1F2F50');
      roadGrad.addColorStop(1, '#18243E');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(this.roadLeft, 0, this.roadWidth, this.height);

      // Pastel Sky-Blue Guardrails (Left: x=50, Right: x=550)
      ctx.save();
      ctx.shadowBlur = 3;
      ctx.shadowColor = '#6EC6E6';
      ctx.strokeStyle = '#6EC6E6';
      ctx.lineWidth = 3;

      // Left rail
      ctx.beginPath();
      ctx.moveTo(this.roadLeft, 0);
      ctx.lineTo(this.roadLeft, this.height);
      ctx.stroke();

      // Right rail
      ctx.beginPath();
      ctx.moveTo(this.roadRight, 0);
      ctx.lineTo(this.roadRight, this.height);
      ctx.stroke();
      ctx.restore();

      // Highway Lane Dividers (Dashed vertical lines)
      ctx.save();
      ctx.strokeStyle = 'rgba(110, 198, 230, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 18]);
      ctx.lineDashOffset = -this.gridOffset;

      const laneWidth = this.roadWidth / 4;
      for (let i = 1; i < 4; i++) {
        const lx = this.roadLeft + i * laneWidth;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, this.height);
        ctx.stroke();
      }
      ctx.restore();

      // 3D Perspective Scrolling Horizontal Grid Lines
      ctx.save();
      ctx.lineWidth = 1;

      const spacing = 40;
      for (let y = this.gridOffset; y < this.height; y += spacing) {
        // Perspective intensity increases toward defense line
        const alpha = 0.05 + (y / this.height) * 0.15;
        ctx.strokeStyle = `rgba(110, 198, 230, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(this.roadLeft, y);
        ctx.lineTo(this.roadRight, y);
        ctx.stroke();
      }
      ctx.restore();

      // Highway Hazard Chevrons on side borders
      ctx.save();
      ctx.fillStyle = 'rgba(110, 198, 230, 0.35)';
      const chevronSpacing = 60;
      const chevronY = (this.gridOffset * 1.5) % chevronSpacing;
      for (let y = -chevronSpacing + chevronY; y < this.height; y += chevronSpacing) {
        // Left chevron
        ctx.beginPath();
        ctx.moveTo(this.roadLeft - 18, y);
        ctx.lineTo(this.roadLeft - 8, y + 10);
        ctx.lineTo(this.roadLeft - 18, y + 20);
        ctx.lineTo(this.roadLeft - 22, y + 16);
        ctx.lineTo(this.roadLeft - 14, y + 10);
        ctx.lineTo(this.roadLeft - 22, y + 4);
        ctx.fill();

        // Right chevron
        ctx.beginPath();
        ctx.moveTo(this.roadRight + 18, y);
        ctx.lineTo(this.roadRight + 8, y + 10);
        ctx.lineTo(this.roadRight + 18, y + 20);
        ctx.lineTo(this.roadRight + 22, y + 16);
        ctx.lineTo(this.roadRight + 14, y + 10);
        ctx.lineTo(this.roadRight + 22, y + 4);
        ctx.fill();
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Danger Defense Line
    // -------------------------------------------------------------
    drawDefenseLine(ctx) {
      const y = this.defenseLineY;

      ctx.save();
      // Pastel Rose-Red Danger Laser
      ctx.shadowBlur = 3;
      ctx.shadowColor = '#F2546D';
      ctx.strokeStyle = '#F2546D';
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(this.roadLeft, y);
      ctx.lineTo(this.roadRight, y);
      ctx.stroke();

      // Pulsing Hazard Stripe beneath the line
      ctx.fillStyle = 'rgba(242, 84, 109, 0.2)';
      ctx.fillRect(this.roadLeft, y, this.roadWidth, 8);

      // Warning Label
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(242, 84, 109, ${0.75 + this.warningPulse * 0.25})`;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ DANGER DEFENSE LINE ⚠', 300, y - 5);

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Dual Math Gates
    // -------------------------------------------------------------
    drawGatePairs(ctx) {
      for (let i = 0; i < this.gatePairs.length; i++) {
        const gp = this.gatePairs[i];
        if (gp.y > this.height || gp.y + gp.height < 0) continue;

        const isTriggered = gp.triggered;
        const gateAlpha = isTriggered ? 0.25 : 1.0;

        // Draw Left Gate
        this.drawSingleGate(ctx, gp.left, gp.y, gp.height, gateAlpha);

        // Draw Right Gate
        this.drawSingleGate(ctx, gp.right, gp.y, gp.height, gateAlpha);

        // Middle Divider Pillar
        const divX = 296 + (gp.swayOffset || 0);
        ctx.fillStyle = 'rgba(110, 198, 230, 0.4)';
        ctx.fillRect(divX, gp.y - 2, 8, gp.height + 4);
      }
    }

    drawSingleGate(ctx, gate, y, h, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;

      const isPos = gate.isPositive;
      // Positive in Pastel Sky-Blue (#6EC6E6), Negative in Patch Rose-Red (#F2546D)
      const mainColor = isPos ? '#6EC6E6' : '#F2546D';
      const bgColor1 = isPos ? 'rgba(110, 198, 230, 0.25)' : 'rgba(242, 84, 109, 0.25)';
      const bgColor2 = isPos ? 'rgba(50, 72, 117, 0.5)' : 'rgba(110, 36, 52, 0.5)';

      // Holographic Glass Body Gradient
      const grad = ctx.createLinearGradient(gate.x, y, gate.x, y + h);
      grad.addColorStop(0, bgColor1);
      grad.addColorStop(1, bgColor2);

      ctx.fillStyle = grad;
      this.drawRoundedRect(ctx, gate.x, y, gate.width, h, 8);
      ctx.fill();

      // Clean Pastel Border
      ctx.shadowBlur = 3;
      ctx.shadowColor = mainColor;
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.5;
      this.drawRoundedRect(ctx, gate.x, y, gate.width, h, 8);
      ctx.stroke();

      // Internal Scanlines
      ctx.strokeStyle = isPos ? 'rgba(110, 198, 230, 0.15)' : 'rgba(242, 84, 109, 0.15)';
      ctx.lineWidth = 1;
      for (let lineY = y + 8; lineY < y + h; lineY += 8) {
        ctx.beginPath();
        ctx.moveTo(gate.x + 6, lineY);
        ctx.lineTo(gate.x + gate.width - 6, lineY);
        ctx.stroke();
      }

      // Gate Math Text (e.g. "+25", "×2", "-15", "÷2")
      ctx.shadowBlur = 2;
      ctx.shadowColor = '#F8FAFC';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 26px "Courier New", monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const opSymbol = gate.type === '*' ? '×' : (gate.type === '/' ? '÷' : gate.type);
      const text = `${opSymbol}${gate.value}`;
      ctx.fillText(text, gate.x + gate.width / 2, y + h / 2 - 3);

      // Sub-label
      ctx.shadowBlur = 0;
      ctx.fillStyle = mainColor;
      ctx.font = 'bold 9px monospace';
      const sub = isPos ? 'POWER BOOST' : 'SYSTEM DRAIN';
      ctx.fillText(sub, gate.x + gate.width / 2, y + h - 10);

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Enemy Blocks & Bosses
    // -------------------------------------------------------------
    drawEnemies(ctx) {
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.y > this.height || e.y + e.height < -100) continue;

        ctx.save();
        if (!e.isBoss && e.y > 640) {
          ctx.globalAlpha = Math.max(0, 1 - (e.y - 640) / 85);
        }

        if (e.isBoss) {
          this.drawBossBlock(ctx, e);
        } else {
          this.drawNormalBlock(ctx, e);
        }

        ctx.restore();
      }
    }

    drawNormalBlock(ctx, e) {
      const isFlash = e.flashTimer > 0;
      const borderColor = isFlash ? '#F8FAFC' : e.color;

      // Dark Slate-Navy body with pastel border
      ctx.shadowBlur = isFlash ? 3 : 2;
      ctx.shadowColor = borderColor;

      const grad = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.height);
      grad.addColorStop(0, isFlash ? '#F8FAFC' : '#233457');
      grad.addColorStop(1, isFlash ? '#FCE7EB' : '#18243E');
      ctx.fillStyle = grad;

      this.drawRoundedRect(ctx, e.x, e.y, e.width, e.height, 6);
      ctx.fill();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2.5;
      this.drawRoundedRect(ctx, e.x, e.y, e.width, e.height, 6);
      ctx.stroke();

      // Health bar at bottom of block
      const hpRatio = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(e.x + 6, e.y + e.height - 8, e.width - 12, 4);

      ctx.fillStyle = e.color;
      ctx.fillRect(e.x + 6, e.y + e.height - 8, (e.width - 12) * hpRatio, 4);

      // Remaining HP Number in bold center
      ctx.shadowBlur = 0;
      ctx.fillStyle = isFlash ? '#18243E' : '#F8FAFC';
      const hpText = `${Math.max(0, e.hp)}`;
      const fontSize = hpText.length >= 5 ? 16 : (hpText.length >= 4 ? 18 : 22);
      ctx.font = `bold ${fontSize}px "Courier New", monospace, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hpText, e.x + e.width / 2, e.y + e.height / 2 - 4);
    }

    drawBossBlock(ctx, e) {
      const isFlash = e.flashTimer > 0;
      const borderColor = isFlash ? '#F8FAFC' : '#F2546D';

      // Dreadnought Armor Body
      ctx.shadowBlur = isFlash ? 4 : 3;
      ctx.shadowColor = borderColor;

      const grad = ctx.createLinearGradient(e.x, e.y, e.x, e.y + e.height);
      grad.addColorStop(0, isFlash ? '#F8FAFC' : '#2D1B2D');
      grad.addColorStop(1, isFlash ? '#FCE7EB' : '#1A1220');
      ctx.fillStyle = grad;

      this.drawRoundedRect(ctx, e.x, e.y, e.width, e.height, 10);
      ctx.fill();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3.5;
      this.drawRoundedRect(ctx, e.x, e.y, e.width, e.height, 10);
      ctx.stroke();

      // Rotating Energy Core in center
      ctx.save();
      ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
      ctx.rotate(e.coreAngle || 0);
      ctx.strokeStyle = 'rgba(242, 84, 109, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, -22, 44, 44);
      ctx.restore();

      // Boss Title Banner in Mustard-Gold
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#F4C552';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(e.bossName, e.x + e.width / 2, e.y + 16);

      // Remaining Boss HP number
      ctx.shadowBlur = 2;
      ctx.shadowColor = '#F2546D';
      ctx.fillStyle = isFlash ? '#18243E' : '#F8FAFC';
      const bossHpText = `HP: ${Math.max(0, e.hp)}`;
      const bossFontSize = bossHpText.length >= 9 ? 22 : (bossHpText.length >= 7 ? 26 : 30);
      ctx.font = `bold ${bossFontSize}px "Courier New", monospace, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bossHpText, e.x + e.width / 2, e.y + e.height / 2 + 6);

      // Huge Boss Health Bar in Patch Rose-Red
      const hpRatio = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(e.x + 16, e.y + e.height - 12, e.width - 32, 6);

      ctx.fillStyle = '#F2546D';
      ctx.fillRect(e.x + 16, e.y + e.height - 12, (e.width - 32) * hpRatio, 6);
    }

    // -------------------------------------------------------------
    // Drawing: Bullets
    // -------------------------------------------------------------
    drawBullets(ctx) {
      ctx.save();
      for (let i = 0; i < this.bullets.length; i++) {
        const b = this.bullets[i];
        ctx.shadowBlur = 2;
        ctx.shadowColor = b.color;
        ctx.fillStyle = b.color;

        // Elongated energy capsule
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Trail beam
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.radius * 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
        ctx.stroke();
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Player Squad & Floating Badge
    // -------------------------------------------------------------
    drawPlayerSquad(ctx) {
      const squadCount = this.getVisualSquadCount();

      // 1. Draw Mini Cyber Drones in formation
      ctx.save();
      for (let i = 0; i < squadCount; i++) {
        const offset = this.getSquadUnitOffset(i);
        const floatBob = Math.sin(this.gameTime * 6 + i * 0.5) * 2;
        const ux = this.x + offset.x;
        const uy = this.playerY + offset.y + floatBob;

        this.drawMiniDrone(ctx, ux, uy, i === 0);
      }
      ctx.restore();

      // 2. Bold Floating Power Badge above squad
      this.drawPowerBadge(ctx);
    }

    getSquadUnitOffset(index) {
      if (index === 0) return { x: 0, y: -4 }; // Leader drone

      // Formation layout of wing escorts
      const side = (index % 2 === 1) ? -1 : 1;
      const pairIndex = Math.floor((index - 1) / 2);

      // Staggered chevron delta formation
      const row = Math.floor(pairIndex / 3);
      const col = pairIndex % 3;

      const offsetX = side * (14 + col * 12 + row * 6);
      const offsetY = 10 + row * 12 + col * 4;

      return { x: offsetX, y: offsetY };
    }

    drawMiniDrone(ctx, x, y, isLeader) {
      ctx.save();

      // Thruster flame particles / glow
      ctx.shadowBlur = isLeader ? 2 : 1;
      ctx.shadowColor = isLeader ? '#6EC6E6' : '#5C85D6';

      // Thruster flare
      ctx.fillStyle = 'rgba(110, 198, 230, 0.7)';
      ctx.beginPath();
      ctx.moveTo(x - 3, y + (isLeader ? 8 : 5));
      ctx.lineTo(x + 3, y + (isLeader ? 8 : 5));
      ctx.lineTo(x, y + (isLeader ? 16 : 10) + Math.random() * 4);
      ctx.fill();

      // Cyber Drone Chassis
      ctx.fillStyle = isLeader ? '#6EC6E6' : '#5C85D6';
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = isLeader ? 1.5 : 1;

      ctx.beginPath();
      if (isLeader) {
        // Delta wing leader
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 10, y + 6);
        ctx.lineTo(x + 3, y + 4);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x - 3, y + 4);
        ctx.lineTo(x - 10, y + 6);
      } else {
        // Mini wing drone
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y + 4);
        ctx.lineTo(x, y + 2);
        ctx.lineTo(x - 6, y + 4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cockpit Core in Glove White
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.arc(x, y - (isLeader ? 2 : 1), isLeader ? 2.5 : 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawPowerBadge(ctx) {
      const badgeY = this.playerY - 36;

      ctx.save();
      ctx.translate(this.x, badgeY);
      ctx.scale(this.badgeScale, this.badgeScale);

      const text = `[ POWER: ${this.power} ]`;
      ctx.font = 'bold 15px "Courier New", monospace, sans-serif';
      const textWidth = ctx.measureText(text).width;
      const padX = 10;
      const padY = 5;
      const bWidth = textWidth + padX * 2;
      const bHeight = 24;

      // Slate-Navy Backdrop
      ctx.shadowBlur = 2;
      ctx.shadowColor = '#6EC6E6';
      ctx.fillStyle = 'rgba(28, 41, 71, 0.95)';
      this.drawRoundedRect(ctx, -bWidth / 2, -bHeight / 2, bWidth, bHeight, 6);
      ctx.fill();

      // Pastel Sky-Blue Border
      ctx.strokeStyle = '#6EC6E6';
      ctx.lineWidth = 1.8;
      this.drawRoundedRect(ctx, -bWidth / 2, -bHeight / 2, bWidth, bHeight, 6);
      ctx.stroke();

      // Badge Text
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#6EC6E6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 1);

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Particles & Floating Texts
    // -------------------------------------------------------------
    drawParticles(ctx) {
      ctx.save();
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 2;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawFloatingTexts(ctx) {
      ctx.save();
      for (let i = 0; i < this.floatingTexts.length; i++) {
        const ft = this.floatingTexts[i];
        const alpha = clamp(ft.life / ft.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 2;
        ctx.shadowColor = ft.color;
        ctx.fillStyle = ft.color;
        ctx.font = `bold ${ft.size}px "Courier New", monospace, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Top HUD
    // -------------------------------------------------------------
    drawHUD(ctx) {
      ctx.save();

      // HUD Header Bar Backdrop
      const hudY = 10;
      const hudHeight = 44;

      ctx.fillStyle = 'rgba(28, 41, 71, 0.94)';
      ctx.fillRect(this.roadLeft - 10, hudY, this.roadWidth + 20, hudHeight);

      ctx.strokeStyle = '#5B78AD';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.roadLeft - 10, hudY, this.roadWidth + 20, hudHeight);

      ctx.textBaseline = 'middle';

      // 1. SCORE (6-digit zero padded)
      const scoreStr = String(Math.floor(this.score)).padStart(6, '0');
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
      ctx.textAlign = 'left';
      ctx.fillText('SCORE', this.roadLeft + 6, hudY + 14);

      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillStyle = '#7BE092';
      ctx.shadowBlur = 0;
      ctx.fillText(scoreStr, this.roadLeft + 6, hudY + 30);

      // 2. WAVE (Center)
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
      ctx.fillText('SECTOR', 300, hudY + 14);

      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillStyle = (this.wave % 3 === 0) ? '#F2546D' : '#6EC6E6';
      const waveLabel = (this.wave % 3 === 0) ? `WAVE ${this.wave} [BOSS]` : `WAVE ${String(this.wave).padStart(2, '0')}`;
      ctx.fillText(waveLabel, 300, hudY + 30);

      // 3. FIREPOWER / 전투력 (Right)
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
      ctx.fillText('전투력 (FIREPOWER)', this.roadRight - 6, hudY + 14);

      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillStyle = '#F4C552';
      ctx.fillText(`⚡ ${this.power}`, this.roadRight - 6, hudY + 30);

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Drawing: Game Over Screen Overlay
    // -------------------------------------------------------------
    drawGameOverOverlay(ctx) {
      ctx.save();

      // Soft Slate-Navy vignette
      ctx.fillStyle = 'rgba(22, 34, 58, 0.92)';
      ctx.fillRect(0, 0, this.width, this.height);

      // Center System Failure Box
      const boxW = 440;
      const boxH = 280;
      const boxX = (this.width - boxW) / 2;
      const boxY = (this.height - boxH) / 2 - 20;

      ctx.fillStyle = '#233457';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      ctx.strokeStyle = '#F2546D';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 3;
      ctx.shadowColor = '#F2546D';
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Title
      ctx.textAlign = 'center';
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.fillStyle = '#F2546D';
      ctx.fillText('SYSTEM BREACHED', this.width / 2, boxY + 50);

      // Sub-reason
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.75)';
      const reasonLabel = this.gameLog.reason === 'POWER_DEPLETED'
        ? 'FIREPOWER ZERO - POWER COLLAPSED'
        : (this.gameLog.reason === 'PLAYER_COLLISION'
          ? 'CRITICAL HULL COLLISION'
          : 'DEFENSE PERIMETER COMPROMISED');
      ctx.fillText(reasonLabel, this.width / 2, boxY + 75);

      // Divider line
      ctx.strokeStyle = 'rgba(242, 84, 109, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX + 30, boxY + 95);
      ctx.lineTo(boxX + boxW - 30, boxY + 95);
      ctx.stroke();

      // Summary Stats
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(`FINAL SCORE: ${Math.floor(this.score)}`, this.width / 2, boxY + 130);

      ctx.font = '14px monospace';
      ctx.fillStyle = '#6EC6E6';
      ctx.fillText(`WAVE REACHED: ${this.wave}`, this.width / 2, boxY + 160);

      ctx.fillStyle = '#F4C552';
      ctx.fillText(`ENEMIES DESTROYED: ${this.kills}`, this.width / 2, boxY + 185);

      ctx.fillStyle = '#7BE092';
      ctx.fillText(`GATES CLEARED: ${this.gatesPassed}`, this.width / 2, boxY + 210);

      ctx.restore();
    }

    // Helper: Rounded Rect
    drawRoundedRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  }

  // Export to global window object
  if (typeof window !== 'undefined') {
    window.MathRunner = MathRunner;
  }

  // Export for module systems if present
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathRunner;
  }
})();
