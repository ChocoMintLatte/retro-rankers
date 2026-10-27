/**
 * ============================================================================
 * RETRO RANKERS - RANKING & ANTI-CHEAT SERVICE (js/ranking.js)
 * Persistent LocalStorage Database (Key: 'RETRO_RANKERS_DB_V3')
 * Top 10 Hall of Fame, Anti-Cheat Verification, Session Hash & Live Feed
 * ============================================================================
 */

(function (window) {
  'use strict';

  const STORAGE_KEY = 'RETRO_RANKERS_DB_V3';

  // Check URL query param: ?db=https://...
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const urlDb = new URLSearchParams(window.location.search).get('db');
      if (urlDb && typeof localStorage !== 'undefined') {
        localStorage.setItem('RETRO_FIREBASE_URL', urlDb.trim());
      }
    } catch (e) {
      console.warn('[RankingService] Failed to parse URLSearchParams:', e);
    }
  }

  const CLOUD_CONFIG = {
    // Firebase Realtime Database URL만 입력하면 모든 PC에서 실시간으로 랭킹이 동기화됩니다.
    // 예: 'https://retro-rankers-default-rtdb.asia-southeast1.firebasedatabase.app'
    FIREBASE_DB_URL: (typeof localStorage !== 'undefined' ? localStorage.getItem('RETRO_FIREBASE_URL') : null)
      || 'https://retro-rankers-default-rtdb.firebaseio.com'
  };

  class RankingService {
    constructor() {
      this.storageKey = STORAGE_KEY;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('RETRO_RANKERS_DB_V1');
          localStorage.removeItem('RETRO_RANKERS_DB_V2');
        }
      } catch (e) {
        // ignore
      }
      this.supportedGames = ['tetris', 'dodge', 'mathRunner', 'stack', 'survivor'];
      this.activeSession = null;
      this.listeners = [];
      this._isPushing = false;
      this._hasInitialSynced = false;

      // Cloud Configuration & URL Normalization
      const rawUrl = (CLOUD_CONFIG.FIREBASE_DB_URL || '').trim();
      this.firebaseUrl = rawUrl ? rawUrl.replace(/\/+$/, '') : '';

      this.db = this._loadOrInitDB();

      // Real-time Cloud Synchronization (Poll every 4 seconds)
      if (this.firebaseUrl) {
        this._syncFromCloud();
        this.syncTimer = setInterval(() => {
          this._syncFromCloud();
        }, 4000);
      }
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
     * Initial Seed Data for TOP 10 per game and Live Feed (Clean V3: Empty records)
     */
    _getSeedData() {
      return {
        version: 3,
        scores: {
          tetris: [],
          dodge: [],
          mathRunner: [],
          stack: [],
          survivor: []
        },
        feed: []
      };
    }

    /**
     * Filters an array to keep only real player records (excluding any seed_ dummy records)
     * @param {Array} arr
     * @returns {Array}
     */
    _filterOutSeedEntries(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.filter(item => item && item.id && !String(item.id).startsWith('seed_'));
    }

    /**
     * Filters an array to exclude legacy dummy seed feed items
     * @param {Array} arr
     * @returns {Array}
     */
    _filterOutSeedFeed(arr) {
      if (!Array.isArray(arr)) return [];
      const legacySeedFeedIds = new Set(['f_01', 'f_02', 'f_03']);
      return arr.filter(item => item && item.id && !legacySeedFeedIds.has(item.id) && !String(item.id).startsWith('seed_'));
    }

    /**
     * Load DB from localStorage or seed initial data
     */
    _loadOrInitDB() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && parsed.version === 3) {
            if (!parsed.scores || typeof parsed.scores !== 'object') {
              parsed.scores = {};
            }
            // Ensure all supported games exist as clean arrays without dummy seeds
            for (const g of this.supportedGames) {
              const gameScores = Array.isArray(parsed.scores[g]) ? parsed.scores[g] : [];
              parsed.scores[g] = this._filterOutSeedEntries(gameScores);
            }
            parsed.feed = this._filterOutSeedFeed(Array.isArray(parsed.feed) ? parsed.feed : []);
            parsed.version = 3;
            return parsed;
          }
        }
      } catch (e) {
        console.warn('[RankingService] Failed to load localStorage DB, reseeding:', e);
      }

      // Seed initial empty DB (Version 3)
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
     * Register a callback to be notified when cloud sync updates rankings/feed
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    onSync(callback) {
      if (typeof callback === 'function') {
        this.listeners.push(callback);
      }
      return () => {
        this.listeners = this.listeners.filter(cb => cb !== callback);
      };
    }

    /**
     * Notify all registered sync listeners
     */
    _notifyListeners() {
      for (const listener of this.listeners) {
        try {
          listener(this.db);
        } catch (e) {
          console.error('[RankingService] Listener callback error:', e);
        }
      }
    }

    /**
     * Normalize arrays from Firebase (handles object-to-array conversion)
     */
    _normalizeArray(val) {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'object') return Object.values(val);
      return [];
    }

    /**
     * Fetch latest rankings and feed from Firebase Realtime Database
     */
    async _syncFromCloud() {
      if (!this.firebaseUrl || this._isPushing) return;

      try {
        const res = await fetch(`${this.firebaseUrl}/retro_rankers.json`);
        if (!res.ok) {
          console.warn('[RankingService] Cloud sync HTTP error:', res.status, res.statusText);
          return;
        }

        const data = await res.json();

        // 1. If cloud is empty or older version (< 3), reset remote and local to fresh version: 3
        if (data === null || (data && typeof data === 'object' && (data.version || 1) < 3)) {
          this.db = this._getSeedData();
          this._saveToStorage();
          this._notifyListeners();
          await fetch(`${this.firebaseUrl}/retro_rankers.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.db)
          });
          return;
        }

        // 2. When data is valid version: 3, normalize scores and feed
        if (data && typeof data === 'object' && data.version === 3) {
          const normalizedScores = {};

          for (const g of this.supportedGames) {
            const rawArr = this._normalizeArray(data.scores ? data.scores[g] : null);
            normalizedScores[g] = this._filterOutSeedEntries(rawArr);
          }

          const rawFeed = this._normalizeArray(data.feed);
          const filteredFeed = this._filterOutSeedFeed(rawFeed);

          const newDb = {
            version: 3,
            scores: normalizedScores,
            feed: filteredFeed
          };

          const oldJson = JSON.stringify(this.db);
          const newJson = JSON.stringify(newDb);

          if (oldJson !== newJson || !this._hasInitialSynced) {
            this._hasInitialSynced = true;
            this.db = newDb;
            this._saveToStorage();
            this._notifyListeners();
          }
        }
      } catch (e) {
        console.warn('[RankingService] Cloud sync error:', e);
      }
    }

    /**
     * Asynchronously push score to cloud with safe concurrent merge
     * @param {string} validGameId
     * @param {object} newEntry
     * @param {object} newFeedItem
     */
    async _pushScoreToCloud(validGameId, newEntry, newFeedItem) {
      if (!this.firebaseUrl) return;

      this._isPushing = true;
      try {
        // 1. Fetch latest cloud database first so other PCs' scores aren't overwritten
        let cloudDb = null;
        try {
          const res = await fetch(`${this.firebaseUrl}/retro_rankers.json`);
          if (res.ok) {
            cloudDb = await res.json();
          }
        } catch (fetchErr) {
          console.warn('[RankingService] Cloud fetch failed before push, falling back to local db:', fetchErr);
        }

        if (!cloudDb || typeof cloudDb !== 'object' || (cloudDb.version || 1) < 3 || !cloudDb.scores) {
          cloudDb = this._getSeedData();
        }

        if (!cloudDb.scores) cloudDb.scores = {};
        for (const g of this.supportedGames) {
          const rawArr = this._normalizeArray(cloudDb.scores[g] || (this.db.scores && this.db.scores[g]) || []);
          cloudDb.scores[g] = this._filterOutSeedEntries(rawArr);
        }
        cloudDb.feed = this._filterOutSeedFeed(this._normalizeArray(cloudDb.feed || this.db.feed || []));
        cloudDb.version = 3;

        // 2. Merge newEntry into cloudDb.scores[validGameId], deduplicate by id, sort descending by score, keep top 10
        const gameScores = [...(cloudDb.scores[validGameId] || [])];
        if (!gameScores.some(item => item && item.id === newEntry.id)) {
          gameScores.push(newEntry);
        }

        const scoreMap = new Map();
        for (const item of gameScores) {
          if (item && item.id) {
            if (!scoreMap.has(item.id) || scoreMap.get(item.id).score < item.score) {
              scoreMap.set(item.id, item);
            }
          }
        }
        const mergedScores = Array.from(scoreMap.values());
        mergedScores.sort((a, b) => (b.score || 0) - (a.score || 0));
        cloudDb.scores[validGameId] = mergedScores.slice(0, 10);

        // 3. Merge newFeedItem into cloudDb.feed, deduplicate by id, keep top 20
        const feedList = [newFeedItem, ...(cloudDb.feed || [])];
        const feedMap = new Map();
        for (const item of feedList) {
          if (item && item.id) {
            if (!feedMap.has(item.id)) {
              feedMap.set(item.id, item);
            }
          }
        }
        cloudDb.feed = Array.from(feedMap.values()).slice(0, 20);

        // 4. PUT the merged cloudDb back to ${this.firebaseUrl}/retro_rankers.json, update this.db, and notify this.listeners
        const putRes = await fetch(`${this.firebaseUrl}/retro_rankers.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cloudDb)
        });

        if (putRes.ok) {
          this.db = cloudDb;
          this._saveToStorage();
          this._notifyListeners();
        } else {
          console.warn('[RankingService] Cloud PUT failed with status:', putRes.status);
        }
      } catch (err) {
        console.error('[RankingService] Error pushing score to cloud:', err);
      } finally {
        this._isPushing = false;
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
     * @param {string} [gameId]
     * @returns {{ valid: boolean, reason: string }}
     */
    validateScore(score, durationMs, gameLog, gameId) {
      // 1. Basic Type & Range Check
      if (score === null || score === undefined || typeof score !== 'number' || isNaN(score)) {
        return { valid: false, reason: '유효하지 않은 점수 형식 (Invalid Score Type)' };
      }

      if (score < 0) {
        return { valid: false, reason: '음수 점수 감지 (Negative Score Detected)' };
      }

      const resolvedGameId = gameId || (gameLog && gameLog.gameId) || (this.activeSession && this.activeSession.gameId) || '';
      const isHighLimitGame = resolvedGameId === 'mathRunner' || resolvedGameId === 'survivor';
      const maxScore = isHighLimitGame ? 99999999 : 999999;

      if (score > maxScore) {
        return { valid: false, reason: `점수 한계치(${maxScore.toLocaleString('en-US')}) 초과 (Exceeded Max Score)` };
      }

      const durMs = Math.max(0, Number(durationMs) || 0);

      // 2. Impossible Speed Check (e.g., >3,000 pts in under 2 seconds)
      const instantLimit = isHighLimitGame ? 30000 : 3000;
      if (durMs < 2000 && score > instantLimit) {
        return { valid: false, reason: '비정상적인 초고속 득점 감지 (Instant High Score)' };
      }

      // 3. Score-to-Time Ratio Rate Limit Check
      // Generous threshold: 15,000 pts / sec allows extreme arcade combos but blocks memory-hacked 990,000 pts in 3s
      const durationSec = Math.max(durMs / 1000, 1);
      const maxAllowedPerSec = isHighLimitGame ? 500000 : 15000;
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
      const validation = this.validateScore(score, durationMs, gameLog, gameId);

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
        mathRunner: 'MATH RUNNER',
        stack: 'PIXEL STACK',
        survivor: 'VAMP SURVIVOR'
      };
      const gameLabel = gameLabels[validGameId] || validGameId.toUpperCase();
      const rankText = rank ? `${rank}위` : '완주';
      const feedMsg = `[${gameLabel}] ${cleanInitials}님이 ${this.formatScore(score)}점으로 ${rankText} 달성!`;

      if (!Array.isArray(this.db.feed)) {
        this.db.feed = [];
      }

      const newFeedItem = {
        id: 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        time: this._getTimeString(),
        msg: feedMsg,
        initials: cleanInitials,
        score,
        rank,
        gameId: validGameId
      };

      this.db.feed.unshift(newFeedItem);

      // Keep maximum 20 feed items
      this.db.feed = this.db.feed.slice(0, 20);

      // Save to localStorage
      this._saveToStorage();

      // Asynchronously push to cloud in background
      if (this.firebaseUrl) {
        this._pushScoreToCloud(validGameId, newEntry, newFeedItem).catch(err => {
          console.warn('[RankingService] Background cloud push error:', err);
        });
      }

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
      if (this.firebaseUrl) {
        fetch(`${this.firebaseUrl}/retro_rankers.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.db)
        }).catch(err => {
          console.warn('[RankingService] Failed to reset cloud database:', err);
        });
      }
      this._notifyListeners();
      return this.db;
    }

    /**
     * Configure Firebase URL dynamically at runtime
     * @param {string} url
     */
    setFirebaseUrl(url) {
      const rawUrl = (url || '').trim();
      this.firebaseUrl = rawUrl ? rawUrl.replace(/\/+$/, '') : '';
      if (typeof localStorage !== 'undefined') {
        if (this.firebaseUrl) {
          localStorage.setItem('RETRO_FIREBASE_URL', this.firebaseUrl);
        } else {
          localStorage.removeItem('RETRO_FIREBASE_URL');
        }
      }
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
      if (this.firebaseUrl) {
        this._syncFromCloud();
        this.syncTimer = setInterval(() => {
          this._syncFromCloud();
        }, 4000);
      }
    }
  }

  // Export to global window object
  window.RankingService = RankingService;
  window.rankingService = new RankingService();

})(typeof window !== 'undefined' ? window : this);
