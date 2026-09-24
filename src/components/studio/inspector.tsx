import { LayersPanel } from '@/components/studio/layers-panel.tsx';
import { NumberField, Swatch } from '@/components/studio/tool-rail.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { type AlignAxis, shallowEqual, studio, useStudioSelection } from '@/drawing/store.ts';
import {
	type Align,
	type BackgroundKind,
	type Element,
	PEN_PALETTE,
	WORKSPACE_PRESETS,
	type Workspace,
} from '@/drawing/types.ts';
import { cn } from '@/lib/utils.ts';
import {
	AlignCenterHorizontal,
	AlignCenterVertical,
	AlignEndHorizontal,
	AlignEndVertical,
	AlignStartHorizontal,
	AlignStartVertical,
	ArrowDown,
	ArrowUp,
	BringToFront,
	Copy,
	SendToBack,
	TextAlignCenter,
	TextAlignEnd,
	TextAlignStart,
	Trash,
} from 'lucide-react';
import * as React from 'react';

const SIZE_ITEMS = WORKSPACE_PRESETS.map((preset) => ({ label: preset.name, value: preset.name }));

const BACKGROUNDS: { id: BackgroundKind; label: string }[] = [
	{ id: 'blank', label: 'Blank' },
	{ id: 'lines', label: 'Ruled' },
	{ id: 'grid', label: 'Grid' },
	{ id: 'graph', label: 'Graph' },
	{ id: 'dots', label: 'Dotted' },
];

const PAPER_COLORS = ['#ffffff', '#fbfaf5', '#f1f5f9', '#fefce8', '#e2e8f0', '#1e293b'];

const ALIGNMENTS: { axis: AlignAxis; icon: typeof AlignStartVertical; label: string }[] = [
	{ axis: 'left', icon: AlignStartVertical, label: 'Align left' },
	{ axis: 'center', icon: AlignCenterVertical, label: 'Align centres horizontally' },
	{ axis: 'right', icon: AlignEndVertical, label: 'Align right' },
	{ axis: 'top', icon: AlignStartHorizontal, label: 'Align top' },
	{ axis: 'middle', icon: AlignCenterHorizontal, label: 'Align middles' },
	{ axis: 'bottom', icon: AlignEndHorizontal, label: 'Align bottom' },
];

const TEXT_ALIGNMENTS: { align: Align; icon: typeof TextAlignStart; label: string }[] = [
	{ align: 'left', icon: TextAlignStart, label: 'Align text left' },
	{ align: 'center', icon: TextAlignCenter, label: 'Align text centre' },
	{ align: 'right', icon: TextAlignEnd, label: 'Align text right' },
];

interface StylePatch {
	align?: Align;
	color?: string;
	fill?: string | null;
	fontSize?: number;
	opacity?: number;
	width?: number;
}

function restyleElement(element: Element, patch: StylePatch): Element {
	if (element.type === 'stroke') {
		return {
			...element,
			color: patch.color ?? element.color,
			opacity: patch.opacity ?? element.opacity,
			width: patch.width ?? element.width,
		};
	}
	if (element.type === 'shape') {
		return {
			...element,
			color: patch.color ?? element.color,
			fill: patch.fill === undefined ? element.fill : patch.fill,
			opacity: patch.opacity ?? element.opacity,
			strokeWidth: patch.width ?? element.strokeWidth,
		};
	}
	return {
		...element,
		align: patch.align ?? element.align,
		color: patch.color ?? element.color,
		fontSize: patch.fontSize ?? element.fontSize,
	};
}

function Section({
	actions,
	children,
	title,
}: {
	actions?: React.ReactNode;
	children: React.ReactNode;
	title: string;
}): React.ReactElement {
	return (
		<section className='flex flex-col gap-2 border-b px-3 py-3 last:border-b-0'>
			<header className='flex items-center justify-between'>
				<h2 className='font-medium text-xs uppercase tracking-wide text-muted-foreground'>{title}</h2>
				{actions}
			</header>
			{children}
		</section>
	);
}

function IconRow({
	items,
}: {
	items: { disabled?: boolean; icon: typeof AlignStartVertical; label: string; onClick: () => void }[];
}): React.ReactElement {
	return (
		<div className='flex flex-wrap items-center gap-0.5'>
			{items.map((item) => (
				<Button
					aria-label={item.label}
					disabled={item.disabled}
					key={item.label}
					onClick={item.onClick}
					size='icon-xs'
					title={item.label}
					variant='ghost'
				>
					<item.icon />
				</Button>
			))}
		</div>
	);
}

function SelectionSection({ selected }: { selected: Element[] }): React.ReactElement {
	const ids = selected.map((element) => element.id);
	const hasText = selected.some((element) => element.type === 'text');
	const hasShape = selected.some((element) => element.type === 'shape');
	const first = selected[0];
	const currentColor = first?.color;
	const currentWidth = first?.type === 'stroke' ? first.width : first?.type === 'shape' ? first.strokeWidth : null;
	const currentOpacity = first?.type === 'text' ? null : (first?.opacity ?? null);
	const currentFontSize = first?.type === 'text' ? first.fontSize : null;

	const beginEdit = React.useCallback(() => {
		if (studio.getState().selection.length) studio.commit('Change objects');
	}, []);
	const restyle = React.useCallback((patch: StylePatch) => {
		const selection = studio.getState().selection;
		if (!selection.length) return;
		studio.updateElements(selection, (element) => restyleElement(element, patch));
	}, []);

	return (
		<Section
			actions={
				<span className='text-[11px] text-muted-foreground'>
					{selected.length} object{selected.length === 1 ? '' : 's'}
				</span>
			}
			title='Selection'
		>
			<div className='flex flex-wrap items-center gap-1.5'>
				{PEN_PALETTE.slice(0, 8).map((color) => (
					<Swatch
						active={color === currentColor}
						color={color}
						key={color}
						onSelect={(next) => {
							beginEdit();
							restyle({ color: next });
						}}
					/>
				))}
				<input
					aria-label='Object colour'
					className='h-6 w-9 cursor-pointer rounded border border-input bg-transparent'
					onChange={(event) => {
						beginEdit();
						restyle({ color: event.target.value });
					}}
					onPointerDown={beginEdit}
					type='color'
					value={currentColor ?? '#111827'}
				/>
			</div>

			{hasShape ? (
				<div className='flex flex-wrap items-center gap-1.5'>
					<span className='w-10 text-muted-foreground text-xs'>Fill</span>
					<button
						className='rounded border border-input px-1.5 py-0.5 text-[11px] hover:bg-accent'
						onClick={() => {
							beginEdit();
							restyle({ fill: null });
						}}
						type='button'
					>
						None
					</button>
					{PEN_PALETTE.slice(1, 7).map((color) => (
						<Swatch
							active={false}
							color={color}
							key={`fill-${color}`}
							onSelect={(next) => {
								beginEdit();
								restyle({ fill: next });
							}}
							title={`Fill ${color}`}
						/>
					))}
				</div>
			) : null}

			{currentWidth !== null ? (
				<NumberField
					label='Width'
					max={120}
					min={0.5}
					onChange={(value) => restyle({ width: value })}
					onGestureStart={beginEdit}
					step={0.5}
					value={currentWidth}
				/>
			) : null}
			{currentOpacity !== null ? (
				<NumberField
					label='Opacity'
					max={1}
					min={0.05}
					onChange={(value) => restyle({ opacity: value })}
					onGestureStart={beginEdit}
					step={0.05}
					value={currentOpacity}
				/>
			) : null}
			{currentFontSize !== null ? (
				<NumberField
					label='Font'
					max={240}
					min={8}
					onChange={(value) => restyle({ fontSize: value })}
					onGestureStart={beginEdit}
					step={1}
					suffix='px'
					value={currentFontSize}
				/>
			) : null}

			{hasText ? (
				<IconRow
					items={TEXT_ALIGNMENTS.map((item) => ({
						icon: item.icon,
						label: item.label,
						onClick: () => {
							beginEdit();
							restyle({ align: item.align });
						},
					}))}
				/>
			) : null}

			<IconRow
				items={ALIGNMENTS.map((item) => ({
					disabled: selected.length < 2,
					icon: item.icon,
					label: item.label,
					onClick: () => studio.alignElements(ids, item.axis),
				}))}
			/>
			<IconRow
				items={[
					{
						icon: BringToFront,
						label: 'Bring to front',
						onClick: () => studio.reorderElements(ids, 'front'),
					},
					{ icon: ArrowUp, label: 'Bring forward', onClick: () => studio.reorderElements(ids, 'forward') },
					{ icon: ArrowDown, label: 'Send backward', onClick: () => studio.reorderElements(ids, 'backward') },
					{ icon: SendToBack, label: 'Send to back', onClick: () => studio.reorderElements(ids, 'back') },
				]}
			/>
			<div className='flex items-center gap-1.5'>
				<Button onClick={() => studio.duplicateSelection()} size='xs' variant='outline'>
					<Copy />
					Duplicate
				</Button>
				<Button onClick={() => studio.deleteSelection()} size='xs' variant='destructive-outline'>
					<Trash />
					Delete
				</Button>
			</div>
		</Section>
	);
}

function PageSection({ workspace }: { workspace: Workspace }): React.ReactElement {
	const [name, setName] = React.useState(workspace.name);
	const [width, setWidth] = React.useState(String(workspace.width));
	const [height, setHeight] = React.useState(String(workspace.height));

	React.useEffect(() => {
		setName(workspace.name);
		setWidth(String(workspace.width));
		setHeight(String(workspace.height));
	}, [workspace.name, workspace.width, workspace.height]);

	const commitSize = () => {
		const nextWidth = Number(width);
		const nextHeight = Number(height);
		if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth < 100 || nextHeight < 100) {
			setWidth(String(workspace.width));
			setHeight(String(workspace.height));
			return;
		}
		if (nextWidth !== workspace.width || nextHeight !== workspace.height)
			studio.setWorkspaceSize(nextWidth, nextHeight);
	};

	const preset = WORKSPACE_PRESETS.find((item) => item.width === workspace.width && item.height === workspace.height);

	return (
		<Section title='Page'>
			<input
				aria-label='Page name'
				className='h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none'
				onBlur={() => {
					const next = name.trim();
					if (next && next !== workspace.name) studio.renameWorkspace(workspace.id, next);
					else setName(workspace.name);
				}}
				onChange={(event) => setName(event.target.value)}
				value={name}
			/>
			<Select
				items={SIZE_ITEMS}
				onValueChange={(value) => {
					const match = WORKSPACE_PRESETS.find((item) => item.name === value);
					if (match) studio.setWorkspaceSize(match.width, match.height);
				}}
				value={preset?.name ?? null}
			>
				<SelectTrigger size='sm'>
					<SelectValue />
				</SelectTrigger>
				<SelectPopup>
					{SIZE_ITEMS.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectPopup>
			</Select>
			<div className='flex items-center gap-1.5 text-xs'>
				<input
					aria-label='Page width'
					className='h-7 w-full min-w-0 rounded-md border border-input bg-background px-1.5 tabular-nums outline-none'
					onBlur={commitSize}
					onChange={(event) => setWidth(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
					type='number'
					value={width}
				/>
				<span className='text-muted-foreground'>×</span>
				<input
					aria-label='Page height'
					className='h-7 w-full min-w-0 rounded-md border border-input bg-background px-1.5 tabular-nums outline-none'
					onBlur={commitSize}
					onChange={(event) => setHeight(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
					}}
					type='number'
					value={height}
				/>
			</div>
			<div className='flex flex-wrap items-center gap-1'>
				{BACKGROUNDS.map((item) => (
					<Button
						aria-pressed={workspace.background === item.id}
						key={item.id}
						onClick={() => studio.setWorkspaceBackground(item.id)}
						size='xs'
						variant={workspace.background === item.id ? 'secondary' : 'ghost'}
					>
						{item.label}
					</Button>
				))}
			</div>
			<div className='flex flex-wrap items-center gap-1.5'>
				{PAPER_COLORS.map((color) => (
					<Swatch
						active={workspace.color === color}
						color={color}
						key={color}
						onSelect={(next) => studio.setWorkspaceColor(next)}
					/>
				))}
			</div>
			<Button onClick={() => studio.clearWorkspace()} size='xs' variant='destructive-outline'>
				<Trash />
				Clear page
			</Button>
		</Section>
	);
}

export function Inspector({ className }: { className?: string }): React.ReactElement {
	const { workspace, selection } = useStudioSelection(
		(state) => ({
			selection: state.selection,
			workspace: state.notebook?.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? null,
		}),
		shallowEqual
	);

	const selected = React.useMemo(() => {
		if (!workspace || !selection.length) return [] as Element[];
		const ids = new Set(selection);
		return workspace.elements.filter((element) => ids.has(element.id));
	}, [workspace, selection]);

	if (!workspace) return <aside className={className} />;

	return (
		<aside className={cn('hidden w-72 shrink-0 flex-col overflow-y-auto border-s bg-card lg:flex', className)}>
			{selected.length ? <SelectionSection selected={selected} /> : null}
			<PageSection workspace={workspace} />
			<Section title='Properties'>
				<LayersPanel />
			</Section>
		</aside>
	);
}
