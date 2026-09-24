import { shallowEqual, studio, useStudioSelection } from '@/drawing/store.ts';
import { HIGHLIGHTER_PALETTE, PEN_PALETTE, type InputPolicy, type ShapeKind, type ToolId } from '@/drawing/types.ts';
import { cn } from '@/lib/utils.ts';
import {
	ArrowUpRight,
	Circle,
	Diamond,
	Eraser,
	Hand,
	Highlighter,
	Minus,
	MousePointer2,
	Pen,
	Square,
	TextAlignCenter,
	TextAlignEnd,
	TextAlignStart,
	Triangle,
	Type,
	Zap,
} from 'lucide-react';
import type * as React from 'react';

type IconComponent = React.ComponentType<{ className?: string }>;

const TOOLS: { icon: IconComponent; id: ToolId; label: string; shortcut: string }[] = [
	{ icon: MousePointer2, id: 'select', label: 'Select', shortcut: 'V' },
	{ icon: Hand, id: 'pan', label: 'Pan', shortcut: 'H' },
	{ icon: Pen, id: 'pen', label: 'Pen', shortcut: 'P' },
	{ icon: Highlighter, id: 'highlighter', label: 'Highlighter', shortcut: 'G' },
	{ icon: Eraser, id: 'eraser', label: 'Eraser', shortcut: 'E' },
	{ icon: Type, id: 'text', label: 'Text', shortcut: 'T' },
	{ icon: Square, id: 'shape', label: 'Shape', shortcut: 'R' },
	{ icon: Zap, id: 'laser', label: 'Laser pointer', shortcut: 'L' },
];

const SHAPES: { icon: IconComponent; kind: ShapeKind; label: string }[] = [
	{ icon: Square, kind: 'rect', label: 'Rectangle' },
	{ icon: Circle, kind: 'ellipse', label: 'Ellipse' },
	{ icon: Triangle, kind: 'triangle', label: 'Triangle' },
	{ icon: Diamond, kind: 'diamond', label: 'Diamond' },
	{ icon: Minus, kind: 'line', label: 'Line' },
	{ icon: ArrowUpRight, kind: 'arrow', label: 'Arrow' },
];

const INPUT_POLICIES: { id: InputPolicy; label: string }[] = [
	{ id: 'pen-only', label: 'Pen' },
	{ id: 'pen-and-touch', label: 'Pen + touch' },
	{ id: 'any', label: 'Any' },
];

export function ToolButton({
	active,
	icon: Icon,
	label,
	onClick,
	shortcut,
}: {
	active?: boolean;
	icon: IconComponent;
	label: string;
	onClick: () => void;
	shortcut?: string;
}): React.ReactElement {
	return (
		<button
			aria-pressed={active}
			className={cn(
				'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
				active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
			)}
			onClick={onClick}
			title={shortcut ? `${label} (${shortcut})` : label}
			type='button'
		>
			<Icon className='size-4.5' />
		</button>
	);
}

export function Swatch({
	active,
	color,
	onSelect,
	title,
}: {
	active: boolean;
	color: string;
	onSelect: (color: string) => void;
	title?: string;
}): React.ReactElement {
	return (
		<button
			aria-label={title ?? color}
			aria-pressed={active}
			className={cn(
				'size-6 shrink-0 rounded-full border border-black/15 shadow-xs transition-transform hover:scale-110',
				active && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
			)}
			onClick={() => onSelect(color)}
			style={{ backgroundColor: color }}
			title={title ?? color}
			type='button'
		/>
	);
}

export function NumberField({
	label,
	max,
	min,
	onChange,
	onGestureStart,
	step = 1,
	suffix,
	value,
}: {
	label: string;
	max: number;
	min: number;
	onChange: (value: number) => void;
	onGestureStart?: () => void;
	step?: number;
	suffix?: string;
	value: number;
}): React.ReactElement {
	return (
		<div className='flex items-center gap-2'>
			<span className='text-muted-foreground text-xs'>{label}</span>
			<input
				className='h-6 w-24 accent-primary'
				max={max}
				min={min}
				onChange={(event) => onChange(Number(event.target.value))}
				onKeyDown={onGestureStart}
				onPointerDown={onGestureStart}
				step={step}
				type='range'
				value={value}
			/>
			<span className='w-10 text-right text-xs tabular-nums'>
				{Math.round(value * 100) / 100}
				{suffix}
			</span>
		</div>
	);
}

function Options(): React.ReactElement {
	const { shape, style, tool } = useStudioSelection(
		(state) => ({ shape: state.shape, style: state.style, tool: state.tool }),
		shallowEqual
	);

	if (tool === 'pen' || tool === 'highlighter') {
		const highlighter = tool === 'highlighter';
		const palette = highlighter ? HIGHLIGHTER_PALETTE : PEN_PALETTE;
		const color = highlighter ? style.highlighterColor : style.color;
		return (
			<>
				<div className='flex items-center gap-1.5'>
					{palette.map((item) => (
						<Swatch
							active={item.toLowerCase() === color.toLowerCase()}
							color={item}
							key={item}
							onSelect={(next) =>
								studio.setStyle(highlighter ? { highlighterColor: next } : { color: next })
							}
						/>
					))}
					<input
						aria-label='Custom colour'
						className='size-6 shrink-0 cursor-pointer rounded-full border border-black/15 bg-transparent p-0'
						onChange={(event) =>
							studio.setStyle(
								highlighter ? { highlighterColor: event.target.value } : { color: event.target.value }
							)
						}
						type='color'
						value={color}
					/>
				</div>
				<NumberField
					label='Size'
					max={highlighter ? 64 : 24}
					min={highlighter ? 4 : 1}
					onChange={(value) => studio.setStyle(highlighter ? { highlighterWidth: value } : { width: value })}
					value={highlighter ? style.highlighterWidth : style.width}
				/>
				<NumberField
					label='Opacity'
					max={1}
					min={0.1}
					onChange={(value) => studio.setStyle({ opacity: value })}
					step={0.05}
					value={style.opacity}
				/>
			</>
		);
	}

	if (tool === 'eraser') {
		return (
			<>
				<NumberField
					label='Eraser'
					max={160}
					min={6}
					onChange={(value) => studio.setStyle({ eraserWidth: value })}
					value={style.eraserWidth}
				/>
				<span className='text-muted-foreground text-xs'>Tip: flip your pen to erase.</span>
			</>
		);
	}

	if (tool === 'shape') {
		return (
			<>
				<div className='flex items-center gap-1.5'>
					{SHAPES.map(({ icon, kind, label }) => (
						<ToolButton
							active={shape === kind}
							icon={icon}
							key={kind}
							label={label}
							onClick={() => studio.setShape(kind)}
						/>
					))}
				</div>
				<div className='flex items-center gap-1.5'>
					<Swatch
						active={style.fill === null}
						color='transparent'
						onSelect={() => studio.setStyle({ fill: null })}
						title='No fill'
					/>
					{PEN_PALETTE.slice(0, 6).map((item) => (
						<Swatch
							active={style.fill?.toLowerCase() === item.toLowerCase()}
							color={item}
							key={item}
							onSelect={(next) => studio.setStyle({ fill: next })}
							title={`Fill ${item}`}
						/>
					))}
				</div>
				<NumberField
					label='Stroke'
					max={24}
					min={1}
					onChange={(value) => studio.setStyle({ width: value })}
					value={style.width}
				/>
			</>
		);
	}

	if (tool === 'text') {
		const aligns: { align: 'left' | 'center' | 'right'; icon: IconComponent; label: string }[] = [
			{ align: 'left', icon: TextAlignStart, label: 'Align left' },
			{ align: 'center', icon: TextAlignCenter, label: 'Align centre' },
			{ align: 'right', icon: TextAlignEnd, label: 'Align right' },
		];
		return (
			<>
				<NumberField
					label='Font'
					max={120}
					min={10}
					onChange={(value) => studio.setStyle({ fontSize: value })}
					value={style.fontSize}
				/>
				<div className='flex items-center gap-1.5'>
					{aligns.map(({ align, icon, label }) => (
						<ToolButton
							icon={icon}
							key={align}
							label={label}
							onClick={() => {
								const id = studio.getState().editingTextId;
								if (id) {
									studio.updateElements([id], (element) =>
										element.type === 'text' ? { ...element, align } : element
									);
								}
							}}
						/>
					))}
				</div>
			</>
		);
	}

	if (tool === 'laser') {
		return (
			<span className='text-muted-foreground text-xs'>
				Draws a temporary pointer trail that never saves to the page.
			</span>
		);
	}

	return <span className='text-muted-foreground text-xs'>Drag to marquee-select, drag an object to move it.</span>;
}

export function ToolBar(): React.ReactElement {
	const { prefs, tool } = useStudioSelection((state) => ({ prefs: state.prefs, tool: state.tool }), shallowEqual);

	return (
		<div className='flex items-center gap-2 border-b bg-card px-3 py-2'>
			<div className='flex shrink-0 items-center gap-1'>
				{TOOLS.map(({ icon, id, label, shortcut }) => (
					<ToolButton
						active={tool === id}
						icon={icon}
						key={id}
						label={label}
						onClick={() => studio.setTool(id)}
						shortcut={shortcut}
					/>
				))}
			</div>
			<div className='mx-1 h-4 w-px shrink-0 bg-border' />
			<div className='flex min-w-0 flex-1 items-center gap-3 overflow-x-auto *:shrink-0'>
				<Options />
			</div>
			<div className='flex shrink-0 items-center gap-2'>
				<span className='text-muted-foreground text-xs'>Input</span>
				<div className='flex items-center rounded-lg border bg-background p-0.5'>
					{INPUT_POLICIES.map((policy) => (
						<button
							aria-pressed={prefs.inputPolicy === policy.id}
							className={cn(
								'rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent',
								prefs.inputPolicy === policy.id && 'bg-primary text-primary-foreground hover:bg-primary'
							)}
							key={policy.id}
							onClick={() => studio.setPrefs({ inputPolicy: policy.id })}
							title={
								policy.id === 'pen-only'
									? 'Only a pen writes; finger and mouse gestures pan and select'
									: policy.id === 'pen-and-touch'
										? 'Pen and finger both write'
										: 'Any pointer writes'
							}
							type='button'
						>
							{policy.label}
						</button>
					))}
				</div>
				<button
					aria-pressed={prefs.pressureSensitive}
					className={cn(
						'rounded-lg border px-2 py-1 text-xs transition-colors hover:bg-accent',
						prefs.pressureSensitive && 'border-primary/40 bg-primary/10 text-foreground'
					)}
					onClick={() => studio.setPrefs({ pressureSensitive: !prefs.pressureSensitive })}
					title='Vary ink width with pen pressure'
					type='button'
				>
					Pressure
				</button>
			</div>
		</div>
	);
}
