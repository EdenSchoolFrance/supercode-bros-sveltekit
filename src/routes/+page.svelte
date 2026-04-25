<script>
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import GameCanvas from '$lib/components/GameCanvas.svelte';
	import { defaultLevel } from '$lib/game/defaultLevel.js';
	import imgSol      from '$lib/assets/sol.png';
	import imgBrique   from '$lib/assets/brique.png';
	import imgQuestion from '$lib/assets/question.png';
	import imgTuyau    from '$lib/assets/tuyau.png';
	import imgSpike    from '$lib/assets/spike.png';
	import imgCloud    from '$lib/assets/cloud.png';
	import imgDrapeau  from '$lib/assets/drapeau.png';
	import imgPiece    from '$lib/assets/piece.png';
	import imgGoomba   from '$lib/assets/goomba.png';
	import imgMario    from '$lib/assets/mario.png';

	let code = $state(defaultLevel);
	let splitPos = $state(45); // left panel % width
	let dragging = $state(false);
	let legendOpen = $state(false);

	const TAGS = [
		{ tag: 'h1',    img: imgSol,      name: 'Sol',           desc: 'Plateforme solide',                              attrs: 'data-x="?" data-y="?"' },
		{ tag: 'h2',    img: imgBrique,   name: 'Brique',        desc: 'Plateforme en briques',                          attrs: 'data-x="?" data-y="?"' },
		{ tag: 'h3',    img: imgQuestion, name: 'Bloc ?',        desc: 'Frappe dessous = pièce !',                       attrs: 'data-x="?" data-y="?"' },
		{ tag: 'a',     img: imgTuyau,    name: 'Tuyau',         desc: '↓ sur un tuyau lié = téléportation !',           attrs: 'id="?" data-x="?" data-y="?" href="#?"' },
		{ tag: 'hr',    img: imgSpike,    name: 'Pic',           desc: 'Toucher = dégâts ! (pic de fer)',                attrs: 'data-x="?" data-y="?"' },
		{ tag: 'h5',    img: imgCloud,    name: 'Nuage',         desc: 'Plateforme traversable',                         attrs: 'data-x="?" data-y="?"' },
		{ tag: 'h6',    img: imgDrapeau,  name: 'Drapeau',       desc: 'Objectif de fin de niveau',                     attrs: 'data-x="?" data-y="?"' },
		{ tag: 'p',     img: imgPiece,    name: 'Pièce',         desc: 'À collecter (+50 pts)',                          attrs: 'data-x="?" data-y="?"' },
		{ tag: 'input', img: imgGoomba,   name: 'Ennemi Goomba', desc: 'name="goomba" · saute dessus pour vaincre',      attrs: 'name="goomba" data-x="?" data-y="?"' },
		{ tag: 'input', img: imgMario,    name: 'Spawn Mario',   desc: 'name="mario" · point de départ unique du joueur', attrs: 'name="mario" data-x="?" data-y="?"' },
	];
	/** @type {HTMLDivElement} */
	let containerEl;

	/** @param {MouseEvent} e */
	function onDividerMouseDown(e) {
		dragging = true;
		e.preventDefault();
	}

	/** @param {MouseEvent} e */
	function onMouseMove(e) {
		if (!dragging || !containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const x = e.clientX - rect.left;
		splitPos = Math.max(20, Math.min(78, (x / rect.width) * 100));
	}

	function stopDrag() {
		dragging = false;
	}
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={stopDrag} />

<div class="page">
	<header class="header">
		<div class="title">🍄 SUPER CODE BROS 🍄</div>
		<div class="subtitle">Crée ton niveau en HTML · Joue-le en direct !</div>
	</header>

	<div class="workspace" bind:this={containerEl} class:dragging>
		<!-- Left panel: code editor -->
		<div class="panel left-panel" style="width: {splitPos}%">
			<div class="panel-header">
				<span class="panel-icon">📝</span>
				<span>Zone Élève — Ton code HTML</span>
				<button
					class="legend-btn"
					class:active={legendOpen}
					onclick={() => (legendOpen = !legendOpen)}
					aria-label="Guide des balises"
					title="Guide des balises"
				>
					📖 Guide
				</button>
			</div>

			<div class="editor-area">
				{#if legendOpen}
					<div class="legend-panel">
						<div class="legend-title">📖 GUIDE DES BALISES</div>
						<div class="legend-hint">
							x : colonne (1-25, gauche → droite) &nbsp;·&nbsp; y : ligne (1-15, haut → bas)
						</div>
						<div class="legend-grid">
							{#each TAGS as t}
								<div class="legend-card">
									<img class="l-icon" src={t.img} alt={t.name} />
									<div class="l-body">
										<div class="l-tag">&lt;{t.tag} {t.attrs}&gt;&lt;/{t.tag}&gt;</div>
										<div class="l-name">{t.name} — {t.desc}</div>
									</div>
								</div>
							{/each}
						</div>
						<div class="legend-coords">
							<div class="coord-grid-label">Grille du niveau</div>
							<div class="coord-row">
								<span class="coord-dim">25 colonnes × 15 lignes · chaque case = 32 px</span>
							</div>
							<div class="coord-row">
								<span>x="1" = gauche &nbsp;·&nbsp; x="25" = droite</span>
							</div>
							<div class="coord-row">
								<span>y="1" = haut &nbsp;·&nbsp; y="15" = bas (sol)</span>
							</div>
						</div>
						<div class="legend-coords">
							<div class="coord-grid-label">Balise &lt;input&gt; — attribut name</div>
							<div class="coord-row">
								<span>👾 &nbsp;<code style="color:#79c0ff">name="goomba"</code> &nbsp;→ ennemi qui marche (saute dessus pour le vaincre)</span>
							</div>
							<div class="coord-row">
								<span>🍄 &nbsp;<code style="color:#79c0ff">name="mario"</code> &nbsp;→ point de départ de Mario dans le niveau</span>
							</div>
							<div class="coord-row">
								<span class="coord-dim">Un seul spawn par niveau. Sans name="mario", Mario part au-dessus du 1er bloc de sol.</span>
							</div>
						</div>
					</div>
				{/if}
				<div class="editor-wrap" class:hidden={legendOpen}>
					<CodeEditor bind:value={code} />
				</div>
			</div>

			<div class="tag-guide">
				<span class="tag"><code>&lt;h1&gt;</code> Sol</span>
				<span class="tag"><code>&lt;h2&gt;</code> Brique</span>
				<span class="tag"><code>&lt;h3&gt;</code> Bloc ?</span>
				<span class="tag"><code>&lt;a&gt;</code> Tuyau ↓</span>
				<span class="tag"><code>&lt;hr&gt;</code> Pic ☠</span>
				<span class="tag"><code>&lt;h5&gt;</code> Nuage</span>
				<span class="tag"><code>&lt;h6&gt;</code> Drapeau</span>
				<span class="tag"><code>&lt;p&gt;</code> Pièce</span>
				<span class="tag"><code>&lt;input name="goomba"&gt;</code> Ennemi</span>
				<span class="tag"><code>&lt;input name="mario"&gt;</code> Spawn</span>
			</div>
		</div>

		<!-- Resizable divider -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="divider"
			class:active={dragging}
			onmousedown={onDividerMouseDown}
			role="separator"
			tabindex="0"
			aria-label="Redimensionner"
		>
			<div class="divider-handle">⠿</div>
		</div>

		<!-- Right panel: game -->
		<div class="panel right-panel" style="width: {100 - splitPos}%">
			<GameCanvas htmlCode={code} />
		</div>
	</div>
</div>

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(html, body) {
		height: 100%;
		overflow: hidden;
		background: #070710;
		color: #e8e8ff;
	}

	.page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		font-family: 'Press Start 2P', monospace;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		flex-wrap: wrap;
		background: #0d0d1a;
		border-bottom: 2px solid rgba(248, 184, 0, 0.3);
		padding: 10px 20px;
		flex-shrink: 0;
	}

	.title {
		font-size: clamp(0.75em, 2vw, 1.2em);
		color: #f8b800;
		text-shadow:
			2px 2px 0 #cc2200,
			4px 4px 0 rgba(0, 0, 0, 0.4);
		letter-spacing: 2px;
		animation: pulse 3s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			text-shadow:
				2px 2px 0 #cc2200,
				4px 4px 0 rgba(0, 0, 0, 0.4);
		}
		50% {
			text-shadow:
				2px 2px 0 #cc2200,
				4px 4px 0 rgba(0, 0, 0, 0.4),
				0 0 16px rgba(248, 184, 0, 0.4);
		}
	}

	.subtitle {
		font-family: 'Courier New', monospace;
		font-size: clamp(0.55em, 1.2vw, 0.7em);
		color: #5566aa;
		letter-spacing: 1px;
	}

	.workspace {
		display: flex;
		flex: 1;
		overflow: hidden;
		cursor: default;
	}

	.workspace.dragging {
		cursor: col-resize;
		user-select: none;
	}

	.panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.left-panel {
		background: #0d1117;
		border-right: 1px solid rgba(248, 184, 0, 0.1);
	}

	.right-panel {
		background: #070710;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		font-size: 0.55em;
		color: #f8b800;
		background: #0d0d1a;
		border-bottom: 1px solid rgba(248, 184, 0, 0.15);
		flex-shrink: 0;
		letter-spacing: 1px;
	}

	.panel-icon {
		font-size: 1.3em;
	}

	.legend-btn {
		all: unset;
		cursor: pointer;
		margin-left: auto;
		background: rgba(248, 184, 0, 0.08);
		border: 1px solid rgba(248, 184, 0, 0.25);
		color: #f8b800;
		font-family: 'Press Start 2P', monospace;
		font-size: 0.9em;
		padding: 5px 10px;
		letter-spacing: 1px;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.legend-btn:hover,
	.legend-btn.active {
		background: rgba(248, 184, 0, 0.18);
		border-color: rgba(248, 184, 0, 0.55);
	}

	.editor-area {
		flex: 1;
		overflow: hidden;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.editor-wrap {
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}

	.editor-wrap.hidden {
		display: none;
	}

	/* ── Legend panel ── */
	.legend-panel {
		flex: 1;
		overflow-y: auto;
		background: #0d1117;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.legend-title {
		font-size: 0.6em;
		color: #f8b800;
		letter-spacing: 2px;
		text-align: center;
	}

	.legend-hint {
		font-family: 'Courier New', monospace;
		font-size: 0.65em;
		color: #4a5580;
		text-align: center;
	}

	.legend-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
	}

	.legend-card {
		display: flex;
		align-items: center;
		gap: 10px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.07);
		padding: 10px 12px;
	}

	.l-icon {
		width: 36px;
		height: 36px;
		object-fit: contain;
		flex-shrink: 0;
		image-rendering: pixelated;
	}

	.l-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.l-tag {
		font-family: 'Courier New', monospace;
		font-size: 0.55em;
		color: #79c0ff;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.l-name {
		font-family: 'Courier New', monospace;
		font-size: 0.6em;
		color: #7788aa;
	}

	.legend-coords {
		background: rgba(248, 184, 0, 0.04);
		border: 1px solid rgba(248, 184, 0, 0.12);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.coord-grid-label {
		font-size: 0.5em;
		color: #f8b800;
		letter-spacing: 1px;
		margin-bottom: 2px;
	}

	.coord-row {
		font-family: 'Courier New', monospace;
		font-size: 0.62em;
		color: #556080;
	}

	.coord-dim {
		color: #4a5580;
	}

	.tag-guide {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		padding: 8px 12px;
		background: #0d0d1a;
		border-top: 1px solid rgba(248, 184, 0, 0.15);
		flex-shrink: 0;
	}

	.tag {
		font-family: 'Courier New', monospace;
		font-size: 0.62em;
		color: #556;
		white-space: nowrap;
	}

	.tag code {
		color: #79c0ff;
		font-weight: bold;
	}

	.divider {
		width: 6px;
		flex-shrink: 0;
		background: #0d0d1a;
		border-left: 1px solid rgba(248, 184, 0, 0.15);
		border-right: 1px solid rgba(248, 184, 0, 0.15);
		cursor: col-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
		position: relative;
		z-index: 10;
	}

	.divider:hover,
	.divider.active {
		background: rgba(248, 184, 0, 0.15);
	}

	.divider-handle {
		font-size: 0.8em;
		color: rgba(248, 184, 0, 0.4);
		writing-mode: vertical-rl;
		pointer-events: none;
		letter-spacing: -2px;
	}
</style>
