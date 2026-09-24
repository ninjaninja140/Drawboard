import { TitleBar } from '@/components/studio/window-chrome.tsx';
import { useTheme } from '@/components/theme-provider.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu.tsx';
import { exportAllWorkspacesPng, exportNotebookJson, exportWorkspacePng } from '@/drawing/export.ts';
import { shallowEqual, studio, useStudioSelection } from '@/drawing/store.ts';
import { Check, Download, FileDown, Image, LayoutGrid, Moon, NotebookPen, Redo2, Sun, Undo2 } from 'lucide-react';
import * as React from 'react';

export function TopBar(): React.ReactElement {
	const { notebook, savedAt, status, canRedo, canUndo, showLayers, workspace } = useStudioSelection(
		(state) => ({
			canRedo: state.future.length > 0,
			canUndo: state.history.length > 0,
			notebook: state.notebook,
			savedAt: state.savedAt,
			showLayers: state.prefs.showLayers,
			status: state.status,
			workspace: state.notebook?.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? null,
		}),
		shallowEqual
	);
	const [name, setName] = React.useState(notebook?.name ?? '');
	const { theme, setTheme } = useTheme();

	React.useEffect(() => {
		setName(notebook?.name ?? '');
	}, [notebook?.name]);

	if (!notebook) return <div />;

	const dirty = savedAt === null || notebook.updatedAt > savedAt;

	return (
		<TitleBar>
			<div className='flex min-w-0 items-center gap-2'>
				<NotebookPen className='size-4.5 shrink-0 text-muted-foreground' />
				<input
					aria-label='Notebook name'
					className='h-8 w-32 min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2 font-medium text-sm outline-none select-text hover:border-input focus-visible:border-input sm:w-40'
					onBlur={() => {
						const next = name.trim();
						if (next && next !== notebook.name) studio.renameNotebook(next);
						else setName(notebook.name);
					}}
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
					value={name}
				/>
			</div>

			<span className='hidden shrink-0 items-center gap-1.5 text-muted-foreground text-xs md:flex'>
				{status === 'saving' ? (
					'Saving…'
				) : dirty ? (
					'Unsaved changes'
				) : (
					<>
						<Check className='size-3.5' />
						Saved locally
					</>
				)}
			</span>

			<div className='flex shrink-0 items-center gap-1'>
				<Button
					aria-label='Undo'
					disabled={!canUndo}
					onClick={() => studio.undo()}
					size='icon-sm'
					title='Undo (Ctrl+Z)'
					variant='ghost'
				>
					<Undo2 />
				</Button>
				<Button
					aria-label='Redo'
					disabled={!canRedo}
					onClick={() => studio.redo()}
					size='icon-sm'
					title='Redo (Ctrl+Shift+Z)'
					variant='ghost'
				>
					<Redo2 />
				</Button>
			</div>

			<span className='hidden shrink-0 text-muted-foreground text-xs md:inline'>
				{notebook.workspaces.length} page{notebook.workspaces.length === 1 ? '' : 's'}
			</span>

			<div className='ms-auto flex shrink-0 items-center gap-1'>
				<Button
					aria-label='Toggle properties panel'
					aria-pressed={showLayers}
					onClick={() => studio.setPrefs({ showLayers: !showLayers })}
					size='icon-sm'
					title='Toggle properties panel'
					variant={showLayers ? 'secondary' : 'ghost'}
				>
					<LayoutGrid />
				</Button>
				<Button
					aria-label='Toggle theme'
					onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
					size='icon-sm'
					title='Toggle dark mode'
					variant='ghost'
				>
					{theme === 'dark' ? <Sun /> : <Moon />}
				</Button>
				<Menu>
					<MenuTrigger render={<Button size='sm' variant='outline' />}>
						<Download />
						Export
					</MenuTrigger>
					<MenuPopup align='end'>
						<MenuItem
							disabled={!workspace}
							onClick={() => workspace && void exportWorkspacePng(workspace, notebook.name)}
						>
							<Image />
							This page as PNG
						</MenuItem>
						<MenuItem onClick={() => void exportAllWorkspacesPng(notebook)}>
							<Image />
							All pages as PNG
						</MenuItem>
						<MenuSeparator />
						<MenuItem onClick={() => exportNotebookJson(notebook)}>
							<FileDown />
							Notebook file (.json)
						</MenuItem>
					</MenuPopup>
				</Menu>
				<Button onClick={() => studio.closeNotebook()} size='sm' title='Back to notebooks' variant='ghost'>
					Notebooks
				</Button>
			</div>
		</TitleBar>
	);
}
