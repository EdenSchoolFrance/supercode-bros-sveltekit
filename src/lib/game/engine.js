// @ts-nocheck
"use strict";

import {
	TILE,
	COLS,
	ROWS,
	GW,
	GH,
	GRAVITY,
	JUMP_FORCE,
	MOVE_SPD,
	MAX_FALL,
	PLAYER_W,
	PLAYER_H,
	ENEMY_W,
	ENEMY_H,
	ENEMY_SPD
} from "./constants.js";

const COLOR_FILTERS = {
	red: "sepia(1) saturate(6) hue-rotate(322deg)",
	green: "sepia(1) saturate(6) hue-rotate(80deg)",
	blue: "sepia(1) saturate(6) hue-rotate(200deg)"
};

function getColorClass(el) {
	const classes = (el.className || "").split(" ");
	for (const c of ["red", "green", "blue"]) if (classes.includes(c)) return c;
	return null;
}

export class GameEngine {
	constructor(canvas, onStateChange) {
		this._canvas = canvas;
		this._ctx = canvas.getContext("2d");
		this._onStateChange = onStateChange || (() => {});

		this._gameState = "menu";
		this._frame = 0;
		this._raf = null;

		this._tileMap = {};
		this._blockList = [];
		this._coins = [];
		this._enemies = [];
		this._particles = [];
		this._items = [];
		this._platforms = [];
		this._goalCell = null;
		this._marioSpawn = null;

		this._player = null;
		this._lives = 3;
		this._coinCount = 0;
		this._score = 0;

		this._K = {
			left: false,
			right: false,
			jump: false,
			down: false,
			downPress: false,
			fire: false,
			firePress: false
		};
		this._jumpBuffer = 0;
		this._coyoteTime = 0;

		this._pipes = [];
		this._fireballs = [];

		this._showGrid = false;
		this._hoveredCell = null;

		this._boundKeyDown = this._onKeyDown.bind(this);
		this._boundKeyUp = this._onKeyUp.bind(this);
		document.addEventListener("keydown", this._boundKeyDown);
		document.addEventListener("keyup", this._boundKeyUp);
	}

	destroy() {
		document.removeEventListener("keydown", this._boundKeyDown);
		document.removeEventListener("keyup", this._boundKeyUp);
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
	}

	// ── Input ──────────────────────────────────────────────────────────────

	_onKeyDown(e) {
		const tag = e.target?.tagName?.toLowerCase();
		if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

		const gameKey = [
			"ArrowLeft",
			"ArrowRight",
			"ArrowUp",
			"ArrowDown",
			" ",
			"a",
			"d",
			"w",
			"s",
			"e",
			"E"
		].includes(e.key);
		if (gameKey && this._gameState === "playing") e.preventDefault();

		if (e.key === "ArrowLeft" || e.key === "a") this._K.left = true;
		if (e.key === "ArrowRight" || e.key === "d") this._K.right = true;
		if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") {
			if (!this._K.jump) this._jumpBuffer = 8;
			this._K.jump = true;
		}
		if (e.key === "ArrowDown" || e.key === "s") {
			if (!this._K.down) this._K.downPress = true;
			this._K.down = true;
		}
		if (e.key === "e" || e.key === "E") {
			if (!this._K.fire) this._K.firePress = true;
			this._K.fire = true;
		}
		if (e.key === "Enter" && this._gameState !== "playing") {
			this._onStateChange({ action: "play-requested" });
		}
	}

	_onKeyUp(e) {
		const tag = e.target?.tagName?.toLowerCase();
		if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

		if (e.key === "ArrowLeft" || e.key === "a") this._K.left = false;
		if (e.key === "ArrowRight" || e.key === "d") this._K.right = false;
		if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") this._K.jump = false;
		if (e.key === "ArrowDown" || e.key === "s") this._K.down = false;
		if (e.key === "e" || e.key === "E") this._K.fire = false;
	}

	pressKey(key, pressed) {
		this._K[key] = pressed;
		if (key === "jump" && pressed) this._jumpBuffer = 8;
		if (key === "fire" && pressed) this._K.firePress = true;
	}

	// ── Level parsing ──────────────────────────────────────────────────────

	loadLevel(htmlString) {
		this._tileMap = {};
		this._blockList = [];
		this._coins = [];
		this._enemies = [];
		this._goalCell = null;
		this._pipes = [];
		this._fireballs = [];
		this._items = [];
		this._platforms = [];
		this._particles = [];
		this._marioSpawn = null;

		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlString}</div>`, "text/html");

		doc.querySelectorAll("h1,h2,h3,a,h5,h6,hr,p,i,aside,input,button").forEach((el) => {
			const tag = el.tagName.toLowerCase();
			if (tag === "button") return;

			const rawX = parseInt(el.dataset.x);
			const rawY = parseInt(el.dataset.y);
			if (isNaN(rawX) || isNaN(rawY)) return;

			const gx = Math.max(0, Math.min(COLS - 1, rawX - 1));
			const gy = Math.max(0, Math.min(ROWS - 1, rawY - 1));

			const colorClass = getColorClass(el);
			switch (tag) {
				case "h1":
					this._addTile(gx, gy, "ground", colorClass);
					break;
				case "h2":
					this._addTile(gx, gy, "brick", colorClass);
					break;
				case "h3": {
					const qb = this._addTile(gx, gy, "question", colorClass);
					const item = (el.dataset.item || "coin").toLowerCase();
					qb.item = ["coin", "star", "mushroom", "flower"].includes(item) ? item : "coin";
					break;
				}
				case "a": {
					const pipeGy = Math.min(gy, ROWS - 2);
					this._addTile(gx, pipeGy, "pipe_top", colorClass);
					this._addTile(gx, Math.min(gy + 1, ROWS - 1), "pipe_body", colorClass);
					const pipeId = el.id || null;
					const hrefAttr = el.getAttribute("href");
					const linkedTo = hrefAttr ? hrefAttr.replace(/^#/, "") : null;
					this._pipes.push({ id: pipeId, linkedTo, gx, gy: pipeGy });
					break;
				}
				case "h5":
					this._addTile(gx, gy, "cloud", colorClass);
					break;
				case "hr":
					this._addTile(gx, gy, "spike", colorClass);
					break;
				case "i":
					this._addTile(gx, gy, "lava", colorClass);
					break;
				case "aside": {
					const widthTiles = Math.max(1, parseInt(el.dataset.w) || 2);
					const rangeTiles = Math.max(1, parseInt(el.dataset.range) || 4);
					const speed = parseFloat(el.dataset.speed) || 1.2;
					const x = gx * TILE;
					const minX = Math.max(0, x - rangeTiles * TILE);
					const maxX = Math.min(GW, x + (widthTiles + rangeTiles) * TILE);
					this._platforms.push({
						x,
						y: gy * TILE + TILE - 12,
						w: widthTiles * TILE,
						h: 12,
						vx: speed,
						minX,
						maxX,
						colorClass
					});
					break;
				}
				case "h6":
					this._goalCell = { gx, gy, colorClass };
					break;
				case "p":
					this._coins.push({ gx, gy, collected: false, colorClass });
					break;
				case "input": {
					const name = el.getAttribute("name");
					const type = el.getAttribute("type");
					if (name === "mario") {
						this._marioSpawn = { gx, gy };
					} else if (type === "boss" || name === "bowser") {
						this._enemies.push(this._makeBowser(gx, gy, colorClass));
					} else {
						const enemyType = name === "koopa" ? "koopa" : "goomba";
						this._enemies.push(this._makeEnemy(gx, gy, colorClass, enemyType));
					}
					break;
				}
			}
		});

		let sx, sy;
		if (this._marioSpawn) {
			sx = this._marioSpawn.gx * TILE + (TILE - PLAYER_W) / 2;
			sy = this._marioSpawn.gy * TILE - PLAYER_H;
		} else {
			const bases = this._blockList
				.filter((b) => b.type === "ground" || b.type === "brick")
				.sort((a, b) => (a.gx !== b.gx ? a.gx - b.gx : a.gy - b.gy));
			sx = TILE;
			sy = GH - TILE * 3;
			if (bases.length > 0) {
				sx = bases[0].gx * TILE + (TILE - PLAYER_W) / 2;
				sy = bases[0].gy * TILE - PLAYER_H;
			}
		}
		this._player = this._makePlayer(sx, sy);
	}

	_addTile(gx, gy, type, colorClass = null) {
		const b = { gx, gy, type, used: false, colorClass };
		this._tileMap[`${gx},${gy}`] = b;
		this._blockList.push(b);
		return b;
	}

	_getTile(gx, gy) {
		return this._tileMap[`${gx},${gy}`] || null;
	}

	_getPipeUnderPlayer() {
		const p = this._player;
		if (!p.onGround) return null;
		const footTileY = Math.floor((p.y + p.h + 1) / TILE);
		const centerTileX = Math.floor((p.x + p.w / 2) / TILE);
		const tile = this._getTile(centerTileX, footTileY);
		if (!tile || tile.type !== "pipe_top") return null;
		return this._pipes.find((pipe) => pipe.gx === centerTileX && pipe.gy === footTileY) || null;
	}

	// ── Game objects ───────────────────────────────────────────────────────

	_makePlayer(x, y) {
		return {
			x,
			y,
			vx: 0,
			vy: 0,
			w: PLAYER_W,
			h: PLAYER_H,
			onGround: false,
			dir: 1,
			walkTick: 0,
			invincible: 0,
			coyote: 0,
			pipeState: null,
			pipeTick: 0,
			pipeClipY: 0,
			pipeLinkedTo: null,
			big: false,
			fire: false,
			starInvincible: 0,
			fireCooldown: 0,
			platform: null
		};
	}

	_makeBowser(gx, gy, colorClass = null) {
		return {
			x: gx * TILE + (TILE - 48) / 2,
			y: gy * TILE + (TILE - 48),
			w: 48,
			h: 48,
			vx: -(ENEMY_SPD * 0.5),
			vy: 0,
			onGround: false,
			alive: true,
			squishTimer: 0,
			colorClass,
			enemyType: "bowser",
			hp: 3,
			hitFlash: 0,
			fireTimer: 0
		};
	}

	_makeEnemy(gx, gy, colorClass = null, enemyType = "goomba") {
		return {
			x: gx * TILE + (TILE - ENEMY_W) / 2,
			y: gy * TILE + (TILE - ENEMY_H),
			w: ENEMY_W,
			h: ENEMY_H,
			vx: -ENEMY_SPD,
			vy: 0,
			onGround: false,
			alive: true,
			squishTimer: 0,
			colorClass,
			enemyType
		};
	}

	// ── Physics ────────────────────────────────────────────────────────────

	_isSolid(type) {
		// 'cloud' is one-way only; 'lava' is pass-through (instant death on contact)
		return type !== "cloud" && type !== "lava";
	}

	_moveY(ent, allowOneWay) {
		const prevBottom = ent.y + ent.h;
		ent.y += ent.vy;
		ent.onGround = false;
		ent.platform = null;

		const txL = Math.floor(ent.x / TILE);
		const txR = Math.floor((ent.x + ent.w - 1) / TILE);

		if (ent.vy >= 0) {
			const tyFoot = Math.floor((ent.y + ent.h - 1) / TILE);
			let landed = false;
			for (let tx = txL; tx <= txR; tx++) {
				const b = this._getTile(tx, tyFoot);
				if (!b) continue;
				const tileTop = tyFoot * TILE;
				if (this._isSolid(b.type) && prevBottom <= tileTop + 1) {
					ent.y = tileTop - ent.h;
					ent.vy = 0;
					ent.onGround = true;
					landed = true;
					break;
				}
				if (allowOneWay && b.type === "cloud" && !b.falling && prevBottom <= tileTop + 1) {
					ent.y = tileTop - ent.h;
					ent.vy = 0;
					ent.onGround = true;
					landed = true;
					if (ent === this._player && !b.destroying) {
						b.destroying = true;
						b.destroyTimer = 60;
					}
					break;
				}
			}
			// Moving platforms (one-way, land from above)
			if (!landed && allowOneWay) {
				for (const p of this._platforms) {
					if (ent.x + ent.w <= p.x || ent.x >= p.x + p.w) continue;
					if (prevBottom <= p.y + 1 && ent.y + ent.h >= p.y) {
						ent.y = p.y - ent.h;
						ent.vy = 0;
						ent.onGround = true;
						ent.platform = p;
						break;
					}
				}
			}
		} else {
			const tyHead = Math.floor(ent.y / TILE);
			for (let tx = txL; tx <= txR; tx++) {
				const b = this._getTile(tx, tyHead);
				if (b && this._isSolid(b.type)) {
					ent.y = (tyHead + 1) * TILE;
					if (b.type === "question" && !b.used && ent === this._player) {
						b.used = true;
						const item = b.item || "coin";
						if (item === "coin") {
							this._score += 50;
							this._coinCount++;
							this._notifyState();
							this._addParticle(b.gx * TILE + TILE / 2, b.gy * TILE - 4, "+50 🪙", "#f8b800");
						} else {
							this._spawnItem(item, b.gx, b.gy);
						}
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

	// ── Items (star / mushroom / flower) ───────────────────────────────────

	_spawnItem(type, gx, gy) {
		const cx = gx * TILE + TILE / 2;
		const baseY = gy * TILE - 22;
		const dir = this._player && this._player.x + this._player.w / 2 > cx ? -1 : 1;
		if (type === "star") {
			this._items.push({
				type,
				x: cx - 10,
				y: baseY,
				vx: dir * 2.4,
				vy: -8,
				w: 20,
				h: 20,
				alive: true,
				frame: 0
			});
		} else {
			this._items.push({
				type,
				x: cx - 11,
				y: baseY,
				vx: dir * 1.8,
				vy: 0,
				w: 22,
				h: 22,
				alive: true,
				frame: 0
			});
		}
		this._addParticle(
			cx,
			gy * TILE - 4,
			type === "star" ? "⭐" : type === "mushroom" ? "🍄" : "🌸",
			"#fff"
		);
	}

	_updateItems() {
		const player = this._player;
		for (const it of this._items) {
			if (!it.alive) continue;
			it.frame++;

			it.vy = Math.min(it.vy + GRAVITY, MAX_FALL);
			const prevBottom = it.y + it.h;
			it.y += it.vy;
			const txL = Math.floor(it.x / TILE);
			const txR = Math.floor((it.x + it.w - 1) / TILE);

			if (it.vy >= 0) {
				const tyFoot = Math.floor((it.y + it.h - 1) / TILE);
				for (let tx = txL; tx <= txR; tx++) {
					const b = this._getTile(tx, tyFoot);
					if (!b) continue;
					const tileTop = tyFoot * TILE;
					const supports = this._isSolid(b.type) || (b.type === "cloud" && !b.falling);
					if (supports && prevBottom <= tileTop + 1) {
						it.y = tileTop - it.h;
						if (it.type === "star") {
							it.vy = -10;
						} else {
							it.vy = 0;
						}
						break;
					}
				}
			} else {
				const tyHead = Math.floor(it.y / TILE);
				for (let tx = txL; tx <= txR; tx++) {
					const b = this._getTile(tx, tyHead);
					if (b && this._isSolid(b.type)) {
						it.y = (tyHead + 1) * TILE;
						it.vy = 0;
						break;
					}
				}
			}

			it.x += it.vx;
			const tyT = Math.floor(it.y / TILE);
			const tyB = Math.floor((it.y + it.h - 1) / TILE);
			if (it.vx > 0) {
				const txR2 = Math.floor((it.x + it.w - 1) / TILE);
				for (let ty = tyT; ty <= tyB; ty++) {
					const b = this._getTile(txR2, ty);
					if (b && this._isSolid(b.type)) {
						it.x = txR2 * TILE - it.w;
						it.vx *= -1;
						break;
					}
				}
			} else if (it.vx < 0) {
				const txL2 = Math.floor(it.x / TILE);
				for (let ty = tyT; ty <= tyB; ty++) {
					const b = this._getTile(txL2, ty);
					if (b && this._isSolid(b.type)) {
						it.x = (txL2 + 1) * TILE;
						it.vx *= -1;
						break;
					}
				}
			}
			if (it.x < 0) {
				it.x = 0;
				it.vx = Math.abs(it.vx);
			} else if (it.x + it.w > GW) {
				it.x = GW - it.w;
				it.vx = -Math.abs(it.vx);
			}

			for (const e of this._enemies) {
				if (!e.alive) continue;
				if (this._overlap(it, e)) {
					it.vx = it.x + it.w / 2 < e.x + e.w / 2 ? -Math.abs(it.vx) : Math.abs(it.vx);
					it.vy = -6;
					break;
				}
			}

			if (it.y > GH + 60) {
				it.alive = false;
				continue;
			}

			if (player && this._overlap(player, it)) {
				it.alive = false;
				this._applyItemEffect(it.type);
			}
		}
		this._items = this._items.filter((i) => i.alive);
	}

	_applyItemEffect(type) {
		const player = this._player;
		const cx = player.x + player.w / 2;
		const top = player.y;
		if (type === "star") {
			player.starInvincible = 300; // 5s @ 60fps
			this._score += 1000;
			this._notifyState();
			this._addParticle(cx, top, "⭐ INVINCIBLE !", "#f8b800");
		} else if (type === "mushroom") {
			if (!player.big) {
				player.big = true;
				const newH = Math.round(PLAYER_H * 1.3);
				const dh = newH - player.h;
				player.y -= dh;
				player.h = newH;
				player.w = Math.round(PLAYER_W * 1.2);
			}
			this._lives++;
			this._score += 500;
			this._notifyState();
			this._addParticle(cx, top, "🍄 +1 ❤️", "#ff4444");
		} else if (type === "flower") {
			player.fire = true;
			if (!player.big) {
				player.big = true;
				const newH = Math.round(PLAYER_H * 1.3);
				const dh = newH - player.h;
				player.y -= dh;
				player.h = newH;
				player.w = Math.round(PLAYER_W * 1.2);
			}
			this._lives++;
			this._score += 700;
			this._notifyState();
			this._addParticle(cx, top, "🌸 FEU !", "#ff66cc");
		}
	}

	// ── Moving platforms ───────────────────────────────────────────────────

	_updatePlatforms() {
		const player = this._player;
		for (const p of this._platforms) {
			const oldX = p.x;
			p.x += p.vx;
			if (p.x < p.minX) {
				p.x = p.minX;
				p.vx = Math.abs(p.vx);
			} else if (p.x + p.w > p.maxX) {
				p.x = p.maxX - p.w;
				p.vx = -Math.abs(p.vx);
			}
			const dx = p.x - oldX;
			if (player && player.platform === p && dx !== 0) {
				player.x = Math.max(0, Math.min(GW - player.w, player.x + dx));
			}
		}
	}

	// ── Damage ─────────────────────────────────────────────────────────────

	_damagePlayer(knockbackFromX) {
		const p = this._player;
		if (p.big) {
			const dh = p.h - PLAYER_H;
			p.big = false;
			p.h = PLAYER_H;
			p.w = PLAYER_W;
			p.y += dh;
		}
		p.fire = false;
		this._lives--;
		p.invincible = 80;
		if (knockbackFromX != null) {
			p.vx = p.x < knockbackFromX ? -4.5 : 4.5;
			p.vy = -6;
		} else {
			p.vy = -9;
		}
		this._notifyState();
		if (this._lives <= 0) {
			this._gameState = "dead";
			setTimeout(() => this._notifyState(), 700);
		}
	}

	// ── Player fireball (flower power) ─────────────────────────────────────

	_spawnPlayerFireball() {
		const p = this._player;
		this._fireballs.push({
			x: p.dir > 0 ? p.x + p.w : p.x - 12,
			y: p.y + p.h * 0.4,
			vx: p.dir * 6,
			vy: -1,
			w: 12,
			h: 12,
			alive: true,
			frame: 0,
			friendly: true,
			bounces: 0
		});
	}

	// ── Game loop ──────────────────────────────────────────────────────────

	start() {
		this._lives = 3;
		this._coinCount = 0;
		this._score = 0;
		this._particles = [];
		this._fireballs = [];
		this._items = [];
		this._frame = 0;
		this._jumpBuffer = 0;
		this._gameState = "playing";
		this._notifyState();
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = requestAnimationFrame(this._loop.bind(this));
	}

	stop() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
		this._gameState = "menu";
		this._notifyState();
	}

	renderStatic() {
		this._render();
	}

	setGrid(show) {
		this._showGrid = show;
		if (this._gameState !== "playing") this._render();
	}

	setHoveredCell(col, row) {
		this._hoveredCell = col !== null ? { col, row } : null;
		if (this._gameState !== "playing") this._render();
	}

	_loop() {
		if (this._gameState !== "playing") return;
		this._frame++;
		this._update();
		this._render();
		this._raf = requestAnimationFrame(this._loop.bind(this));
	}

	_update() {
		const p = this._player;

		// ── Pipe animation (freeze normal physics) ──────────────────────────
		if (p.pipeState === "entering") {
			p.pipeTick++;
			if (p.pipeTick >= 30) {
				const dest = this._pipes.find((pipe) => pipe.id === p.pipeLinkedTo);
				if (dest) {
					p.x = dest.gx * TILE + (TILE - p.w) / 2;
					p.y = dest.gy * TILE;
					p.pipeClipY = dest.gy * TILE;
					p.pipeState = "exiting";
					p.pipeTick = 0;
				} else {
					p.pipeState = null;
				}
			}
			this._updateParticles();
			return;
		}
		if (p.pipeState === "exiting") {
			p.pipeTick++;
			if (p.pipeTick >= 30) {
				p.y = p.pipeClipY - p.h;
				p.vx = 0;
				p.vy = 0;
				p.onGround = true;
				p.pipeState = null;
			}
			this._updateParticles();
			return;
		}

		// Moving platforms (must run before player physics so carry works)
		this._updatePlatforms();

		if (this._K.left) {
			p.vx = -MOVE_SPD;
			p.dir = -1;
		} else if (this._K.right) {
			p.vx = MOVE_SPD;
			p.dir = 1;
		} else {
			p.vx *= 0.78;
		}

		if (p.onGround) {
			p.coyote = 6;
		} else if (p.coyote > 0) {
			p.coyote--;
		}

		if (this._jumpBuffer > 0) this._jumpBuffer--;

		const canJump = p.coyote > 0 && p.vy >= 0;
		if (this._jumpBuffer > 0 && canJump) {
			p.vy = JUMP_FORCE;
			p.onGround = false;
			p.coyote = 0;
			this._jumpBuffer = 0;
		}

		if (!this._K.jump && p.vy < -3.5) p.vy = Math.max(p.vy, -3.5);

		p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
		this._moveY(p, true);
		this._moveX(p);

		if (Math.abs(p.vx) > 0.4 && p.onGround) p.walkTick++;
		else p.walkTick = 0;

		if (p.invincible > 0) p.invincible--;
		if (p.starInvincible > 0) p.starInvincible--;
		if (p.fireCooldown > 0) p.fireCooldown--;

		// Throw fireball (flower power)
		if (this._K.firePress) {
			this._K.firePress = false;
			if (p.fire && p.fireCooldown === 0) {
				this._spawnPlayerFireball();
				p.fireCooldown = 14;
			}
		}

		// ── Lava: instant game over (invincibility shields) ─────────────────
		if (p.invincible === 0 && p.starInvincible === 0) {
			const txL = Math.floor(p.x / TILE);
			const txR = Math.floor((p.x + p.w - 1) / TILE);
			const tyT = Math.floor(p.y / TILE);
			const tyB = Math.floor((p.y + p.h - 1) / TILE);
			let lavaHit = false;
			for (let ty = tyT; ty <= tyB && !lavaHit; ty++) {
				for (let tx = txL; tx <= txR && !lavaHit; tx++) {
					const b = this._getTile(tx, ty);
					if (b && b.type === "lava") lavaHit = true;
				}
			}
			if (lavaHit) {
				this._lives = 0;
				p.invincible = 80;
				p.vy = -4;
				this._notifyState();
				this._gameState = "dead";
				this._addParticle(p.x + p.w / 2, p.y, "🔥 LAVA !", "#ff4400");
				setTimeout(() => this._notifyState(), 700);
				return;
			}
		}

		// ── Spike damage ────────────────────────────────────────────────────
		if (p.onGround && p.invincible === 0 && p.starInvincible === 0) {
			const footTileY = Math.floor((p.y + p.h) / TILE);
			const txL = Math.floor(p.x / TILE);
			const txR = Math.floor((p.x + p.w - 1) / TILE);
			for (let tx = txL; tx <= txR; tx++) {
				const b = this._getTile(tx, footTileY);
				if (b && b.type === "spike") {
					this._damagePlayer(null);
					break;
				}
			}
		}

		// ── Pipe entry ──────────────────────────────────────────────────────
		if (this._K.downPress) {
			this._K.downPress = false;
			if (p.onGround) {
				const pipe = this._getPipeUnderPlayer();
				if (pipe && pipe.linkedTo) {
					p.pipeState = "entering";
					p.pipeTick = 0;
					p.pipeClipY = pipe.gy * TILE;
					p.pipeLinkedTo = pipe.linkedTo;
					p.vx = 0;
					p.vy = 0;
				}
			}
		}

		// Enemies
		for (const e of this._enemies) {
			if (!e.alive) {
				if (e.squishTimer > 0) e.squishTimer--;
				continue;
			}

			if (e.onGround) {
				const aTx = e.vx > 0 ? Math.floor((e.x + e.w + 2) / TILE) : Math.floor((e.x - 2) / TILE);
				const footTy = Math.floor((e.y + e.h + 4) / TILE);
				if (!this._getTile(aTx, footTy)) e.vx *= -1;
			}

			const prevVx = e.vx;
			e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
			this._moveY(e, false);
			this._moveX(e);

			if (Math.abs(e.vx) < 0.05 && Math.abs(prevVx) > 0.1) {
				const spd = e.enemyType === "bowser" ? ENEMY_SPD * 0.5 : ENEMY_SPD;
				e.vx = prevVx > 0 ? -spd : spd;
			}
			if (e.y > GH + 60) {
				e.alive = false;
				continue;
			}

			// Bowser: hit flash + fireball timer
			if (e.enemyType === "bowser") {
				if (e.hitFlash > 0) e.hitFlash--;
				if (e.alive && e.onGround) {
					e.fireTimer++;
					if (e.fireTimer >= 180) {
						e.fireTimer = 0;
						this._spawnFireball(e);
					}
				}
			}

			// Player ↔ enemy (invincibility kills regular enemies on contact)
			if (this._overlap(p, e)) {
				if ((p.starInvincible > 0 || p.invincible > 0) && e.enemyType !== "bowser") {
					e.alive = false;
					e.squishTimer = 28;
					this._score += 200;
					this._notifyState();
					const icon = p.starInvincible > 0 ? "⭐" : "✨";
					this._addParticle(e.x + e.w / 2, e.y, `+200 ${icon}`, "#f8b800");
					continue;
				}
			}
			if (p.invincible === 0 && p.starInvincible === 0 && this._overlap(p, e)) {
				if (p.vy > 0 && p.y + p.h < e.y + e.h * 0.55) {
					if (e.enemyType === "bowser") {
						if (e.hitFlash === 0) {
							e.hp--;
							e.hitFlash = 60;
							p.vy = -9;
							const cx = e.x + e.w / 2;
							if (e.hp <= 0) {
								e.alive = false;
								e.squishTimer = 90;
								this._score += 1000;
								this._notifyState();
								this._addParticle(cx, e.y + 4, "+1000 ⭐", "#f8b800");
							} else {
								this._addParticle(cx, e.y + 4, "💥", "#ff4444");
							}
						} else {
							p.vy = -9;
						}
					} else {
						e.alive = false;
						e.squishTimer = 28;
						p.vy = -9;
						this._score += 200;
						this._notifyState();
						this._addParticle(e.x + e.w / 2, e.y, "+200 ⭐", "#44ff88");
					}
				} else {
					this._damagePlayer(e.x);
				}
			}
		}

		// Fireballs
		this._updateFireballs(p);

		// Items
		this._updateItems();

		// Coins
		for (const c of this._coins) {
			if (c.collected) continue;
			const cr = { x: c.gx * TILE + 8, y: c.gy * TILE + 6, w: TILE - 16, h: TILE - 12 };
			if (this._overlap(p, cr)) {
				c.collected = true;
				this._coinCount++;
				this._score += 50;
				this._notifyState();
				this._addParticle(c.gx * TILE + TILE / 2, c.gy * TILE, "+50 🪙", "#f8b800");
			}
		}

		// Goal / Flag
		if (this._goalCell) {
			const flagZone = {
				x: this._goalCell.gx * TILE - 2,
				y: this._goalCell.gy * TILE - TILE * 2,
				w: TILE + 4,
				h: TILE * 3
			};
			if (this._overlap(p, flagZone)) {
				this._score += 500;
				this._gameState = "win";
				setTimeout(() => this._notifyState(), 700);
			}
		}

		// Fell off screen
		if (p.y > GH + 80) {
			this._lives--;
			this._notifyState();
			if (this._lives <= 0) {
				this._gameState = "dead";
				setTimeout(() => this._notifyState(), 400);
			} else {
				this._respawn();
			}
		}

		this._updateClouds();
		this._updateParticles();
	}

	_updateClouds() {
		for (let i = this._blockList.length - 1; i >= 0; i--) {
			const b = this._blockList[i];
			if (b.type !== "cloud") continue;
			if (b.destroying && !b.falling) {
				b.destroyTimer--;
				if (b.destroyTimer <= 0) {
					b.falling = true;
					b.fallVy = 0;
					b.fallY = 0;
					delete this._tileMap[`${b.gx},${b.gy}`];
				}
			}
			if (b.falling) {
				b.fallVy = Math.min((b.fallVy || 0) + GRAVITY, MAX_FALL);
				b.fallY = (b.fallY || 0) + b.fallVy;
				if (b.gy * TILE + b.fallY > GH + TILE) {
					this._blockList.splice(i, 1);
				}
			}
		}
	}

	_respawn() {
		const p = this._player;
		if (this._marioSpawn) {
			p.x = this._marioSpawn.gx * TILE + (TILE - PLAYER_W) / 2;
			p.y = this._marioSpawn.gy * TILE - PLAYER_H;
		} else {
			const bases = this._blockList
				.filter((b) => b.type === "ground" || b.type === "brick")
				.sort((a, b) => a.gx - b.gx);
			if (bases.length > 0) {
				p.x = bases[0].gx * TILE + (TILE - PLAYER_W) / 2;
				p.y = bases[0].gy * TILE - PLAYER_H;
			} else {
				p.x = TILE;
				p.y = GH / 2;
			}
		}
		p.vx = 0;
		p.vy = 0;
		p.invincible = 80;
		p.pipeState = null;
		p.big = false;
		p.fire = false;
		p.h = PLAYER_H;
		p.w = PLAYER_W;
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
		sky.addColorStop(0, "#3b7de8");
		sky.addColorStop(0.6, "#6aa0f8");
		sky.addColorStop(1, "#90b8ff");
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, GW, GH);

		this._drawBgClouds();
		for (const b of this._blockList) this._drawBlock(b);
		for (const p of this._platforms) this._drawPlatform(p);
		if (this._goalCell)
			this._drawFlag(this._goalCell.gx, this._goalCell.gy, this._goalCell.colorClass);
		for (const c of this._coins) if (!c.collected) this._drawCoin(c.gx, c.gy, c.colorClass);
		for (const it of this._items) if (it.alive) this._drawItem(it);
		for (const e of this._enemies) this._drawEnemy(e);
		for (const fb of this._fireballs) if (fb.alive) this._drawFireball(fb);
		if (this._player) this._drawPlayer();

		ctx.save();
		ctx.font = 'bold 12px "Courier New"';
		ctx.textAlign = "center";
		for (const p of this._particles) {
			ctx.globalAlpha = Math.max(0, p.alpha);
			ctx.fillStyle = p.color;
			ctx.fillText(p.text, p.x, p.y);
		}
		ctx.globalAlpha = 1;
		ctx.restore();

		if (this._showGrid) this._drawGrid();
	}

	_drawGrid() {
		const ctx = this._ctx;
		ctx.save();

		if (this._hoveredCell) {
			ctx.fillStyle = "rgba(248,184,0,0.22)";
			ctx.fillRect(this._hoveredCell.col * TILE, this._hoveredCell.row * TILE, TILE, TILE);
		}

		ctx.strokeStyle = "rgba(0,0,0,0.55)";
		ctx.lineWidth = 1;
		for (let col = 0; col <= COLS; col++) {
			ctx.beginPath();
			ctx.moveTo(col * TILE, 0);
			ctx.lineTo(col * TILE, GH);
			ctx.stroke();
		}
		for (let row = 0; row <= ROWS; row++) {
			ctx.beginPath();
			ctx.moveTo(0, row * TILE);
			ctx.lineTo(GW, row * TILE);
			ctx.stroke();
		}

		if (this._hoveredCell) {
			const cx = this._hoveredCell.col;
			const cy = this._hoveredCell.row;
			const label = `x:${cx + 1}  y:${cy + 1}`;

			ctx.font = 'bold 10px "Courier New", monospace';
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			const tw = ctx.measureText(label).width + 12;
			const th = 18;

			let bx = cx * TILE + TILE / 2 - tw / 2;
			let by = cy * TILE - th - 5;
			if (by < 0) by = cy * TILE + TILE + 5;
			bx = Math.max(2, Math.min(GW - tw - 2, bx));

			ctx.fillStyle = "rgba(0,0,0,0.85)";
			ctx.fillRect(bx, by, tw, th);
			ctx.strokeStyle = "#f8b800";
			ctx.lineWidth = 1.5;
			ctx.strokeRect(bx, by, tw, th);

			ctx.fillStyle = "#f8b800";
			ctx.fillText(label, bx + 6, by + 4);
		}

		ctx.restore();
	}

	_drawBgClouds() {
		const ctx = this._ctx;
		const BG_CLOUDS = [
			{ x: 70, y: 55, s: 1.1 },
			{ x: 220, y: 38, s: 1.3 },
			{ x: 400, y: 62, s: 0.9 },
			{ x: 580, y: 42, s: 1.15 },
			{ x: 730, y: 68, s: 0.85 }
		];
		ctx.fillStyle = "rgba(255,255,255,0.5)";
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
		if (b.colorClass) ctx.filter = COLOR_FILTERS[b.colorClass];

		switch (b.type) {
			case "ground":
				ctx.fillStyle = "#bb3800";
				ctx.fillRect(x, y, T, T);
				ctx.fillStyle = "#e86800";
				ctx.fillRect(x, y, T, 6);
				ctx.fillStyle = "#881800";
				ctx.fillRect(x, y + T - 5, T, 5);
				ctx.fillStyle = "#992800";
				ctx.fillRect(x + T / 2 - 1, y + 6, 2, T - 11);
				ctx.fillRect(x + 1, y + T / 2 - 1, T - 2, 2);
				break;

			case "brick":
				ctx.fillStyle = "#c84008";
				ctx.fillRect(x, y, T, T);
				ctx.fillStyle = "#ffddaa";
				ctx.fillRect(x, y + 10, T, 2);
				ctx.fillRect(x, y + 22, T, 2);
				ctx.fillRect(x + 15, y, 2, 10);
				ctx.fillRect(x + 7, y + 12, 2, 10);
				ctx.fillRect(x + 23, y + 12, 2, 10);
				ctx.fillRect(x + 15, y + 24, 2, 8);
				break;

			case "question":
				if (b.used) {
					ctx.fillStyle = "#888";
					ctx.fillRect(x, y, T, T);
					ctx.fillStyle = "#666";
					for (let i = 0; i < T; i += 8) ctx.fillRect(x + i, y, 4, T);
				} else {
					const bob = Math.sin(this._frame * 0.12) * 2;
					ctx.fillStyle = "#f8b800";
					ctx.fillRect(x, y - bob, T, T);
					ctx.fillStyle = "#c87800";
					ctx.fillRect(x, y - bob, T, 3);
					ctx.fillRect(x, y - bob + T - 3, T, 3);
					ctx.fillRect(x, y - bob, 3, T);
					ctx.fillRect(x + T - 3, y - bob, 3, T);
					ctx.fillStyle = "#ffe044";
					ctx.fillRect(x + 3, y - bob + 3, T - 6, T - 6);
					ctx.fillStyle = "#fff";
					ctx.font = 'bold 20px "Press Start 2P", monospace';
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("?", x + T / 2, y - bob + T / 2);
					ctx.textBaseline = "alphabetic";
				}
				break;

			case "pipe_top": {
				const bw = T + 8,
					bx = x - 4;
				ctx.fillStyle = "#00bb00";
				ctx.fillRect(bx, y, bw, 14);
				ctx.fillStyle = "#008800";
				ctx.fillRect(bx, y + 14, bw, 4);
				ctx.fillStyle = "#009900";
				ctx.fillRect(x + 2, y + 18, T - 4, T - 18);
				ctx.fillStyle = "#00ee00";
				ctx.fillRect(bx + 3, y + 2, 6, 10);
				ctx.fillRect(x + 4, y + 20, 5, T - 22);
				break;
			}
			case "pipe_body":
				ctx.fillStyle = "#009900";
				ctx.fillRect(x + 2, y, T - 4, T);
				ctx.fillStyle = "#00ee00";
				ctx.fillRect(x + 4, y, 5, T);
				ctx.fillStyle = "#005500";
				ctx.fillRect(x + T - 7, y, 5, T);
				break;

			case "cloud": {
				let ox = 0;
				let oy = 0;
				if (b.destroying && !b.falling) {
					ox = Math.sin(this._frame * 1.2) * 2;
					oy = Math.cos(this._frame * 1.4) * 1.5;
				}
				if (b.falling) {
					oy = b.fallY || 0;
					ctx.globalAlpha = Math.max(0, 1 - (b.fallY || 0) / GH);
				}
				ctx.fillStyle = "rgba(210,225,255,0.88)";
				ctx.beginPath();
				this._cloudArc(x - 2 + ox, y + 6 + oy, 0.68);
				ctx.fill();
				ctx.globalAlpha = 1;
				break;
			}

			case "lava": {
				const wave = Math.sin(this._frame * 0.1 + b.gx * 0.6) * 2;
				const flick = (Math.sin(this._frame * 0.18 + b.gx * 1.3) + 1) * 0.5;
				ctx.fillStyle = "#5a0a00";
				ctx.fillRect(x, y, T, T);
				ctx.fillStyle = `rgb(${200 + flick * 55},${60 + flick * 80},0)`;
				ctx.fillRect(x, y + 4, T, T - 4);
				ctx.fillStyle = `rgb(${230 + flick * 25},${140 + flick * 90},${30 + flick * 50})`;
				ctx.fillRect(x, y + 6, T, T - 8);
				ctx.fillStyle = "#ffe066";
				ctx.fillRect(x, y + 4 + wave, T, 2);
				ctx.fillStyle = "#fff5b0";
				ctx.fillRect(x + 4, y + 3 + wave, 6, 1);
				ctx.fillRect(x + T - 12, y + 5 - wave, 8, 1);
				const bubX = x + ((this._frame * 0.7 + b.gx * 11) % T);
				ctx.fillStyle = "#fff";
				ctx.globalAlpha = 0.6;
				ctx.beginPath();
				ctx.arc(bubX, y + T - 6 - (this._frame % 30) * 0.2, 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.globalAlpha = 1;
				break;
			}

			case "spike": {
				ctx.fillStyle = "#3c3c3c";
				ctx.fillRect(x, y + 14, T, T - 14);
				ctx.fillStyle = "#555";
				ctx.fillRect(x, y + 14, T, 2);
				for (let i = 0; i < 4; i++) {
					const cx = x + i * 8 + 4;
					ctx.fillStyle = "#d0d0d0";
					ctx.fillRect(cx - 1, y, 2, 2);
					ctx.fillStyle = "#909090";
					ctx.fillRect(cx - 2, y + 2, 4, 4);
					ctx.fillStyle = "#b8b8b8";
					ctx.fillRect(cx - 2, y + 2, 1, 4);
					ctx.fillStyle = "#585858";
					ctx.fillRect(cx + 1, y + 2, 1, 4);
					ctx.fillStyle = "#707070";
					ctx.fillRect(cx - 3, y + 6, 6, 8);
					ctx.fillStyle = "#888";
					ctx.fillRect(cx - 3, y + 6, 1, 8);
					ctx.fillStyle = "#484848";
					ctx.fillRect(cx + 2, y + 6, 1, 8);
				}
				break;
			}
		}
		ctx.restore();
	}

	_drawPlatform(p) {
		const ctx = this._ctx;
		const x = Math.round(p.x);
		const y = Math.round(p.y);
		ctx.save();
		if (p.colorClass) ctx.filter = COLOR_FILTERS[p.colorClass];
		ctx.fillStyle = "#8a5a2a";
		ctx.fillRect(x, y, p.w, p.h);
		ctx.fillStyle = "#c8924a";
		ctx.fillRect(x, y, p.w, 3);
		ctx.fillStyle = "#5a3a18";
		ctx.fillRect(x, y + p.h - 2, p.w, 2);
		ctx.fillStyle = "#f8d878";
		for (let bx = 4; bx < p.w - 2; bx += 16) {
			ctx.fillRect(x + bx, y + 4, 2, 2);
			ctx.fillRect(x + bx, y + p.h - 5, 2, 2);
		}
		ctx.fillStyle = "rgba(255,255,255,0.35)";
		const ax = p.vx > 0 ? x + p.w - 6 : x + 2;
		ctx.fillRect(ax, y + p.h / 2 - 1, 4, 2);
		ctx.restore();
	}

	_drawItem(it) {
		const ctx = this._ctx;
		const x = Math.round(it.x),
			y = Math.round(it.y);
		if (it.type === "star") {
			const t = it.frame * 0.2;
			const hue = (it.frame * 6) % 360;
			ctx.save();
			ctx.translate(x + it.w / 2, y + it.h / 2);
			ctx.rotate(t);
			ctx.fillStyle = `hsl(${hue},100%,60%)`;
			ctx.beginPath();
			const R = 11,
				r = 4;
			for (let i = 0; i < 10; i++) {
				const ang = (Math.PI / 5) * i - Math.PI / 2;
				const rad = i % 2 === 0 ? R : r;
				const px = Math.cos(ang) * rad;
				const py = Math.sin(ang) * rad;
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			}
			ctx.closePath();
			ctx.fill();
			ctx.fillStyle = "#fff";
			ctx.beginPath();
			ctx.arc(-2, -2, 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		} else if (it.type === "mushroom") {
			ctx.fillStyle = "#cc0000";
			ctx.fillRect(x + 2, y + 2, it.w - 4, 4);
			ctx.fillRect(x, y + 6, it.w, 7);
			ctx.fillStyle = "#990000";
			ctx.fillRect(x, y + 11, it.w, 2);
			ctx.fillStyle = "#fff";
			ctx.fillRect(x + 4, y + 5, 4, 4);
			ctx.fillRect(x + it.w - 8, y + 7, 4, 4);
			ctx.fillRect(x + it.w / 2 - 1, y + 3, 3, 3);
			ctx.fillStyle = "#ffe6b3";
			ctx.fillRect(x + 5, y + 13, it.w - 10, it.h - 14);
			ctx.fillStyle = "#cc9966";
			ctx.fillRect(x + 5, y + it.h - 3, it.w - 10, 2);
			ctx.fillStyle = "#000";
			ctx.fillRect(x + 7, y + 15, 2, 3);
			ctx.fillRect(x + it.w - 9, y + 15, 2, 3);
		} else if (it.type === "flower") {
			const bob = Math.sin(it.frame * 0.2) * 1.5;
			ctx.fillStyle = "#2a8e2a";
			ctx.fillRect(x + it.w / 2 - 1, y + 12, 2, it.h - 12);
			ctx.fillStyle = "#3da830";
			ctx.fillRect(x + 4, y + 16, 5, 3);
			ctx.fillRect(x + it.w - 9, y + 18, 5, 3);
			ctx.fillStyle = "#ff66cc";
			const cx = x + it.w / 2;
			const cy = y + 8 + bob;
			ctx.beginPath();
			ctx.arc(cx, cy - 4, 4, 0, Math.PI * 2);
			ctx.arc(cx - 5, cy, 4, 0, Math.PI * 2);
			ctx.arc(cx + 5, cy, 4, 0, Math.PI * 2);
			ctx.arc(cx, cy + 4, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#ffeb3b";
			ctx.beginPath();
			ctx.arc(cx, cy, 3, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#000";
			ctx.fillRect(cx - 2, cy - 1, 1, 1);
			ctx.fillRect(cx + 1, cy - 1, 1, 1);
		}
	}

	_drawCoin(gx, gy, colorClass) {
		const ctx = this._ctx;
		ctx.save();
		if (colorClass) ctx.filter = COLOR_FILTERS[colorClass];
		const bob = Math.sin(this._frame * 0.1 + gx * 0.7) * 3;
		const ox = gx * TILE + 8;
		const oy = Math.round(gy * TILE + 8 + bob);
		const B = "#c87800",
			Y = "#f8b800",
			W = "#fff8b0";
		ctx.fillStyle = B;
		ctx.fillRect(ox + 4, oy, 8, 2);
		ctx.fillRect(ox + 2, oy + 2, 2, 2);
		ctx.fillRect(ox + 12, oy + 2, 2, 2);
		ctx.fillStyle = Y;
		ctx.fillRect(ox + 4, oy + 2, 8, 2);
		ctx.fillStyle = B;
		ctx.fillRect(ox, oy + 4, 2, 2);
		ctx.fillRect(ox + 14, oy + 4, 2, 2);
		ctx.fillStyle = W;
		ctx.fillRect(ox + 2, oy + 4, 4, 2);
		ctx.fillStyle = Y;
		ctx.fillRect(ox + 6, oy + 4, 8, 2);
		ctx.fillStyle = B;
		ctx.fillRect(ox, oy + 6, 2, 2);
		ctx.fillRect(ox + 14, oy + 6, 2, 2);
		ctx.fillStyle = W;
		ctx.fillRect(ox + 2, oy + 6, 4, 2);
		ctx.fillStyle = Y;
		ctx.fillRect(ox + 6, oy + 6, 8, 2);
		ctx.fillStyle = B;
		ctx.fillRect(ox, oy + 8, 2, 2);
		ctx.fillRect(ox + 14, oy + 8, 2, 2);
		ctx.fillStyle = Y;
		ctx.fillRect(ox + 2, oy + 8, 12, 2);
		ctx.fillStyle = B;
		ctx.fillRect(ox, oy + 10, 2, 2);
		ctx.fillRect(ox + 14, oy + 10, 2, 2);
		ctx.fillStyle = Y;
		ctx.fillRect(ox + 2, oy + 10, 12, 2);
		ctx.fillStyle = B;
		ctx.fillRect(ox + 2, oy + 12, 2, 2);
		ctx.fillRect(ox + 12, oy + 12, 2, 2);
		ctx.fillStyle = Y;
		ctx.fillRect(ox + 4, oy + 12, 8, 2);
		ctx.fillStyle = B;
		ctx.fillRect(ox + 4, oy + 14, 8, 2);
		ctx.restore();
	}

	_drawFlag(gx, gy, colorClass) {
		const ctx = this._ctx;
		ctx.save();
		if (colorClass) ctx.filter = COLOR_FILTERS[colorClass];
		const px = gx * TILE + TILE / 2;
		const py = gy * TILE;
		const ph = TILE * 3;

		ctx.fillStyle = "#aaaaaa";
		ctx.fillRect(px - 2, py - ph, 4, ph + TILE + 2);

		ctx.fillStyle = "#00cc00";
		const wave = Math.sin(this._frame * 0.09) * 5;
		ctx.beginPath();
		ctx.moveTo(px + 2, py - ph);
		ctx.quadraticCurveTo(px + 22, py - ph + 11 + wave, px + 2, py - ph + 22);
		ctx.fill();

		ctx.fillStyle = "#f8b800";
		ctx.beginPath();
		ctx.arc(px, py - ph, 5, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	_drawKoopaSprite(e, x, y) {
		const ctx = this._ctx;
		const ft = Math.floor(this._frame / 10) % 2;
		if (!e.alive) {
			if (e.squishTimer > 0) {
				ctx.fillStyle = "#2d6b2d";
				ctx.fillRect(x + 2, y + e.h - 6, e.w - 4, 6);
				ctx.fillStyle = "#4ca84c";
				ctx.fillRect(x + 4, y + e.h - 5, e.w - 8, 4);
				ctx.fillStyle = "#1a3d1a";
				ctx.fillRect(x + 11, y + e.h - 6, 2, 6);
			}
			return;
		}
		ctx.fillStyle = "#2d6b2d";
		ctx.fillRect(x + 3, y + 6, 18, 14);
		ctx.fillStyle = "#4ca84c";
		ctx.fillRect(x + 5, y + 8, 14, 10);
		ctx.fillStyle = "#72c272";
		ctx.fillRect(x + 6, y + 9, 5, 4);
		ctx.fillStyle = "#1a3d1a";
		ctx.fillRect(x + 3, y + 13, 18, 2);
		ctx.fillStyle = "#1a3d1a";
		ctx.fillRect(x + 12, y + 6, 2, 14);
		ctx.fillStyle = "#f0d050";
		ctx.fillRect(x + 7, y + 1, 12, 7);
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(x + 8, y + 2, 3, 3);
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(x + 14, y + 2, 3, 3);
		ctx.fillStyle = "#111111";
		ctx.fillRect(x + 9, y + 3, 2, 2);
		ctx.fillStyle = "#111111";
		ctx.fillRect(x + 15, y + 3, 2, 2);
		ctx.fillStyle = "#e87820";
		ctx.fillRect(x + 11, y + 6, 7, 2);
		ctx.fillStyle = "#f0d050";
		ctx.fillRect(x, y + 9, 4, 4);
		ctx.fillStyle = "#f0d050";
		ctx.fillRect(x + 20, y + 9, 4, 4);
		ctx.fillStyle = "#e87820";
		if (ft === 0) {
			ctx.fillRect(x + 4, y + 20, 7, 4);
			ctx.fillRect(x + 15, y + 18, 7, 4);
		} else {
			ctx.fillRect(x + 4, y + 18, 7, 4);
			ctx.fillRect(x + 15, y + 20, 7, 4);
		}
	}

	_spawnFireball(bowser) {
		const p = this._player;
		const dir = p.x + p.w / 2 < bowser.x + bowser.w / 2 ? -1 : 1;
		this._fireballs.push({
			x: dir < 0 ? bowser.x - 14 : bowser.x + bowser.w,
			y: bowser.y + bowser.h * 0.35,
			vx: dir * 4.5,
			vy: -1.5,
			w: 12,
			h: 12,
			alive: true,
			frame: 0,
			friendly: false
		});
	}

	_updateFireballs(p) {
		for (const fb of this._fireballs) {
			if (!fb.alive) continue;
			fb.frame++;
			fb.x += fb.vx;
			fb.vy = Math.min(fb.vy + GRAVITY * 0.4, 8);
			fb.y += fb.vy;
			if (fb.x < -20 || fb.x > GW + 20 || fb.y > GH + 20) {
				fb.alive = false;
				continue;
			}
			const txL = Math.floor(fb.x / TILE),
				txR = Math.floor((fb.x + fb.w - 1) / TILE);
			const tyT = Math.floor(fb.y / TILE),
				tyB = Math.floor((fb.y + fb.h - 1) / TILE);
			let hitTile = null;
			let hitTy = -1;
			for (let ty = tyT; ty <= tyB && !hitTile; ty++) {
				for (let tx = txL; tx <= txR && !hitTile; tx++) {
					const t = this._getTile(tx, ty);
					if (t && this._isSolid(t.type)) {
						hitTile = t;
						hitTy = ty;
					}
				}
			}
			if (hitTile) {
				if (fb.friendly && fb.vy > 0 && fb.bounces < 3) {
					fb.y = hitTy * TILE - fb.h;
					fb.vy = -6;
					fb.bounces++;
				} else {
					fb.alive = false;
					continue;
				}
			}

			if (fb.friendly) {
				for (const e of this._enemies) {
					if (!e.alive) continue;
					if (this._overlap(fb, e)) {
						fb.alive = false;
						if (e.enemyType === "bowser") {
							if (e.hitFlash === 0) {
								e.hp--;
								e.hitFlash = 60;
								const cx = e.x + e.w / 2;
								if (e.hp <= 0) {
									e.alive = false;
									e.squishTimer = 90;
									this._score += 1000;
									this._notifyState();
									this._addParticle(cx, e.y + 4, "+1000 ⭐", "#f8b800");
								} else {
									this._addParticle(cx, e.y + 4, "🔥", "#ff6600");
								}
							}
						} else {
							e.alive = false;
							e.squishTimer = 28;
							this._score += 200;
							this._notifyState();
							this._addParticle(e.x + e.w / 2, e.y, "+200 🔥", "#ff8844");
						}
						break;
					}
				}
			} else {
				if (p.invincible === 0 && p.starInvincible === 0 && this._overlap(p, fb)) {
					fb.alive = false;
					this._damagePlayer(fb.x);
				}
			}
		}
		this._fireballs = this._fireballs.filter((fb) => fb.alive);
	}

	_drawFireball(fb) {
		const ctx = this._ctx;
		const x = Math.round(fb.x),
			y = Math.round(fb.y);
		const f = Math.floor(fb.frame / 4) % 2;
		if (fb.friendly) {
			ctx.save();
			ctx.translate(x + fb.w / 2, y + fb.h / 2);
			ctx.rotate((fb.frame * 0.5) % (Math.PI * 2));
			ctx.fillStyle = "#ffd600";
			ctx.beginPath();
			ctx.arc(0, 0, 6, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#ff6d00";
			ctx.beginPath();
			ctx.arc(0, 0, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#fff8b0";
			ctx.beginPath();
			ctx.arc(-1, -1, 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
			return;
		}
		ctx.fillStyle = "#bf360c";
		ctx.fillRect(x + 2, y, 8, 2);
		ctx.fillRect(x, y + 2, 12, 8);
		ctx.fillRect(x + 2, y + 10, 8, 2);
		ctx.fillStyle = "#ff6d00";
		ctx.fillRect(x + 2, y + 2, 8, 8);
		ctx.fillStyle = "#ffd600";
		ctx.fillRect(x + 3 + f, y + 3, 5, 5);
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(x + 4 + f, y + 4, 3, 3);
	}

	_drawBowserSprite(e, x, y) {
		const ctx = this._ctx;
		const G = "#3da830";
		const Gd = "#2a7020";
		const O = "#d47c3c";
		const Od = "#b05820";
		const W = "#ffffff";
		const ft = Math.floor(this._frame / 14) % 2;
		if (e.hitFlash > 0 && Math.floor(e.hitFlash / 5) % 2 === 1) ctx.globalAlpha = 0.4;

		if (!e.alive) {
			if (e.squishTimer > 0) {
				ctx.fillStyle = G;
				ctx.fillRect(x + 2, y + e.h - 10, e.w - 4, 10);
				ctx.fillStyle = Gd;
				ctx.fillRect(x + 2, y + e.h - 10, 4, 10);
			}
			ctx.globalAlpha = 1;
			return;
		}

		ctx.save();
		if (e.vx > 0) {
			ctx.translate(x + e.w, 0);
			ctx.scale(-1, 1);
			ctx.translate(-x, 0);
		}

		ctx.fillStyle = W;
		ctx.fillRect(x + 2, y + 0, 6, 10);
		ctx.fillRect(x + 10, y + 0, 6, 14);
		ctx.fillRect(x + 18, y + 2, 6, 10);
		ctx.fillStyle = O;
		ctx.fillRect(x + 0, y + 8, 22, 16);
		ctx.fillRect(x + 2, y + 6, 18, 4);
		ctx.fillStyle = Od;
		ctx.fillRect(x + 0, y + 20, 22, 4);
		ctx.fillStyle = Gd;
		ctx.fillRect(x + 10, y + 4, 38, 36);
		ctx.fillStyle = G;
		ctx.fillRect(x + 12, y + 6, 34, 32);
		ctx.fillStyle = W;
		ctx.fillRect(x + 14, y + 8, 8, 6);
		ctx.fillRect(x + 26, y + 8, 8, 6);
		ctx.fillRect(x + 38, y + 10, 6, 6);
		ctx.fillRect(x + 16, y + 18, 8, 6);
		ctx.fillRect(x + 28, y + 18, 8, 6);
		ctx.fillRect(x + 38, y + 20, 6, 5);
		ctx.fillRect(x + 14, y + 28, 8, 6);
		ctx.fillRect(x + 26, y + 28, 8, 6);
		ctx.fillRect(x + 38, y + 30, 6, 5);
		ctx.fillStyle = O;
		ctx.fillRect(x + 0, y + 22, 14, 8);
		ctx.fillStyle = Od;
		ctx.fillRect(x + 0, y + 28, 14, 2);
		ctx.fillStyle = W;
		ctx.fillRect(x + 0, y + 26, 6, 8);
		ctx.fillRect(x + 8, y + 28, 6, 6);
		ctx.fillStyle = O;
		ctx.fillRect(x + 10, y + 24, 4, 16);
		ctx.fillStyle = O;
		if (ft === 0) {
			ctx.fillRect(x + 12, y + 38, 14, 10);
			ctx.fillRect(x + 30, y + 38, 14, 8);
		} else {
			ctx.fillRect(x + 12, y + 38, 14, 8);
			ctx.fillRect(x + 30, y + 38, 14, 10);
		}
		ctx.fillStyle = W;
		ctx.fillRect(x + 10, y + 44, 6, 6);
		ctx.fillRect(x + 18, y + 46, 6, 4);
		ctx.fillRect(x + 28, y + 44, 6, 6);
		ctx.fillRect(x + 36, y + 44, 6, 4);

		ctx.restore();

		for (let i = 0; i < e.hp; i++) {
			ctx.fillStyle = "#e53935";
			ctx.fillRect(x + e.w / 2 - (e.hp * 7) / 2 + i * 7, y - 10, 5, 5);
		}
		ctx.globalAlpha = 1;
	}

	_drawEnemy(e) {
		const ctx = this._ctx;
		const x = Math.round(e.x);
		const y = Math.round(e.y);
		ctx.save();
		if (e.colorClass) ctx.filter = COLOR_FILTERS[e.colorClass];

		if (e.enemyType === "bowser") {
			this._drawBowserSprite(e, x, y);
			ctx.restore();
			return;
		}

		if (e.enemyType === "koopa") {
			this._drawKoopaSprite(e, x, y);
			ctx.restore();
			return;
		}

		if (!e.alive) {
			if (e.squishTimer > 0) {
				ctx.fillStyle = "#b02800";
				ctx.fillRect(x, y + e.h - 8, e.w, 8);
				ctx.fillStyle = "#702000";
				ctx.fillRect(x + 2, y + e.h - 6, 4, 4);
				ctx.fillRect(x + e.w - 6, y + e.h - 6, 4, 4);
			}
			ctx.restore();
			return;
		}

		const ft = Math.floor(this._frame / 11) % 2;

		ctx.fillStyle = "#b02800";
		ctx.fillRect(x + 2, y + 11, e.w - 4, e.h - 11);
		ctx.fillRect(x + 3, y + 7, e.w - 6, 6);
		ctx.fillStyle = "#901800";
		ctx.fillRect(x, y + 2, e.w, 12);
		ctx.fillRect(x + 2, y, e.w - 4, 4);

		ctx.fillStyle = "white";
		ctx.fillRect(x + 3, y + 3, 5, 5);
		ctx.fillRect(x + 16, y + 3, 5, 5);
		ctx.fillStyle = "#111";
		ctx.fillRect(x + 4, y + 4, 3, 3);
		ctx.fillRect(x + 17, y + 4, 3, 3);

		ctx.fillStyle = "#111";
		ctx.save();
		ctx.translate(x + 5, y + 3);
		ctx.rotate(-0.32);
		ctx.fillRect(0, 0, 7, 2);
		ctx.restore();
		ctx.save();
		ctx.translate(x + 14, y + 3);
		ctx.rotate(0.32);
		ctx.fillRect(2, 0, 7, 2);
		ctx.restore();

		ctx.fillStyle = "ivory";
		ctx.fillRect(x + 7, y + 11, 4, 3);
		ctx.fillRect(x + 13, y + 11, 4, 3);

		ctx.fillStyle = "#601000";
		if (ft === 0) {
			ctx.fillRect(x, y + e.h - 6, 9, 6);
			ctx.fillRect(x + e.w - 7, y + e.h - 4, 9, 4);
		} else {
			ctx.fillRect(x, y + e.h - 4, 9, 4);
			ctx.fillRect(x + e.w - 7, y + e.h - 6, 9, 6);
		}
		ctx.restore();
	}

	_drawPlayer() {
		const ctx = this._ctx;
		const p = this._player;
		const x = Math.round(p.x);

		// Blink when post-damage invincible (but not while star)
		if (
			p.invincible > 0 &&
			p.starInvincible === 0 &&
			Math.floor(p.invincible / 5) % 2 === 1
		)
			return;

		// Pipe animation: slide into / out of pipe with clipping
		let y = Math.round(p.y);
		let pipeClip = false;
		if (p.pipeState === "entering") {
			y = Math.round(p.y + (p.pipeTick / 30) * p.h);
			pipeClip = true;
		} else if (p.pipeState === "exiting") {
			y = Math.round(p.pipeClipY - (p.pipeTick / 30) * p.h);
			pipeClip = true;
		}

		if (pipeClip) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, 0, GW, p.pipeClipY);
			ctx.clip();
		}

		// Star glow aura
		if (p.starInvincible > 0) {
			const pulse = 0.5 + 0.5 * Math.sin(this._frame * 0.4);
			const hue = (this._frame * 8) % 360;
			ctx.save();
			ctx.globalAlpha = 0.55 + 0.25 * pulse;
			const grad = ctx.createRadialGradient(
				x + p.w / 2,
				y + p.h / 2,
				2,
				x + p.w / 2,
				y + p.h / 2,
				p.w
			);
			grad.addColorStop(0, `hsla(${hue},100%,70%,0.95)`);
			grad.addColorStop(1, `hsla(${hue},100%,60%,0)`);
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(x + p.w / 2, y + p.h / 2, p.w * 1.1, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}

		const wf = p.onGround ? Math.floor(p.walkTick / 7) % 3 : -1;

		ctx.save();

		// Filters: pink for fire, hue-rotate rainbow for star
		const filters = [];
		if (p.fire) filters.push("hue-rotate(310deg) saturate(1.4)");
		if (p.starInvincible > 0) {
			const hue = (this._frame * 12) % 360;
			filters.push(`hue-rotate(${hue}deg) saturate(1.6) brightness(1.15)`);
		}
		if (filters.length) ctx.filter = filters.join(" ");

		// Big mode scale around top-left of hitbox
		if (p.big) {
			ctx.translate(x, y);
			ctx.scale(p.w / PLAYER_W, p.h / PLAYER_H);
			ctx.translate(-x, -y);
		}

		if (p.dir === -1) {
			ctx.translate(x + PLAYER_W, 0);
			ctx.scale(-1, 1);
			ctx.translate(-x, 0);
		}

		ctx.fillStyle = "#dd1100";
		ctx.fillRect(x + 3, y, 16, 5);
		ctx.fillRect(x + 1, y + 3, 18, 4);
		ctx.fillRect(x + 16, y + 4, 8, 3);

		ctx.fillStyle = "#5a2200";
		ctx.fillRect(x + 3, y + 5, 4, 2);

		ctx.fillStyle = "#fca060";
		ctx.fillRect(x + 2, y + 6, 18, 9);
		ctx.fillRect(x + 1, y + 7, 2, 7);

		ctx.fillStyle = "#e07040";
		ctx.fillRect(x + 15, y + 9, 5, 3);

		ctx.fillStyle = "#111";
		ctx.fillRect(x + 13, y + 7, 4, 4);
		ctx.fillStyle = "white";
		ctx.fillRect(x + 14, y + 7, 2, 2);

		ctx.fillStyle = "#5a2200";
		ctx.fillRect(x + 7, y + 12, 12, 2);
		ctx.fillRect(x + 9, y + 13, 10, 2);

		ctx.fillStyle = "#dd1100";
		ctx.fillRect(x + 4, y + 15, 14, 5);

		ctx.fillStyle = "#0022cc";
		ctx.fillRect(x + 2, y + 15, 5, 9);
		ctx.fillRect(x + 15, y + 15, 5, 9);
		ctx.fillRect(x + 2, y + 20, 18, 4);

		ctx.fillStyle = "#f8b800";
		ctx.fillRect(x + 5, y + 17, 2, 2);
		ctx.fillRect(x + 15, y + 17, 2, 2);

		ctx.fillStyle = "#0022cc";
		if (wf === -1) {
			ctx.fillRect(x + 2, y + 24, 7, 4);
			ctx.fillRect(x + 13, y + 22, 7, 4);
		} else if (wf === 1) {
			ctx.fillRect(x + 3, y + 24, 7, 4);
			ctx.fillRect(x + 13, y + 22, 7, 6);
		} else if (wf === 2) {
			ctx.fillRect(x + 3, y + 22, 7, 6);
			ctx.fillRect(x + 13, y + 24, 7, 4);
		} else {
			ctx.fillRect(x + 3, y + 24, 7, 4);
			ctx.fillRect(x + 13, y + 24, 7, 4);
		}

		ctx.fillStyle = "#5a2200";
		if (wf === 1) {
			ctx.fillRect(x + 1, y + 27, 11, 4);
			ctx.fillRect(x + 12, y + 25, 11, 4);
		} else if (wf === 2) {
			ctx.fillRect(x + 1, y + 25, 11, 4);
			ctx.fillRect(x + 12, y + 27, 11, 4);
		} else {
			ctx.fillRect(x + 1, y + 27, 11, 4);
			ctx.fillRect(x + 11, y + 27, 11, 4);
		}

		ctx.restore();
		if (pipeClip) ctx.restore();
	}
}
