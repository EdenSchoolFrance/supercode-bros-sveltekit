// @ts-nocheck
"use strict";

import {
	TILE, COLS, ROWS, GW, GH,
	GRAVITY, JUMP_FORCE, MOVE_SPD, MAX_FALL,
	PLAYER_W, PLAYER_H, ENEMY_W, ENEMY_H, ENEMY_SPD
} from './constants.js';

export class GameEngine {
	constructor(canvas, onStateChange) {
		this._canvas = canvas;
		this._ctx = canvas.getContext('2d');
		this._onStateChange = onStateChange || (() => {});

		this._gameState = 'menu';
		this._frame = 0;
		this._raf = null;

		this._tileMap = {};
		this._blockList = [];
		this._coins = [];
		this._enemies = [];
		this._particles = [];
		this._goalCell = null;

		this._player = null;
		this._lives = 3;
		this._coinCount = 0;
		this._score = 0;

		this._K = { left: false, right: false, jump: false };
		this._jumpBuffer = 0;  // frames remaining to honour a queued jump
		this._coyoteTime = 0;  // frames remaining after leaving ground

		this._boundKeyDown = this._onKeyDown.bind(this);
		this._boundKeyUp = this._onKeyUp.bind(this);
		document.addEventListener('keydown', this._boundKeyDown);
		document.addEventListener('keyup', this._boundKeyUp);
	}

	destroy() {
		document.removeEventListener('keydown', this._boundKeyDown);
		document.removeEventListener('keyup', this._boundKeyUp);
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
	}

	// ── Input ──────────────────────────────────────────────────────────────

	_onKeyDown(e) {
		const gameKey = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d','w'].includes(e.key);
		if (gameKey && this._gameState === 'playing') e.preventDefault();

		if (e.key === 'ArrowLeft'  || e.key === 'a') this._K.left = true;
		if (e.key === 'ArrowRight' || e.key === 'd') this._K.right = true;
		if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
			if (!this._K.jump) this._jumpBuffer = 8; // queue jump for up to 8 frames
			this._K.jump = true;
		}
		if (e.key === 'Enter' && this._gameState !== 'playing') {
			this._onStateChange({ action: 'play-requested' });
		}
	}

	_onKeyUp(e) {
		if (e.key === 'ArrowLeft'  || e.key === 'a') this._K.left = false;
		if (e.key === 'ArrowRight' || e.key === 'd') this._K.right = false;
		if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') this._K.jump = false;
	}

	pressKey(key, pressed) {
		this._K[key] = pressed;
		if (key === 'jump' && pressed) this._jumpBuffer = 8;
	}

	// ── Level parsing ──────────────────────────────────────────────────────

	loadLevel(htmlString) {
		this._tileMap = {};
		this._blockList = [];
		this._coins = [];
		this._enemies = [];
		this._goalCell = null;

		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlString}</div>`, 'text/html');

		doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,input,button').forEach((el) => {
			const tag = el.tagName.toLowerCase();
			if (tag === 'button') return;

			const rawX = parseInt(el.dataset.x);
			const rawY = parseInt(el.dataset.y);
			if (isNaN(rawX) || isNaN(rawY)) return;

			const gx = Math.max(0, Math.min(COLS - 1, rawX - 1));
			const gy = Math.max(0, Math.min(ROWS - 1, rawY - 1));

			switch (tag) {
				case 'h1': this._addTile(gx, gy, 'ground'); break;
				case 'h2': this._addTile(gx, gy, 'brick'); break;
				case 'h3': this._addTile(gx, gy, 'question'); break;
				case 'h4':
					this._addTile(gx, Math.min(gy, ROWS - 2), 'pipe_top');
					this._addTile(gx, Math.min(gy + 1, ROWS - 1), 'pipe_body');
					break;
				case 'h5': this._addTile(gx, gy, 'cloud'); break;
				case 'h6': this._goalCell = { gx, gy }; break;
				case 'p': this._coins.push({ gx, gy, collected: false }); break;
				case 'input': this._enemies.push(this._makeEnemy(gx, gy)); break;
			}
		});

		const bases = this._blockList
			.filter((b) => b.type === 'ground' || b.type === 'brick')
			.sort((a, b) => (a.gx !== b.gx ? a.gx - b.gx : a.gy - b.gy));

		let sx = TILE, sy = GH - TILE * 3;
		if (bases.length > 0) {
			sx = bases[0].gx * TILE + (TILE - PLAYER_W) / 2;
			sy = bases[0].gy * TILE - PLAYER_H;
		}
		this._player = this._makePlayer(sx, sy);
	}

	_addTile(gx, gy, type) {
		const b = { gx, gy, type, used: false };
		this._tileMap[`${gx},${gy}`] = b;
		this._blockList.push(b);
	}

	_getTile(gx, gy) {
		return this._tileMap[`${gx},${gy}`] || null;
	}

	// ── Game objects ───────────────────────────────────────────────────────

	_makePlayer(x, y) {
		return { x, y, vx: 0, vy: 0, w: PLAYER_W, h: PLAYER_H, onGround: false, dir: 1, walkTick: 0, invincible: 0, coyote: 0 };
	}

	_makeEnemy(gx, gy) {
		return {
			x: gx * TILE + (TILE - ENEMY_W) / 2,
			y: gy * TILE + (TILE - ENEMY_H),
			w: ENEMY_W, h: ENEMY_H,
			vx: -ENEMY_SPD, vy: 0,
			onGround: false, alive: true, squishTimer: 0
		};
	}

	// ── Physics ────────────────────────────────────────────────────────────

	_isSolid(type) {
		return type !== 'cloud';
	}

	_moveY(ent, allowOneWay) {
		const prevBottom = ent.y + ent.h;
		ent.y += ent.vy;
		ent.onGround = false;

		const txL = Math.floor(ent.x / TILE);
		const txR = Math.floor((ent.x + ent.w - 1) / TILE);

		if (ent.vy >= 0) {
			const tyFoot = Math.floor((ent.y + ent.h - 1) / TILE);
			for (let tx = txL; tx <= txR; tx++) {
				const b = this._getTile(tx, tyFoot);
				if (!b) continue;
				const tileTop = tyFoot * TILE;
				if (this._isSolid(b.type) && prevBottom <= tileTop + 1) {
					ent.y = tileTop - ent.h;
					ent.vy = 0;
					ent.onGround = true;
					break;
				}
				if (allowOneWay && b.type === 'cloud' && prevBottom <= tileTop + 1) {
					ent.y = tileTop - ent.h;
					ent.vy = 0;
					ent.onGround = true;
					break;
				}
			}
		} else {
			const tyHead = Math.floor(ent.y / TILE);
			for (let tx = txL; tx <= txR; tx++) {
				const b = this._getTile(tx, tyHead);
				if (b && this._isSolid(b.type)) {
					ent.y = (tyHead + 1) * TILE;
					if (b.type === 'question' && !b.used && ent === this._player) {
						b.used = true;
						this._score += 50;
						this._coinCount++;
						this._notifyState();
						this._addParticle(b.gx * TILE + TILE / 2, b.gy * TILE - 4, '+50 🪙', '#f8b800');
					}
					ent.vy = 0;
					break;
				}
			}
		}
	}

	_moveX(ent) {
		ent.x += ent.vx;
		const tyT = Math.floor(ent.y / TILE);
		const tyB = Math.floor((ent.y + ent.h - 1) / TILE);

		if (ent.vx > 0) {
			const txR = Math.floor((ent.x + ent.w - 1) / TILE);
			for (let ty = tyT; ty <= tyB; ty++) {
				const b = this._getTile(txR, ty);
				if (b && this._isSolid(b.type)) {
					ent.x = txR * TILE - ent.w;
					ent.vx = 0;
					break;
				}
			}
		} else if (ent.vx < 0) {
			const txL = Math.floor(ent.x / TILE);
			for (let ty = tyT; ty <= tyB; ty++) {
				const b = this._getTile(txL, ty);
				if (b && this._isSolid(b.type)) {
					ent.x = (txL + 1) * TILE;
					ent.vx = 0;
					break;
				}
			}
		}

		ent.x = Math.max(0, Math.min(GW - ent.w, ent.x));
	}

	// ── Particles ──────────────────────────────────────────────────────────

	_addParticle(x, y, text, color) {
		this._particles.push({ x, y, vy: -3.8, alpha: 1.0, text, color });
	}

	_updateParticles() {
		for (const p of this._particles) {
			p.y += p.vy;
			p.vy += 0.14;
			p.alpha -= 0.022;
		}
		this._particles = this._particles.filter((p) => p.alpha > 0);
	}

	// ── Game loop ──────────────────────────────────────────────────────────

	start() {
		this._lives = 3;
		this._coinCount = 0;
		this._score = 0;
		this._particles = [];
		this._frame = 0;
		this._jumpBuffer = 0;
		this._gameState = 'playing';
		this._notifyState();
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = requestAnimationFrame(this._loop.bind(this));
	}

	stop() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
		this._gameState = 'menu';
		this._notifyState();
	}

	renderStatic() {
		this._render();
	}

	_loop() {
		if (this._gameState !== 'playing') return;
		this._frame++;
		this._update();
		this._render();
		this._raf = requestAnimationFrame(this._loop.bind(this));
	}

	_update() {
		const p = this._player;

		if (this._K.left) { p.vx = -MOVE_SPD; p.dir = -1; }
		else if (this._K.right) { p.vx = MOVE_SPD; p.dir = 1; }
		else { p.vx *= 0.78; }

		// Coyote time: keep the window alive while on ground, count down after leaving
		if (p.onGround) {
			p.coyote = 6;
		} else if (p.coyote > 0) {
			p.coyote--;
		}

		// Jump buffer: count down each frame; fire when we have ground (or coyote window)
		if (this._jumpBuffer > 0) this._jumpBuffer--;

		const canJump = p.coyote > 0 && p.vy >= 0;
		if (this._jumpBuffer > 0 && canJump) {
			p.vy = JUMP_FORCE;
			p.onGround = false;
			p.coyote = 0;
			this._jumpBuffer = 0;
		}

		// Variable-height jump: releasing early cuts the rise
		if (!this._K.jump && p.vy < -3.5) p.vy = Math.max(p.vy, -3.5);

		p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
		this._moveY(p, true);
		this._moveX(p);

		if (Math.abs(p.vx) > 0.4 && p.onGround) p.walkTick++;
		else p.walkTick = 0;

		if (p.invincible > 0) p.invincible--;

		// Enemies
		for (const e of this._enemies) {
			if (!e.alive) {
				if (e.squishTimer > 0) e.squishTimer--;
				continue;
			}

			if (e.onGround) {
				const aTx = e.vx > 0
					? Math.floor((e.x + e.w + 2) / TILE)
					: Math.floor((e.x - 2) / TILE);
				const footTy = Math.floor((e.y + e.h + 4) / TILE);
				if (!this._getTile(aTx, footTy)) e.vx *= -1;
			}

			const prevVx = e.vx;
			e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
			this._moveY(e, false);
			this._moveX(e);

			if (Math.abs(e.vx) < 0.05 && Math.abs(prevVx) > 0.1) {
				e.vx = prevVx > 0 ? -ENEMY_SPD : ENEMY_SPD;
			}
			if (e.y > GH + 60) { e.alive = false; continue; }

			if (p.invincible === 0 && this._overlap(p, e)) {
				if (p.vy > 0 && p.y + p.h < e.y + e.h * 0.55) {
					e.alive = false;
					e.squishTimer = 28;
					p.vy = -9;
					this._score += 200;
					this._notifyState();
					this._addParticle(e.x + e.w / 2, e.y, '+200 ⭐', '#44ff88');
				} else {
					this._lives--;
					p.invincible = 80;
					p.vx = p.x < e.x ? -4.5 : 4.5;
					p.vy = -6;
					this._notifyState();
					if (this._lives <= 0) {
						this._gameState = 'dead';
						setTimeout(() => this._notifyState(), 700);
					}
				}
			}
		}

		// Coins
		for (const c of this._coins) {
			if (c.collected) continue;
			const cr = { x: c.gx * TILE + 8, y: c.gy * TILE + 6, w: TILE - 16, h: TILE - 12 };
			if (this._overlap(p, cr)) {
				c.collected = true;
				this._coinCount++;
				this._score += 50;
				this._notifyState();
				this._addParticle(c.gx * TILE + TILE / 2, c.gy * TILE, '+50 🪙', '#f8b800');
			}
		}

		// Goal / Flag
		if (this._goalCell) {
			const flagZone = {
				x: this._goalCell.gx * TILE - 2,
				y: this._goalCell.gy * TILE - TILE * 2,
				w: TILE + 4, h: TILE * 3
			};
			if (this._overlap(p, flagZone)) {
				this._score += 500;
				this._gameState = 'win';
				setTimeout(() => this._notifyState(), 700);
			}
		}

		// Fell off screen
		if (p.y > GH + 80) {
			this._lives--;
			this._notifyState();
			if (this._lives <= 0) {
				this._gameState = 'dead';
				setTimeout(() => this._notifyState(), 400);
			} else {
				this._respawn();
			}
		}

		this._updateParticles();
	}

	_respawn() {
		const bases = this._blockList
			.filter((b) => b.type === 'ground' || b.type === 'brick')
			.sort((a, b) => a.gx - b.gx);
		const p = this._player;
		if (bases.length > 0) {
			p.x = bases[0].gx * TILE + (TILE - PLAYER_W) / 2;
			p.y = bases[0].gy * TILE - PLAYER_H;
		} else {
			p.x = TILE;
			p.y = GH / 2;
		}
		p.vx = 0;
		p.vy = 0;
		p.invincible = 80;
	}

	_overlap(a, b) {
		return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
	}

	_notifyState() {
		this._onStateChange({
			gameState: this._gameState,
			lives: this._lives,
			coinCount: this._coinCount,
			score: this._score
		});
	}

	// ── Rendering ──────────────────────────────────────────────────────────

	_render() {
		const ctx = this._ctx;

		const sky = ctx.createLinearGradient(0, 0, 0, GH);
		sky.addColorStop(0, '#3b7de8');
		sky.addColorStop(0.6, '#6aa0f8');
		sky.addColorStop(1, '#90b8ff');
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, GW, GH);

		this._drawBgClouds();
		for (const b of this._blockList) this._drawBlock(b);
		if (this._goalCell) this._drawFlag(this._goalCell.gx, this._goalCell.gy);
		for (const c of this._coins) if (!c.collected) this._drawCoin(c.gx, c.gy);
		for (const e of this._enemies) this._drawEnemy(e);
		if (this._player) this._drawPlayer();

		ctx.save();
		ctx.font = 'bold 12px "Courier New"';
		ctx.textAlign = 'center';
		for (const p of this._particles) {
			ctx.globalAlpha = Math.max(0, p.alpha);
			ctx.fillStyle = p.color;
			ctx.fillText(p.text, p.x, p.y);
		}
		ctx.globalAlpha = 1;
		ctx.restore();
	}

	_drawBgClouds() {
		const ctx = this._ctx;
		const BG_CLOUDS = [
			{ x: 70, y: 55, s: 1.1 }, { x: 220, y: 38, s: 1.3 },
			{ x: 400, y: 62, s: 0.9 }, { x: 580, y: 42, s: 1.15 },
			{ x: 730, y: 68, s: 0.85 }
		];
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		for (const c of BG_CLOUDS) {
			ctx.beginPath();
			this._cloudArc(c.x, c.y, c.s);
			ctx.fill();
		}
	}

	_cloudArc(x, y, s) {
		const ctx = this._ctx;
		ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
		ctx.arc(x + 20 * s, y - 9 * s, 14 * s, 0, Math.PI * 2);
		ctx.arc(x + 38 * s, y, 16 * s, 0, Math.PI * 2);
		ctx.arc(x + 18 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
	}

	_drawBlock(b) {
		const ctx = this._ctx;
		const x = b.gx * TILE;
		const y = b.gy * TILE;
		const T = TILE;
		ctx.save();

		switch (b.type) {
			case 'ground':
				ctx.fillStyle = '#bb3800'; ctx.fillRect(x, y, T, T);
				ctx.fillStyle = '#e86800'; ctx.fillRect(x, y, T, 6);
				ctx.fillStyle = '#881800'; ctx.fillRect(x, y + T - 5, T, 5);
				ctx.fillStyle = '#992800';
				ctx.fillRect(x + T / 2 - 1, y + 6, 2, T - 11);
				ctx.fillRect(x + 1, y + T / 2 - 1, T - 2, 2);
				break;

			case 'brick':
				ctx.fillStyle = '#c84008'; ctx.fillRect(x, y, T, T);
				ctx.fillStyle = '#ffddaa';
				ctx.fillRect(x, y + 10, T, 2); ctx.fillRect(x, y + 22, T, 2);
				ctx.fillRect(x + 15, y, 2, 10); ctx.fillRect(x + 7, y + 12, 2, 10);
				ctx.fillRect(x + 23, y + 12, 2, 10); ctx.fillRect(x + 15, y + 24, 2, 8);
				break;

			case 'question':
				if (b.used) {
					ctx.fillStyle = '#888'; ctx.fillRect(x, y, T, T);
					ctx.fillStyle = '#666';
					for (let i = 0; i < T; i += 8) ctx.fillRect(x + i, y, 4, T);
				} else {
					const bob = Math.sin(this._frame * 0.12) * 2;
					ctx.fillStyle = '#f8b800'; ctx.fillRect(x, y - bob, T, T);
					ctx.fillStyle = '#c87800';
					ctx.fillRect(x, y - bob, T, 3); ctx.fillRect(x, y - bob + T - 3, T, 3);
					ctx.fillRect(x, y - bob, 3, T); ctx.fillRect(x + T - 3, y - bob, 3, T);
					ctx.fillStyle = '#ffe044'; ctx.fillRect(x + 3, y - bob + 3, T - 6, T - 6);
					ctx.fillStyle = '#fff';
					ctx.font = 'bold 20px "Press Start 2P", monospace';
					ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
					ctx.fillText('?', x + T / 2, y - bob + T / 2);
					ctx.textBaseline = 'alphabetic';
				}
				break;

			case 'pipe_top': {
				const bw = T + 8, bx = x - 4;
				ctx.fillStyle = '#00bb00'; ctx.fillRect(bx, y, bw, 14);
				ctx.fillStyle = '#008800'; ctx.fillRect(bx, y + 14, bw, 4);
				ctx.fillStyle = '#009900'; ctx.fillRect(x + 2, y + 18, T - 4, T - 18);
				ctx.fillStyle = '#00ee00';
				ctx.fillRect(bx + 3, y + 2, 6, 10); ctx.fillRect(x + 4, y + 20, 5, T - 22);
				break;
			}
			case 'pipe_body':
				ctx.fillStyle = '#009900'; ctx.fillRect(x + 2, y, T - 4, T);
				ctx.fillStyle = '#00ee00'; ctx.fillRect(x + 4, y, 5, T);
				ctx.fillStyle = '#005500'; ctx.fillRect(x + T - 7, y, 5, T);
				break;

			case 'cloud':
				ctx.fillStyle = 'rgba(210,225,255,0.88)';
				ctx.beginPath();
				this._cloudArc(x - 2, y + 6, 0.68);
				ctx.fill();
				break;
		}
		ctx.restore();
	}

	_drawCoin(gx, gy) {
		const ctx = this._ctx;
		const cx = gx * TILE + TILE / 2;
		const cy = gy * TILE + TILE / 2 + Math.sin(this._frame * 0.1 + gx * 0.7) * 3;
		const sh = Math.floor(this._frame / 9) % 5;

		ctx.fillStyle = '#f8b800';
		ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = '#ffee55';
		ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 4, 0, Math.PI * 2); ctx.fill();

		if (sh < 2) {
			ctx.fillStyle = 'rgba(255,255,255,0.55)';
			ctx.fillRect(cx - 4 + sh * 5, cy - 8, 2, 16);
		}
	}

	_drawFlag(gx, gy) {
		const ctx = this._ctx;
		const px = gx * TILE + TILE / 2;
		const py = gy * TILE;
		const ph = TILE * 3;

		ctx.fillStyle = '#aaaaaa'; ctx.fillRect(px - 2, py - ph, 4, ph + TILE + 2);

		ctx.fillStyle = '#00cc00';
		const wave = Math.sin(this._frame * 0.09) * 5;
		ctx.beginPath();
		ctx.moveTo(px + 2, py - ph);
		ctx.quadraticCurveTo(px + 22, py - ph + 11 + wave, px + 2, py - ph + 22);
		ctx.fill();

		ctx.fillStyle = '#f8b800';
		ctx.beginPath(); ctx.arc(px, py - ph, 5, 0, Math.PI * 2); ctx.fill();
	}

	_drawEnemy(e) {
		const ctx = this._ctx;
		const x = Math.round(e.x);
		const y = Math.round(e.y);

		if (!e.alive) {
			if (e.squishTimer > 0) {
				ctx.fillStyle = '#b02800'; ctx.fillRect(x, y + e.h - 8, e.w, 8);
				ctx.fillStyle = '#702000';
				ctx.fillRect(x + 2, y + e.h - 6, 4, 4);
				ctx.fillRect(x + e.w - 6, y + e.h - 6, 4, 4);
			}
			return;
		}

		const ft = Math.floor(this._frame / 11) % 2;

		ctx.fillStyle = '#b02800';
		ctx.fillRect(x + 2, y + 11, e.w - 4, e.h - 11);
		ctx.fillRect(x + 3, y + 7, e.w - 6, 6);
		ctx.fillStyle = '#901800';
		ctx.fillRect(x, y + 2, e.w, 12); ctx.fillRect(x + 2, y, e.w - 4, 4);

		ctx.fillStyle = 'white';
		ctx.fillRect(x + 3, y + 3, 5, 5); ctx.fillRect(x + 16, y + 3, 5, 5);
		ctx.fillStyle = '#111';
		ctx.fillRect(x + 4, y + 4, 3, 3); ctx.fillRect(x + 17, y + 4, 3, 3);

		ctx.fillStyle = '#111';
		ctx.save(); ctx.translate(x + 5, y + 3); ctx.rotate(-0.32); ctx.fillRect(0, 0, 7, 2); ctx.restore();
		ctx.save(); ctx.translate(x + 14, y + 3); ctx.rotate(0.32); ctx.fillRect(2, 0, 7, 2); ctx.restore();

		ctx.fillStyle = 'ivory';
		ctx.fillRect(x + 7, y + 11, 4, 3); ctx.fillRect(x + 13, y + 11, 4, 3);

		ctx.fillStyle = '#601000';
		if (ft === 0) {
			ctx.fillRect(x, y + e.h - 6, 9, 6); ctx.fillRect(x + e.w - 7, y + e.h - 4, 9, 4);
		} else {
			ctx.fillRect(x, y + e.h - 4, 9, 4); ctx.fillRect(x + e.w - 7, y + e.h - 6, 9, 6);
		}
	}

	_drawPlayer() {
		const ctx = this._ctx;
		const p = this._player;
		const x = Math.round(p.x);
		const y = Math.round(p.y);

		if (p.invincible > 0 && Math.floor(p.invincible / 5) % 2 === 1) return;

		const wf = p.onGround ? Math.floor(p.walkTick / 7) % 3 : -1;

		ctx.save();
		if (p.dir === -1) {
			ctx.translate(x + p.w, 0); ctx.scale(-1, 1); ctx.translate(-x, 0);
		}

		ctx.fillStyle = '#dd1100';
		ctx.fillRect(x + 3, y, 16, 5); ctx.fillRect(x + 1, y + 3, 18, 4);
		ctx.fillRect(x + 16, y + 4, 8, 3);

		ctx.fillStyle = '#5a2200'; ctx.fillRect(x + 3, y + 5, 4, 2);

		ctx.fillStyle = '#fca060';
		ctx.fillRect(x + 2, y + 6, 18, 9); ctx.fillRect(x + 1, y + 7, 2, 7);

		ctx.fillStyle = '#e07040'; ctx.fillRect(x + 15, y + 9, 5, 3);

		ctx.fillStyle = '#111'; ctx.fillRect(x + 13, y + 7, 4, 4);
		ctx.fillStyle = 'white'; ctx.fillRect(x + 14, y + 7, 2, 2);

		ctx.fillStyle = '#5a2200';
		ctx.fillRect(x + 7, y + 12, 12, 2); ctx.fillRect(x + 9, y + 13, 10, 2);

		ctx.fillStyle = '#dd1100'; ctx.fillRect(x + 4, y + 15, 14, 5);

		ctx.fillStyle = '#0022cc';
		ctx.fillRect(x + 2, y + 15, 5, 9); ctx.fillRect(x + 15, y + 15, 5, 9);
		ctx.fillRect(x + 2, y + 20, 18, 4);

		ctx.fillStyle = '#f8b800';
		ctx.fillRect(x + 5, y + 17, 2, 2); ctx.fillRect(x + 15, y + 17, 2, 2);

		ctx.fillStyle = '#0022cc';
		if (wf === -1) {
			ctx.fillRect(x + 2, y + 24, 7, 4); ctx.fillRect(x + 13, y + 22, 7, 4);
		} else if (wf === 1) {
			ctx.fillRect(x + 3, y + 24, 7, 4); ctx.fillRect(x + 13, y + 22, 7, 6);
		} else if (wf === 2) {
			ctx.fillRect(x + 3, y + 22, 7, 6); ctx.fillRect(x + 13, y + 24, 7, 4);
		} else {
			ctx.fillRect(x + 3, y + 24, 7, 4); ctx.fillRect(x + 13, y + 24, 7, 4);
		}

		ctx.fillStyle = '#5a2200';
		if (wf === 1) {
			ctx.fillRect(x + 1, y + 27, 11, 4); ctx.fillRect(x + 12, y + 25, 11, 4);
		} else if (wf === 2) {
			ctx.fillRect(x + 1, y + 25, 11, 4); ctx.fillRect(x + 12, y + 27, 11, 4);
		} else {
			ctx.fillRect(x + 1, y + 27, 11, 4); ctx.fillRect(x + 11, y + 27, 11, 4);
		}

		ctx.restore();
	}
}
