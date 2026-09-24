import {
	boundsFromPoints,
	elementBounds,
	elementIntersectsCircle,
	hitTestElement,
	pointInBounds,
	simplifyStroke,
} from '@/drawing/geometry.ts';
import { inkOptionsFor, strokePath } from '@/drawing/ink.ts';
import { renderElement, renderScene } from '@/drawing/render.ts';
import { createId, studio, usePrefs, useStudioState, type StudioState } from '@/drawing/store.ts';
import type {
	Element,
	InputKind,
	Point,
	ShapeElement,
	StrokeElement,
	TextElement,
	Viewport,
	Workspace,
} from '@/drawing/types.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const LASER_LIFETIME = 1400; // How long the laser pointer trail lingers, in milliseconds
const HAIRLINE = 1;
const ERASE_DRAG_STEP = 4; // Screen-space spacing between eraser samples while dragging, in pixels

type ScreenPoint = { x: number; y: number };
type LaserPoint = Point & { time: number };

type Gesture =
	| { kind: 'draw'; pointerId: number; mode: 'pen' | 'highlighter'; input: InputKind; points: Point[] }
	| { kind: 'shape'; pointerId: number; origin: ScreenPoint; current: ScreenPoint; shift: boolean }
	| { kind: 'move'; pointerId: number; ids: string[]; origin: ScreenPoint; current: ScreenPoint; shift: boolean }
	| { kind: 'marquee'; pointerId: number; origin: ScreenPoint; current: ScreenPoint; append: boolean }
	| { kind: 'pan'; pointerId: number; origin: ScreenPoint; viewport: Viewport }
	| { kind: 'erase'; pointerId: number; last: Point }
	| { kind: 'laser'; pointerId: number }
	| { kind: 'pinch'; distance: number; midpoint: ScreenPoint; viewport: Viewport }
	| null;

function screenOf(event: { clientX: number; clientY: number }, rect: DOMRect): ScreenPoint {
	return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function toPage(point: ScreenPoint, viewport: Viewport): Point {
	return { pressure: 0.5, x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

function toScreen(point: { x: number; y: number }, viewport: Viewport): ScreenPoint {
	return { x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y };
}

function applySceneTransform(ctx: CanvasRenderingContext2D, dpr: number, viewport: Viewport): void {
	ctx.setTransform(dpr * viewport.zoom, 0, 0, dpr * viewport.zoom, dpr * viewport.x, dpr * viewport.y);
}

function capturePointer(canvas: HTMLCanvasElement, pointerId: number): void {
	try {
		canvas.setPointerCapture(pointerId);
	} catch {
		// drawing still works without capture, strokes simply stop at the element edge
	}
}

function releasePointer(canvas: HTMLCanvasElement, pointerId: number): void {
	if (!canvas.hasPointerCapture(pointerId)) return;
	try {
		canvas.releasePointerCapture(pointerId);
	} catch {
		// ignore: the pointer is already gone
	}
}

function inputKindOf(pointerType: string): StrokeElement['input'] {
	if (pointerType === 'pen') return 'pen';
	if (pointerType === 'touch') return 'touch';
	return 'mouse';
}

function isTypingTarget(target: EventTarget | null): boolean {
	const element = target as HTMLElement | null;
	if (!element) return false;
	const tag = element.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

// Drag box in page units, keeping the anchor corner so lines and arrows keep their direction.
function shapeBox(origin: ScreenPoint, current: ScreenPoint, shift: boolean, viewport: Viewport) {
	const anchor = toPage(origin, viewport);
	const raw = toPage(current, viewport);
	let x2 = raw.x;
	let y2 = raw.y;
	if (shift) {
		const size = Math.max(Math.abs(raw.x - anchor.x), Math.abs(raw.y - anchor.y));
		x2 = anchor.x + Math.sign(raw.x - anchor.x || 1) * size;
		y2 = anchor.y + Math.sign(raw.y - anchor.y || 1) * size;
	}
	return { h: y2 - anchor.y, w: x2 - anchor.x, x: anchor.x, y: anchor.y };
}

function topmostElement(workspace: Workspace, page: Point, viewport: Viewport): Element | null {
	for (let layerIndex = workspace.layers.length - 1; layerIndex >= 0; layerIndex--) {
		const layer = workspace.layers[layerIndex];
		if (!layer.visible || layer.locked) continue;
		for (let i = workspace.elements.length - 1; i >= 0; i--) {
			const element = workspace.elements[i];
			if (element.layerId !== layer.id) continue;
			if (hitTestElement(element, page.x, page.y, 6 / viewport.zoom)) return element;
		}
	}
	return null;
}

export function CanvasStage(): React.JSX.Element {
	const state = useStudioState();
	const prefs = usePrefs();
	const { activeWorkspaceId, editingTextId, notebook, selection, shape, style, tool, viewport } = state;

	const workspace = useMemo(
		() => notebook?.workspaces.find((item) => item.id === activeWorkspaceId) ?? notebook?.workspaces[0] ?? null,
		[activeWorkspaceId, notebook]
	);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const contentRef = useRef<HTMLCanvasElement | null>(null);
	const overlayRef = useRef<HTMLCanvasElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const gestureRef = useRef<Gesture>(null);
	const skipRef = useRef<Set<string> | null>(null);
	const touchesRef = useRef<Map<number, ScreenPoint>>(new Map());
	const laserRef = useRef<LaserPoint[]>([]);
	const hoverRef = useRef<Point | null>(null);
	const frameRef = useRef<number | null>(null);
	const centeredRef = useRef<string | null>(null);
	const [size, setSize] = useState({ height: 0, width: 0 });
	const [spaceHeld, setSpaceHeld] = useState(false);

	const dpr = Math.min(3, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1);

	const editingElement = useMemo(
		() =>
			editingTextId
				? ((workspace?.elements.find((el) => el.id === editingTextId) as TextElement | undefined) ?? null)
				: null,
		[editingTextId, workspace]
	);

	const schedule = useCallback(() => {
		if (frameRef.current !== null) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			drawRef.current();
		});
	}, []);

	const drawContent = useCallback(() => {
		const canvas = contentRef.current;
		const active = studio.activeWorkspace();
		if (!canvas || !active) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		renderScene({
			chrome: false,
			cssHeight: canvas.height / dpr,
			cssWidth: canvas.width / dpr,
			ctx,
			dpr,
			skip: skipRef.current,
			transform: studio.getState().viewport,
			workspace: active,
		});
	}, [dpr]);

	const drawSelection = useCallback(
		(ctx: CanvasRenderingContext2D, current: StudioState) => {
			const active = studio.activeWorkspace();
			if (!active || !current.selection.length) return;
			const transform = current.viewport;
			const moving = gestureRef.current?.kind === 'move' ? gestureRef.current : null;
			const offset = moving
				? { x: moving.current.x - moving.origin.x, y: moving.current.y - moving.origin.y }
				: { x: 0, y: 0 };
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.lineWidth = HAIRLINE;
			ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
			for (const id of current.selection) {
				const element = active.elements.find((el) => el.id === id);
				if (!element) continue;
				const box = elementBounds(element);
				const corner = toScreen(box, transform);
				const width = Math.max(box.width * transform.zoom, 2);
				const height = Math.max(box.height * transform.zoom, 2);
				ctx.setLineDash(element.type === 'stroke' && !moving ? [4, 3] : []);
				ctx.strokeRect(corner.x + offset.x, corner.y + offset.y, width, height);
			}
			ctx.setLineDash([]);
		},
		[dpr]
	);

	const drawOverlay = useCallback(() => {
		const canvas = overlayRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const current = studio.getState();
		const transform = current.viewport;
		const gesture = gestureRef.current;
		const width = canvas.width / dpr;
		const height = canvas.height / dpr;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		let needsFrame = false;

		if (gesture?.kind === 'draw' && gesture.points.length) {
			const draft: StrokeElement = {
				color: gesture.mode === 'highlighter' ? current.style.highlighterColor : current.style.color,
				id: 'draft',
				input: gesture.input,
				layerId: current.activeLayerId ?? '',
				mode: gesture.mode,
				opacity: current.style.opacity,
				points: gesture.points,
				streamline: 0.5,
				thinning: gesture.mode === 'highlighter' ? 0 : 0.45,
				type: 'stroke',
				width: gesture.mode === 'highlighter' ? current.style.highlighterWidth : current.style.width,
			};
			ctx.save();
			applySceneTransform(ctx, dpr, transform);
			ctx.globalAlpha = draft.opacity;
			if (gesture.mode === 'highlighter') ctx.globalCompositeOperation = 'multiply';
			ctx.fillStyle = draft.color;
			ctx.fill(strokePath(gesture.points, inkOptionsFor(draft, false)));
			ctx.restore();
		}

		if (gesture?.kind === 'shape') {
			const box = shapeBox(gesture.origin, gesture.current, gesture.shift, transform);
			const draft: ShapeElement = {
				color: current.style.color,
				fill: current.style.fill,
				layerId: '',
				opacity: current.style.opacity,
				shape: current.shape,
				strokeWidth: current.style.width,
				type: 'shape',
				...box,
				id: 'draft',
			};
			applySceneTransform(ctx, dpr, transform);
			renderElement(ctx, draft, true);
		}

		if (gesture?.kind === 'move') {
			const active = studio.activeWorkspace();
			if (active) {
				const dx = (gesture.current.x - gesture.origin.x) / transform.zoom;
				const dy = (gesture.current.y - gesture.origin.y) / transform.zoom;
				ctx.save();
				applySceneTransform(ctx, dpr, transform);
				ctx.translate(dx, dy);
				for (const element of active.elements) {
					if (!gesture.ids.includes(element.id)) continue;
					renderElement(ctx, element, true);
				}
				ctx.restore();
			}
		}

		if (gesture?.kind === 'marquee') {
			const left = Math.min(gesture.origin.x, gesture.current.x);
			const top = Math.min(gesture.origin.y, gesture.current.y);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = 'rgba(37, 99, 235, 0.10)';
			ctx.strokeStyle = 'rgba(37, 99, 235, 0.85)';
			ctx.lineWidth = HAIRLINE;
			ctx.fillRect(
				left,
				top,
				Math.abs(gesture.current.x - gesture.origin.x),
				Math.abs(gesture.current.y - gesture.origin.y)
			);
			ctx.strokeRect(
				left,
				top,
				Math.abs(gesture.current.x - gesture.origin.x),
				Math.abs(gesture.current.y - gesture.origin.y)
			);
		}

		const eraserPoint = gesture?.kind === 'erase' ? gesture.last : (hoverRef.current ?? null);
		if (eraserPoint && (current.tool === 'eraser' || gesture?.kind === 'erase')) {
			const radius = (current.style.eraserWidth / 2) * transform.zoom;
			const center = toScreen(eraserPoint, transform);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.strokeStyle = 'rgba(100, 116, 139, 0.9)';
			ctx.fillStyle = 'rgba(148, 163, 184, 0.15)';
			ctx.lineWidth = HAIRLINE;
			ctx.beginPath();
			ctx.arc(center.x, center.y, Math.max(4, radius), 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}

		const now = performance.now();
		const laser = laserRef.current.filter((point) => now - point.time < LASER_LIFETIME);
		laserRef.current = laser;
		if (laser.length > 1) {
			ctx.save();
			applySceneTransform(ctx, dpr, transform);
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.lineWidth = 5 / transform.zoom;
			ctx.strokeStyle = '#e11d48';
			for (let i = 1; i < laser.length; i++) {
				ctx.globalAlpha = Math.max(0, 1 - (now - laser[i].time) / LASER_LIFETIME) * 0.9;
				ctx.beginPath();
				ctx.moveTo(laser[i - 1].x, laser[i - 1].y);
				ctx.lineTo(laser[i].x, laser[i].y);
				ctx.stroke();
			}
			ctx.restore();
		}
		if (laser.length > 1) needsFrame = true;

		drawSelection(ctx, current);
		if (needsFrame) schedule();
	}, [dpr, drawSelection, schedule]);

	const draw = useCallback(() => {
		drawContent();
		drawOverlay();
	}, [drawContent, drawOverlay]);
	const drawRef = useRef(draw);
	drawRef.current = draw;

	// The rAF callback reads the scene through `drawRef`, so these dependencies are not used
	// inside the effect — they exist purely to schedule a fresh frame when the document,
	// selection, or viewport changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: deliberate redraw trigger
	useEffect(() => {
		schedule();
	}, [schedule, selection, viewport, workspace]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(([entry]) => {
			setSize({ height: Math.round(entry.contentRect.height), width: Math.round(entry.contentRect.width) });
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		for (const canvas of [contentRef.current, overlayRef.current]) {
			if (!canvas) return;
			canvas.width = Math.max(1, Math.round(size.width * dpr));
			canvas.height = Math.max(1, Math.round(size.height * dpr));
			canvas.style.width = `${size.width}px`;
			canvas.style.height = `${size.height}px`;
		}
		schedule();
	}, [dpr, schedule, size.height, size.width]);

	useEffect(() => {
		if (!workspace || size.width === 0 || size.height === 0) return;
		if (centeredRef.current === workspace.id) return;
		centeredRef.current = workspace.id;
		studio.fitToViewport(size.width, size.height);
	}, [size.height, size.width, workspace]);

	useEffect(() => {
		const active = studio.activeWorkspace();
		if (!active || size.width === 0 || size.height === 0) return;
		const current = studio.getState().viewport;
		studio.setViewport({
			x: (size.width - active.width * current.zoom) / 2,
			y: (size.height - active.height * current.zoom) / 2,
			zoom: current.zoom,
		});
	}, [size.height, size.width]);

	useEffect(() => {
		if (editingElement) textareaRef.current?.focus();
	}, [editingElement]);

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.code === 'Space' && !isTypingTarget(event.target)) setSpaceHeld(true);
		};
		const up = (event: KeyboardEvent) => {
			if (event.code === 'Space') setSpaceHeld(false);
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	}, []);

	// Wheel needs a non-passive native listener so trackpad zoom gestures can be cancelled.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onWheel = (event: WheelEvent) => {
			const rect = container.getBoundingClientRect();
			const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) {
				studio.zoomBy(Math.exp(-event.deltaY / 320), anchor);
				return;
			}
			const step = event.deltaMode === 1 ? 16 : 1;
			const current = studio.getState().viewport;
			studio.setViewport({
				x: current.x - event.deltaX * step,
				y: current.y - event.deltaY * step,
				zoom: current.zoom,
			});
		};
		container.addEventListener('wheel', onWheel, { passive: false });
		return () => container.removeEventListener('wheel', onWheel);
	}, []);

	const commitTextarea = useCallback(() => {
		const id = studio.getState().editingTextId;
		if (!id) return;
		const element = studio.activeWorkspace()?.elements.find((el) => el.id === id);
		if (element?.type === 'text' && !element.text.trim()) studio.removeElements([id]);
		studio.setEditingText(null);
	}, []);

	// interaction

	const eraseAt = useCallback(
		(point: Point) => {
			const active = studio.activeWorkspace();
			if (!active) return;
			const radius = style.eraserWidth / 2;
			const hits = active.elements
				.filter((element) => {
					const layer = active.layers.find((item) => item.id === element.layerId);
					return (
						layer?.visible && !layer.locked && elementIntersectsCircle(element, point.x, point.y, radius)
					);
				})
				.map((element) => element.id);
			if (hits.length) studio.removeElements(hits, false);
		},
		[style.eraserWidth]
	);

	const finishGesture = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const gesture = gestureRef.current;
			const canvas = overlayRef.current;
			if (canvas) releasePointer(canvas, event.pointerId);
			if (event.pointerType === 'touch') touchesRef.current.delete(event.pointerId);
			gestureRef.current = null;
			if (!gesture) return;
			const transform = studio.getState().viewport;
			const active = studio.activeWorkspace();

			if (gesture.kind === 'draw' && gesture.points.length) {
				const layerId = studio.activeLayerId();
				if (layerId) {
					studio.addElement(
						{
							color: gesture.mode === 'highlighter' ? style.highlighterColor : style.color,
							id: createId(),
							input: gesture.input,
							layerId,
							mode: gesture.mode,
							opacity: style.opacity,
							points: simplifyStroke(gesture.points),
							streamline: 0.5,
							thinning: gesture.mode === 'highlighter' ? 0 : 0.45,
							type: 'stroke',
							width: gesture.mode === 'highlighter' ? style.highlighterWidth : style.width,
						},
						false
					);
				}
			}

			if (gesture.kind === 'shape') {
				const layerId = studio.activeLayerId();
				const box = shapeBox(gesture.origin, gesture.current, gesture.shift, transform);
				if (layerId && (Math.abs(box.w) * transform.zoom > 3 || Math.abs(box.h) * transform.zoom > 3)) {
					studio.addElement({
						color: style.color,
						fill: style.fill,
						id: createId(),
						layerId,
						opacity: style.opacity,
						shape,
						strokeWidth: style.width,
						type: 'shape',
						...box,
					});
				}
			}

			if (gesture.kind === 'move' && active) {
				const dx = (gesture.current.x - gesture.origin.x) / transform.zoom;
				const dy = (gesture.current.y - gesture.origin.y) / transform.zoom;
				if (dx || dy) {
					studio.commit('Move');
					studio.translateElements(gesture.ids, dx, dy);
				}
			}

			if (gesture.kind === 'marquee' && active) {
				const start = toPage(gesture.origin, transform);
				const end = toPage(gesture.current, transform);
				const box = boundsFromPoints([{ ...start }, { ...end }]);
				if (box.width * transform.zoom > 3 || box.height * transform.zoom > 3) {
					const writable = new Set(
						active.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id)
					);
					const inside = active.elements
						.filter((element) => {
							if (!writable.has(element.layerId)) return false;
							const elementBox = elementBounds(element);
							return (
								elementBox.x <= box.x + box.width &&
								elementBox.x + elementBox.width >= box.x &&
								elementBox.y <= box.y + box.height &&
								elementBox.y + elementBox.height >= box.y
							);
						})
						.map((element) => element.id);
					studio.setSelection(gesture.append ? [...new Set([...selection, ...inside])] : inside);
				}
			}

			skipRef.current = null;
			schedule();
		},
		[schedule, selection, shape, style]
	);

	const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const active = studio.activeWorkspace();
		const canvas = overlayRef.current;
		if (!active || !canvas || size.width === 0) return;
		if (event.button > 1 && event.button !== 5) return;
		if (editingTextId && gestureRef.current === null) commitTextarea();

		const rect = canvas.getBoundingClientRect();
		const screen = screenOf(event, rect);
		const transform = studio.getState().viewport;
		const page = toPage(screen, transform);
		const kind = inputKindOf(event.pointerType);
		const isEraserTip = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0);
		const inPage = pointInBounds(page.x, page.y, { height: active.height, width: active.width, x: 0, y: 0 });

		if (event.pointerType === 'touch') {
			touchesRef.current.set(event.pointerId, screen);
			if (touchesRef.current.size >= 2) {
				const [a, b] = [...touchesRef.current.values()];
				gestureRef.current = {
					distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
					kind: 'pinch',
					midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
					viewport: transform,
				};
				skipRef.current = null;
				capturePointer(canvas, event.pointerId);
				return;
			}
		}

		capturePointer(canvas, event.pointerId);
		event.preventDefault();

		const wantsPan = tool === 'pan' || spaceHeld || event.button === 1;
		if (wantsPan || (kind === 'touch' && prefs.inputPolicy === 'pen-only')) {
			gestureRef.current = { kind: 'pan', origin: screen, pointerId: event.pointerId, viewport: transform };
			return;
		}

		if (isEraserTip || tool === 'eraser') {
			studio.commit('Erase');
			gestureRef.current = { kind: 'erase', last: page, pointerId: event.pointerId };
			eraseAt(page);
			schedule();
			return;
		}

		if (tool === 'laser') {
			laserRef.current = [{ ...page, time: performance.now() }];
			gestureRef.current = { kind: 'laser', pointerId: event.pointerId };
			schedule();
			return;
		}

		if (tool === 'select') {
			const hit = topmostElement(active, page, transform);
			if (hit) {
				if (event.shiftKey) studio.toggleSelection(hit.id);
				else if (!selection.includes(hit.id)) studio.setSelection([hit.id]);
				const ids = studio.getState().selection;
				if (ids.length) {
					gestureRef.current = {
						current: screen,
						ids,
						kind: 'move',
						origin: screen,
						pointerId: event.pointerId,
						shift: event.shiftKey,
					};
					skipRef.current = new Set(ids);
					drawContent();
					schedule();
					return;
				}
			}
			if (!event.shiftKey) studio.clearSelection();
			gestureRef.current = {
				append: event.shiftKey,
				current: screen,
				kind: 'marquee',
				origin: screen,
				pointerId: event.pointerId,
			};
			return;
		}

		if (tool === 'text') {
			const hit = topmostElement(active, page, transform);
			if (hit?.type === 'text') {
				studio.setSelection([hit.id]);
				studio.setEditingText(hit.id);
				return;
			}
			if (inPage) studio.addText(page.x, page.y);
			return;
		}

		if (tool === 'shape') {
			if (!inPage) return;
			gestureRef.current = {
				current: screen,
				kind: 'shape',
				origin: screen,
				pointerId: event.pointerId,
				shift: event.shiftKey,
			};
			return;
		}

		if (inPage) {
			const pressure = prefs.pressureSensitive && kind === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
			gestureRef.current = {
				kind: 'draw',
				input: kind,
				mode: tool === 'highlighter' ? 'highlighter' : 'pen',
				pointerId: event.pointerId,
				points: [{ ...page, pressure }],
			};
		}
	};

	const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
		const active = studio.activeWorkspace();
		const canvas = overlayRef.current;
		if (!active || !canvas || studio.getState().tool !== 'select') return;
		const viewport = studio.getState().viewport;
		const screen = screenOf(event, canvas.getBoundingClientRect());
		const hit = topmostElement(active, toPage(screen, viewport), viewport);
		if (hit?.type !== 'text') return;
		studio.setSelection([hit.id]);
		studio.setEditingText(hit.id);
	};

	const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = overlayRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const screen = screenOf(event, rect);
		const transform = studio.getState().viewport;

		if (event.pointerType === 'touch' && touchesRef.current.has(event.pointerId)) {
			touchesRef.current.set(event.pointerId, screen);
		}

		const gesture = gestureRef.current;
		if (!gesture) {
			if (tool === 'eraser' || event.pointerType === 'pen') {
				hoverRef.current = toPage(screen, transform);
				schedule();
			}
			return;
		}

		if (gesture.kind === 'pinch') {
			if (touchesRef.current.size < 2) return;
			const [a, b] = [...touchesRef.current.values()];
			const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
			const zoom = Math.max(0.05, Math.min(16, (gesture.viewport.zoom * distance) / gesture.distance));
			const pageX = (gesture.midpoint.x - gesture.viewport.x) / gesture.viewport.zoom;
			const pageY = (gesture.midpoint.y - gesture.viewport.y) / gesture.viewport.zoom;
			studio.setViewport({ x: midpoint.x - pageX * zoom, y: midpoint.y - pageY * zoom, zoom });
			return;
		}

		if (gesture.kind === 'pan') {
			studio.setViewport({
				x: gesture.viewport.x + (screen.x - gesture.origin.x),
				y: gesture.viewport.y + (screen.y - gesture.origin.y),
				zoom: gesture.viewport.zoom,
			});
			return;
		}

		if (gesture.kind === 'draw') {
			const kind = inputKindOf(event.pointerType);
			const fallback = prefs.pressureSensitive && kind === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
			const coalesced =
				typeof event.nativeEvent.getCoalescedEvents === 'function'
					? event.nativeEvent.getCoalescedEvents()
					: [];
			const samples = coalesced.length > 1 ? coalesced : [event.nativeEvent];
			for (const sample of samples) {
				const sampleScreen = screenOf(sample, rect);
				const pressure =
					prefs.pressureSensitive && sample.pressure > 0 && kind === 'pen' ? sample.pressure : fallback;
				gesture.points.push({ ...toPage(sampleScreen, transform), pressure });
			}
			schedule();
			return;
		}

		if (gesture.kind === 'shape') {
			gesture.current = screen;
			gesture.shift = event.shiftKey;
			schedule();
			return;
		}

		if (gesture.kind === 'move') {
			if (gesture.shift) {
				const dx = screen.x - gesture.origin.x;
				const dy = screen.y - gesture.origin.y;
				gesture.current =
					Math.abs(dx) > Math.abs(dy)
						? { x: screen.x, y: gesture.origin.y }
						: { x: gesture.origin.x, y: screen.y };
			} else {
				gesture.current = screen;
			}
			schedule();
			return;
		}

		if (gesture.kind === 'marquee') {
			gesture.current = screen;
			schedule();
			return;
		}

		if (gesture.kind === 'erase') {
			const next = toPage(screen, transform);
			const steps = Math.max(
				1,
				Math.ceil(
					Math.hypot(next.x - gesture.last.x, next.y - gesture.last.y) / (ERASE_DRAG_STEP / transform.zoom)
				)
			);
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				eraseAt({
					pressure: 0.5,
					x: gesture.last.x + (next.x - gesture.last.x) * t,
					y: gesture.last.y + (next.y - gesture.last.y) * t,
				});
			}
			gesture.last = next;
			schedule();
			return;
		}

		if (gesture.kind === 'laser') {
			laserRef.current = [...laserRef.current, { ...toPage(screen, transform), time: performance.now() }];
			schedule();
		}
	};

	const cursor = (() => {
		if (tool === 'pan' || spaceHeld) return 'grab';
		if (tool === 'select') return 'default';
		if (tool === 'text') return 'text';
		if (tool === 'eraser') return 'none';
		return 'crosshair';
	})();

	if (!workspace) {
		return <div className='grid h-full place-items-center text-muted-foreground'>No workspace</div>;
	}

	const textOrigin = editingElement ? toScreen(editingElement, viewport) : null;

	return (
		<div className='relative h-full w-full overflow-hidden' ref={containerRef}>
			<canvas className='absolute inset-0 touch-none select-none' ref={contentRef} />
			<canvas
				className='absolute inset-0 touch-none select-none'
				onDoubleClick={onDoubleClick}
				onPointerCancel={finishGesture}
				onPointerDown={onPointerDown}
				onPointerLeave={() => {
					hoverRef.current = null;
					schedule();
				}}
				onPointerMove={onPointerMove}
				onPointerUp={finishGesture}
				ref={overlayRef}
				style={{ cursor }}
			/>
			{editingElement && textOrigin ? (
				<textarea
					className='absolute resize-none overflow-hidden border-none bg-transparent p-0 outline-none'
					onBlur={commitTextarea}
					onChange={(event) =>
						studio.updateElements([editingElement.id], (element) =>
							element.type === 'text' ? { ...element, text: event.target.value } : element
						)
					}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							commitTextarea();
						}
					}}
					ref={textareaRef}
					style={{
						color: editingElement.color,
						fontFamily: editingElement.fontFamily,
						fontSize: `${editingElement.fontSize * viewport.zoom}px`,
						fontWeight: 500,
						left: `${textOrigin.x}px`,
						lineHeight: editingElement.lineHeight,
						textAlign: editingElement.align,
						top: `${textOrigin.y}px`,
						width: `${editingElement.w * viewport.zoom}px`,
					}}
					value={editingElement.text}
				/>
			) : null}
		</div>
	);
}
