import { useCallback, useRef, useSyncExternalStore } from 'react';
import { elementBounds, elementsBounds, translateElement } from './geometry.ts';
import {
	DEFAULT_PREFS,
	MAX_ZOOM,
	MIN_ZOOM,
	NOTEBOOK_VERSION,
	type BackgroundKind,
	type Element,
	type Layer,
	type Notebook,
	type NotebookSummary,
	type Prefs,
	type ShapeKind,
	type StyleState,
	type TextElement,
	type ToolId,
	type Viewport,
	type Workspace,
} from './types.ts';

const HISTORY_LIMIT = 100;
const DUPLICATE_OFFSET = 24;

export function createId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLayer(name: string): Layer {
	return { id: createId(), name, opacity: 1, visible: true, locked: false };
}

export function createWorkspace(
	options: Partial<Pick<Workspace, 'name' | 'width' | 'height' | 'background' | 'color'>> = {}
): Workspace {
	return {
		background: options.background ?? 'blank',
		color: options.color ?? '#ffffff',
		elements: [],
		height: options.height ?? 900,
		id: createId(),
		layers: [createLayer('Layer 1')],
		name: options.name ?? 'Page 1',
		width: options.width ?? 1600,
	};
}

export function createNotebook(name: string, workspaces?: Workspace[]): Notebook {
	const now = Date.now();
	return {
		createdAt: now,
		id: createId(),
		name,
		updatedAt: now,
		version: NOTEBOOK_VERSION,
		workspaces: workspaces?.length ? workspaces : [createWorkspace()],
	};
}

export function summarizeNotebook(notebook: Notebook): NotebookSummary {
	return {
		createdAt: notebook.createdAt,
		id: notebook.id,
		name: notebook.name,
		updatedAt: notebook.updatedAt,
		workspaceCount: notebook.workspaces.length,
	};
}

export interface HistoryEntry {
	label: string;
	notebook: Notebook;
	selection: string[];
	activeLayerId: string | null;
}

export type AlignAxis = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type OrderMode = 'front' | 'forward' | 'backward' | 'back';

export interface StudioState {
	notebook: Notebook | null;
	activeWorkspaceId: string | null;
	activeLayerId: string | null;
	tool: ToolId;
	shape: ShapeKind;
	style: StyleState;
	prefs: Prefs;
	selection: string[];
	editingTextId: string | null;
	viewport: Viewport;
	history: HistoryEntry[];
	future: HistoryEntry[];
	status: 'idle' | 'saving' | 'saved' | 'error';
	savedAt: number | null;
	library: NotebookSummary[];
	hydrated: boolean;
}

function initialState(): StudioState {
	return {
		activeLayerId: null,
		activeWorkspaceId: null,
		editingTextId: null,
		future: [],
		history: [],
		hydrated: false,
		library: [],
		notebook: null,
		prefs: DEFAULT_PREFS,
		savedAt: null,
		selection: [],
		shape: DEFAULT_PREFS.shape,
		status: 'idle',
		style: DEFAULT_PREFS.style,
		tool: 'pen',
		viewport: { x: 0, y: 0, zoom: 1 },
	};
}

let state: StudioState = initialState();
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of [...listeners]) listener();
}

function setState(patch: Partial<StudioState>): void {
	state = { ...state, ...patch };
	emit();
}

function cloneWorkspace(workspace: Workspace): Workspace {
	return {
		...workspace,
		elements: workspace.elements.map((el) => ({ ...el })),
		layers: workspace.layers.map((layer) => ({ ...layer })),
	};
}

function activeWorkspaceOf(current: StudioState): Workspace | null {
	if (!current.notebook) return null;
	return (
		current.notebook.workspaces.find((workspace) => workspace.id === current.activeWorkspaceId) ??
		current.notebook.workspaces[0] ??
		null
	);
}

function writableLayerId(current: StudioState): string | null {
	const workspace = activeWorkspaceOf(current);
	if (!workspace) return null;
	const active = workspace.layers.find((layer) => layer.id === current.activeLayerId);
	if (active?.visible && !active.locked) return active.id;
	return [...workspace.layers].reverse().find((layer) => layer.visible && !layer.locked)?.id ?? null;
}

function reorder<T>(list: T[], from: number, to: number): T[] {
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
	return next;
}

function snapshot(label: string): HistoryEntry {
	return {
		activeLayerId: state.activeLayerId,
		label,
		notebook: state.notebook as Notebook,
		selection: state.selection,
	};
}

export const studio = {
	subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},

	getState(): StudioState {
		return state;
	},

	activeWorkspace(): Workspace | null {
		return activeWorkspaceOf(state);
	},

	activeLayerId(): string | null {
		return writableLayerId(state);
	},

	canUndo(): boolean {
		return state.history.length > 0;
	},

	canRedo(): boolean {
		return state.future.length > 0;
	},

	isDirty(): boolean {
		if (!state.notebook) return false;
		return state.savedAt === null || state.notebook.updatedAt > state.savedAt;
	},

	commit(label: string): void {
		if (!state.notebook) return;
		setState({ future: [], history: [...state.history, snapshot(label)].slice(-HISTORY_LIMIT) });
	},

	newNotebook(name: string, workspaces?: Workspace[]): Notebook {
		const notebook = createNotebook(name, workspaces);
		studio.openNotebook(notebook);
		return notebook;
	},

	openNotebook(notebook: Notebook): void {
		const normalized: Notebook = {
			...notebook,
			version: NOTEBOOK_VERSION,
			workspaces: notebook.workspaces.length ? notebook.workspaces.map(cloneWorkspace) : [createWorkspace()],
		};
		const first = normalized.workspaces[0];
		setState({
			activeLayerId: first.layers[first.layers.length - 1]?.id ?? null,
			activeWorkspaceId: first.id,
			editingTextId: null,
			future: [],
			history: [],
			notebook: normalized,
			savedAt: Date.now(),
			selection: [],
			status: 'saved',
		});
	},

	closeNotebook(): void {
		const { library, prefs, tool } = state;
		setState({
			...initialState(),
			hydrated: true,
			library,
			prefs,
			shape: prefs.shape,
			style: prefs.style,
			tool,
		});
	},

	renameNotebook(name: string): void {
		if (!state.notebook) return;
		studio.commit('Rename notebook');
		setState({ notebook: { ...state.notebook, name, updatedAt: Date.now() } });
	},

	setLibrary(library: NotebookSummary[]): void {
		setState({ library });
	},

	setHydrated(hydrated: boolean): void {
		setState({ hydrated });
	},

	markSaved(at = Date.now()): void {
		setState({ savedAt: at, status: 'saved' });
	},

	setStatus(status: StudioState['status']): void {
		setState({ status });
	},

	selectWorkspace(id: string): void {
		const workspace = state.notebook?.workspaces.find((item) => item.id === id);
		if (!workspace || id === state.activeWorkspaceId) return;
		setState({
			activeLayerId: workspace.layers[workspace.layers.length - 1]?.id ?? null,
			activeWorkspaceId: id,
			editingTextId: null,
			selection: [],
		});
	},

	addWorkspace(
		options: Partial<Pick<Workspace, 'name' | 'width' | 'height' | 'background' | 'color'>> = {}
	): Workspace {
		const workspace = createWorkspace(options);
		if (!state.notebook) return workspace;
		studio.commit('Add workspace');
		if (!options.name) workspace.name = `Page ${state.notebook.workspaces.length + 1}`;
		setState({
			activeLayerId: workspace.layers[workspace.layers.length - 1]?.id ?? null,
			activeWorkspaceId: workspace.id,
			notebook: {
				...state.notebook,
				updatedAt: Date.now(),
				workspaces: [...state.notebook.workspaces, workspace],
			},
			selection: [],
		});
		return workspace;
	},

	insertWorkspace(workspace: Workspace, index?: number): void {
		const notebook = state.notebook;
		if (!notebook) return;
		const workspaces = [...notebook.workspaces];
		workspaces.splice(Math.max(0, Math.min(workspaces.length, index ?? workspaces.length)), 0, workspace);
		studio.commit('Add workspace');
		setState({
			activeLayerId: workspace.layers[workspace.layers.length - 1]?.id ?? null,
			activeWorkspaceId: workspace.id,
			notebook: { ...notebook, updatedAt: Date.now(), workspaces },
			selection: [],
		});
	},

	duplicateWorkspace(id: string): void {
		const notebook = state.notebook;
		if (!notebook) return;
		const index = notebook.workspaces.findIndex((workspace) => workspace.id === id);
		if (index < 0) return;
		studio.commit('Duplicate workspace');
		const source = notebook.workspaces[index];
		const layerIds = source.layers.map(() => createId());
		const layerMap = new Map(source.layers.map((layer, i) => [layer.id, layerIds[i]]));
		const copy: Workspace = {
			...source,
			elements: source.elements.map((el) => ({
				...el,
				id: createId(),
				layerId: layerMap.get(el.layerId) ?? layerIds[0],
			})),
			id: createId(),
			layers: source.layers.map((layer, i) => ({ ...layer, id: layerIds[i] })),
			name: `${source.name} copy`,
		};
		const workspaces = [...notebook.workspaces];
		workspaces.splice(index + 1, 0, copy);
		setState({
			activeLayerId: copy.layers[copy.layers.length - 1]?.id ?? null,
			activeWorkspaceId: copy.id,
			notebook: { ...notebook, updatedAt: Date.now(), workspaces },
			selection: [],
		});
	},

	deleteWorkspace(id: string): void {
		const notebook = state.notebook;
		if (!notebook || notebook.workspaces.length <= 1) return;
		studio.commit('Delete workspace');
		const workspaces = notebook.workspaces.filter((workspace) => workspace.id !== id);
		const workspace = (state.activeWorkspaceId === id ? null : activeWorkspaceOf(state)) ?? workspaces[0];
		setState({
			activeLayerId: workspace.layers[workspace.layers.length - 1]?.id ?? null,
			activeWorkspaceId: workspace.id,
			notebook: { ...notebook, updatedAt: Date.now(), workspaces },
			selection: [],
		});
	},

	renameWorkspace(id: string, name: string): void {
		studio.commit('Rename workspace');
		studio.updateWorkspace(id, (workspace) => ({ ...workspace, name }));
	},

	moveWorkspace(id: string, delta: number): void {
		const notebook = state.notebook;
		if (!notebook) return;
		const index = notebook.workspaces.findIndex((workspace) => workspace.id === id);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= notebook.workspaces.length) return;
		studio.commit('Reorder workspaces');
		setState({
			notebook: { ...notebook, updatedAt: Date.now(), workspaces: reorder(notebook.workspaces, index, target) },
		});
	},

	updateWorkspace(id: string, updater: (workspace: Workspace) => Workspace): void {
		const notebook = state.notebook;
		if (!notebook) return;
		setState({
			notebook: {
				...notebook,
				updatedAt: Date.now(),
				workspaces: notebook.workspaces.map((workspace) =>
					workspace.id === id ? updater(workspace) : workspace
				),
			},
		});
	},

	updateActiveWorkspace(updater: (workspace: Workspace) => Workspace): void {
		const id = activeWorkspaceOf(state)?.id;
		if (id) studio.updateWorkspace(id, updater);
	},

	setWorkspaceSize(width: number, height: number): void {
		studio.commit('Resize workspace');
		studio.updateActiveWorkspace((workspace) => ({
			...workspace,
			height: Math.max(100, Math.round(height)),
			width: Math.max(100, Math.round(width)),
		}));
	},

	setWorkspaceBackground(background: BackgroundKind): void {
		studio.commit('Change background');
		studio.updateActiveWorkspace((workspace) => ({ ...workspace, background }));
	},

	setWorkspaceColor(color: string): void {
		studio.commit('Change paper colour');
		studio.updateActiveWorkspace((workspace) => ({ ...workspace, color }));
	},

	clearWorkspace(): void {
		studio.commit('Clear workspace');
		studio.updateActiveWorkspace((workspace) => ({ ...workspace, elements: [] }));
		setState({ selection: [] });
	},

	addLayer(name?: string): string | null {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return null;
		studio.commit('Add layer');
		const layer = createLayer(name ?? `Layer ${workspace.layers.length + 1}`);
		studio.updateWorkspace(workspace.id, (current) => ({ ...current, layers: [...current.layers, layer] }));
		setState({ activeLayerId: layer.id });
		return layer.id;
	},

	deleteLayer(id: string): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace || workspace.layers.length <= 1) return;
		studio.commit('Delete layer');
		const layers = workspace.layers.filter((layer) => layer.id !== id);
		studio.updateWorkspace(workspace.id, (current) => ({
			...current,
			elements: current.elements.filter((el) => el.layerId !== id),
			layers,
		}));
		setState({ activeLayerId: layers[layers.length - 1].id, selection: [] });
	},

	updateLayer(id: string, patch: Partial<Omit<Layer, 'id'>>): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return;
		studio.commit('Update layer');
		studio.updateWorkspace(workspace.id, (current) => ({
			...current,
			layers: current.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
		}));
	},

	moveLayer(id: string, delta: number): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return;
		const index = workspace.layers.findIndex((layer) => layer.id === id);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= workspace.layers.length) return;
		studio.commit('Reorder layers');
		studio.updateWorkspace(workspace.id, (current) => ({
			...current,
			layers: reorder(current.layers, index, target),
		}));
	},

	mergeLayerDown(id: string): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return;
		const index = workspace.layers.findIndex((layer) => layer.id === id);
		if (index <= 0) return;
		const target = workspace.layers[index - 1];
		studio.commit('Merge layer down');
		studio.updateWorkspace(workspace.id, (current) => ({
			...current,
			elements: current.elements.map((el) => (el.layerId === id ? { ...el, layerId: target.id } : el)),
			layers: current.layers.filter((layer) => layer.id !== id),
		}));
		setState({ activeLayerId: target.id });
	},

	setActiveLayer(id: string): void {
		setState({ activeLayerId: id });
	},

	addElement(element: Element, select = true): void {
		studio.commit('Add element');
		studio.updateActiveWorkspace((workspace) => ({ ...workspace, elements: [...workspace.elements, element] }));
		if (select) setState({ selection: [element.id] });
	},

	addElements(elements: Element[], select = true): void {
		if (!elements.length) return;
		studio.commit('Add elements');
		studio.updateActiveWorkspace((workspace) => ({ ...workspace, elements: [...workspace.elements, ...elements] }));
		if (select) setState({ selection: elements.map((el) => el.id) });
	},

	addText(x: number, y: number): string | null {
		const layerId = studio.activeLayerId();
		const workspace = activeWorkspaceOf(state);
		if (!layerId || !workspace) return null;
		const element: TextElement = {
			align: 'left',
			color: state.style.color,
			fontFamily: state.style.fontFamily,
			fontSize: state.style.fontSize,
			id: createId(),
			layerId,
			lineHeight: 1.3,
			text: '',
			type: 'text',
			w: Math.min(520, Math.max(220, workspace.width * 0.3)),
			x,
			y,
		};
		studio.addElement(element);
		setState({ editingTextId: element.id, tool: 'text' });
		return element.id;
	},

	updateElements(ids: string[], updater: (element: Element) => Element): void {
		if (!ids.length) return;
		const idSet = new Set(ids);
		studio.updateActiveWorkspace((workspace) => ({
			...workspace,
			elements: workspace.elements.map((el) => (idSet.has(el.id) ? updater(el) : el)),
		}));
	},

	translateElements(ids: string[], dx: number, dy: number): void {
		studio.updateElements(ids, (el) => translateElement(el, dx, dy));
	},

	alignElements(ids: string[], axis: AlignAxis): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace || ids.length < 2) return;
		const idSet = new Set(ids);
		const bounds = elementsBounds(workspace.elements.filter((el) => idSet.has(el.id)));
		if (!bounds) return;
		studio.commit('Align');
		studio.updateWorkspace(workspace.id, (current) => ({
			...current,
			elements: current.elements.map((el) => {
				if (!idSet.has(el.id)) return el;
				const box = elementBounds(el);
				let dx = 0;
				let dy = 0;
				if (axis === 'left') dx = bounds.x - box.x;
				else if (axis === 'right') dx = bounds.x + bounds.width - (box.x + box.width);
				else if (axis === 'center') dx = bounds.x + bounds.width / 2 - (box.x + box.width / 2);
				else if (axis === 'top') dy = bounds.y - box.y;
				else if (axis === 'bottom') dy = bounds.y + bounds.height - (box.y + box.height);
				else dy = bounds.y + bounds.height / 2 - (box.y + box.height / 2);
				return dx || dy ? translateElement(el, dx, dy) : el;
			}),
		}));
	},

	removeElements(ids: string[], recordHistory = true): void {
		if (!ids.length) return;
		if (recordHistory) studio.commit('Delete');
		const idSet = new Set(ids);
		studio.updateActiveWorkspace((workspace) => ({
			...workspace,
			elements: workspace.elements.filter((el) => !idSet.has(el.id)),
		}));
		setState({
			editingTextId: state.editingTextId && idSet.has(state.editingTextId) ? null : state.editingTextId,
			selection: state.selection.filter((id) => !idSet.has(id)),
		});
	},

	deleteSelection(): void {
		studio.removeElements(state.selection);
	},

	duplicateSelection(): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace || !state.selection.length) return;
		studio.commit('Duplicate');
		const idSet = new Set(state.selection);
		const copies = workspace.elements
			.filter((el) => idSet.has(el.id))
			.map((el) => {
				const copy = { ...el, id: createId() };
				if (copy.type === 'stroke') {
					return {
						...copy,
						points: copy.points.map((point) => ({
							...point,
							x: point.x + DUPLICATE_OFFSET,
							y: point.y + DUPLICATE_OFFSET,
						})),
					};
				}
				return { ...copy, x: copy.x + DUPLICATE_OFFSET, y: copy.y + DUPLICATE_OFFSET };
			});
		studio.updateWorkspace(workspace.id, (current) => ({ ...current, elements: [...current.elements, ...copies] }));
		setState({ selection: copies.map((copy) => copy.id) });
	},

	reorderElements(ids: string[], mode: OrderMode): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace || !ids.length) return;
		const idSet = new Set(ids);
		const labels: Record<OrderMode, string> = {
			back: 'Send to back',
			backward: 'Send backward',
			forward: 'Bring forward',
			front: 'Bring to front',
		};
		studio.commit(labels[mode]);
		let elements = [...workspace.elements];
		if (mode === 'front') {
			elements = [...elements.filter((el) => !idSet.has(el.id)), ...elements.filter((el) => idSet.has(el.id))];
		} else if (mode === 'back') {
			elements = [...elements.filter((el) => idSet.has(el.id)), ...elements.filter((el) => !idSet.has(el.id))];
		} else if (mode === 'forward') {
			for (let i = elements.length - 2; i >= 0; i--) {
				if (idSet.has(elements[i].id) && !idSet.has(elements[i + 1].id)) {
					[elements[i], elements[i + 1]] = [elements[i + 1], elements[i]];
				}
			}
		} else {
			for (let i = 1; i < elements.length; i++) {
				if (idSet.has(elements[i].id) && !idSet.has(elements[i - 1].id)) {
					[elements[i - 1], elements[i]] = [elements[i], elements[i - 1]];
				}
			}
		}
		studio.updateWorkspace(workspace.id, (current) => ({ ...current, elements }));
	},

	setSelection(ids: string[]): void {
		setState({ selection: ids });
	},

	toggleSelection(id: string): void {
		const selection = state.selection.includes(id)
			? state.selection.filter((item) => item !== id)
			: [...state.selection, id];
		setState({ selection });
	},

	selectAll(): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return;
		const writable = new Set(
			workspace.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id)
		);
		setState({ selection: workspace.elements.filter((el) => writable.has(el.layerId)).map((el) => el.id) });
	},

	clearSelection(): void {
		setState({ selection: [] });
	},

	setEditingText(id: string | null): void {
		setState({ editingTextId: id });
	},

	setTool(tool: ToolId): void {
		setState({
			editingTextId: tool === 'text' ? state.editingTextId : null,
			selection: tool === 'select' ? state.selection : [],
			tool,
		});
	},

	setShape(shape: ShapeKind): void {
		setState({ prefs: { ...state.prefs, shape }, shape, tool: 'shape' });
	},

	setStyle(patch: Partial<StyleState>): void {
		setState({
			prefs: { ...state.prefs, style: { ...state.style, ...patch } },
			style: { ...state.style, ...patch },
		});
	},

	setPrefs(patch: Partial<Prefs>): void {
		const prefs = { ...state.prefs, ...patch };
		setState({ prefs, shape: prefs.shape, style: prefs.style });
	},

	setViewport(viewport: Viewport): void {
		setState({ viewport });
	},

	zoomTo(zoom: number, anchor?: { x: number; y: number }): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return;
		const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
		const point = anchor ?? { x: 0, y: 0 };
		const current = state.viewport;
		const pageX = (point.x - current.x) / current.zoom;
		const pageY = (point.y - current.y) / current.zoom;
		setState({ viewport: { x: point.x - pageX * next, y: point.y - pageY * next, zoom: next } });
	},

	zoomBy(factor: number, anchor?: { x: number; y: number }): void {
		studio.zoomTo(state.viewport.zoom * factor, anchor);
	},

	fitToViewport(cssWidth: number, cssHeight: number, padding = 56): void {
		const workspace = activeWorkspaceOf(state);
		if (!workspace) return;
		const width = Math.max(50, cssWidth - padding * 2);
		const height = Math.max(50, cssHeight - padding * 2);
		const zoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, 1, Math.min(width / workspace.width, height / workspace.height))
		);
		setState({
			viewport: {
				x: (cssWidth - workspace.width * zoom) / 2,
				y: (cssHeight - workspace.height * zoom) / 2,
				zoom,
			},
		});
	},

	undo(): void {
		const entry = state.history[state.history.length - 1];
		if (!entry || !state.notebook) return;
		setState({
			activeLayerId: entry.activeLayerId,
			future: [...state.future, snapshot(entry.label)],
			history: state.history.slice(0, -1),
			notebook: entry.notebook,
			selection: entry.selection,
		});
	},

	redo(): void {
		const entry = state.future[state.future.length - 1];
		if (!entry || !state.notebook) return;
		setState({
			activeLayerId: entry.activeLayerId,
			future: state.future.slice(0, -1),
			history: [...state.history, snapshot(entry.label)],
			notebook: entry.notebook,
			selection: entry.selection,
		});
	},
};

export type Studio = typeof studio;

export function useStudioState(): StudioState {
	return useSyncExternalStore(studio.subscribe, studio.getState, studio.getState);
}

export function shallowEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = Object.keys(left);
	if (keys.length !== Object.keys(right).length) return false;
	for (const key of keys) {
		if (left[key] !== right[key]) return false;
	}
	return true;
}

export function useStudioSelection<T>(
	selector: (state: StudioState) => T,
	isEqual: (a: T, b: T) => boolean = Object.is
): T {
	const cache = useRef<{ state: StudioState | null; value: T }>({ state: null, value: undefined as unknown as T });
	const getSnapshot = useCallback(() => {
		const current = studio.getState();
		const previous = cache.current;
		if (previous.state === current) return previous.value;
		const next = selector(current);
		const value = previous.state !== null && isEqual(previous.value, next) ? previous.value : next;
		cache.current = { state: current, value };
		return value;
	}, [isEqual, selector]);
	return useSyncExternalStore(studio.subscribe, getSnapshot, getSnapshot);
}

const selectActiveWorkspace = (current: StudioState): Workspace | null => activeWorkspaceOf(current);
const selectTool = (current: StudioState): ToolId => current.tool;
const selectViewport = (current: StudioState): Viewport => current.viewport;
const selectPrefs = (current: StudioState): Prefs => current.prefs;
const selectNotebook = (current: StudioState): Notebook | null => current.notebook;
const selectLibrary = (current: StudioState): NotebookSummary[] => current.library;
const selectCanUndo = (current: StudioState): boolean => current.history.length > 0;
const selectCanRedo = (current: StudioState): boolean => current.future.length > 0;

export function useActiveWorkspace(): Workspace | null {
	return useStudioSelection(selectActiveWorkspace);
}

export function useTool(): ToolId {
	return useStudioSelection(selectTool);
}

export function useViewport(): Viewport {
	return useStudioSelection(selectViewport);
}

export function usePrefs(): Prefs {
	return useStudioSelection(selectPrefs);
}

export function useNotebook(): Notebook | null {
	return useStudioSelection(selectNotebook);
}

export function useLibrary(): NotebookSummary[] {
	return useStudioSelection(selectLibrary);
}

export function useHistoryState(): { canRedo: boolean; canUndo: boolean } {
	return { canRedo: useStudioSelection(selectCanRedo), canUndo: useStudioSelection(selectCanUndo) };
}
