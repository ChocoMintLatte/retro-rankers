/**
 * ============================================================================
 * RETRO RANKERS - PIXEL STACK (js/games/stack.js)
 * High-Precision Tower Stacking Game in Patch Pastel Pixel-Art Aesthetic
 * ============================================================================
 * 
 * Strict Specification Compliance:
 * - 600x750 Canvas Layout:
 *   - Top HUD bar: SCORE (6-digit zero-padded), FLOOR (00F), COMBO (x0), BLOCK WIDTH bar
 *   - Smooth dynamic camera tracking active placement zone (y: 380..440)
 *   - Background sky transition: Slate-Navy (#18243E) -> Indigo (#25365C) -> Deep Cosmos (#111A2E)
 *   - Scrolling background stars, pixel clouds, celestial moon, and height ruler markers (10F, 20F, 30F...)
 * - Core Stack Mechanics:
 *   - Base block at bottom: width = 240, height = 28, centered at x = 300, y = 650
 *   - Sliding block speed: 220 + Math.min(this.floor * 11, 320) px/s
 *   - Drop triggers: Space, ArrowDown, KeyS, Enter, or Canvas Touch / Click
 *   - Case 1: Complete Miss (overlap <= 0):
 *       Active block tumbles down as falling piece; triggers triggerGameOver()
 *       Calls callbacks.onGameOver(score, { gameId: 'stack', stage: `${floor}F`, floor, maxCombo })
 *   - Case 2: PERFECT Drop (|active.x - top.x| <= 5):
 *       Snaps active.x = top.x with NO width loss!
 *       combo++, maxCombo update
 *       Score: 1200 + floor * 150 + combo * 350 pts
 *       Sound: playPowerUp(), pastel shockwave flash, floating text "PERFECT x{combo}!"
 *       Combo Width Recovery: If combo >= 3 and width < 240, widens by +14px (max 240) + "SIZE UP! +14px"
 *   - Case 3: Normal Hit / Slice (overlap > 0):
 *       combo = 0; trims placed block to overlapping segment (newX, newWidth = overlap)
 *       Spawns cut-off piece with gravity, horizontal impulse & rotation into fallingPieces
 *       Score: 500 + floor * 80 pts; sound: playRotate() or playScore()
 * - Export: window.PixelStack = PixelStack;
 */

(function (window) {
  'use strict';

  // Patch Pastel Color Palette (7 Cycling Colors)
  const PASTEL_PALETTE = [
    '#6EC6E6', // Pastel Sky-Blue
    '#7BE092', // Pastel Mint-Green
    '#F4C552', // Mustard Gold
    '#F7A072', // Warm Peach / Apricot
    '#F2546D', // Patch Rose-Red
    '#B388EB', // Pastel Lavender
    '#5C85D6'  // Soft Royal-Blue
  ];

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

  // Helper: Parse Hex to RGB object
  function parseHex(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  // Helper: Linear interpolation between two hex colors
  function lerpColor(hexA, hexB, t) {
    t = Math.max(0, Math.min(1, t));
    const cA = parseHex(hexA);
    const cB = parseHex(hexB);
    const r = Math.round(cA.r + (cB.r - cA.r) * t);
    const g = Math.round(cA.g + (cB.g - cA.g) * t);
    const b = Math.round(cA.b + (cB.b - cA.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  class PixelStack {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} callbacks
     *   callbacks.onScoreChange(score)
     *   callbacks.onGameOver(finalScore, gameLog)
     *   callbacks.sound
     */
    constructor(canvas, callbacks = {}) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.callbacks = callbacks || {};

      // Canvas Dimensions
      this.width = canvas ? canvas.width : 600;
      this.height = canvas ? canvas.height : 750;

      // Palette
      this.palette = PASTEL_PALETTE;

      // Base Block Dimensions
      this.baseWidth = 240;
      this.blockHeight = 28;
      this.baseX = 300;
      this.baseY = 650;

      // Game States
      this.floor = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.running = false;
      this.gameOver = false;

      // Camera Tracking
      this.cameraY = 0;
      this.targetCameraY = 0;

      // Blocks & Physics
      this.stack = [];
      this.activeBlock = null;
      this.fallingPieces = [];

      // Visual Effects
      this.shockwaves = [];
      this.particles = [];
      this.floatingTexts = [];
      this.screenShake = 0;

      // Background Scenery
      this.stars = [];
      this.clouds = [];
      this._initBackgroundEntities();

      // Bind Pointer & Touch Inputs
      this._bindInputs();

      // Initialize
      this.reset();
    }

    // -------------------------------------------------------------
    // Sound Playback Wrapper
    // -------------------------------------------------------------
    playSound(soundMethodName) {
      try {
        const sound = this.callbacks?.sound || window.sound || window.soundManager;
        if (sound && typeof sound[soundMethodName] === 'function') {
          sound[soundMethodName]();
        }
      } catch (e) {
        // Safe fail
      }
    }

    // -------------------------------------------------------------
    // Input Handling
    // -------------------------------------------------------------
    _bindInputs() {
      this._onCanvasPointerDown = (e) => {
        if (!this.running || this.gameOver) return;
        if (e.cancelable && e.type !== 'touchstart') {
          e.preventDefault();
        }
        this.placeBlock();
      };

      if (this.canvas) {
        this.canvas.addEventListener('mousedown', this._onCanvasPointerDown);
        this.canvas.addEventListener('touchstart', this._onCanvasPointerDown, { passive: true });
      }
    }

    handleKeyDown(e) {
      if (!this.running || this.gameOver) return;
      const key = e.key;
      const code = e.code;

      if (
        code === 'Space' ||
        code === 'ArrowDown' ||
        code === 'KeyS' ||
        code === 'Enter' ||
        key === ' ' ||
        key === 'ArrowDown' ||
        key === 's' ||
        key === 'S' ||
        key === 'Enter'
      ) {
        if (e.preventDefault) e.preventDefault();
        this.placeBlock();
      }
    }

    handleKeyUp(e) {
      // Satisfies standard platform contract interface
    }

    // -------------------------------------------------------------
    // Background Scenery Initialization
    // -------------------------------------------------------------
    _initBackgroundEntities() {
      // 1. Stars (Deep Cosmos / High Altitude Sky)
      this.stars = [];
      const starColors = ['#F8FAFC', '#6EC6E6', '#F4C552', '#B388EB', '#7BE092'];
      for (let i = 0; i < 65; i++) {
        this.stars.push({
          x: Math.random() * this.width,
          baseY: Math.random() * this.height,
          size: Math.random() * 2 + 1,
          twinkleSpeed: Math.random() * 2.5 + 1.2,
          phase: Math.random() * Math.PI * 2,
          color: starColors[i % starColors.length],
          parallax: 0.15 + Math.random() * 0.25
        });
      }

      // 2. Pixel Clouds (Low Altitude / Lower Floors)
      this.clouds = [];
      for (let i = 0; i < 6; i++) {
        this.clouds.push({
          x: Math.random() * (this.width + 120) - 60,
          y: 120 + Math.random() * 320,
          width: 70 + Math.random() * 80,
          height: 18 + Math.random() * 14,
          speed: 8 + Math.random() * 14,
          alpha: 0.12 + Math.random() * 0.16
        });
      }
    }

    // -------------------------------------------------------------
    // Lifecycle Methods
    // -------------------------------------------------------------
    reset() {
      this.floor = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.running = false;
      this.gameOver = false;

      this.cameraY = 0;
      this.targetCameraY = 0;
      this.screenShake = 0;

      // Base Foundation Block at bottom
      this.stack = [
        {
          x: this.baseX,
          y: this.baseY,
          width: this.baseWidth,
          height: this.blockHeight,
          color: this.palette[0]
        }
      ];

      this.activeBlock = null;
      this.fallingPieces = [];
      this.shockwaves = [];
      this.particles = [];
      this.floatingTexts = [];
    }

    start() {
      this.reset();
      this.running = true;
      this.gameOver = false;
      this.callbacks?.onScoreChange?.(0);

      // Spawn initial sliding block for Floor 1
      this.spawnNextBlock();
    }

    stop() {
      this.running = false;
    }

    destroy() {
      this.stop();
      if (this.canvas && this._onCanvasPointerDown) {
        this.canvas.removeEventListener('mousedown', this._onCanvasPointerDown);
        this.canvas.removeEventListener('touchstart', this._onCanvasPointerDown);
      }
    }

    // -------------------------------------------------------------
    // Sliding Block Spawner
    // -------------------------------------------------------------
    spawnNextBlock() {
      const top = this.stack[this.stack.length - 1];
      const targetFloor = this.floor + 1;
      const targetY = top.y - this.blockHeight;
      const width = top.width;

      // Speed scales up smoothly with floor
      const speed = 220 + Math.min(this.floor * 11, 320);

      // Color cycles through the 7-color Patch Pastel Palette
      const color = this.palette[targetFloor % this.palette.length];

      // Alternate sliding start direction
      const startsFromLeft = targetFloor % 2 === 1;

      // Ensure block can slide fully past top block on both sides
      const minX = Math.max(25, top.x - top.width / 2 - width / 2 - 45);
      const maxX = Math.min(575, top.x + top.width / 2 + width / 2 + 45);

      const startX = startsFromLeft ? minX : maxX;
      const direction = startsFromLeft ? 1 : -1;

      this.activeBlock = {
        x: startX,
        y: targetY,
        width: width,
        height: this.blockHeight,
        speed: speed,
        direction: direction,
        minX: minX,
        maxX: maxX,
        color: color
      };
    }

    // -------------------------------------------------------------
    // Block Drop & Overlap Resolution
    // -------------------------------------------------------------
    placeBlock() {
      if (!this.running || this.gameOver || !this.activeBlock) return;

      const active = this.activeBlock;
      const top = this.stack[this.stack.length - 1];

      // Horizontal boundaries
      const activeLeft = active.x - active.width / 2;
      const activeRight = active.x + active.width / 2;
      const topLeft = top.x - top.width / 2;
      const topRight = top.x + top.width / 2;

      // Overlap Calculation
      const overlapLeft = Math.max(activeLeft, topLeft);
      const overlapRight = Math.min(activeRight, topRight);
      const overlap = overlapRight - overlapLeft;

      // -----------------------------------------------------------
      // CASE 1: COMPLETE MISS (overlap <= 0)
      // -----------------------------------------------------------
      if (overlap <= 0) {
        // Active block tumbles down off the tower as a falling piece
        this.fallingPieces.push({
          x: active.x,
          y: active.y,
          width: active.width,
          height: active.height,
          color: active.color,
          vx: active.direction * (active.speed * 0.35),
          vy: 20,
          gravity: 1250,
          rotation: 0,
          vRot: active.direction * 3.6,
          alpha: 1.0
        });

        this.activeBlock = null;
        this.triggerGameOver();
        return;
      }

      // -----------------------------------------------------------
      // CASE 2: PERFECT DROP (Math.abs(active.x - top.x) <= 5)
      // -----------------------------------------------------------
      if (Math.abs(active.x - top.x) <= 5) {
        // Snap active.x = top.x with NO width loss
        const snappedX = top.x;
        let finalWidth = active.width;

        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);

        // Score award: 1200 + floor * 150 + combo * 350
        const pts = 1200 + this.floor * 150 + this.combo * 350;
        this.score += pts;
        this.callbacks?.onScoreChange?.(Math.floor(this.score));

        // Audio
        this.playSound('playPowerUp');

        // Pastel Shockwave Flash around snapped block
        this.shockwaves.push({
          x: snappedX,
          y: active.y,
          width: active.width,
          height: active.height,
          radius: 4,
          maxRadius: 85,
          color: active.color,
          alpha: 1.0
        });

        // Radiating Sparkle Particles
        this.spawnSparkles(snappedX, active.y, active.color, 16);

        // Floating Text: "PERFECT x{combo}!"
        this.spawnFloatingText(
          `PERFECT x${this.combo}!`,
          snappedX,
          active.y - 18,
          '#F4C552',
          1.25
        );

        // Combo Width Recovery: If combo >= 3 and active.width < 240, widens by +14px
        if (this.combo >= 3 && finalWidth < 240) {
          finalWidth = Math.min(240, finalWidth + 14);
          this.spawnFloatingText(
            'SIZE UP! +14px',
            snappedX,
            active.y - 42,
            '#7BE092',
            1.05
          );
          this.spawnSparkles(snappedX, active.y, '#7BE092', 12);
        }

        // Screen Shake
        this.triggerShake(3.5);

        // Commit placed block to stack
        this.stack.push({
          x: snappedX,
          y: active.y,
          width: finalWidth,
          height: active.height,
          color: active.color
        });

        this.floor++;
        this._updateCameraTarget();
        this.spawnNextBlock();
        return;
      }

      // -----------------------------------------------------------
      // CASE 3: NORMAL HIT / SLICE (overlap > 0)
      // -----------------------------------------------------------
      this.combo = 0;

      const newWidth = overlap;
      const newX = (overlapLeft + overlapRight) / 2;
      const cutWidth = active.width - overlap;

      // Determine slice side & cut-off piece physics
      let cutX = 0;
      let vx = 0;
      let vRot = 0;

      if (active.x < top.x) {
        // Active block overhung on the left side
        cutX = activeLeft + cutWidth / 2;
        vx = -Math.abs(active.speed * 0.42) - 40;
        vRot = -3.2;
      } else {
        // Active block overhung on the right side
        cutX = activeRight - cutWidth / 2;
        vx = Math.abs(active.speed * 0.42) + 40;
        vRot = 3.2;
      }

      // Overhanging cut-off piece slices and falls away
      this.fallingPieces.push({
        x: cutX,
        y: active.y,
        width: cutWidth,
        height: active.height,
        color: active.color,
        vx: vx,
        vy: -30, // slight upward pop before gravity takes over
        gravity: 1280,
        rotation: 0,
        vRot: vRot,
        alpha: 1.0
      });

      // Slice edge sparkles
      const cutEdgeX = (active.x < top.x) ? overlapLeft : overlapRight;
      this.spawnSparkles(cutEdgeX, active.y, active.color, 8);

      // Score award: 500 + floor * 80
      const pts = 500 + this.floor * 80;
      this.score += pts;
      this.callbacks?.onScoreChange?.(Math.floor(this.score));

      // Audio: crisp tick/slice chime
      this.playSound('playRotate');

      // Floating score indicator
      this.spawnFloatingText(`+${pts}`, newX, active.y - 16, '#6EC6E6', 0.95);

      // Subtle slice shake
      this.triggerShake(2.0);

      // Commit trimmed block to stack
      this.stack.push({
        x: newX,
        y: active.y,
        width: newWidth,
        height: active.height,
        color: active.color
      });

      this.floor++;
      this._updateCameraTarget();
      this.spawnNextBlock();
    }

    // -------------------------------------------------------------
    // Camera Target Calculation
    // -------------------------------------------------------------
    _updateCameraTarget() {
      // Once stack exceeds 8 blocks, scroll upward so active placement zone stays at y = 380..440
      const top = this.stack[this.stack.length - 1];
      const nextActiveWorldY = top.y - this.blockHeight;

      // Keep next active placement line comfortable around screen y = 410
      const targetScreenY = 410;
      if (nextActiveWorldY < targetScreenY) {
        this.targetCameraY = targetScreenY - nextActiveWorldY;
      } else {
        this.targetCameraY = 0;
      }
    }

    // -------------------------------------------------------------
    // Game Over Handler
    // -------------------------------------------------------------
    triggerGameOver() {
      if (this.gameOver) return;
      this.gameOver = true;
      this.running = false;

      // Dramatic impact shake & sound
      this.triggerShake(12.0);
      this.playSound('playGameOver');

      const finalScore = Math.floor(this.score);
      const gameLog = {
        gameId: 'stack',
        stage: `${this.floor}F`,
        floor: this.floor,
        maxCombo: this.maxCombo
      };

      // Notify parent platform callback
      if (typeof this.callbacks?.onGameOver === 'function') {
        this.callbacks.onGameOver(finalScore, gameLog);
      }
    }

    // -------------------------------------------------------------
    // Particle & Effect Spawners
    // -------------------------------------------------------------
    triggerShake(amount) {
      this.screenShake = Math.max(this.screenShake, amount);
    }

    spawnSparkles(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 140;
        this.particles.push({
          x: x + (Math.random() - 0.5) * 16,
          y: y + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          color: color,
          size: 2 + Math.random() * 2.5,
          alpha: 1.0,
          decay: 1.8 + Math.random() * 1.5
        });
      }
    }

    spawnFloatingText(text, x, y, color = '#F4C552', scale = 1.0) {
      this.floatingTexts.push({
        text: text,
        x: x,
        y: y,
        vy: -55,
        alpha: 1.0,
        color: color,
        scale: scale
      });
    }

    // -------------------------------------------------------------
    // Main Game Loop: Update (dt in seconds)
    // -------------------------------------------------------------
    update(dt) {
      // Clamp dt to prevent teleportation after tab suspension
      dt = Math.min(Math.max(dt, 0), 0.1);

      // 1. Sliding Block Motion
      if (this.activeBlock && !this.gameOver) {
        const ab = this.activeBlock;
        ab.x += ab.direction * ab.speed * dt;

        // Turnaround limits
        if (ab.direction > 0 && ab.x >= ab.maxX) {
          ab.x = ab.maxX;
          ab.direction = -1;
        } else if (ab.direction < 0 && ab.x <= ab.minX) {
          ab.x = ab.minX;
          ab.direction = 1;
        }
      }

      // 2. Smooth Camera Interpolation
      this.cameraY += (this.targetCameraY - this.cameraY) * Math.min(1, dt * 7.5);

      // 3. Falling Slices / Missed Blocks Physics
      for (let i = this.fallingPieces.length - 1; i >= 0; i--) {
        const p = this.fallingPieces[i];
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.vRot * dt;

        // Remove pieces fallen well below view
        if (p.y + this.cameraY > this.height + 150) {
          this.fallingPieces.splice(i, 1);
        }
      }

      // 4. Shockwaves
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.radius += dt * 210;
        sw.alpha -= dt * 2.4;
        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
          this.shockwaves.splice(i, 1);
        }
      }

      // 5. Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.alpha -= dt * 0.95;
        if (ft.alpha <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }

      // 6. Sparkle Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.alpha -= dt * pt.decay;
        if (pt.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // 7. Background Clouds Drift
      for (const c of this.clouds) {
        c.x += c.speed * dt;
        if (c.x > this.width + 100) {
          c.x = -c.width - 20;
          c.y = 100 + Math.random() * 320;
        }
      }

      // 8. Screen Shake Decay
      if (this.screenShake > 0) {
        this.screenShake *= Math.pow(0.06, dt);
        if (this.screenShake < 0.15) this.screenShake = 0;
      }
    }

    // -------------------------------------------------------------
    // Main Game Loop: Render
    // -------------------------------------------------------------
    render(ctx) {
      if (!ctx && !this.ctx) return;
      ctx = ctx || this.ctx;

      ctx.save();

      // Apply Screen Shake
      if (this.screenShake > 0) {
        const sx = (Math.random() - 0.5) * this.screenShake * 2;
        const sy = (Math.random() - 0.5) * this.screenShake * 2;
        ctx.translate(sx, sy);
      }

      // 1. Dynamic Background Sky
      this._renderSky(ctx);

      // 2. Stars & Moon / High Altitude Celestial
      this._renderCelestials(ctx);

      // 3. Low Altitude Pixel Clouds
      this._renderClouds(ctx);

      // 4. Height Ruler Markers (10F, 20F, 30F...)
      this._renderHeightRuler(ctx);

      // 5. Foundation Base Pedestal
      this._renderBasePedestal(ctx);

      // 6. Placed Blocks Tower
      this._renderStack(ctx);

      // 7. Active Sliding Block
      this._renderActiveBlock(ctx);

      // 8. Falling Slices / Missed Blocks
      this._renderFallingPieces(ctx);

      // 9. Shockwaves & Sparkles
      this._renderEffects(ctx);

      // 10. Floating Score & Combo Texts
      this._renderFloatingTexts(ctx);

      ctx.restore();

      // 11. Top HUD Bar (Rendered in screen-space, unaffected by camera & shake)
      this._renderTopHUD(ctx);
    }

    // -------------------------------------------------------------
    // Rendering Sub-Routines
    // -------------------------------------------------------------

    /**
     * Smooth background sky color transitions based on current floor:
     * Slate-Navy (#18243E) -> Indigo (#25365C) -> Deep Cosmos (#111A2E)
     */
    _renderSky(ctx) {
      const progress = Math.min(1.0, this.floor / 55);

      let topColor, botColor;
      if (progress < 0.5) {
        const t = progress * 2; // 0..1
        topColor = lerpColor('#18243E', '#202E4F', t);
        botColor = lerpColor('#25365C', '#1B2742', t);
      } else {
        const t = (progress - 0.5) * 2; // 0..1
        topColor = lerpColor('#202E4F', '#111A2E', t);
        botColor = lerpColor('#1B2742', '#0A0F1D', t);
      }

      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, botColor);

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Stars with camera parallax & Twinkling + Pixel Moon
     */
    _renderCelestials(ctx) {
      const t = performance.now() * 0.001;

      // Stars
      for (const s of this.stars) {
        // Parallax scroll relative to camera
        const sy = (s.baseY + this.cameraY * s.parallax) % this.height;
        const brightness = 0.35 + 0.65 * Math.sin(t * s.twinkleSpeed + s.phase);

        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.max(0.15, brightness * 0.85);
        ctx.fillRect(s.x, sy, s.size, s.size);
      }
      ctx.globalAlpha = 1.0;

      // Celestial Pixel Moon appears as player rises (floors 15+)
      if (this.floor >= 12) {
        const moonProgress = Math.min(1.0, (this.floor - 12) / 30);
        const moonY = 160 - moonProgress * 70;
        const moonX = 490;
        const moonRadius = 24;

        ctx.save();
        // Soft outer glow
        const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 55);
        moonGlow.addColorStop(0, 'rgba(244, 197, 82, 0.28)');
        moonGlow.addColorStop(0.6, 'rgba(110, 198, 230, 0.12)');
        moonGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = moonGlow;
        ctx.fillRect(moonX - 60, moonY - 60, 120, 120);

        // Crescent Pixel Moon Body
        ctx.fillStyle = '#F4C552';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
        ctx.fill();

        // Shadow cutout to create crescent
        ctx.fillStyle = '#18243E';
        ctx.beginPath();
        ctx.arc(moonX - 9, moonY - 6, moonRadius - 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    /**
     * Fluffy horizontal pixel clouds (visible primarily in lower/mid altitudes)
     */
    _renderClouds(ctx) {
      ctx.save();
      for (const c of this.clouds) {
        const cy = c.y + this.cameraY * 0.45;
        // Fade out as camera goes high into deep space
        const altitudeFade = Math.max(0, 1.0 - (this.cameraY / 1400));
        const alpha = c.alpha * altitudeFade;

        if (cy < -60 || cy > this.height + 40 || alpha <= 0.02) continue;

        ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
        // Pixel cloud clustered rects
        const w = c.width;
        const h = c.height;
        ctx.fillRect(c.x, cy, w, h);
        ctx.fillRect(c.x + 8, cy - 6, w - 24, h + 10);
        ctx.fillRect(c.x + 22, cy - 10, w - 46, h + 14);
      }
      ctx.restore();
    }

    /**
     * Height Ruler Markers on left/right borders (10F, 20F, 30F...)
     */
    _renderHeightRuler(ctx) {
      ctx.save();

      // Topmost potential floor in view
      const topFloorInView = Math.ceil((this.baseY + this.cameraY) / this.blockHeight) + 4;
      const startFloor = Math.max(5, Math.floor((this.cameraY - 200) / this.blockHeight));

      for (let f = 5; f <= topFloorInView; f += 5) {
        const worldY = this.baseY - f * this.blockHeight;
        const screenY = worldY + this.cameraY;

        // Only draw markers in visible play zone
        if (screenY < 65 || screenY > this.height - 30) continue;

        const isDecade = f % 10 === 0;

        // Faint horizontal dotted guide line across screen for decades
        if (isDecade) {
          ctx.save();
          ctx.setLineDash([3, 7]);
          ctx.strokeStyle = 'rgba(110, 198, 230, 0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(42, screenY);
          ctx.lineTo(this.width - 42, screenY);
          ctx.stroke();
          ctx.restore();
        }

        // Left & Right border tick marks
        const tickLength = isDecade ? 22 : 12;
        ctx.strokeStyle = isDecade ? '#6EC6E6' : 'rgba(110, 198, 230, 0.4)';
        ctx.lineWidth = isDecade ? 2 : 1;

        // Left tick
        ctx.beginPath();
        ctx.moveTo(12, screenY);
        ctx.lineTo(12 + tickLength, screenY);
        ctx.stroke();

        // Right tick
        ctx.beginPath();
        ctx.moveTo(this.width - 12, screenY);
        ctx.lineTo(this.width - 12 - tickLength, screenY);
        ctx.stroke();

        // Label for decade floors (10F, 20F, 30F...)
        if (isDecade) {
          ctx.font = '8px "Press Start 2P", monospace';
          ctx.fillStyle = '#6EC6E6';
          ctx.textAlign = 'left';
          ctx.fillText(`${f}F`, 38, screenY + 3);

          ctx.textAlign = 'right';
          ctx.fillText(`${f}F`, this.width - 38, screenY + 3);
        }
      }

      ctx.restore();
    }

    /**
     * Sturdy Arcade Pedestal / Foundation beneath the base block
     */
    _renderBasePedestal(ctx) {
      const pedestalTopY = this.baseY + this.blockHeight / 2 + this.cameraY;
      if (pedestalTopY > this.height) return;

      const pedWidth = 320;
      const pedLeft = (this.width - pedWidth) / 2;
      const pedHeight = Math.max(10, this.height - pedestalTopY);

      ctx.save();

      // Pedestal body
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(pedLeft, pedestalTopY, pedWidth, pedHeight);

      // Top highlighted bevel border
      ctx.fillStyle = '#334155';
      ctx.fillRect(pedLeft, pedestalTopY, pedWidth, 4);

      // Crisp arcade grid details & rivets
      ctx.strokeStyle = '#2A3A5E';
      ctx.lineWidth = 1;
      for (let x = pedLeft + 20; x < pedLeft + pedWidth; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, pedestalTopY);
        ctx.lineTo(x, pedestalTopY + pedHeight);
        ctx.stroke();

        // Metal rivet head
        ctx.fillStyle = '#64748B';
        ctx.fillRect(x - 2, pedestalTopY + 8, 4, 4);
      }

      // Base Platform Caution Decal / Strip
      ctx.fillStyle = '#F4C552';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      if (pedestalTopY + 24 < this.height) {
        ctx.fillText('◄ FOUNDATION BASE: 00F ►', this.width / 2, pedestalTopY + 24);
      }

      ctx.restore();
    }

    /**
     * Renders a single pixel-art block with crisp 3D beveled highlights
     */
    _drawBeveledBlock(ctx, bx, by, bw, bh, color, isPulse = false) {
      // 1. Base Fill
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, bw, bh);

      // 2. Crisp Top Highlight Bevel (Light reflection)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillRect(bx, by + 3, 3, bh - 3);

      // 3. Crisp Bottom & Right Dark Bevel (Cast shadow)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
      ctx.fillRect(bx, by + bh - 3, bw, 3);
      ctx.fillRect(bx + bw - 3, by, 3, bh - 3);

      // 4. Subtle Inner Pixel Core Border
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

      // 5. Active block subtle pulse highlight
      if (isPulse) {
        const pulseAlpha = 0.2 + 0.2 * Math.sin(performance.now() * 0.008);
        ctx.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
        ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
      }
    }

    /**
     * Stacked blocks rendering
     */
    _renderStack(ctx) {
      for (let i = 0; i < this.stack.length; i++) {
        const b = this.stack[i];
        const screenY = b.y - b.height / 2 + this.cameraY;

        // Frustum culling
        if (screenY + b.height < 55 || screenY > this.height + 40) continue;

        const bx = Math.round(b.x - b.width / 2);
        const by = Math.round(screenY);
        const bw = Math.round(b.width);
        const bh = Math.round(b.height);

        this._drawBeveledBlock(ctx, bx, by, bw, bh, b.color, false);
      }
    }

    /**
     * Active horizontal sliding block
     */
    _renderActiveBlock(ctx) {
      if (!this.activeBlock || this.gameOver) return;

      const ab = this.activeBlock;
      const screenY = ab.y - ab.height / 2 + this.cameraY;

      const bx = Math.round(ab.x - ab.width / 2);
      const by = Math.round(screenY);
      const bw = Math.round(ab.width);
      const bh = Math.round(ab.height);

      ctx.save();

      // Soft neon glow around active piece
      ctx.shadowColor = ab.color;
      ctx.shadowBlur = 5;

      this._drawBeveledBlock(ctx, bx, by, bw, bh, ab.color, true);

      // Subtle direction motion indicators on sides
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      if (ab.direction > 0) {
        ctx.fillText('▶', bx + bw - 6, by + bh / 2 + 3);
      } else {
        ctx.fillText('◀', bx + 6, by + bh / 2 + 3);
      }

      ctx.restore();
    }

    /**
     * Falling Slices & Missed pieces with gravity and 2D rotation
     */
    _renderFallingPieces(ctx) {
      for (const p of this.fallingPieces) {
        const screenY = p.y + this.cameraY;
        if (screenY > this.height + 150) continue;

        ctx.save();
        ctx.translate(p.x, screenY);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.alpha);

        const pw = Math.round(p.width);
        const ph = Math.round(p.height);
        const hx = -pw / 2;
        const hy = -ph / 2;

        // Base
        ctx.fillStyle = p.color;
        ctx.fillRect(hx, hy, pw, ph);

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(hx, hy, pw, 3);
        ctx.fillRect(hx, hy + 3, 3, ph - 3);

        // Shadow
        ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.fillRect(hx, hy + ph - 3, pw, 3);
        ctx.fillRect(hx + pw - 3, hy, 3, ph - 3);

        // Border
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx + 0.5, hy + 0.5, pw - 1, ph - 1);

        ctx.restore();
      }
    }

    /**
     * Visual Shockwaves & Sparkles
     */
    _renderEffects(ctx) {
      // 1. Expanding Shockwaves on PERFECT hits
      for (const sw of this.shockwaves) {
        const screenY = sw.y + this.cameraY;
        ctx.save();
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = Math.max(0, sw.alpha);

        const exp = sw.radius;
        const sx = sw.x - sw.width / 2 - exp;
        const sy = screenY - sw.height / 2 - exp;
        const swWidth = sw.width + exp * 2;
        const swHeight = sw.height + exp * 2;

        ctx.strokeRect(sx, sy, swWidth, swHeight);
        ctx.restore();
      }

      // 2. Sparkle Particles
      for (const pt of this.particles) {
        const py = pt.y + this.cameraY;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillRect(pt.x, py, pt.size, pt.size);
      }
      ctx.globalAlpha = 1.0;
    }

    /**
     * Floating Score & Combo Texts
     */
    _renderFloatingTexts(ctx) {
      for (const ft of this.floatingTexts) {
        const py = ft.y + this.cameraY;
        ctx.save();
        ctx.font = `bold ${Math.round(10 * ft.scale)}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.max(0, ft.alpha);

        // Crisp dark outline shadow
        ctx.fillStyle = '#0F172A';
        ctx.fillText(ft.text, ft.x + 2, py + 2);

        // Color text
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, py);

        ctx.restore();
      }
    }

    /**
     * Top Arcade HUD Bar:
     * SCORE (6-digit zero-padded), FLOOR (00F), COMBO (x0), BLOCK WIDTH bar
     */
    _renderTopHUD(ctx) {
      ctx.save();

      // Top HUD Bar Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(0, 0, this.width, 58);

      // Glowing Divider Line
      ctx.strokeStyle = '#2A3A5E';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 58);
      ctx.lineTo(this.width, 58);
      ctx.stroke();

      // 1. SCORE
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#8FA3C7';
      ctx.textAlign = 'left';
      ctx.fillText('SCORE', 20, 22);

      const scoreNum = Math.floor(this.score);
      const scoreStr = String(scoreNum).padStart(6, '0');
      const formattedScore = scoreStr.slice(0, 3) + ',' + scoreStr.slice(3);

      ctx.font = '13px "Press Start 2P", monospace';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(formattedScore, 20, 44);

      // 2. FLOOR
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#8FA3C7';
      ctx.fillText('FLOOR', 185, 22);

      const floorStr = `${String(this.floor).padStart(2, '0')}F`;
      ctx.font = '13px "Press Start 2P", monospace';
      ctx.fillStyle = '#6EC6E6';
      ctx.fillText(floorStr, 185, 44);

      // 3. COMBO
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#8FA3C7';
      ctx.fillText('COMBO', 290, 22);

      ctx.font = '13px "Press Start 2P", monospace';
      ctx.fillStyle = this.combo > 0 ? '#F2546D' : '#64748B';
      ctx.fillText(`x${this.combo}`, 290, 44);

      // 4. BLOCK WIDTH GAUGE
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#8FA3C7';
      ctx.fillText('WIDTH', 385, 22);

      const currentWidth = this.activeBlock
        ? Math.round(this.activeBlock.width)
        : (this.stack.length > 0 ? Math.round(this.stack[this.stack.length - 1].width) : 240);

      const barX = 385;
      const barY = 30;
      const barW = 195;
      const barH = 14;

      // Bar container
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // Fill width
      const fillRatio = Math.max(0, Math.min(1, currentWidth / 240));
      const fillWidth = (barW - 4) * fillRatio;

      let barColor = '#7BE092'; // Mint
      if (currentWidth < 90) {
        barColor = '#F2546D'; // Danger red
      } else if (currentWidth < 160) {
        barColor = '#F4C552'; // Mustard warning
      }

      if (fillWidth > 0) {
        ctx.fillStyle = barColor;
        ctx.fillRect(barX + 2, barY + 2, fillWidth, barH - 4);
      }

      // Numeric width display inside bar
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      ctx.fillText(`${currentWidth}px`, barX + barW - 6, barY + 11);

      ctx.restore();

      // Bottom Control Hint (Initial floors)
      if (this.floor <= 1 && !this.gameOver) {
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = `rgba(110, 198, 230, ${0.4 + pulse * 0.5})`;
        ctx.textAlign = 'center';
        ctx.fillText('PRESS [SPACE] OR CLICK TO DROP BLOCK', this.width / 2, this.height - 24);
        ctx.restore();
      }
    }
  }

  // Export to Global window object
  window.PixelStack = PixelStack;

})(typeof window !== 'undefined' ? window : this);
