/**
 * ============================================================================
 * RETRO RANKERS - CYBER DODGE (js/games/dodge.js)
 * 360-Degree Bullet Dodge Survival with Cyberpunk Neon Aesthetic & EMP Burst
 * ============================================================================
 * 
 * Strict Specification Compliance:
 * - 600x750 Canvas Layout:
 *   - Top HUD bar: SCORE, TIME SURVIVED, DANGER LEVEL, CORES COLLECTED
 *   - Safe play area (x: 15..585, y: 65..735) with glowing cyber borders & starfield
 * - Player Ship:
 *   - Starts at center (300, 390)
 *   - 360-degree smooth movement via Arrow keys / WASD (simultaneous key map)
 *   - Normalized diagonal speed ~280px/s
 *   - Neon ship polygon pointing in movement direction + glowing engine particles
 *   - Bullet-hell style precise hitbox indicator (radius 6px)
 * - 3 Bullet Types spawning from all 4 screen edges:
 *   1. Normal Bullet (#00FFFF Cyan): straight line at steady speed
 *   2. Aimed Bullet (#FF007F Magenta): aims at player on spawn, diamond/spear, faster
 *   3. Accelerating Bullet (#FF8800/#FF2200 Orange-Red): starts at 80px/s,
 *      accelerates at 260px/s² with fiery trail
 * - Scoring & Energy Cores:
 *   - Survival score increases continuously (150 pts/sec)
 *   - Green glowing hexagonal Energy Core (#39FF14) spawns every 4~6s with pulsing ring
 *   - Collecting awards +1500 bonus points (sound.playPowerUp()), triggers 130px radius
 *     EMP shockwave clearing nearby bullets, and shows floating "+1500!" text
 *   - Spawn interval shortens from 0.42s down to 0.08s; bullet speeds scale up
 * - Collision & Game Over:
 *   - Triggers explosion particles, sound.playGameOver()
 *   - Calls callbacks.onGameOver(Math.floor(score), gameLog)
 *   - gameLog = { gameId: 'dodge', timeSurvived, dangerLevel, coresCollected }
 */

(function () {
  'use strict';

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

  // Helper: Format seconds to MM:SS.s
  function formatTime(sec) {
    const totalTenths = Math.floor(sec * 10);
    const tenths = totalTenths % 10;
    const totalSec = Math.floor(sec);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
  }

  class CyberDodge {
    constructor(canvas, callbacks = {}) {
      this.canvas = canvas;
      this.callbacks = callbacks || {};

      // Canvas dimensions
      this.width = canvas ? canvas.width : 600;
      this.height = canvas ? canvas.height : 750;

      // Play area boundaries (excluding top HUD)
      this.playBounds = {
        minX: 18,
        maxX: 582,
        minY: 68,
        maxY: 732
      };

      // Player state
      this.player = {
        x: 300,
        y: 390,
        radius: 13,        // Visual radius
        hitboxRadius: 6,   // Exact collision hitbox radius
        speed: 280,        // Movement speed px/s
        angle: -Math.PI / 2, // Facing angle (pointing up initially)
        vx: 0,
        vy: 0
      };

      // Game state
      this.score = 0;
      this.timeSurvived = 0;
      this.dangerLevel = 1;
      this.coresCollected = 0;

      this.running = false;
      this.gameOver = false;

      // Spawning timers
      this.bulletSpawnTimer = 0;
      this.coreSpawnTimer = 3.5; // First core in 3.5s

      // Entities
      this.bullets = [];
      this.energyCores = [];
      this.empWaves = [];
      this.particles = [];
      this.floatingTexts = [];
      this.stars = [];

      // Keyboard input state map
      this.keys = {};

      // Effects
      this.screenShake = 0;
      this.scoreSyncTimer = 0;
      this.ambientTimer = 0;

      // Initialize background stars
      this.initStars();
      this.reset();
    }

    // -------------------------------------------------------------
    // Sound Helper
    // -------------------------------------------------------------
    playSound(soundName) {
      try {
        const sound = this.callbacks?.sound || window.sound || window.soundManager;
        if (sound && typeof sound[soundName] === 'function') {
          sound[soundName]();
        }
      } catch (e) {
        // Safe fail
      }
    }

    // -------------------------------------------------------------
    // Initialization & Reset
    // -------------------------------------------------------------
    initStars() {
      this.stars = [];
      for (let i = 0; i < 45; i++) {
        this.stars.push({
          x: Math.random() * this.width,
          y: 54 + Math.random() * (this.height - 54),
          speed: 25 + Math.random() * 85,
          size: 1 + Math.random() * 2,
          color: Math.random() > 0.4 ? '#00FFFF' : (Math.random() > 0.5 ? '#FF007F' : '#39FF14'),
          alpha: 0.2 + Math.random() * 0.7
        });
      }
    }

    reset() {
      this.player.x = 300;
      this.player.y = 390;
      this.player.angle = -Math.PI / 2;
      this.player.vx = 0;
      this.player.vy = 0;

      this.score = 0;
      this.timeSurvived = 0;
      this.dangerLevel = 1;
      this.coresCollected = 0;

      this.running = false;
      this.gameOver = false;

      this.bullets = [];
      this.energyCores = [];
      this.empWaves = [];
      this.particles = [];
      this.floatingTexts = [];

      this.bulletSpawnTimer = 0;
      this.coreSpawnTimer = 4.0;
      this.screenShake = 0;
      this.scoreSyncTimer = 0;
      this.ambientTimer = 0;
      this.keys = {};
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
    // Input Handlers
    // -------------------------------------------------------------
    handleKeyDown(e) {
      const code = e.code || e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(code)) {
        e.preventDefault();
      }
      this.keys[code] = true;
      // Also map friendly keys
      if (e.key) {
        this.keys[e.key] = true;
      }
    }

    handleKeyUp(e) {
      const code = e.code || e.key;
      this.keys[code] = false;
      if (e.key) {
        this.keys[e.key] = false;
      }
    }

    // -------------------------------------------------------------
    // Bullet Spawning System (3 Distinct Types)
    // -------------------------------------------------------------
    spawnBullet() {
      // 1. Choose edge (0: Top, 1: Bottom, 2: Left, 3: Right)
      const edge = Math.floor(Math.random() * 4);
      let spawnX = 0;
      let spawnY = 0;

      if (edge === 0) {
        // Top edge
        spawnX = 20 + Math.random() * 560;
        spawnY = 56;
      } else if (edge === 1) {
        // Bottom edge
        spawnX = 20 + Math.random() * 560;
        spawnY = 746;
      } else if (edge === 2) {
        // Left edge
        spawnX = 4;
        spawnY = 60 + Math.random() * 680;
      } else {
        // Right edge
        spawnX = 596;
        spawnY = 60 + Math.random() * 680;
      }

      // Speed multiplier scaling up over survival time
      const speedMult = 1.0 + Math.min(1.2, this.timeSurvived * 0.015);

      // 2. Select bullet type based on survival time progression
      const rand = Math.random();
      let type = 'normal';

      if (this.timeSurvived < 4) {
        type = 'normal';
      } else if (this.timeSurvived < 12) {
        type = rand < 0.65 ? 'normal' : 'aimed';
      } else if (this.timeSurvived < 25) {
        if (rand < 0.45) type = 'normal';
        else if (rand < 0.75) type = 'aimed';
        else type = 'accelerating';
      } else {
        if (rand < 0.35) type = 'normal';
        else if (rand < 0.70) type = 'aimed';
        else type = 'accelerating';
      }

      // 3. Configure bullet parameters
      if (type === 'normal') {
        // Cyan (#00FFFF): Moves in straight line at steady speed
        // Directed toward a random point inside the arena center
        const targetX = 160 + Math.random() * 280;
        const targetY = 220 + Math.random() * 380;
        const angle = Math.atan2(targetY - spawnY, targetX - spawnX);
        const speed = 190 * speedMult;

        this.bullets.push({
          type: 'normal',
          x: spawnX,
          y: spawnY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          speed: speed,
          angle: angle,
          radius: 5,
          color: '#00FFFF',
          life: 0
        });
      } else if (type === 'aimed') {
        // Magenta (#FF007F): Calculates angle toward player's current position upon spawn
        // Diamond/spear shape, faster speed
        const angle = Math.atan2(this.player.y - spawnY, this.player.x - spawnX);
        const speed = 270 * speedMult;

        this.bullets.push({
          type: 'aimed',
          x: spawnX,
          y: spawnY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          speed: speed,
          angle: angle,
          radius: 5.5,
          color: '#FF007F',
          life: 0
        });
      } else {
        // Accelerating Bullet (#FF8800 / #FF2200):
        // Starts slow (80px/s) and accelerates continuously (accel = 260px/s²) with fiery trail
        const targetAngle = Math.atan2(this.player.y - spawnY, this.player.x - spawnX);
        // Slight spread deviation (+/- 0.25 rad) for challenging patterns
        const angle = targetAngle + (Math.random() - 0.5) * 0.5;
        const initialSpeed = 80 * speedMult;

        this.bullets.push({
          type: 'accelerating',
          x: spawnX,
          y: spawnY,
          vx: Math.cos(angle) * initialSpeed,
          vy: Math.sin(angle) * initialSpeed,
          speed: initialSpeed,
          accel: 260,
          angle: angle,
          radius: 6,
          color: '#FF8800',
          life: 0,
          trailTimer: 0
        });
      }
    }

    // -------------------------------------------------------------
    // Energy Core Spawning & EMP Wave
    // -------------------------------------------------------------
    spawnEnergyCore() {
      // Hexagonal core within safe play area
      const x = 70 + Math.random() * 460;
      const y = 130 + Math.random() * 540;

      this.energyCores.push({
        x: x,
        y: y,
        radius: 16,
        rotation: 0,
        pulseTimer: 0,
        lifetime: 8.5, // 8.5 seconds lifetime
        maxLifetime: 8.5
      });
    }

    triggerEMP(originX, originY) {
      const empRadius = 130;

      // 1. Add visual shockwave
      this.empWaves.push({
        x: originX,
        y: originY,
        currentRadius: 10,
        maxRadius: empRadius,
        speed: 400,
        alpha: 1.0
      });

      // 2. Clear all bullets within 130px radius
      let clearedCount = 0;
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        const dist = Math.hypot(b.x - originX, b.y - originY);
        if (dist <= empRadius) {
          // Bullet vaporized!
          clearedCount++;
          // Spawn sparkle particles
          for (let p = 0; p < 4; p++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 40 + Math.random() * 100;
            this.particles.push({
              x: b.x,
              y: b.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd,
              color: '#39FF14',
              size: 2 + Math.random() * 2,
              alpha: 1.0,
              life: 0.35 + Math.random() * 0.2
            });
          }
          this.bullets.splice(i, 1);
        }
      }

      this.screenShake = 0.14;

      // Floating EMP text banner
      if (clearedCount > 0) {
        this.floatingTexts.push({
          text: `EMP CLEAR x${clearedCount}`,
          x: originX,
          y: originY + 28,
          vy: -35,
          color: '#00FFFF',
          alpha: 1.0,
          maxLife: 1.0,
          life: 1.0,
          size: 11
        });
      }
    }

    // -------------------------------------------------------------
    // Game Over Trigger
    // -------------------------------------------------------------
    triggerGameOver() {
      if (this.gameOver) return;
      this.gameOver = true;
      this.running = false;

      this.playSound('playGameOver');
      this.screenShake = 0.35;

      // Spawn massive explosion particles at player position
      for (let i = 0; i < 50; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 240;
        const colors = ['#00FFFF', '#FF007F', '#39FF14', '#FF8800', '#FFFFFF'];
        this.particles.push({
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2.5 + Math.random() * 4,
          alpha: 1.0,
          life: 0.6 + Math.random() * 0.5
        });
      }

      const finalScore = Math.floor(this.score);
      const gameLog = {
        gameId: 'dodge',
        timeSurvived: Number(this.timeSurvived.toFixed(1)),
        dangerLevel: this.dangerLevel,
        coresCollected: this.coresCollected
      };

      this.callbacks?.onGameOver?.(finalScore, gameLog);
    }

    // -------------------------------------------------------------
    // Game Loop: Update (dt in seconds)
    // -------------------------------------------------------------
    update(dt) {
      dt = Math.min(dt, 0.1);
      this.ambientTimer += dt;

      // Screen shake decay
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt);
      }

      // Update background starfield
      for (const s of this.stars) {
        s.y += s.speed * dt;
        if (s.y > this.height) {
          s.y = 54;
          s.x = Math.random() * this.width;
        }
      }

      // Update EMP shockwaves
      for (let i = this.empWaves.length - 1; i >= 0; i--) {
        const wave = this.empWaves[i];
        wave.currentRadius += wave.speed * dt;
        wave.alpha = Math.max(0, 1 - (wave.currentRadius / wave.maxRadius));
        if (wave.currentRadius >= wave.maxRadius) {
          this.empWaves.splice(i, 1);
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
        p.alpha = Math.max(0, p.life / 0.7);
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      if (!this.running || this.gameOver) return;

      // 1. Survival time & score update (150 pts/sec)
      this.timeSurvived += dt;
      this.score += 150 * dt;

      // Danger level scales up every 7 seconds (max 10)
      this.dangerLevel = Math.min(10, Math.floor(this.timeSurvived / 7) + 1);

      // Throttle onScoreChange notification
      this.scoreSyncTimer += dt;
      if (this.scoreSyncTimer >= 0.1) {
        this.scoreSyncTimer = 0;
        this.callbacks?.onScoreChange?.(Math.floor(this.score));
      }

      // 2. Smooth 360-degree Player Movement
      let dx = 0;
      let dy = 0;

      if (this.keys['ArrowLeft'] || this.keys['KeyA'] || this.keys['a'] || this.keys['Left']) dx -= 1;
      if (this.keys['ArrowRight'] || this.keys['KeyD'] || this.keys['d'] || this.keys['Right']) dx += 1;
      if (this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['w'] || this.keys['Up']) dy -= 1;
      if (this.keys['ArrowDown'] || this.keys['KeyS'] || this.keys['s'] || this.keys['Down']) dy += 1;

      // Normalize diagonal movement speed
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      const isMoving = dx !== 0 || dy !== 0;

      if (isMoving) {
        // Point ship towards movement direction
        this.player.angle = Math.atan2(dy, dx);

        this.player.x += dx * this.player.speed * dt;
        this.player.y += dy * this.player.speed * dt;

        // Spawn engine thruster particles backwards
        if (Math.random() < 0.65) {
          const rearAngle = this.player.angle + Math.PI + (Math.random() - 0.5) * 0.5;
          const thrustSpd = 60 + Math.random() * 80;
          this.particles.push({
            x: this.player.x - Math.cos(this.player.angle) * 11,
            y: this.player.y - Math.sin(this.player.angle) * 11,
            vx: Math.cos(rearAngle) * thrustSpd,
            vy: Math.sin(rearAngle) * thrustSpd,
            color: Math.random() > 0.5 ? '#00FFFF' : '#39FF14',
            size: 2 + Math.random() * 2,
            alpha: 1.0,
            life: 0.22 + Math.random() * 0.15
          });
        }
      }

      // Clamp player within safe play boundaries
      this.player.x = Math.max(this.playBounds.minX, Math.min(this.playBounds.maxX, this.player.x));
      this.player.y = Math.max(this.playBounds.minY, Math.min(this.playBounds.maxY, this.player.y));

      // 3. Energy Core Spawning & Lifetime
      this.coreSpawnTimer -= dt;
      if (this.coreSpawnTimer <= 0 && this.energyCores.length === 0) {
        this.spawnEnergyCore();
        // Next core in 4~6 seconds
        this.coreSpawnTimer = 4.0 + Math.random() * 2.0;
      }

      for (let i = this.energyCores.length - 1; i >= 0; i--) {
        const core = this.energyCores[i];
        core.lifetime -= dt;
        core.rotation += 2.0 * dt;
        core.pulseTimer += 3.5 * dt;

        // Check collection collision with player
        const dist = Math.hypot(core.x - this.player.x, core.y - this.player.y);
        if (dist <= (this.player.radius + core.radius)) {
          // Collected!
          this.score += 1500;
          this.coresCollected++;
          this.callbacks?.onScoreChange?.(Math.floor(this.score));

          this.playSound('playPowerUp');

          // Floating bonus text
          this.floatingTexts.push({
            text: '+1500!',
            x: core.x,
            y: core.y - 12,
            vy: -45,
            color: '#39FF14',
            alpha: 1.0,
            maxLife: 1.2,
            life: 1.2,
            size: 16
          });

          // Trigger EMP clearing bullets within 130px
          this.triggerEMP(core.x, core.y);

          this.energyCores.splice(i, 1);
          continue;
        }

        // Despawn if lifetime ended
        if (core.lifetime <= 0) {
          this.energyCores.splice(i, 1);
        }
      }

      // 4. Bullet Spawning & Movement
      // Shortens from 0.42s down to 0.08s
      const spawnInterval = Math.max(0.08, 0.42 - (this.timeSurvived * 0.0055));
      this.bulletSpawnTimer += dt;
      if (this.bulletSpawnTimer >= spawnInterval) {
        this.bulletSpawnTimer = 0;
        this.spawnBullet();
      }

      // Update active bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.life += dt;

        if (b.type === 'accelerating') {
          // Accelerate continuously
          b.speed += b.accel * dt;
          b.vx = Math.cos(b.angle) * b.speed;
          b.vy = Math.sin(b.angle) * b.speed;

          // Fiery particle trail
          b.trailTimer = (b.trailTimer || 0) + dt;
          if (b.trailTimer >= 0.035) {
            b.trailTimer = 0;
            this.particles.push({
              x: b.x,
              y: b.y,
              vx: (Math.random() - 0.5) * 30,
              vy: (Math.random() - 0.5) * 30,
              color: Math.random() > 0.4 ? '#FF8800' : '#FF2200',
              size: 2 + Math.random() * 2,
              alpha: 0.9,
              life: 0.25 + Math.random() * 0.15
            });
          }
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Check Collision with Player Hitbox (radius 6px)
        const hitDist = Math.hypot(b.x - this.player.x, b.y - this.player.y);
        if (hitDist < (this.player.hitboxRadius + b.radius)) {
          this.triggerGameOver();
          return;
        }

        // Despawn if out of play screen bounds
        if (b.x < -35 || b.x > this.width + 35 || b.y < 35 || b.y > this.height + 35) {
          this.bullets.splice(i, 1);
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
        const shakeMag = this.screenShake * 16;
        const sx = (Math.random() - 0.5) * shakeMag;
        const sy = (Math.random() - 0.5) * shakeMag;
        ctx.translate(sx, sy);
      }

      // 1. Deep Cyber Background
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, this.width, this.height);

      // 2. Background Grid Lines & Stars
      this.renderArenaGrid(ctx);
      this.renderStars(ctx);

      // 3. EMP Waves
      this.renderEmpWaves(ctx);

      // 4. Energy Cores
      this.renderEnergyCores(ctx);

      // 5. Bullets
      this.renderBullets(ctx);

      // 6. Player Ship
      if (!this.gameOver) {
        this.renderPlayer(ctx);
      }

      // 7. Particles & Floating Texts
      this.renderParticles(ctx);
      this.renderFloatingTexts(ctx);

      // 8. Top HUD Bar
      this.renderHUD(ctx);

      // 9. Game Over Overlay
      if (this.gameOver) {
        this.renderGameOver(ctx);
      }

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Arena Visuals & Ambiance
    // -------------------------------------------------------------
    renderArenaGrid(ctx) {
      ctx.save();
      ctx.strokeStyle = '#0e1628';
      ctx.lineWidth = 1;

      const step = 35;
      for (let x = 0; x < this.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 52);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = 52; y < this.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }

      // Glowing Cyan Arena Boundaries
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(12, 58, this.width - 24, this.height - 70);

      // Cyber Corner Brackets
      this.drawCornerBrackets(ctx, 12, 58, this.width - 24, this.height - 70, '#00FFFF');

      ctx.restore();
    }

    renderStars(ctx) {
      ctx.save();
      for (const s of this.stars) {
        ctx.fillStyle = hexToRgba(s.color, s.alpha);
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.restore();
    }

    drawCornerBrackets(ctx, x, y, w, h, color) {
      const len = 14;
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
    // Player Ship Rendering
    // -------------------------------------------------------------
    renderPlayer(ctx) {
      ctx.save();
      ctx.translate(this.player.x, this.player.y);
      ctx.rotate(this.player.angle);

      // Delta Wing Neon Ship Polygon
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 10;

      // Outer hull
      ctx.beginPath();
      ctx.moveTo(16, 0);          // Nose
      ctx.lineTo(-12, -12);       // Left wingtip
      ctx.lineTo(-6, -4);         // Left indent
      ctx.lineTo(-10, 0);         // Engine center
      ctx.lineTo(-6, 4);          // Right indent
      ctx.lineTo(-12, 12);        // Right wingtip
      ctx.closePath();

      ctx.fillStyle = '#0B132B';
      ctx.fill();

      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Cockpit Glow
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(2, 0, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bullet-hell Center Hitbox Indicator (radius 6px)
      ctx.shadowColor = '#39FF14';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#39FF14';
      ctx.beginPath();
      ctx.arc(0, 0, this.player.hitboxRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Bullets Rendering (3 Distinct Visual Styles)
    // -------------------------------------------------------------
    renderBullets(ctx) {
      ctx.save();

      for (const b of this.bullets) {
        ctx.save();

        if (b.type === 'normal') {
          // Normal Bullet: Glowing Cyan (#00FFFF) Plasma Sphere
          ctx.shadowColor = '#00FFFF';
          ctx.shadowBlur = 8;

          // Outer pulse
          ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
          ctx.fill();

          // Main body
          ctx.fillStyle = '#00FFFF';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();

          // White core
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
          ctx.fill();

        } else if (b.type === 'aimed') {
          // Aimed Bullet: Magenta (#FF007F) Diamond / Spear
          ctx.translate(b.x, b.y);
          ctx.rotate(b.angle);

          ctx.shadowColor = '#FF007F';
          ctx.shadowBlur = 10;

          // Elongated diamond/spear
          ctx.beginPath();
          ctx.moveTo(10, 0);   // Spear point
          ctx.lineTo(-4, -5);  // Top barb
          ctx.lineTo(-8, 0);   // Tail
          ctx.lineTo(-4, 5);   // Bottom barb
          ctx.closePath();

          ctx.fillStyle = '#FF007F';
          ctx.fill();

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();

        } else if (b.type === 'accelerating') {
          // Accelerating Bullet: Orange-Red Comet (#FF8800 / #FF2200)
          ctx.shadowColor = '#FF8800';
          ctx.shadowBlur = 12;

          // Outer fiery aura
          ctx.fillStyle = 'rgba(255, 34, 0, 0.5)';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + 3, 0, Math.PI * 2);
          ctx.fill();

          // Core flame
          ctx.fillStyle = '#FF8800';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();

          // Intense yellow center
          ctx.fillStyle = '#FFFF00';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      ctx.restore();
    }

    // -------------------------------------------------------------
    // Energy Core & EMP Waves Rendering
    // -------------------------------------------------------------
    renderEnergyCores(ctx) {
      ctx.save();

      for (const core of this.energyCores) {
        // Blinking warning if about to despawn
        if (core.lifetime < 2.0 && Math.sin(core.lifetime * 14) > 0) {
          continue;
        }

        ctx.save();
        ctx.translate(core.x, core.y);

        // 1. Pulsing Outer Ring
        const pulse = 16 + (Math.sin(core.pulseTimer) + 1) * 6;
        ctx.strokeStyle = hexToRgba('#39FF14', 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, pulse, 0, Math.PI * 2);
        ctx.stroke();

        // 2. Rotating Glowing Green Hexagon (#39FF14)
        ctx.rotate(core.rotation);
        ctx.shadowColor = '#39FF14';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const hx = Math.cos(a) * core.radius;
          const hy = Math.sin(a) * core.radius;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        ctx.fillStyle = 'rgba(57, 255, 20, 0.25)';
        ctx.fill();

        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner glowing core dot
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      ctx.restore();
    }

    renderEmpWaves(ctx) {
      ctx.save();
      for (const wave of this.empWaves) {
        ctx.strokeStyle = hexToRgba('#39FF14', wave.alpha);
        ctx.lineWidth = 3;
        ctx.shadowColor = '#39FF14';
        ctx.shadowBlur = 14;

        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.currentRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
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

    // -------------------------------------------------------------
    // Top HUD Bar Rendering (y: 0 to 52)
    // -------------------------------------------------------------
    renderHUD(ctx) {
      ctx.save();

      // Translucent Cyber Bar Background
      ctx.fillStyle = 'rgba(8, 12, 24, 0.92)';
      ctx.fillRect(0, 0, this.width, 52);

      // Glowing Neon Divider Line
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(0, 52);
      ctx.lineTo(this.width, 52);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 1. SCORE
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText('SCORE', 16, 20);

      const scoreStr = String(Math.floor(this.score)).padStart(6, '0');
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 6;
      ctx.fillText(scoreStr, 16, 38);
      ctx.shadowBlur = 0;

      // 2. TIME SURVIVED
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'center';
      ctx.fillText('TIME', 200, 20);

      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = '#00FFFF';
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 6;
      ctx.fillText(formatTime(this.timeSurvived), 200, 38);
      ctx.shadowBlur = 0;

      // 3. DANGER LEVEL
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'center';
      ctx.fillText('DANGER', 360, 20);

      ctx.font = '11px "Press Start 2P", monospace';
      const dangerColor = this.dangerLevel >= 7 ? '#FF0055' : (this.dangerLevel >= 4 ? '#FF8800' : '#39FF14');
      ctx.fillStyle = dangerColor;
      ctx.shadowColor = dangerColor;
      ctx.shadowBlur = 6;
      ctx.fillText(`LV.${String(this.dangerLevel).padStart(2, '0')}`, 360, 38);
      ctx.shadowBlur = 0;

      // 4. CORES COLLECTED
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'right';
      ctx.fillText('CORES', 584, 20);

      // Small green core icon + count
      ctx.fillStyle = '#39FF14';
      ctx.shadowColor = '#39FF14';
      ctx.shadowBlur = 6;
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillText(`◆ x${String(this.coresCollected).padStart(2, '0')}`, 584, 38);
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    renderGameOver(ctx) {
      ctx.save();

      // Dark translucent overlay
      ctx.fillStyle = 'rgba(5, 7, 15, 0.88)';
      ctx.fillRect(0, 52, this.width, this.height - 52);

      const cx = this.width / 2;
      const cy = this.height / 2;

      // Center Cyber Game Over Card
      ctx.fillStyle = '#0D1122';
      ctx.fillRect(cx - 200, cy - 140, 400, 280);

      ctx.strokeStyle = '#FF007F';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#FF007F';
      ctx.shadowBlur = 12;
      ctx.strokeRect(cx - 200, cy - 140, 400, 280);

      this.drawCornerBrackets(ctx, cx - 200, cy - 140, 400, 280, '#00FFFF');

      ctx.font = '18px "Press Start 2P", monospace';
      ctx.fillStyle = '#FF007F';
      ctx.textAlign = 'center';
      ctx.fillText('CRITICAL IMPACT', cx, cy - 90);

      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#00FFFF';
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 6;
      ctx.fillText('SURVIVAL FAILED', cx, cy - 55);

      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`FINAL SCORE: ${Math.floor(this.score).toLocaleString()}`, cx, cy - 10);

      ctx.fillStyle = '#00FFFF';
      ctx.fillText(`TIME SURVIVED: ${formatTime(this.timeSurvived)}`, cx, cy + 20);

      ctx.fillStyle = '#39FF14';
      ctx.fillText(`ENERGY CORES: ${this.coresCollected}`, cx, cy + 50);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('ENTER INITIALS TO SAVE RECORD', cx, cy + 95);

      ctx.restore();
    }
  }

  // Export to global window object
  if (typeof window !== 'undefined') {
    window.CyberDodge = CyberDodge;
  }

  // Export for module systems if present
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CyberDodge;
  }
})();
