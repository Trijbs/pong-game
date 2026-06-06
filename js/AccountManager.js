'use strict';
/* ================================================================
   AccountManager — client-side account system for Pong
   All data stored in localStorage. No server required.
   Passwords hashed with SHA-256 via Web Crypto API.
   ================================================================ */
class AccountManager {
  constructor() {
    this._AK = 'pong_accounts_v2';
    this._CK = 'pong_current_v2';
  }
  _load()          { try { return JSON.parse(localStorage.getItem(this._AK)) || {}; } catch { return {}; } }
  _save(a)         { localStorage.setItem(this._AK, JSON.stringify(a)); }
  getCurrentUser() { return localStorage.getItem(this._CK) || null; }
  isLoggedIn()     { return !!this.getCurrentUser(); }
  getAccount(u)    { const n = u ?? this.getCurrentUser(); return n ? (this._load()[n.toUpperCase()] || null) : null; }

  async _sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }
  async register(username, password, confirm) {
    if (!username || username.length < 2)   throw new Error('USERNAME TOO SHORT (MIN 2)');
    if (!/^[A-Za-z0-9_]+$/.test(username)) throw new Error('LETTERS, NUMBERS AND _ ONLY');
    if (!password || password.length < 4)  throw new Error('PASSWORD TOO SHORT (MIN 4)');
    if (password !== confirm)              throw new Error('PASSWORDS DO NOT MATCH');
    const accounts = this._load(), uname = username.toUpperCase();
    if (accounts[uname])                   throw new Error('USERNAME ALREADY TAKEN');
    accounts[uname] = this._blank(uname, await this._sha256(password));
    this._save(accounts); localStorage.setItem(this._CK, uname);
    return accounts[uname];
  }
  async login(username, password) {
    if (!username) throw new Error('ENTER A USERNAME');
    if (!password) throw new Error('ENTER A PASSWORD');
    const uname = username.toUpperCase(), acc = this._load()[uname];
    if (!acc) throw new Error('ACCOUNT NOT FOUND');
    if (await this._sha256(password) !== acc.passwordHash) throw new Error('WRONG PASSWORD');
    localStorage.setItem(this._CK, uname); return acc;
  }
  logout() { localStorage.removeItem(this._CK); }
  _blank(username, passwordHash) {
    const avatars = ['🕹️','👾','🎮','⚡','🔥','💎'];
    return { username, passwordHash,
      avatar: avatars[Math.floor(Math.random()*avatars.length)], createdAt: Date.now(),
      stats: { gamesPlayed:0, wins:0, losses:0, totalPlayTimeSec:0, longestRally:0, maxBallSpeed:0, highScore:0 },
      xp:0, achievements:{}, streak:0 };
  }
  saveGame({ won, playerScore, aiScore, rallyMax, maxSpeed, playTimeSec, wasTrailing }) {
    const uname = this.getCurrentUser(); if (!uname) return null;
    const accounts = this._load(), a = accounts[uname]; if (!a) return null;
    a.stats.gamesPlayed++;
    if (won) { a.stats.wins++;   a.streak=(a.streak||0)+1; }
    else     { a.stats.losses++; a.streak=0; }
    a.stats.totalPlayTimeSec += Math.round(playTimeSec);
    if (rallyMax  > a.stats.longestRally)  a.stats.longestRally  = rallyMax;
    if (maxSpeed  > a.stats.maxBallSpeed)  a.stats.maxBallSpeed  = +maxSpeed.toFixed(2);
    if (playerScore > a.stats.highScore)   a.stats.highScore     = playerScore;
    let xp = 20 + playerScore*5;
    if (won)                  xp += 50;
    if (won && aiScore===0)   xp += 30;
    if (rallyMax >= 10)       xp += 10;
    if (rallyMax >= 20)       xp += 15;
    const oldLevel = this._level(a.xp); a.xp += xp;
    const newLevel = this._level(a.xp);
    const newAch = [];
    const chk = (id, cond) => {
      if (!a.achievements[id] && cond) {
        const def = AccountManager.ACHIEVEMENTS.find(d=>d.id===id);
        a.achievements[id]=Date.now(); if (def) newAch.push(def);
      }
    };
    chk('first_win',    won && a.stats.wins===1);
    chk('win_streak_3', won && a.streak>=3);
    chk('win_streak_5', won && a.streak>=5);
    chk('shutout',      won && aiScore===0);
    chk('rally_10',     rallyMax>=10);
    chk('rally_20',     rallyMax>=20);
    chk('speed_demon',  maxSpeed>=12);
    chk('games_10',     a.stats.gamesPlayed>=10);
    chk('games_50',     a.stats.gamesPlayed>=50);
    chk('level_5',      newLevel>=5);
    chk('level_10',     newLevel>=10);
    chk('play_hour',    a.stats.totalPlayTimeSec>=3600);
    chk('comeback',     won && wasTrailing);
    this._save(accounts);
    return { xpGained:xp, leveled:newLevel>oldLevel, newLevel, newAchievements:newAch };
  }
  _level(xp)     { return Math.floor((xp||0)/500)+1; }
  _progress(xp)  { return ((xp||0)%500)/500; }
  _xpInLevel(xp) { return (xp||0)%500; }
}
AccountManager.ACHIEVEMENTS = [
  { id:'first_win',    icon:'🏆', label:'FIRST WIN',   desc:'Win your first game' },
  { id:'win_streak_3', icon:'🎩', label:'HAT TRICK',   desc:'Win 3 in a row' },
  { id:'win_streak_5', icon:'🔥', label:'STREAK x5',   desc:'Win 5 in a row' },
  { id:'shutout',      icon:'💀', label:'SHUTOUT',      desc:'Win 7-0' },
  { id:'rally_10',     icon:'🙌', label:'HOT HANDS',   desc:'10-hit rally' },
  { id:'rally_20',     icon:'⚡', label:'RALLY KING',  desc:'20-hit rally' },
  { id:'speed_demon',  icon:'💨', label:'SPEED DEMON', desc:'Near max ball speed' },
  { id:'games_10',     icon:'🎮', label:'VETERAN',      desc:'Play 10 games' },
  { id:'games_50',     icon:'👑', label:'LEGEND',       desc:'Play 50 games' },
  { id:'level_5',      icon:'⬆️', label:'LEVEL 5',      desc:'Reach Level 5' },
  { id:'level_10',     icon:'💎', label:'LEVEL 10',     desc:'Reach Level 10' },
  { id:'play_hour',    icon:'⏰', label:'DEDICATED',    desc:'Play 1 hour total' },
  { id:'comeback',     icon:'↩️', label:'COMEBACK',     desc:'Win when trailing 0-5' },
];
