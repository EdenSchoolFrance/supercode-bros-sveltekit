<script>
	import { onMount } from 'svelte';
	import { GameEngine } from '$lib/game/engine.js';
	import { TILE, COLS, ROWS } from '$lib/game/constants.js';

	let { htmlCode } = $props();

	/** @type {HTMLCanvasElement} */
	let canvas;
	/** @type {HTMLDivElement} */
	let canvasWrap;
	/** @type {import('$lib/game/engine.js').GameEngine | undefined} */
	let engine;

	let gameState = $state('menu');
	let lives = $state(3);
	let coinCount = $state(0);
	let score = $state(0);
	let playRequested = $state(false);
	let showGrid = $state(false);
	let isFullscreen = $state(false);

	onMount(() => {
		const eng = new GameEngine(canvas, (/** @type {any} */ s) => {
			if (s.action === 'play-requested') {
				playRequested = true;
				return;
			}
			gameState = s.gameState;
			lives = s.lives;
			coinCount = s.coinCount;
			score = s.score;
		});
		engine = eng;

		eng.loadLevel(htmlCode);
		eng.renderStatic();

		const onFsChange = () => { isFullscreen = !!document.fullscreenElement; };
		document.addEventListener('fullscreenchange', onFsChange);

		return () => {
			eng.destroy();
			document.removeEventListener('fullscreenchange', onFsChange);
		};
	});

	$effect(() => {
		if (playRequested && engine) {
			playRequested = false;
			handlePlay();
		}
	});

	// Live preview: debounced reload whenever the code changes
	$effect(() => {
		const code = htmlCode; // track dependency
		if (!engine) return;

		const timer = setTimeout(() => {
			if (gameState === 'playing') {
				// Restart the game with the new level
				engine?.loadLevel(code);
				engine?.start();
			} else {
				// Just update the static preview behind the overlay
				engine?.loadLevel(code);
				engine?.renderStatic();
			}
		}, 400);

		return () => clearTimeout(timer);
	});

	function handlePlay() {
		engine?.loadLevel(htmlCode);
		engine?.start();
		gameState = 'playing';
	}

	function handleReplay() {
		engine?.loadLevel(htmlCode);
		engine?.start();
		gameState = 'playing';
	}

	function handleFullscreen() {
		if (!document.fullscreenElement) {
			canvasWrap?.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	function handleGridToggle() {
		showGrid = !showGrid;
		engine?.setGrid(showGrid);
	}

	/** @param {MouseEvent} e */
	function handleCanvasMouseMove(e) {
		if (!showGrid || !engine) return;
		const rect = canvas.getBoundingClientRect();
		const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
		const my = (e.clientY - rect.top) * (canvas.height / rect.height);
		const col = Math.floor(mx / TILE);
		const row = Math.floor(my / TILE);
		if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
			engine.setHoveredCell(col, row);
		} else {
			engine.setHoveredCell(null, 0);
		}
	}

	function handleCanvasMouseLeave() {
		engine?.setHoveredCell(null, 0);
	}

	/** @param {HTMLElement} node @param {string} key */
	function bindTouchBtn(node, key) {
		const down = () => engine?.pressKey(key, true);
		const up = () => engine?.pressKey(key, false);
		node.addEventListener('touchstart', (/** @type {TouchEvent} */ e) => { e.preventDefault(); down(); }, { passive: false });
		node.addEventListener('touchend',   (/** @type {TouchEvent} */ e) => { e.preventDefault(); up(); },   { passive: false });
		node.addEventListener('touchcancel',(/** @type {TouchEvent} */ e) => { e.preventDefault(); up(); },   { passive: false });
		node.addEventListener('mousedown', down);
		node.addEventListener('mouseup', up);
		return { destroy() {
			node.removeEventListener('mousedown', down);
			node.removeEventListener('mouseup', up);
		}};
	}
</script>

<div class="game-panel">
	<!-- HUD -->
	<div class="hud">
		<span>❤️ VIE : <span class="hud-val">{lives <= 0 ? '💀' : '❤️'.repeat(Math.max(0, lives))}</span></span>
		<span>🪙 PIÈCES : <span class="hud-val">{coinCount}</span></span>
		<span>⭐ SCORE : <span class="hud-val">{score}</span></span>
	</div>

	<!-- Canvas area -->
	<div class="canvas-wrap" bind:this={canvasWrap}>
		<canvas
			bind:this={canvas}
			width="800"
			height="480"
			onmousemove={handleCanvasMouseMove}
			onmouseleave={handleCanvasMouseLeave}
		></canvas>
		<button
			class="fullscreen-btn"
			onclick={handleFullscreen}
			title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
		>{isFullscreen ? '✕' : '⛶'}</button>

		<!-- Menu overlay -->
		{#if gameState === 'menu'}
			<div class="overlay">
				<div class="ov-icon">🍄</div>
				<div class="ov-title">SUPER CODE BROS</div>
				<div class="ov-sub">
					Écris tes balises HTML dans l'éditeur,<br />
					puis clique sur <strong>JOUER</strong> pour tester ton niveau !<br /><br />
					← → pour bouger · ↑ ou ESPACE pour sauter
				</div>
				<button class="play-btn" onclick={handlePlay}>▶ JOUER</button>
			</div>
		{/if}

		<!-- Win overlay -->
		{#if gameState === 'win'}
			<div class="overlay">
				<div class="ov-icon">🏆</div>
				<div class="ov-title" style="color:#f8b800">VICTOIRE !</div>
				<div class="ov-sub">
					Bravo, tu as fini le niveau !<br /><br />
					🪙 {coinCount} pièce{coinCount > 1 ? 's' : ''} &nbsp;·&nbsp; ⭐ {score} points
				</div>
				<button class="play-btn" onclick={handleReplay}>🔄 REJOUER</button>
			</div>
		{/if}

		<!-- Dead overlay -->
		{#if gameState === 'dead'}
			<div class="overlay">
				<div class="ov-icon">💀</div>
				<div class="ov-title" style="color:#cc2200">GAME OVER</div>
				<div class="ov-sub">
					Tu as perdu toutes tes vies...<br />Modifie ton niveau et réessaie !
				</div>
				<button class="play-btn" onclick={handleReplay}>🔄 RÉESSAYER</button>
			</div>
		{/if}
	</div>

	<!-- Grid toggle -->
	<button class="grid-btn" class:active={showGrid} onclick={handleGridToggle}>▦ GRILLE</button>

	<!-- Touch controls -->
	<div class="touch-pad">
		<button class="t-btn" use:bindTouchBtn={'left'}>◀</button>
		<button class="t-btn" use:bindTouchBtn={'jump'}>▲</button>
		<button class="t-btn" use:bindTouchBtn={'right'}>▶</button>
	</div>
</div>

<style>
	.game-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 10px;
		padding: 12px;
		background: #070710;
	}

	.hud {
		display: flex;
		gap: 20px;
		flex-wrap: wrap;
		justify-content: center;
		background: #111122;
		border: 2px solid rgba(248, 184, 0, 0.3);
		padding: 7px 20px;
		font-family: 'Press Start 2P', monospace;
		font-size: clamp(0.45em, 1.2vw, 0.6em);
		color: #e8e8ff;
		flex-shrink: 0;
	}

	.hud-val {
		color: #f8b800;
	}

	.canvas-wrap {
		position: relative;
		line-height: 0;
		width: 100%;
		max-width: 800px;
	}

	canvas {
		display: block;
		width: 100%;
		height: auto;
		border: 4px solid #f8b800;
		box-shadow:
			0 0 30px rgba(248, 184, 0, 0.25),
			0 0 80px rgba(248, 184, 0, 0.1);
		image-rendering: pixelated;
		image-rendering: crisp-edges;
	}

	/* ── Fullscreen button ── */
	.fullscreen-btn {
		all: unset;
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 20;
		cursor: pointer;
		background: rgba(0, 0, 0, 0.55);
		color: #f8b800;
		border: 1.5px solid rgba(248, 184, 0, 0.35);
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1em;
		opacity: 0.7;
		transition: opacity 0.15s;
	}

	.fullscreen-btn:hover {
		opacity: 1;
	}

	/* ── Fullscreen mode ── */
	.canvas-wrap:fullscreen,
	.canvas-wrap:-webkit-full-screen {
		background: #000;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		line-height: 0;
	}

	.canvas-wrap:fullscreen canvas,
	.canvas-wrap:-webkit-full-screen canvas {
		width: auto !important;
		height: 100% !important;
		max-width: 100%;
	}

	.canvas-wrap:fullscreen .overlay,
	.canvas-wrap:-webkit-full-screen .overlay {
		inset: 0;
	}

	.overlay {
		position: absolute;
		inset: 4px;
		background: rgba(0, 0, 10, 0.85);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		backdrop-filter: blur(3px);
	}

	.ov-icon {
		font-size: clamp(2em, 5vw, 3em);
	}

	.ov-title {
		font-family: 'Press Start 2P', monospace;
		font-size: clamp(0.8em, 2.5vw, 1.4em);
		color: #f8b800;
		text-shadow: 4px 4px 0 #cc2200;
		text-align: center;
	}

	.ov-sub {
		font-family: 'Courier New', monospace;
		font-size: clamp(0.65em, 1.8vw, 0.82em);
		color: #aab;
		text-align: center;
		max-width: 380px;
		line-height: 1.8;
	}

	.ov-sub strong {
		color: #f8b800;
	}

	.play-btn {
		all: unset;
		cursor: pointer;
		background: #009900;
		color: #fff;
		font-family: 'Press Start 2P', monospace;
		font-size: clamp(0.5em, 1.5vw, 0.8em);
		padding: 12px 40px;
		border: 3px solid #006600;
		box-shadow: 0 6px 0 #003300;
		transition: box-shadow 0.08s, transform 0.08s;
		letter-spacing: 2px;
	}

	.play-btn:hover {
		background: #00bb00;
		transform: translateY(-2px);
		box-shadow: 0 8px 0 #003300;
	}

	.play-btn:active {
		transform: translateY(4px);
		box-shadow: 0 2px 0 #003300;
	}

	.grid-btn {
		all: unset;
		cursor: pointer;
		font-family: 'Press Start 2P', monospace;
		font-size: 0.5em;
		color: #778;
		border: 2px solid rgba(255, 255, 255, 0.12);
		padding: 8px 18px;
		letter-spacing: 1px;
		background: #111122;
		flex-shrink: 0;
		transition:
			color 0.1s,
			border-color 0.1s,
			background 0.1s;
	}

	.grid-btn:hover {
		color: #dde;
		border-color: rgba(255, 255, 255, 0.3);
	}

	.grid-btn.active {
		color: #f8b800;
		border-color: #f8b800;
		background: rgba(248, 184, 0, 0.08);
	}

	.touch-pad {
		display: none;
		gap: 10px;
		align-items: center;
		flex-shrink: 0;
	}

	@media (pointer: coarse) {
		.touch-pad {
			display: flex;
		}
	}

	.t-btn {
		all: unset;
		background: rgba(255, 255, 255, 0.12);
		border: 2px solid rgba(255, 255, 255, 0.25);
		color: #fff;
		font-family: 'Press Start 2P', monospace;
		font-size: 0.85em;
		width: 60px;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		cursor: pointer;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.t-btn:active {
		background: rgba(255, 255, 255, 0.25);
	}
</style>
