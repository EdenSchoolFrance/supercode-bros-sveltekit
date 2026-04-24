/* ╔═══════════════════════════════════════════════════════╗
   ║  JAVASCRIPT — NE PAS MODIFIER / DO NOT MODIFY        ║
   ╚═══════════════════════════════════════════════════════╝ */
'use strict';

// ┌──────────────────────────────────────────┐
// │  CONSTANTES                              │
// └──────────────────────────────────────────┘
const TILE = 32;
const COLS = 25;
const ROWS = 15;
const GW = COLS * TILE; // 800 px
const GH = ROWS * TILE; // 480 px

const GRAVITY = 0.48;
const JUMP_FORCE = -12.5;
const MOVE_SPD = 3.6;
const MAX_FALL = 15;
const PLAYER_W = 22;
const PLAYER_H = 28;
const ENEMY_W = 24;
const ENEMY_H = 24;
const ENEMY_SPD = 1.3;

const COLOR_FILTERS = {
	red:   'sepia(1) saturate(6) hue-rotate(0deg)',
	green: 'sepia(1) saturate(6) hue-rotate(80deg)',
	blue:  'sepia(1) saturate(6) hue-rotate(195deg)',
};

function getColorClass(el) {
	const classes = (el.className || '').split(' ');
	for (const c of ['red', 'green', 'blue']) if (classes.includes(c)) return c;
	return null;
}

// ┌──────────────────────────────────────────┐
// │  ÉTAT DU JEU                             │
// └──────────────────────────────────────────┘
const cvs = document.getElementById('gameCanvas');
const ctx = cvs.getContext('2d');

let gameState = 'menu'; // 'menu' | 'playing' | 'dead' | 'win'
let frame = 0;
let raf = null;
let showGrid = false;
let hoveredCell = null;

// Level data
let tileMap = {}; // "gx,gy" => block object
let blockList = [];
let coins = [];
let enemies = [];
let particles = [];
let goalCell = null;
let pipes = [];

// Player & score
let player = null;
let lives = 3;
let coinCount = 0;
let score = 0;

// ┌──────────────────────────────────────────┐
// │  INPUT                                   │
// └──────────────────────────────────────────┘
const K = { left: false, right: false, jump: false, down: false, downPress: false };
let jumpBuffer = 0; // frames remaining to honour a queued jump

document.addEventListener('keydown', (e) => {
	const tag = e.target?.tagName?.toLowerCase();
	if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

	const gameKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's'].includes(
		e.key
	);
	if (gameKey && gameState === 'playing') e.preventDefault();

	if (e.key === 'ArrowLeft' || e.key === 'a') K.left = true;
	if (e.key === 'ArrowRight' || e.key === 'd') K.right = true;
	if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
		if (!K.jump) jumpBuffer = 8; // queue jump for up to 8 frames
		K.jump = true;
	}
	if (e.key === 'ArrowDown' || e.key === 's') {
		if (!K.down) K.downPress = true;
		K.down = true;
	}
	if (e.key === 'Enter' && gameState !== 'playing') startGame();
});

document.addEventListener('keyup', (e) => {
	const tag = e.target?.tagName?.toLowerCase();
	if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

	if (e.key === 'ArrowLeft' || e.key === 'a') K.left = false;
	if (e.key === 'ArrowRight' || e.key === 'd') K.right = false;
	if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') K.jump = false;
	if (e.key === 'ArrowDown' || e.key === 's') K.down = false;
});

// Touch/mouse buttons
function bindBtn(id, key) {
	const el = document.getElementById(id);
	if (!el) return;
	const down = () => {
		K[key] = true;
		if (key === 'jump') jumpBuffer = 8;
	};
	const up = () => {
		K[key] = false;
	};
	el.addEventListener(
		'touchstart',
		(e) => {
			e.preventDefault();
			down();
		},
		{ passive: false }
	);
	el.addEventListener(
		'touchend',
		(e) => {
			e.preventDefault();
			up();
		},
		{ passive: false }
	);
	el.addEventListener(
		'touchcancel',
		(e) => {
			e.preventDefault();
			up();
		},
		{ passive: false }
	);
	el.addEventListener('mousedown', down);
	el.addEventListener('mouseup', up);
}
bindBtn('tb-left', 'left');
bindBtn('tb-right', 'right');
bindBtn('tb-jump', 'jump');

document.getElementById('mainPlayBtn').addEventListener('click', startGame);

// ┌──────────────────────────────────────────┐
// │  LECTURE DU NIVEAU HTML                  │
// └──────────────────────────────────────────┘
function parseLevel() {
	tileMap = {};
	blockList = [];
	coins = [];
	enemies = [];
	goalCell = null;
	pipes = [];

	document
		.querySelectorAll(
			'#my-level h1,#my-level h2,#my-level h3,#my-level a,#my-level h5,#my-level h6,#my-level p,#my-level input,#my-level button'
		)
		.forEach((el) => {
			const tag = el.tagName.toLowerCase();
			if (tag === 'button') return;

			const rawX = parseInt(el.dataset.x);
			const rawY = parseInt(el.dataset.y);
			if (isNaN(rawX) || isNaN(rawY)) return;

			const gx = Math.max(0, Math.min(COLS - 1, rawX - 1));
			const gy = Math.max(0, Math.min(ROWS - 1, rawY - 1));

			const colorClass = getColorClass(el);
			switch (tag) {
				case 'h1':
					addTile(gx, gy, 'ground', colorClass);
					break;
				case 'h2':
					addTile(gx, gy, 'brick', colorClass);
					break;
				case 'h3':
					addTile(gx, gy, 'question', colorClass);
					break;
				case 'a': {
					const pipeGy = Math.min(gy, ROWS - 2);
					addTile(gx, pipeGy, 'pipe_top', colorClass);
					addTile(gx, Math.min(gy + 1, ROWS - 1), 'pipe_body', colorClass);
					const pipeId = el.id || null;
					const hrefAttr = el.getAttribute('href');
					const linkedTo = hrefAttr ? hrefAttr.replace(/^#/, '') : null;
					pipes.push({ id: pipeId, linkedTo, gx, gy: pipeGy });
					break;
				}
				case 'h5':
					addTile(gx, gy, 'cloud', colorClass);
					break;
				case 'h6':
					goalCell = { gx, gy, colorClass };
					break;
				case 'p':
					coins.push({ gx, gy, collected: false, colorClass });
					break;
				case 'input':
					enemies.push(makeEnemy(gx, gy, colorClass));
					break;
			}
		});

	// Player spawn: above leftmost ground/brick tile
	const bases = blockList
		.filter((b) => b.type === 'ground' || b.type === 'brick')
		.sort((a, b) => (a.gx !== b.gx ? a.gx - b.gx : a.gy - b.gy));

	let sx = TILE,
		sy = GH - TILE * 3;
	if (bases.length > 0) {
		sx = bases[0].gx * TILE + (TILE - PLAYER_W) / 2;
		sy = bases[0].gy * TILE - PLAYER_H;
	}
	player = makePlayer(sx, sy);
}

function addTile(gx, gy, type, colorClass = null) {
	const b = { gx, gy, type, used: false, colorClass };
	tileMap[`${gx},${gy}`] = b;
	blockList.push(b);
}

function getTile(gx, gy) {
	return tileMap[`${gx},${gy}`] || null;
}

// ┌──────────────────────────────────────────┐
// │  OBJETS DU JEU                           │
// └──────────────────────────────────────────┘
function makePlayer(x, y) {
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
		pipeLinkedTo: null
	};
}

function getPipeUnderPlayer() {
	if (!player.onGround) return null;
	const footTileY = Math.floor((player.y + player.h + 1) / TILE);
	const centerTileX = Math.floor((player.x + player.w / 2) / TILE);
	const tile = getTile(centerTileX, footTileY);
	if (!tile || tile.type !== 'pipe_top') return null;
	return pipes.find((pipe) => pipe.gx === centerTileX && pipe.gy === footTileY) || null;
}

function makeEnemy(gx, gy, colorClass = null) {
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
		colorClass
	};
}

// ┌──────────────────────────────────────────┐
// │  PHYSIQUE & COLLISIONS                   │
// └──────────────────────────────────────────┘
function isSolid(type) {
	// 'cloud' is one-way only
	return type !== 'cloud';
}

/*  moveY — move entity vertically, then resolve tile collisions.
    allowOneWay: if true, lands on 'cloud' tiles from above.     */
function moveY(ent, allowOneWay) {
	const prevBottom = ent.y + ent.h;
	ent.y += ent.vy;
	ent.onGround = false;

	const txL = Math.floor(ent.x / TILE);
	const txR = Math.floor((ent.x + ent.w - 1) / TILE);

	if (ent.vy >= 0) {
		// Falling — check floor
		const tyFoot = Math.floor((ent.y + ent.h - 1) / TILE);
		for (let tx = txL; tx <= txR; tx++) {
			const b = getTile(tx, tyFoot);
			if (!b) continue;
			const tileTop = tyFoot * TILE;
			if (isSolid(b.type) && prevBottom <= tileTop + 1) {
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
		// Rising — check ceiling
		const tyHead = Math.floor(ent.y / TILE);
		for (let tx = txL; tx <= txR; tx++) {
			const b = getTile(tx, tyHead);
			if (b && isSolid(b.type)) {
				ent.y = (tyHead + 1) * TILE;
				if (b.type === 'question' && !b.used && ent === player) {
					b.used = true;
					score += 50;
					coinCount++;
					updateHUD();
					addParticle(b.gx * TILE + TILE / 2, b.gy * TILE - 4, '+50 🪙', '#f8b800');
				}
				ent.vy = 0;
				break;
			}
		}
	}
}

/*  moveX — move entity horizontally, then resolve tile collisions. */
function moveX(ent) {
	ent.x += ent.vx;
	const tyT = Math.floor(ent.y / TILE);
	const tyB = Math.floor((ent.y + ent.h - 1) / TILE);

	if (ent.vx > 0) {
		const txR = Math.floor((ent.x + ent.w - 1) / TILE);
		for (let ty = tyT; ty <= tyB; ty++) {
			const b = getTile(txR, ty);
			if (b && isSolid(b.type)) {
				ent.x = txR * TILE - ent.w;
				ent.vx = 0;
				break;
			}
		}
	} else if (ent.vx < 0) {
		const txL = Math.floor(ent.x / TILE);
		for (let ty = tyT; ty <= tyB; ty++) {
			const b = getTile(txL, ty);
			if (b && isSolid(b.type)) {
				ent.x = (txL + 1) * TILE;
				ent.vx = 0;
				break;
			}
		}
	}

	// Level bounds
	ent.x = Math.max(0, Math.min(GW - ent.w, ent.x));
}

// ┌──────────────────────────────────────────┐
// │  PARTICULES                              │
// └──────────────────────────────────────────┘
function addParticle(x, y, text, color) {
	particles.push({ x, y, vy: -3.8, alpha: 1.0, text, color });
}

function updateParticles() {
	for (const p of particles) {
		p.y += p.vy;
		p.vy += 0.14;
		p.alpha -= 0.022;
	}
	particles = particles.filter((p) => p.alpha > 0);
}

// ┌──────────────────────────────────────────┐
// │  BOUCLE DE JEU                           │
// └──────────────────────────────────────────┘
function startGame() {
	parseLevel();
	lives = 3;
	coinCount = 0;
	score = 0;
	particles = [];
	frame = 0;
	jumpBuffer = 0;
	gameState = 'playing';
	updateHUD();
	hideOverlay();
	if (raf) cancelAnimationFrame(raf);
	raf = requestAnimationFrame(loop);
}

function loop() {
	if (gameState !== 'playing') return;
	frame++;
	update();
	render();
	raf = requestAnimationFrame(loop);
}

function update() {
	// ── Pipe animation (freeze normal physics) ──
	if (player.pipeState === 'entering') {
		player.pipeTick++;
		if (player.pipeTick >= 30) {
			const dest = pipes.find((pipe) => pipe.id === player.pipeLinkedTo);
			if (dest) {
				player.x = dest.gx * TILE + (TILE - player.w) / 2;
				player.y = dest.gy * TILE;
				player.pipeClipY = dest.gy * TILE;
				player.pipeState = 'exiting';
				player.pipeTick = 0;
			} else {
				player.pipeState = null;
			}
		}
		updateParticles();
		return;
	}
	if (player.pipeState === 'exiting') {
		player.pipeTick++;
		if (player.pipeTick >= 30) {
			player.y = player.pipeClipY - player.h;
			player.vx = 0;
			player.vy = 0;
			player.onGround = true;
			player.pipeState = null;
		}
		updateParticles();
		return;
	}

	// ── Player input ──
	if (K.left) {
		player.vx = -MOVE_SPD;
		player.dir = -1;
	} else if (K.right) {
		player.vx = MOVE_SPD;
		player.dir = 1;
	} else {
		player.vx *= 0.78;
	}

	// Coyote time: keep the window alive while on ground, count down after leaving
	if (player.onGround) {
		player.coyote = 6;
	} else if (player.coyote > 0) {
		player.coyote--;
	}

	// Jump buffer: count down each frame; fire when we have ground (or coyote window)
	if (jumpBuffer > 0) jumpBuffer--;

	const canJump = player.coyote > 0 && player.vy >= 0;
	if (jumpBuffer > 0 && canJump) {
		player.vy = JUMP_FORCE;
		player.onGround = false;
		player.coyote = 0;
		jumpBuffer = 0;
	}

	// Short hop: releasing jump cuts vertical speed
	if (!K.jump && player.vy < -3.5) player.vy = Math.max(player.vy, -3.5);

	player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);
	moveY(player, true);
	moveX(player);

	if (Math.abs(player.vx) > 0.4 && player.onGround) player.walkTick++;
	else player.walkTick = 0;

	if (player.invincible > 0) player.invincible--;

	// ── Pipe entry ──
	if (K.downPress) {
		K.downPress = false;
		if (player.onGround) {
			const pipe = getPipeUnderPlayer();
			if (pipe && pipe.linkedTo) {
				player.pipeState = 'entering';
				player.pipeTick = 0;
				player.pipeClipY = pipe.gy * TILE;
				player.pipeLinkedTo = pipe.linkedTo;
				player.vx = 0;
				player.vy = 0;
			}
		}
	}

	// ── Enemies ──
	for (const e of enemies) {
		if (!e.alive) {
			if (e.squishTimer > 0) e.squishTimer--;
			continue;
		}

		// Edge detection: don't walk off platforms
		if (e.onGround) {
			const aheadX = e.vx > 0 ? e.x + e.w + 2 : e.x - 2;
			const aTx = e.vx > 0 ? Math.floor((e.x + e.w + 2) / TILE) : Math.floor((e.x - 2) / TILE);
			const footTy = Math.floor((e.y + e.h + 4) / TILE);
			if (!getTile(aTx, footTy)) e.vx *= -1;
		}

		const prevVx = e.vx;
		e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
		moveY(e, false);
		moveX(e);

		// If horizontal collision stopped enemy, flip direction
		if (Math.abs(e.vx) < 0.05 && Math.abs(prevVx) > 0.1) {
			e.vx = prevVx > 0 ? -ENEMY_SPD : ENEMY_SPD;
		}
		// Fell off screen
		if (e.y > GH + 60) {
			e.alive = false;
		}

		// ── Player ↔ Enemy ──
		if (player.invincible === 0 && overlap(player, e)) {
			if (player.vy > 0 && player.y + player.h < e.y + e.h * 0.55) {
				// Stomp!
				e.alive = false;
				e.squishTimer = 28;
				player.vy = -9;
				score += 200;
				updateHUD();
				addParticle(e.x + e.w / 2, e.y, '+200 ⭐', '#44ff88');
			} else {
				// Hit — lose a life
				lives--;
				player.invincible = 80;
				player.vx = player.x < e.x ? -4.5 : 4.5;
				player.vy = -6;
				updateHUD();
				if (lives <= 0) {
					gameState = 'dead';
					setTimeout(() => showOverlay('dead'), 700);
				}
			}
		}
	}

	// ── Coins ──
	for (const c of coins) {
		if (c.collected) continue;
		const cr = {
			x: c.gx * TILE + 8,
			y: c.gy * TILE + 6,
			w: TILE - 16,
			h: TILE - 12
		};
		if (overlap(player, cr)) {
			c.collected = true;
			coinCount++;
			score += 50;
			updateHUD();
			addParticle(c.gx * TILE + TILE / 2, c.gy * TILE, '+50 🪙', '#f8b800');
		}
	}

	// ── Goal / Flag ──
	if (goalCell) {
		const flagZone = {
			x: goalCell.gx * TILE - 2,
			y: goalCell.gy * TILE - TILE * 2,
			w: TILE + 4,
			h: TILE * 3
		};
		if (overlap(player, flagZone)) {
			score += 500;
			updateHUD();
			gameState = 'win';
			setTimeout(() => showOverlay('win'), 700);
		}
	}

	// ── Player fell off screen ──
	if (player.y > GH + 80) {
		lives--;
		updateHUD();
		if (lives <= 0) {
			gameState = 'dead';
			setTimeout(() => showOverlay('dead'), 400);
		} else {
			respawn();
		}
	}

	updateParticles();
}

function respawn() {
	const bases = blockList
		.filter((b) => b.type === 'ground' || b.type === 'brick')
		.sort((a, b) => a.gx - b.gx);
	if (bases.length > 0) {
		player.x = bases[0].gx * TILE + (TILE - PLAYER_W) / 2;
		player.y = bases[0].gy * TILE - PLAYER_H;
	} else {
		player.x = TILE;
		player.y = GH / 2;
	}
	player.vx = 0;
	player.vy = 0;
	player.invincible = 80;
	player.pipeState = null;
}

function overlap(a, b) {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ┌──────────────────────────────────────────┐
// │  RENDU                                   │
// └──────────────────────────────────────────┘
function render() {
	// Sky gradient
	const sky = ctx.createLinearGradient(0, 0, 0, GH);
	sky.addColorStop(0, '#3b7de8');
	sky.addColorStop(0.6, '#6aa0f8');
	sky.addColorStop(1, '#90b8ff');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, GW, GH);

	drawBgClouds();

	for (const b of blockList) drawBlock(b);

	if (goalCell) drawFlag(goalCell.gx, goalCell.gy, goalCell.colorClass);

	for (const c of coins) if (!c.collected) drawCoin(c.gx, c.gy, c.colorClass);
	for (const e of enemies) drawEnemy(e);

	if (player) drawPlayer();

	// Particles
	ctx.save();
	ctx.font = 'bold 12px "Courier New"';
	ctx.textAlign = 'center';
	for (const p of particles) {
		ctx.globalAlpha = Math.max(0, p.alpha);
		ctx.fillStyle = p.color;
		ctx.fillText(p.text, p.x, p.y);
	}
	ctx.globalAlpha = 1;
	ctx.restore();

	if (showGrid) drawGrid();
}

function drawGrid() {
	ctx.save();

	// Hovered cell highlight
	if (hoveredCell) {
		ctx.fillStyle = 'rgba(248,184,0,0.22)';
		ctx.fillRect(hoveredCell.col * TILE, hoveredCell.row * TILE, TILE, TILE);
	}

	// Grid lines — solid black
	ctx.strokeStyle = 'rgba(0,0,0,0.55)';
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

	// Tooltip for hovered cell
	if (hoveredCell) {
		const cx = hoveredCell.col;
		const cy = hoveredCell.row;
		const label = `x:${cx + 1}  y:${cy + 1}`;

		ctx.font = 'bold 10px "Courier New", monospace';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		const tw = ctx.measureText(label).width + 12;
		const th = 18;

		let bx = cx * TILE + TILE / 2 - tw / 2;
		let by = cy * TILE - th - 5;
		if (by < 0) by = cy * TILE + TILE + 5;
		bx = Math.max(2, Math.min(GW - tw - 2, bx));

		ctx.fillStyle = 'rgba(0,0,0,0.85)';
		ctx.fillRect(bx, by, tw, th);
		ctx.strokeStyle = '#f8b800';
		ctx.lineWidth = 1.5;
		ctx.strokeRect(bx, by, tw, th);

		ctx.fillStyle = '#f8b800';
		ctx.fillText(label, bx + 6, by + 4);
	}

	ctx.restore();
}

// ── Background decorative clouds ──
const BG_CLOUDS = [
	{ x: 70, y: 55, s: 1.1 },
	{ x: 220, y: 38, s: 1.3 },
	{ x: 400, y: 62, s: 0.9 },
	{ x: 580, y: 42, s: 1.15 },
	{ x: 730, y: 68, s: 0.85 }
];

function drawBgClouds() {
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	for (const c of BG_CLOUDS) {
		ctx.beginPath();
		cloudArc(c.x, c.y, c.s);
		ctx.fill();
	}
}

function cloudArc(x, y, s) {
	ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
	ctx.arc(x + 20 * s, y - 9 * s, 14 * s, 0, Math.PI * 2);
	ctx.arc(x + 38 * s, y, 16 * s, 0, Math.PI * 2);
	ctx.arc(x + 18 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
}

// ── Blocks ──
function drawBlock(b) {
	const x = b.gx * TILE;
	const y = b.gy * TILE;
	const T = TILE;
	ctx.save();
	if (b.colorClass) ctx.filter = COLOR_FILTERS[b.colorClass];

	switch (b.type) {
		case 'ground':
			ctx.fillStyle = '#bb3800';
			ctx.fillRect(x, y, T, T);
			ctx.fillStyle = '#e86800';
			ctx.fillRect(x, y, T, 6); // top highlight
			ctx.fillStyle = '#881800';
			ctx.fillRect(x, y + T - 5, T, 5); // bottom shadow
			// inner dividers
			ctx.fillStyle = '#992800';
			ctx.fillRect(x + T / 2 - 1, y + 6, 2, T - 11);
			ctx.fillRect(x + 1, y + T / 2 - 1, T - 2, 2);
			break;

		case 'brick':
			ctx.fillStyle = '#c84008';
			ctx.fillRect(x, y, T, T);
			ctx.fillStyle = '#ffddaa';
			// mortar pattern
			ctx.fillRect(x, y + 10, T, 2);
			ctx.fillRect(x, y + 22, T, 2);
			ctx.fillRect(x + 15, y, 2, 10);
			ctx.fillRect(x + 7, y + 12, 2, 10);
			ctx.fillRect(x + 23, y + 12, 2, 10);
			ctx.fillRect(x + 15, y + 24, 2, 8);
			break;

		case 'question':
			if (b.used) {
				ctx.fillStyle = '#888';
				ctx.fillRect(x, y, T, T);
				ctx.fillStyle = '#666';
				for (let i = 0; i < T; i += 8) ctx.fillRect(x + i, y, 4, T);
			} else {
				const bob = Math.sin(frame * 0.12) * 2;
				ctx.fillStyle = '#f8b800';
				ctx.fillRect(x, y - bob, T, T);
				ctx.fillStyle = '#c87800';
				ctx.fillRect(x, y - bob, T, 3);
				ctx.fillRect(x, y - bob + T - 3, T, 3);
				ctx.fillRect(x, y - bob, 3, T);
				ctx.fillRect(x + T - 3, y - bob, 3, T);
				ctx.fillStyle = '#ffe044';
				ctx.fillRect(x + 3, y - bob + 3, T - 6, T - 6);
				ctx.fillStyle = '#fff';
				ctx.font = 'bold 20px "Press Start 2P", monospace';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('?', x + T / 2, y - bob + T / 2);
				ctx.textBaseline = 'alphabetic';
			}
			break;

		case 'pipe_top': {
			const bw = T + 8;
			const bx = x - 4;
			ctx.fillStyle = '#00bb00';
			ctx.fillRect(bx, y, bw, 14); // cap
			ctx.fillStyle = '#008800';
			ctx.fillRect(bx, y + 14, bw, 4); // cap rim
			ctx.fillStyle = '#009900';
			ctx.fillRect(x + 2, y + 18, T - 4, T - 18);
			ctx.fillStyle = '#00ee00';
			ctx.fillRect(bx + 3, y + 2, 6, 10); // shine
			ctx.fillRect(x + 4, y + 20, 5, T - 22);
			break;
		}
		case 'pipe_body':
			ctx.fillStyle = '#009900';
			ctx.fillRect(x + 2, y, T - 4, T);
			ctx.fillStyle = '#00ee00';
			ctx.fillRect(x + 4, y, 5, T);
			ctx.fillStyle = '#005500';
			ctx.fillRect(x + T - 7, y, 5, T);
			break;

		case 'cloud':
			ctx.fillStyle = 'rgba(210,225,255,0.88)';
			ctx.beginPath();
			cloudArc(x - 2, y + 6, 0.68);
			ctx.fill();
			break;
	}

	ctx.restore();
}

// ── Coin ──
function drawCoin(gx, gy, colorClass) {
	ctx.save();
	if (colorClass) ctx.filter = COLOR_FILTERS[colorClass];
	const bob = Math.sin(frame * 0.1 + gx * 0.7) * 3;
	const ox = gx * TILE + 8;
	const oy = Math.round(gy * TILE + 8 + bob);
	const B = '#c87800', Y = '#f8b800', W = '#fff8b0';
	// 8×8 logical pixel art coin (each pixel = 2×2 px, total 16×16 px)
	// Row 0: _ _ B B B B _ _
	ctx.fillStyle = B;
	ctx.fillRect(ox + 4,  oy,      8, 2);
	// Row 1: _ B Y Y Y Y B _
	ctx.fillRect(ox + 2,  oy + 2,  2, 2); ctx.fillRect(ox + 12, oy + 2,  2, 2);
	ctx.fillStyle = Y; ctx.fillRect(ox + 4,  oy + 2,  8, 2);
	// Row 2: B W W Y Y Y Y B
	ctx.fillStyle = B; ctx.fillRect(ox,      oy + 4,  2, 2); ctx.fillRect(ox + 14, oy + 4,  2, 2);
	ctx.fillStyle = W; ctx.fillRect(ox + 2,  oy + 4,  4, 2);
	ctx.fillStyle = Y; ctx.fillRect(ox + 6,  oy + 4,  8, 2);
	// Row 3: B W W Y Y Y Y B
	ctx.fillStyle = B; ctx.fillRect(ox,      oy + 6,  2, 2); ctx.fillRect(ox + 14, oy + 6,  2, 2);
	ctx.fillStyle = W; ctx.fillRect(ox + 2,  oy + 6,  4, 2);
	ctx.fillStyle = Y; ctx.fillRect(ox + 6,  oy + 6,  8, 2);
	// Row 4: B Y Y Y Y Y Y B
	ctx.fillStyle = B; ctx.fillRect(ox,      oy + 8,  2, 2); ctx.fillRect(ox + 14, oy + 8,  2, 2);
	ctx.fillStyle = Y; ctx.fillRect(ox + 2,  oy + 8,  12, 2);
	// Row 5: B Y Y Y Y Y Y B
	ctx.fillStyle = B; ctx.fillRect(ox,      oy + 10, 2, 2); ctx.fillRect(ox + 14, oy + 10, 2, 2);
	ctx.fillStyle = Y; ctx.fillRect(ox + 2,  oy + 10, 12, 2);
	// Row 6: _ B Y Y Y Y B _
	ctx.fillStyle = B; ctx.fillRect(ox + 2,  oy + 12, 2, 2); ctx.fillRect(ox + 12, oy + 12, 2, 2);
	ctx.fillStyle = Y; ctx.fillRect(ox + 4,  oy + 12, 8, 2);
	// Row 7: _ _ B B B B _ _
	ctx.fillStyle = B; ctx.fillRect(ox + 4,  oy + 14, 8, 2);
	ctx.restore();
}

// ── Flag ──
function drawFlag(gx, gy, colorClass) {
	ctx.save();
	if (colorClass) ctx.filter = COLOR_FILTERS[colorClass];
	const px = gx * TILE + TILE / 2;
	const py = gy * TILE;
	const ph = TILE * 3;

	ctx.fillStyle = '#aaaaaa';
	ctx.fillRect(px - 2, py - ph, 4, ph + TILE + 2);

	ctx.fillStyle = '#00cc00';
	const wave = Math.sin(frame * 0.09) * 5;
	ctx.beginPath();
	ctx.moveTo(px + 2, py - ph);
	ctx.quadraticCurveTo(px + 22, py - ph + 11 + wave, px + 2, py - ph + 22);
	ctx.fill();

	ctx.fillStyle = '#f8b800';
	ctx.beginPath();
	ctx.arc(px, py - ph, 5, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

// ── Enemy (Goomba-style) ──
function drawEnemy(e) {
	const x = Math.round(e.x);
	const y = Math.round(e.y);
	ctx.save();
	if (e.colorClass) ctx.filter = COLOR_FILTERS[e.colorClass];

	if (!e.alive) {
		if (e.squishTimer > 0) {
			ctx.fillStyle = '#b02800';
			ctx.fillRect(x, y + e.h - 8, e.w, 8);
			ctx.fillStyle = '#702000';
			ctx.fillRect(x + 2, y + e.h - 6, 4, 4);
			ctx.fillRect(x + e.w - 6, y + e.h - 6, 4, 4);
		}
		ctx.restore();
		return;
	}

	const ft = Math.floor(frame / 11) % 2;

	// Body
	ctx.fillStyle = '#b02800';
	ctx.fillRect(x + 2, y + 11, e.w - 4, e.h - 11);
	ctx.fillRect(x + 3, y + 7, e.w - 6, 6);

	// Head
	ctx.fillStyle = '#901800';
	ctx.fillRect(x, y + 2, e.w, 12);
	ctx.fillRect(x + 2, y, e.w - 4, 4);

	// Eyes
	ctx.fillStyle = 'white';
	ctx.fillRect(x + 3, y + 3, 5, 5);
	ctx.fillRect(x + 16, y + 3, 5, 5);
	ctx.fillStyle = '#111';
	ctx.fillRect(x + 4, y + 4, 3, 3);
	ctx.fillRect(x + 17, y + 4, 3, 3);

	// Angry eyebrows
	ctx.fillStyle = '#111';
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

	// Teeth
	ctx.fillStyle = 'ivory';
	ctx.fillRect(x + 7, y + 11, 4, 3);
	ctx.fillRect(x + 13, y + 11, 4, 3);

	// Feet
	ctx.fillStyle = '#601000';
	if (ft === 0) {
		ctx.fillRect(x, y + e.h - 6, 9, 6);
		ctx.fillRect(x + e.w - 7, y + e.h - 4, 9, 4);
	} else {
		ctx.fillRect(x, y + e.h - 4, 9, 4);
		ctx.fillRect(x + e.w - 7, y + e.h - 6, 9, 6);
	}
	ctx.restore();
}

// ── Player (Mario pixel art) ──
function drawPlayer() {
	const x = Math.round(player.x);

	// Blink when invincible
	if (player.invincible > 0 && Math.floor(player.invincible / 5) % 2 === 1) return;

	// Pipe animation: slide into / out of pipe with clipping
	let y = Math.round(player.y);
	let pipeClip = false;
	if (player.pipeState === 'entering') {
		y = Math.round(player.y + (player.pipeTick / 30) * player.h);
		pipeClip = true;
	} else if (player.pipeState === 'exiting') {
		y = Math.round(player.pipeClipY - (player.pipeTick / 30) * player.h);
		pipeClip = true;
	}

	if (pipeClip) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, GW, player.pipeClipY);
		ctx.clip();
	}

	const wf = player.onGround ? Math.floor(player.walkTick / 7) % 3 : -1;

	ctx.save();
	if (player.dir === -1) {
		ctx.translate(x + player.w, 0);
		ctx.scale(-1, 1);
		ctx.translate(-x, 0);
	}

	// Cap top
	ctx.fillStyle = '#dd1100';
	ctx.fillRect(x + 3, y, 16, 5);
	ctx.fillRect(x + 1, y + 3, 18, 4);
	ctx.fillRect(x + 16, y + 4, 8, 3); // brim (right-facing)

	// Hair under cap
	ctx.fillStyle = '#5a2200';
	ctx.fillRect(x + 3, y + 5, 4, 2);

	// Face
	ctx.fillStyle = '#fca060';
	ctx.fillRect(x + 2, y + 6, 18, 9);
	ctx.fillRect(x + 1, y + 7, 2, 7);

	// Nose
	ctx.fillStyle = '#e07040';
	ctx.fillRect(x + 15, y + 9, 5, 3);

	// Eye
	ctx.fillStyle = '#111';
	ctx.fillRect(x + 13, y + 7, 4, 4);
	ctx.fillStyle = 'white';
	ctx.fillRect(x + 14, y + 7, 2, 2);

	// Mustache
	ctx.fillStyle = '#5a2200';
	ctx.fillRect(x + 7, y + 12, 12, 2);
	ctx.fillRect(x + 9, y + 13, 10, 2);

	// Shirt (red)
	ctx.fillStyle = '#dd1100';
	ctx.fillRect(x + 4, y + 15, 14, 5);

	// Overalls (blue)
	ctx.fillStyle = '#0022cc';
	ctx.fillRect(x + 2, y + 15, 5, 9);
	ctx.fillRect(x + 15, y + 15, 5, 9);
	ctx.fillRect(x + 2, y + 20, 18, 4);

	// Buttons
	ctx.fillStyle = '#f8b800';
	ctx.fillRect(x + 5, y + 17, 2, 2);
	ctx.fillRect(x + 15, y + 17, 2, 2);

	// Legs
	ctx.fillStyle = '#0022cc';
	if (wf === -1) {
		// Jump pose: legs spread
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

	// Shoes
	ctx.fillStyle = '#5a2200';
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

// ┌──────────────────────────────────────────┐
// │  HUD & OVERLAY                           │
// └──────────────────────────────────────────┘
function updateHUD() {
	document.getElementById('h-lives').textContent = '❤️'.repeat(Math.max(0, lives)) || '💀';
	document.getElementById('h-coins').textContent = coinCount;
	document.getElementById('h-score').textContent = score;
}

function hideOverlay() {
	document.getElementById('overlay').style.display = 'none';
}

function showOverlay(type) {
	const el = document.getElementById('overlay');
	let icon, title, sub;

	if (type === 'win') {
		icon = '🏆';
		title = 'VICTOIRE !';
		sub = `Bravo, tu as fini le niveau !<br><br>🪙 ${coinCount} pièce${coinCount > 1 ? 's' : ''} &nbsp;·&nbsp; ⭐ ${score} points`;
	} else {
		icon = '💀';
		title = 'GAME OVER';
		sub = 'Tu as perdu toutes tes vies...<br>Modifie ton niveau et réessaie !';
	}

	el.innerHTML = `
    <div class="ov-icon">${icon}</div>
    <div class="ov-title">${title}</div>
    <div class="ov-sub">${sub}</div>
    <button class="play-btn" id="mainPlayBtn">🔄 REJOUER</button>
  `;
	el.style.display = 'flex';
	document.getElementById('mainPlayBtn').addEventListener('click', startGame);
}

// ┌──────────────────────────────────────────┐
// │  INIT                                    │
// └──────────────────────────────────────────┘

// Wire <button> elements in student zone
document.querySelectorAll('#my-level button').forEach((b) => {
	b.addEventListener('click', startGame);
});

// Grid toggle button
document.getElementById('grid-toggle-btn').addEventListener('click', () => {
	showGrid = !showGrid;
	document.getElementById('grid-toggle-btn').classList.toggle('active', showGrid);
	if (gameState !== 'playing') render();
});

// Grid hover tracking
cvs.addEventListener('mousemove', (e) => {
	if (!showGrid) return;
	const rect = cvs.getBoundingClientRect();
	const scaleX = cvs.width / rect.width;
	const scaleY = cvs.height / rect.height;
	const mx = (e.clientX - rect.left) * scaleX;
	const my = (e.clientY - rect.top) * scaleY;
	const col = Math.floor(mx / TILE);
	const row = Math.floor(my / TILE);
	if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
		hoveredCell = { col, row };
	} else {
		hoveredCell = null;
	}
	if (gameState !== 'playing') render();
});

cvs.addEventListener('mouseleave', () => {
	if (hoveredCell !== null) {
		hoveredCell = null;
		if (gameState !== 'playing') render();
	}
});

// Fullscreen toggle
const fullscreenBtn = document.getElementById('fullscreen-btn');
const gameWrap = document.getElementById('game-wrap');

fullscreenBtn.addEventListener('click', () => {
	if (!document.fullscreenElement) {
		gameWrap.requestFullscreen();
	} else {
		document.exitFullscreen();
	}
});

document.addEventListener('fullscreenchange', () => {
	fullscreenBtn.textContent = document.fullscreenElement ? '✕' : '⛶';
});

// Parse level and render a static preview (overlay covers it)
parseLevel();
render();
updateHUD();
