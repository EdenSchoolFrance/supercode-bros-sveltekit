<script>
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { html } from '@codemirror/lang-html';
	import { oneDark } from '@codemirror/theme-one-dark';

	let { value = $bindable('') } = $props();

	/** @type {HTMLDivElement} */
	let container;
	/** @type {import('codemirror').EditorView | undefined} */
	let view;

	const marioTheme = EditorView.theme({
		'&': { height: '100%', fontSize: '13px' },
		'.cm-scroller': { overflow: 'auto', fontFamily: '"Courier New", monospace' },
		'.cm-content': { padding: '12px 0' },
		'.cm-focused': { outline: 'none' }
	});

	onMount(() => {
		view = new EditorView({
			doc: value,
			extensions: [
				basicSetup,
				html(),
				oneDark,
				marioTheme,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						value = update.state.doc.toString();
					}
				})
			],
			parent: container
		});

		return () => view?.destroy();
	});

	$effect(() => {
		if (!view) return;
		const current = view.state.doc.toString();
		if (current !== value) {
			view.dispatch({
				changes: { from: 0, to: current.length, insert: value }
			});
		}
	});
</script>

<div class="editor-root" bind:this={container}></div>

<style>
	.editor-root {
		height: 100%;
		overflow: hidden;
	}

	.editor-root :global(.cm-editor) {
		height: 100%;
		background: #0d1117;
	}

	.editor-root :global(.cm-gutters) {
		background: #0d1117;
		border-right: 1px solid rgba(248, 184, 0, 0.15);
		color: #4a4a6a;
	}

	.editor-root :global(.cm-activeLineGutter),
	.editor-root :global(.cm-activeLine) {
		background: rgba(248, 184, 0, 0.05);
	}

	.editor-root :global(.cm-selectionBackground) {
		background: rgba(248, 184, 0, 0.2) !important;
	}

	.editor-root :global(.cm-cursor) {
		border-left-color: #f8b800;
	}
</style>
