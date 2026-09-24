import { measureTextLines, normalizeBounds, shapeLine } from './geometry.ts';
import { inkOptionsFor, strokePath, strokePathForElement } from './ink.ts';
import type { Element, ShapeElement, StrokeElement, TextElement, Workspace } from './types.ts';

export interface SceneTransform {
	zoom: number;
	x: number;
	y: number;
}

export interface RenderSceneOptions {
	ctx: CanvasRenderingContext2D;
	workspace: Workspace;
	transform: SceneTransform;
	dpr: number;
	cssWidth: number; // Viewport size in CSS pixels
	cssHeight: number;
	skip?: Set<string> | null; // Elements drawn separately (e.g. being dragged on the overlay canvas)
	draft?: Element | null; // Committed elements plus the in-progress ink, in page units
	chrome?: boolean; // Drop the paper shadow/border (thumbnails, exports)
}

const PAGE_SHADOW = 'rgba(15, 23, 42, 0.45)';

function traceRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
	ctx.beginPath();
	ctx.rect(x, y, w, h);
}

function traceShape(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
	const box = normalizeBounds({ height: el.h, width: el.w, x: el.x, y: el.y });
	if (el.shape === 'line' || el.shape === 'arrow') {
		const { x1, x2, y1, y2 } = shapeLine(el);
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		return;
	}
	if (el.shape === 'ellipse') {
		ctx.beginPath();
		ctx.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
		return;
	}
	if (el.shape === 'triangle') {
		ctx.beginPath();
		ctx.moveTo(box.x + box.width / 2, box.y);
		ctx.lineTo(box.x + box.width, box.y + box.height);
		ctx.lineTo(box.x, box.y + box.height);
		ctx.closePath();
		return;
	}
	if (el.shape === 'diamond') {
		ctx.beginPath();
		ctx.moveTo(box.x + box.width / 2, box.y);
		ctx.lineTo(box.x + box.width, box.y + box.height / 2);
		ctx.lineTo(box.x + box.width / 2, box.y + box.height);
		ctx.lineTo(box.x, box.y + box.height / 2);
		ctx.closePath();
		return;
	}
	traceRect(ctx, box.x, box.y, box.width, box.height);
}

function drawArrowHead(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
	const { x1, x2, y1, y2 } = shapeLine(el);
	const angle = Math.atan2(y2 - y1, x2 - x1);
	const head = Math.max(8, el.strokeWidth * 3.5);
	const spread = Math.PI / 7;
	ctx.beginPath();
	ctx.moveTo(x2, y2);
	ctx.lineTo(x2 - Math.cos(angle - spread) * head, y2 - Math.sin(angle - spread) * head);
	ctx.moveTo(x2, y2);
	ctx.lineTo(x2 - Math.cos(angle + spread) * head, y2 - Math.sin(angle + spread) * head);
	ctx.stroke();
}

function renderStroke(ctx: CanvasRenderingContext2D, el: StrokeElement, draft: boolean): void {
	const path = draft ? strokePath(el.points, inkOptionsFor(el, true)) : strokePathForElement(el);
	ctx.save();
	if (el.mode === 'highlighter') {
		ctx.globalCompositeOperation = 'multiply';
	}
	ctx.globalAlpha = el.opacity;
	ctx.fillStyle = el.color;
	ctx.fill(path);
	ctx.restore();
}

function renderShape(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
	ctx.save();
	ctx.globalAlpha = el.opacity;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = el.strokeWidth;
	ctx.strokeStyle = el.color;
	ctx.fillStyle = el.fill ?? 'transparent';
	traceShape(ctx, el);
	if (el.fill) ctx.fill();
	ctx.stroke();
	if (el.shape === 'arrow') drawArrowHead(ctx, el);
	ctx.restore();
}

function renderText(ctx: CanvasRenderingContext2D, el: TextElement): void {
	if (!el.text) return;
	const lineHeight = el.fontSize * el.lineHeight;
	ctx.save();
	ctx.fillStyle = el.color;
	ctx.font = `${el.fontSize}px ${el.fontFamily}`;
	ctx.textAlign = el.align;
	ctx.textBaseline = 'top';
	const x = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
	const lines = measureTextLines(el);
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], x, el.y + i * lineHeight);
	}
	ctx.restore();
}

export function renderElement(ctx: CanvasRenderingContext2D, el: Element, draft = false): void {
	switch (el.type) {
		case 'stroke':
			renderStroke(ctx, el, draft);
			return;
		case 'shape':
			renderShape(ctx, el);
			return;
		default:
			renderText(ctx, el);
	}
}

export function renderBackground(ctx: CanvasRenderingContext2D, workspace: Workspace): void {
	const step = 40;
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, workspace.width, workspace.height);
	ctx.clip();
	ctx.strokeStyle = 'rgba(15, 23, 42, 0.10)';
	ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
	ctx.lineWidth = 1;
	if (workspace.background === 'grid' || workspace.background === 'graph') {
		ctx.beginPath();
		for (let x = 0; x <= workspace.width; x += step) {
			ctx.moveTo(x, 0);
			ctx.lineTo(x, workspace.height);
		}
		for (let y = 0; y <= workspace.height; y += step) {
			ctx.moveTo(0, y);
			ctx.lineTo(workspace.width, y);
		}
		ctx.stroke();
	}
	if (workspace.background === 'graph') {
		ctx.beginPath();
		const major = step * 5;
		for (let x = 0; x <= workspace.width; x += major) {
			ctx.moveTo(x, 0);
			ctx.lineTo(x, workspace.height);
		}
		for (let y = 0; y <= workspace.height; y += major) {
			ctx.moveTo(0, y);
			ctx.lineTo(workspace.width, y);
		}
		ctx.stroke();
	}
	if (workspace.background === 'lines') {
		ctx.beginPath();
		ctx.strokeStyle = 'rgba(37, 99, 235, 0.22)';
		for (let y = step * 2; y <= workspace.height; y += step * 2) {
			ctx.moveTo(0, y);
			ctx.lineTo(workspace.width, y);
		}
		ctx.stroke();
	}
	if (workspace.background === 'dots') {
		for (let x = step; x < workspace.width; x += step) {
			for (let y = step; y < workspace.height; y += step) {
				ctx.beginPath();
				ctx.arc(x, y, 1.4, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
	ctx.restore();
}

function renderWorkspaceContent(
	ctx: CanvasRenderingContext2D,
	workspace: Workspace,
	skip?: Set<string> | null,
	draft?: Element | null
): void {
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, workspace.width, workspace.height);
	ctx.clip();
	for (const layer of workspace.layers) {
		if (!layer.visible) continue;
		ctx.save();
		ctx.globalAlpha = layer.opacity;
		for (const el of workspace.elements) {
			if (el.layerId !== layer.id) continue;
			if (skip?.has(el.id)) continue;
			renderElement(ctx, el);
		}
		ctx.restore();
	}
	if (draft) {
		const layer = workspace.layers.find((l) => l.id === draft.layerId);
		if (!layer || layer.visible) renderElement(ctx, draft, true);
	}
	ctx.restore();
}

export function renderScene(options: RenderSceneOptions): void {
	const { ctx, workspace, transform, dpr, cssWidth, cssHeight, skip, draft } = options;
	const chrome = options.chrome ?? true;

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssWidth, cssHeight);

	ctx.setTransform(dpr * transform.zoom, 0, 0, dpr * transform.zoom, dpr * transform.x, dpr * transform.y);

	if (chrome) {
		ctx.save();
		ctx.shadowBlur = 32 / transform.zoom;
		ctx.shadowColor = PAGE_SHADOW;
		ctx.shadowOffsetY = 8 / transform.zoom;
		ctx.fillStyle = workspace.color;
		ctx.fillRect(0, 0, workspace.width, workspace.height);
		ctx.restore();
	} else {
		ctx.fillStyle = workspace.color;
		ctx.fillRect(0, 0, workspace.width, workspace.height);
	}

	renderBackground(ctx, workspace);
	renderWorkspaceContent(ctx, workspace, skip, draft);

	if (chrome) {
		ctx.save();
		ctx.lineWidth = 1 / transform.zoom;
		ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
		ctx.strokeRect(0, 0, workspace.width, workspace.height);
		ctx.restore();
	}
}

/** Offscreen render used for library/workspace thumbnails and PNG export. */
export function renderWorkspaceToCanvas(
	workspace: Workspace,
	options: { maxSize?: number; scale?: number; chrome?: boolean; background?: string | null } = {}
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	const scale =
		options.scale ??
		(options.maxSize ? Math.min(options.maxSize / workspace.width, options.maxSize / workspace.height) : 1);
	canvas.width = Math.max(1, Math.round(workspace.width * scale));
	canvas.height = Math.max(1, Math.round(workspace.height * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	if (options.background) {
		ctx.fillStyle = options.background;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	renderScene({
		chrome: options.chrome ?? false,
		cssHeight: canvas.height / scale,
		cssWidth: canvas.width / scale,
		ctx,
		dpr: scale,
		transform: { x: 0, y: 0, zoom: 1 },
		workspace,
	});
	return canvas;
}
