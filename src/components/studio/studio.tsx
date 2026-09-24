import { CanvasStage } from '@/components/studio/canvas-stage.tsx';
import { Inspector } from '@/components/studio/inspector.tsx';
import { Library } from '@/components/studio/library.tsx';
import { PageStrip } from '@/components/studio/page-strip.tsx';
import { ToolBar } from '@/components/studio/tool-rail.tsx';
import { TopBar } from '@/components/studio/top-bar.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Spinner } from '@/components/ui/spinner.tsx';
import { attachAutosave, hydrateFromStorage } from '@/drawing/persistence.ts';
import { shallowEqual, studio, useStudioSelection, useViewport } from '@/drawing/store.ts';
import type { ToolId } from '@/drawing/types.ts';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import * as React from 'react';

const TOOL_KEYS: Record<string, ToolId> = {
	e: 'eraser',
	g: 'highlighter',
	h: 'pan',
	l: 'laser',
	p: 'pen',
	r: 'shape',
	t: 'text',
	v: 'select',
};

let booting: Promise<void> | null = null;

function boot(): Promise<void> {
	booting ??= hydrateFromStorage().catch((error: unknown) => {
		console.error('Failed to load the drawing library', error);
		studio.setHydrated(true);
	});
	return booting;
}

// Hydrate as soon as the module loads: a hot replacement of the store module creates a
// fresh store instance that a mount-only effect would never re-initialise.
void boot();

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function useStudioShortcuts(fit: () => void): void {
	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!studio.getState().notebook) return;
			if (isTypingTarget(event.target)) return;

			const mod = event.ctrlKey || event.metaKey;
			const key = event.key.toLowerCase();

			if (mod) {
				switch (key) {
					case 'z':
						event.preventDefault();
						if (event.shiftKey) studio.redo();
						else studio.undo();
						return;
					case 'y':
						event.preventDefault();
						studio.redo();
						return;
					case 'a':
						event.preventDefault();
						studio.setTool('select');
						studio.selectAll();
						return;
					case 'd':
						event.preventDefault();
						studio.duplicateSelection();
						return;
					case '0':
						event.preventDefault();
						fit();
						return;
					case '=':
					case '+':
						event.preventDefault();
						studio.zoomBy(1.2);
						return;
					case '-':
						event.preventDefault();
						studio.zoomBy(1 / 1.2);
						return;
					default:
						return;
				}
			}

			if (event.altKey) return;

			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				studio.deleteSelection();
				return;
			}
			if (event.key === 'Escape') {
				studio.clearSelection();
				return;
			}
			if (event.key === 'PageDown' || event.key === 'PageUp') {
				const state = studio.getState();
				const notebook = state.notebook;
				if (!notebook) return;
				const index = notebook.workspaces.findIndex((item) => item.id === state.activeWorkspaceId);
				const next = notebook.workspaces[index + (event.key === 'PageDown' ? 1 : -1)];
				if (next) {
					event.preventDefault();
					studio.selectWorkspace(next.id);
				}
				return;
			}

			const tool = TOOL_KEYS[key];
			if (tool) {
				event.preventDefault();
				studio.setTool(tool);
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [fit]);
}

function ZoomControls({ stageRef }: { stageRef: React.RefObject<HTMLDivElement | null> }): React.ReactElement {
	const viewport = useViewport();

	const anchor = () => {
		const stage = stageRef.current;
		return { x: (stage?.clientWidth ?? 0) / 2, y: (stage?.clientHeight ?? 0) / 2 };
	};
	const fit = React.useCallback(() => {
		const stage = stageRef.current;
		if (stage) studio.fitToViewport(stage.clientWidth, stage.clientHeight);
	}, [stageRef]);

	return (
		<div className='absolute inset-e-4 bottom-4 flex items-center gap-0.5 rounded-xl border bg-card/90 p-1 shadow-sm backdrop-blur'>
			<Button
				aria-label='Zoom out'
				onClick={() => studio.zoomBy(1 / 1.2, anchor())}
				size='icon-xs'
				title='Zoom out (Ctrl+-)'
				variant='ghost'
			>
				<ZoomOut />
			</Button>
			<button
				className='min-w-14 rounded px-1 text-center text-xs tabular-nums hover:bg-accent'
				onClick={fit}
				title='Fit page (Ctrl+0)'
				type='button'
			>
				{Math.round(viewport.zoom * 100)}%
			</button>
			<Button
				aria-label='Zoom in'
				onClick={() => studio.zoomBy(1.2, anchor())}
				size='icon-xs'
				title='Zoom in (Ctrl++)'
				variant='ghost'
			>
				<ZoomIn />
			</Button>
			<Button aria-label='Fit page' onClick={fit} size='icon-xs' title='Fit page to screen' variant='ghost'>
				<Maximize />
			</Button>
		</div>
	);
}

export function Studio(): React.ReactElement {
	const { hydrated, notebook, showPanel } = useStudioSelection(
		(state) => ({
			hydrated: state.hydrated,
			notebook: state.notebook,
			showPanel: state.prefs.showLayers,
		}),
		shallowEqual
	);
	const stageRef = React.useRef<HTMLDivElement | null>(null);

	React.useEffect(() => attachAutosave(), []);

	const fit = React.useCallback(() => {
		const stage = stageRef.current;
		if (stage) studio.fitToViewport(stage.clientWidth, stage.clientHeight);
	}, []);

	useStudioShortcuts(fit);

	if (!hydrated) {
		return (
			<div className='flex h-dvh items-center justify-center bg-background text-muted-foreground'>
				<Spinner className='size-5' />
			</div>
		);
	}

	if (!notebook) {
		return (
			<div className='flex h-dvh flex-col bg-background text-foreground'>
				<Library />
			</div>
		);
	}

	return (
		<div className='flex h-dvh min-h-0 flex-col bg-background text-foreground'>
			<TopBar />
			<ToolBar />
			<div className='flex min-h-0 flex-1'>
				<PageStrip />
				<div className='relative min-h-0 min-w-0 flex-1 bg-muted/40' ref={stageRef}>
					<CanvasStage key={notebook.id} />
					<ZoomControls stageRef={stageRef} />
				</div>
				{showPanel ? <Inspector /> : null}
			</div>
		</div>
	);
}
