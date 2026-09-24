import { Button } from '@/components/ui/button.tsx';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu.tsx';
import { workspaceDataUrl } from '@/drawing/export.ts';
import { shallowEqual, studio, useStudioSelection } from '@/drawing/store.ts';
import type { Workspace } from '@/drawing/types.ts';
import { cn } from '@/lib/utils.ts';
import { ArrowDown, ArrowUp, Copy, Ellipsis, Plus, Trash } from 'lucide-react';
import * as React from 'react';

function Thumbnail({ workspace }: { workspace: Workspace }): React.ReactElement {
	// Regenerated only when this page itself changes
	const url = React.useMemo(() => workspaceDataUrl(workspace, 320), [workspace]);
	return (
		<img
			alt=''
			className='pointer-events-none h-full w-full object-contain'
			draggable={false}
			src={url}
			style={{ aspectRatio: `${workspace.width} / ${workspace.height}` }}
		/>
	);
}

function PageThumb({
	index,
	workspace,
	active,
	canDelete,
	last,
}: {
	index: number;
	workspace: Workspace;
	active: boolean;
	canDelete: boolean;
	last: boolean;
}): React.ReactElement {
	return (
		<div className='group relative'>
			<button
				aria-current={active}
				className={cn(
					'flex w-full flex-col gap-1 rounded-xl border border-transparent bg-background p-1.5 text-left transition-colors hover:border-input',
					active && 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
				)}
				onClick={() => studio.selectWorkspace(workspace.id)}
				type='button'
			>
				<span className='flex w-full items-start justify-center overflow-hidden rounded-lg border bg-white shadow-xs'>
					<Thumbnail workspace={workspace} />
				</span>
				<span className='flex items-center gap-1 px-0.5'>
					<span className='text-muted-foreground text-[11px] tabular-nums'>{index + 1}</span>
					<span className='min-w-0 flex-1 truncate text-xs'>{workspace.name}</span>
				</span>
			</button>
			<Menu>
				<MenuTrigger
					render={
						<Button
							className='absolute inset-e-2 top-2 opacity-0 transition-opacity group-hover:opacity-100'
							size='icon-xs'
							variant='outline'
						/>
					}
				>
					<Ellipsis />
				</MenuTrigger>
				<MenuPopup align='end' side='right'>
					<MenuItem onClick={() => studio.duplicateWorkspace(workspace.id)}>
						<Copy />
						Duplicate
					</MenuItem>
					<MenuItem onClick={() => studio.moveWorkspace(workspace.id, -1)} disabled={index === 0}>
						<ArrowUp />
						Move up
					</MenuItem>
					<MenuItem disabled={last} onClick={() => studio.moveWorkspace(workspace.id, 1)}>
						<ArrowDown />
						Move down
					</MenuItem>
					<MenuSeparator />
					<MenuItem
						disabled={!canDelete}
						onClick={() => studio.deleteWorkspace(workspace.id)}
						variant='destructive'
					>
						<Trash />
						Delete page
					</MenuItem>
				</MenuPopup>
			</Menu>
		</div>
	);
}

export function PageStrip({ className }: { className?: string }): React.ReactElement {
	const { notebook, activeId } = useStudioSelection(
		(state) => ({ activeId: state.activeWorkspaceId, notebook: state.notebook }),
		shallowEqual
	);

	if (!notebook) return <aside className={className} />;

	return (
		<aside className={cn('hidden w-44 shrink-0 flex-col border-r bg-card md:flex', className)}>
			<div className='flex items-center justify-between px-3 py-2'>
				<span className='font-medium text-xs uppercase tracking-wide text-muted-foreground'>Pages</span>
				<Button
					aria-label='Add page'
					onClick={() => studio.addWorkspace()}
					size='icon-xs'
					title='Add page'
					variant='ghost'
				>
					<Plus />
				</Button>
			</div>
			<div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3'>
				{notebook.workspaces.map((workspace, index) => (
					<PageThumb
						active={workspace.id === activeId}
						canDelete={notebook.workspaces.length > 1}
						index={index}
						key={workspace.id}
						last={index === notebook.workspaces.length - 1}
						workspace={workspace}
					/>
				))}
				<Button className='mt-1' onClick={() => studio.addWorkspace()} size='sm' variant='outline'>
					<Plus />
					Add page
				</Button>
			</div>
		</aside>
	);
}
