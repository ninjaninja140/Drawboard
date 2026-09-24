export const NOTEBOOK_VERSION = 1;

export type Point = {
	x: number;
	y: number;
	pressure: number; // 0..1, 0.5 for devices without pressure
};

export type InputKind = 'pen' | 'mouse' | 'touch';

export type ToolId = 'select' | 'pan' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'shape' | 'laser';

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'diamond';

export type BackgroundKind = 'blank' | 'grid' | 'lines' | 'dots' | 'graph';

export type Align = 'left' | 'center' | 'right';

export interface BaseElement {
	id: string;
	layerId: string;
}

export interface StrokeElement extends BaseElement {
	type: 'stroke';
	mode: 'pen' | 'highlighter'; // Ink or highlighter
	points: Point[];
	color: string;
	width: number; // Brush size in page units
	opacity: number;
	thinning: number; // How much the stroke thins with pressure, 0...1
	streamline: number;
	input: InputKind;
}

export interface ShapeElement extends BaseElement {
	type: 'shape';
	shape: ShapeKind;
	x: number; // Drag box in page units, w/h may be negative
	y: number;
	w: number;
	h: number;
	color: string;
	fill: string | null;
	strokeWidth: number;
	opacity: number;
}

export interface TextElement extends BaseElement {
	type: 'text';
	x: number;
	y: number;
	w: number;
	text: string;
	color: string;
	fontSize: number;
	fontFamily: string;
	align: Align;
	lineHeight: number;
}

export type Element = StrokeElement | ShapeElement | TextElement;

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	locked: boolean;
	opacity: number;
}

export interface Workspace {
	id: string;
	name: string;
	width: number;
	height: number;
	background: BackgroundKind;
	color: string;
	layers: Layer[]; // Bottom-most layer first
	elements: Element[]; // Bottom-most element first
}

export interface Notebook {
	version: number;
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	workspaces: Workspace[];
}

// Lightweight row used by the notebook library screen.
export interface NotebookSummary {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	workspaceCount: number;
}

export interface Viewport {
	zoom: number; // 1 = 100%
	x: number; // Screen-space offset of the workspace origin
	y: number;
}

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface StyleState {
	color: string;
	width: number;
	highlighterColor: string;
	highlighterWidth: number;
	opacity: number;
	fill: string | null;
	eraserWidth: number;
	fontSize: number;
	fontFamily: string;
}

// Which pointer kinds are allowed to leave ink.
export type InputPolicy = 'pen-only' | 'pen-and-touch' | 'any';

export interface Prefs {
	shape: ShapeKind;
	style: StyleState;
	inputPolicy: InputPolicy;
	pressureSensitive: boolean;
	showLayers: boolean;
}

export const PEN_PALETTE = [
	'#111827',
	'#dc2626',
	'#ea580c',
	'#f59e0b',
	'#16a34a',
	'#0891b2',
	'#2563eb',
	'#7c3aed',
	'#db2777',
	'#ffffff',
] as const;

export const HIGHLIGHTER_PALETTE = [
	'#fde047',
	'#a3e635',
	'#67e8f9',
	'#f9a8d4',
	'#fdba74',
	'#c4b5fd',
	'#ffffff',
] as const;

export const WORKSPACE_PRESETS = [
	{ name: 'Slide 16:9', width: 1600, height: 900 },
	{ name: 'Presentation 4:3', width: 1400, height: 1050 },
	{ name: 'A4 landscape', width: 1123, height: 794 },
	{ name: 'A4 portrait', width: 794, height: 1123 },
	{ name: 'Letter landscape', width: 1056, height: 816 },
	{ name: 'Square', width: 1024, height: 1024 },
] as const;

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

export const DEFAULT_PREFS: Prefs = {
	shape: 'rect',
	style: {
		color: '#111827',
		width: 3,
		highlighterColor: '#fde047',
		highlighterWidth: 18,
		opacity: 1,
		fill: null,
		eraserWidth: 28,
		fontSize: 32,
		fontFamily: 'DM Sans Variable',
	},
	inputPolicy: 'pen-and-touch',
	pressureSensitive: true,
	showLayers: true,
};
