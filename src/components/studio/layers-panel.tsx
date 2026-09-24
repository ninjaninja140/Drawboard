import { Button } from '@/components/ui/button.tsx';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu.tsx';
import { shallowEqual, studio, useStudioSelection } from '@/drawing/store.ts';
import type { Layer } from '@/drawing/types.ts';
import { cn } from '@/lib/utils.ts';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Merge, Ellipsis, Plus, Trash } from 'lucide-react';
import * as React from 'react';

function LayerRow({
	layer,
	index,
	count,
	active,
	canDelete,
	elementCount,
}: {
	layer: Layer;
	index: number;
	count: number;
	active: boolean;
	canDelete: boolean;
	elementCount: number;
}): React.ReactElement {
	const [renaming, setRenaming] = React.useState(false);
	const [draft, setDraft] = React.useState(layer.name);
	const inputRef = React.useRef<HTMLInputElement | null>(null);

	React.useEffect(() => {
		if (!renaming) setDraft(layer.name);
	}, [layer.name, renaming]);

	React.useEffect(() => {
		if (renaming) inputRef.current?.focus();
	}, [renaming]);

	const commitRename = () => {
		setRenaming(false);
		const next = draft.trim();
		if (!next || next === layer.name) {
			setDraft(layer.name);
			return;
		}
		studio.commit('Rename layer');
		studio.updateLayer(layer.id, { name: next });
	};

	return (
		<div
			className={cn(
				'flex items-center gap-1 rounded-lg border border-transparent px-1.5 py-1',
				active ? 'border-primary/50 bg-primary/5' : 'hover:border-input'
			)}
		>
			<Button
				aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
				className='shrink-0'
				onClick={() => {
					studio.commit('Toggle layer visibility');
					studio.updateLayer(layer.id, { visible: !layer.visible });
				}}
				size='icon-xs'
				title={layer.visible ? 'Hide layer' : 'Show layer'}
				variant='ghost'
			>
				{layer.visible ? <Eye /> : <EyeOff />}
			</Button>
			<Button
				aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
				className='shrink-0'
				onClick={() => {
					studio.commit('Toggle layer lock');
					studio.updateLayer(layer.id, { locked: !layer.locked });
				}}
				size='icon-xs'
				title={layer.locked ? 'Unlock layer' : 'Lock layer'}
				variant='ghost'
			>
				{layer.locked ? <Lock /> : <LockOpen />}
			</Button>
			{renaming ? (
				<input
					aria-label='Layer name'
					className='min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-xs outline-none'
					onBlur={commitRename}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commitRename();
						if (event.key === 'Escape') {
							setDraft(layer.name);
							setRenaming(false);
						}
					}}
					ref={inputRef}
					value={draft}
				/>
			) : (
				<button
					className='min-w-0 flex-1 truncate text-left text-xs'
					onClick={() => studio.setActiveLayer(layer.id)}
					onDoubleClick={() => setRenaming(true)}
					title={`${layer.name} — ${elementCount} object${elementCount === 1 ? '' : 's'}`}
					type='button'
				>
					{layer.name}
				</button>
			)}
			<span className='text-[10px] tabular-nums text-muted-foreground'>{elementCount}</span>
			<Menu>
				<MenuTrigger render={<Button className='shrink-0' size='icon-xs' variant='ghost' />}>
					<Ellipsis />
				</MenuTrigger>
				<MenuPopup align='end'>
					<MenuItem onClick={() => setRenaming(true)}>Rename</MenuItem>
					<MenuSeparator />
					<MenuItem disabled={index >= count - 1} onClick={() => studio.moveLayer(layer.id, 1)}>
						<ArrowUp />
						Move up
					</MenuItem>
					<MenuItem disabled={index <= 0} onClick={() => studio.moveLayer(layer.id, -1)}>
						<ArrowDown />
						Move down
					</MenuItem>
					<MenuItem disabled={index <= 0} onClick={() => studio.mergeLayerDown(layer.id)}>
						<Merge />
						Merge down
					</MenuItem>
					<MenuSeparator />
					<MenuItem disabled={!canDelete} onClick={() => studio.deleteLayer(layer.id)} variant='destructive'>
						<Trash />
						Delete layer
					</MenuItem>
				</MenuPopup>
			</Menu>
		</div>
	);
}

export function LayersPanel(): React.ReactElement {
	const { workspace, activeLayerId } = useStudioSelection(
		(state) => ({
			activeLayerId: state.activeLayerId,
			workspace: state.notebook?.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? null,
		}),
		shallowEqual
	);

	if (!workspace) return <div />;

	const ordered = [...workspace.layers].reverse();

	return (
		<div className='flex flex-col gap-1.5'>
			<div className='flex items-center justify-between'>
				<span className='font-medium text-xs uppercase tracking-wide text-muted-foreground'>Layers</span>
				<Button
					aria-label='Add layer'
					onClick={() => studio.addLayer()}
					size='icon-xs'
					title='Add layer'
					variant='ghost'
				>
					<Plus />
				</Button>
			</div>
			<p className='text-[11px] text-muted-foreground'>New objects go on the selected layer.</p>
			<div className='flex flex-col gap-0.5'>
				{ordered.map((layer) => (
					<LayerRow
						active={layer.id === activeLayerId}
						canDelete={workspace.layers.length > 1}
						count={workspace.layers.length}
						elementCount={workspace.elements.filter((element) => element.layerId === layer.id).length}
						index={workspace.layers.indexOf(layer)}
						key={layer.id}
						layer={layer}
					/>
				))}
			</div>
		</div>
	);
}
