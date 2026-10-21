/**
 * ============================================================================
 * RETRO RANKERS - RANKING & ANTI-CHEAT SERVICE (js/ranking.js)
 * Persistent LocalStorage Database (Key: 'RETRO_RANKERS_DB_V1')
 * Top 10 Hall of Fame, Anti-Cheat Verification, Session Hash & Live Feed
 * ============================================================================
 */

(function (window) {
  'use strict';

  const STORAGE_KEY = 'RETRO_RANKERS_DB_V1';

  class RankingService {
    constructor() {
      this.storageKey = STORAGE_KEY;
      this.supportedGames = ['tetris', 'dodge', 'mathRunner'];
      this.activeSession = null;
      this.db = this._loadOrInitDB();
    }

    /**
     * Format score as 6-digit zero-padded string with comma (e.g. 84500 -> '084,500')
     * @param {number|string} score
     * @returns {string}
     */
    static formatScore(score) {
      const num = Math.max(0, Math.floor(Number(score) || 0));
      if (num >= 1000000) {
        return num.toLocaleString('en-US');
      }
      const padded = String(num).padStart(6, '0');
      return padded.slice(0, 3) + ',' + padded.slice(3);
    }

    /**
     * Instance wrapper for formatScore
     */
    formatScore(score) {
      return RankingService.formatScore(score);
    }

    /**
     * Format current HH:MM string
     */
    _getTimeString() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }

    /**
     * Initial Seed Data for TOP 10 per game and Live Feed
     */
    _getSeedData() {
      const now = Date.now();
      return {
        version: 1,
        scores: {
          tetris: [
            { id: 'seed_t_01', initials: 'KJH', score: 84500, stage: 'LV.18', timestamp: now - 3600000 * 5 },
            { id: 'seed_t_02', initials: 'CS1', score: 72300, stage: 'LV.15', timestamp: now - 3600000 * 8 },
            { id: 'seed_t_03', initials: 'DEV', score: 65000, stage: 'LV.14', timestamp: now - 3600000 * 12 },
            { id: 'seed_t_04', initials: 'NEO', score: 58200, stage: 'LV.12', timestamp: now - 3600000 * 15 },
            { id: 'seed_t_05', initials: 'CYB', score: 51000, stage: 'LV.11', timestamp: now - 3600000 * 19 },
            { id: 'seed_t_06', initials: 'AAA', score: 45600, stage: 'LV.10', timestamp: now - 3600000 * 24 },
            { id: 'seed_t_07', initials: 'PXL', score: 39800, stage: 'LV.08', timestamp: now - 3600000 * 30 },
            { id: 'seed_t_08', initials: 'DOS', score: 33400, stage: 'LV.07', timestamp: now - 3600000 * 36 },
            { id: 'seed_t_09', initials: 'BOB', score: 26100, stage: 'LV.05', timestamp: now - 3600000 * 42 },
            { id: 'seed_t_10', initials: 'ACE', score: 18900, stage: 'LV.04', timestamp: now - 3600000 * 48 }
          ],
          dodge: [
            { id: 'seed_d_01', initials: 'FLY', score: 92000, stage: '65s', timestamp: now - 3600000 * 3 },
            { id: 'seed_d_02', initials: 'DOD', score: 79500, stage: '55s', timestamp: now - 3600000 * 6 },
            { id: 'seed_d_03', initials: 'SPD', score: 68000, stage: '48s', timestamp: now - 3600000 * 10 },
            { id: 'seed_d_04', initials: 'EMP', score: 59200, stage: '42s', timestamp: now - 3600000 * 14 },
            { id: 'seed_d_05', initials: 'ACE', score: 48100, stage: '36s', timestamp: now - 3600000 * 18 },
            { id: 'seed_d_06', initials: 'NEO', score: 41000, stage: '30s', timestamp: now - 3600000 * 22 },
            { id: 'seed_d_07', initials: 'RUN', score: 35500, stage: '26s', timestamp: now - 3600000 * 28 },
            { id: 'seed_d_08', initials: 'BOT', score: 27400, stage: '20s', timestamp: now - 3600000 * 34 },
            { id: 'seed_d_09', initials: 'PRO', score: 21000, stage: '16s', timestamp: now - 3600000 * 40 },
            { id: 'seed_d_10', initials: 'WIN', score: 14200, stage: '12s', timestamp: now - 3600000 * 46 }
          ],
          mathRunner: [
            { id: 'seed_m_01', initials: 'CAL', score: 95000, stage: 'G.45', timestamp: now - 3600000 * 2 },
            { id: 'seed_m_02', initials: 'NUM', score: 81200, stage: 'G.38', timestamp: now - 3600000 * 5 },
            { id: 'seed_m_03', initials: 'X2X', score: 71000, stage: 'G.33', timestamp: now - 3600000 * 9 },
            { id: 'seed_m_04', initials: 'SUB', score: 62500, stage: 'G.28', timestamp: now - 3600000 * 13 },
            { id: 'seed_m_05', initials: 'PLS', score: 53000, stage: 'G.24', timestamp: now - 3600000 * 17 },
            { id: 'seed_m_06', initials: 'CST', score: 44800, stage: 'G.20', timestamp: now - 3600000 * 21 },
            { id: 'seed_m_07', initials: 'RUN', score: 38200, stage: 'G.17', timestamp: now - 3600000 * 27 },
            { id: 'seed_m_08', initials: 'MATH', score: 31000, stage: 'G.14', timestamp: now - 3600000 * 33 },
            { id: 'seed_m_09', initials: 'INT', score: 24500, stage: 'G.11', timestamp: now - 3600000 * 39 },
            { id: 'seed_m_10', initials: 'ZERO', score: 16000, stage: 'G.08', timestamp: now - 3600000 * 45 }
          ]
        },
        feed: [
          { id: 'f_01', time: '12:45', msg: '[TETRIS] NEO님이 058,200점으로 4위 달성!', initials: 'NEO', score: 58200, gameId: 'tetris' },
          { id: 'f_02', time: '12:38', msg: '[DODGE] EMP님이 059,200점으로 4위 달성!', initials: 'EMP', score: 59200, gameId: 'dodge' },
          { id: 'f_03', time: '12:20', msg: '[SYSTEM] CSE FESTIVAL ARCADE BOOTH OPEN', initials: 'CSE', score: 0, gameId: 'system' }
        ]
      };
    }

    /**
     * Load DB from localStorage or seed initial data
     */
    _loadOrInitDB() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.scores && parsed.feed) {
            // Ensure all supported games exist
            for (const g of this.supportedGames) {
              if (!Array.isArray(parsed.scores[g])) {
                parsed.scores[g] = this._getSeedData().scores[g];
              }
            }
            return parsed;
          }
        }
      } catch (e) {
        console.warn('[RankingService] Failed to load localStorage DB, reseeding:', e);
      }

      // Seed initial dummy data
      const seed = this._getSeedData();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(seed));
      } catch (e) {
        console.warn('[RankingService] Failed to persist seed to localStorage:', e);
      }
      return seed;
    }

    /**
     * Save current DB state to localStorage
     */
    _saveToStorage() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.db));
      } catch (e) {
        console.error('[RankingService] Storage write error:', e);
      }
    }

    /**
     * Starts a new validated gaming session
     * @param {string} gameId
     * @returns {object} Session data with hash seed
     */
    startSession(gameId) {
      const startTime = Date.now();
      const seed = 's_' + Math.random().toString(36).substring(2, 10) + '_' + startTime.toString(36);
      const session = {
        sessionId: seed,
        gameId: gameId || 'tetris',
        startTime,
        seed,
        gameLog: {
          gameId: gameId || 'tetris',
          events: []
        }
      };

      this.activeSession = session;
      return session;
    }

    /**
     * Log an event in current session (e.g. core collected, line cleared, gate passed)
     */
    logEvent(eventType, eventData) {
      if (this.activeSession && this.activeSession.gameLog) {
        this.activeSession.gameLog.events.push({
          type: eventType,
          t: Date.now() - this.activeSession.startTime,
          data: eventData
        });
      }
    }

    /**
     * Anti-cheat validation: checks score boundaries and score-to-time ratio
     * @param {number} score
     * @param {number} durationMs
     * @param {object} [gameLog]
     * @returns {{ valid: boolean, reason: string }}
     */
    validateScore(score, durationMs, gameLog) {
      // 1. Basic Type & Range Check
      if (score === null || score === undefined || typeof score !== 'number' || isNaN(score)) {
        return { valid: false, reason: '유효하지 않은 점수 형식 (Invalid Score Type)' };
      }

      if (score < 0) {
        return { valid: false, reason: '음수 점수 감지 (Negative Score Detected)' };
      }

      if (score > 999999) {
        return { valid: false, reason: '점수 한계치(999,999) 초과 (Exceeded Max Score)' };
      }

      const durMs = Math.max(0, Number(durationMs) || 0);

      // 2. Impossible Speed Check (e.g., >3,000 pts in under 2 seconds)
      if (durMs < 2000 && score > 3000) {
        return { valid: false, reason: '비정상적인 초고속 득점 감지 (Instant High Score)' };
      }

      // 3. Score-to-Time Ratio Rate Limit Check
      // Generous threshold: 15,000 pts / sec allows extreme arcade combos but blocks memory-hacked 990,000 pts in 3s
      const durationSec = Math.max(durMs / 1000, 1);
      const maxAllowedPerSec = 15000;
      const rate = score / durationSec;

      if (rate > maxAllowedPerSec) {
        return { valid: false, reason: `초당 획득 점수 한도 초과 (${Math.round(rate)} pts/s)` };
      }

      return { valid: true, reason: 'VERIFIED' };
    }

    /**
     * Submit score, insert into Top 10 if qualifying, add live feed entry and persist
     * @param {string} gameId
     * @param {string} initials
     * @param {number} score
     * @param {number} durationMs
     * @param {object} [gameLog]
     * @param {string} [stage]
     * @returns {{ valid: boolean, rank: number|null, entryId: string|null, reason: string }}
     */
    submitScore(gameId, initials, score, durationMs, gameLog, stage) {
      const validation = this.validateScore(score, durationMs, gameLog);

      if (!validation.valid) {
        return {
          valid: false,
          rank: null,
          entryId: null,
          reason: validation.reason
        };
      }

      const validGameId = this.supportedGames.includes(gameId) ? gameId : 'tetris';

      // Clean 3-character uppercase initials
      const cleanInitials = String(initials || 'AAA')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, 'A')
        .slice(0, 3)
        .padEnd(3, 'A');

      const entryId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const newEntry = {
        id: entryId,
        initials: cleanInitials,
        score: Math.floor(score),
        stage: stage || 'CLEAR',
        timestamp: Date.now()
      };

      // Get current list and insert new score
      const currentList = this.getScores(validGameId);
      const combined = [...currentList, newEntry];
      combined.sort((a, b) => b.score - a.score);

      const rankIndex = combined.findIndex(e => e.id === entryId);
      const rank = rankIndex < 10 ? rankIndex + 1 : null;

      // Keep only top 10
      this.db.scores[validGameId] = combined.slice(0, 10);

      // Add Live Feed Ticker entry
      const gameLabels = {
        tetris: 'TETRIS',
        dodge: 'DODGE',
        mathRunner: 'MATH RUNNER'
      };
      const gameLabel = gameLabels[validGameId] || validGameId.toUpperCase();
      const rankText = rank ? `${rank}위` : '완주';
      const feedMsg = `[${gameLabel}] ${cleanInitials}님이 ${this.formatScore(score)}점으로 ${rankText} 달성!`;

      if (!Array.isArray(this.db.feed)) {
        this.db.feed = [];
      }

      this.db.feed.unshift({
        id: 'f_' + Date.now(),
        time: this._getTimeString(),
        msg: feedMsg,
        initials: cleanInitials,
        score,
        rank,
        gameId: validGameId
      });

      // Keep maximum 20 feed items
      this.db.feed = this.db.feed.slice(0, 20);

      // Save to localStorage
      this._saveToStorage();

      return {
        valid: true,
        rank,
        entryId,
        reason: validation.reason
      };
    }

    /**
     * Get TOP 10 scores array for a game
     * @param {string} gameId
     * @returns {Array<object>}
     */
    getScores(gameId) {
      const g = this.supportedGames.includes(gameId) ? gameId : 'tetris';
      return Array.isArray(this.db.scores[g]) ? this.db.scores[g] : [];
    }

    /**
     * Get highest score for a game
     * @param {string} gameId
     * @returns {number}
     */
    getHighScore(gameId) {
      const list = this.getScores(gameId);
      return list.length > 0 ? (list[0].score || 0) : 0;
    }

    /**
     * Get live feed entries array
     * @returns {Array<object>}
     */
    getFeed() {
      return Array.isArray(this.db.feed) ? this.db.feed : [];
    }

    /**
     * Resets database back to default seed data
     */
    resetToSeed() {
      this.db = this._getSeedData();
      this._saveToStorage();
      return this.db;
    }
  }

  // Export to global window object
  window.RankingService = RankingService;
  window.rankingService = new RankingService();

})(typeof window !== 'undefined' ? window : this);
