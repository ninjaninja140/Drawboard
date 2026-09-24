import type { Bounds, Element, Point, ShapeElement, TextElement } from './types.ts';

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
	if (measureCtx) return measureCtx;
	const canvas = document.createElement('canvas');
	measureCtx = canvas.getContext('2d');
	return measureCtx;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
	return Math.hypot(bx - ax, by - ay);
}

// Distance from a point to a line segment
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq === 0) return distance(px, py, ax, ay);
	let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
	t = Math.max(0, Math.min(1, t));
	return distance(px, py, ax + t * dx, ay + t * dy);
}

export function normalizeBounds(b: Bounds): Bounds {
	const x = b.width < 0 ? b.x + b.width : b.x;
	const y = b.height < 0 ? b.y + b.height : b.y;
	return { height: Math.abs(b.height), width: Math.abs(b.width), x, y };
}

export function boundsFromPoints(points: Point[], padding = 0): Bounds {
	if (points.length === 0) return { height: 0, width: 0, x: 0, y: 0 };
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return {
		height: maxY - minY + padding * 2,
		width: maxX - minX + padding * 2,
		x: minX - padding,
		y: minY - padding,
	};
}

export function unionBounds(list: Bounds[]): Bounds | null {
	if (list.length === 0) return null;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const b of list) {
		minX = Math.min(minX, b.x);
		minY = Math.min(minY, b.y);
		maxX = Math.max(maxX, b.x + b.width);
		maxY = Math.max(maxY, b.y + b.height);
	}
	return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

export function measureTextLines(el: TextElement): string[] {
	const ctx = getMeasureContext();
	const lines: string[] = [];
	if (!ctx) return el.text.split('\n');
	ctx.font = `${el.fontSize}px ${el.fontFamily}`;
	for (const paragraph of el.text.split('\n')) {
		if (paragraph.length === 0) {
			lines.push('');
			continue;
		}
		let current = '';
		for (const word of paragraph.split(' ')) {
			const candidate = current.length > 0 ? `${current} ${word}` : word;
			if (ctx.measureText(candidate).width > el.w && current.length > 0) {
				lines.push(current);
				current = word;
			} else current = candidate;
		}
		lines.push(current);
	}
	return lines;
}

export function textBounds(el: TextElement): Bounds {
	const lineHeight = el.fontSize * el.lineHeight;
	const lineCount = el.text.split('\n').length;
	return { height: Math.max(lineHeight, lineCount * lineHeight), width: Math.max(el.w, 1), x: el.x, y: el.y };
}

export function shapeLine(el: ShapeElement): { x1: number; y1: number; x2: number; y2: number } {
	return { x1: el.x, x2: el.x + el.w, y1: el.y, y2: el.y + el.h };
}

export function elementBounds(el: Element): Bounds {
	switch (el.type) {
		case 'stroke':
			return boundsFromPoints(el.points, el.width / 2 + 1);
		case 'text':
			return textBounds(el);
		default: {
			if (el.shape === 'line' || el.shape === 'arrow') {
				const { x1, x2, y1, y2 } = shapeLine(el);
				return normalizeBounds({ height: y2 - y1, width: x2 - x1, x: x1, y: y1 });
			}
			const pad = el.strokeWidth / 2;
			return boundsFromPoints(
				[
					{ pressure: 1, x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h) },
					{ pressure: 1, x: Math.max(el.x, el.x + el.w), y: Math.max(el.y, el.y + el.h) },
				],
				pad
			);
		}
	}
}

export function elementsBounds(elements: Element[]): Bounds | null {
	return unionBounds(elements.map(elementBounds));
}

export function pointInBounds(px: number, py: number, b: Bounds): boolean {
	return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
	return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

function pointInEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean {
	if (rx === 0 || ry === 0) return false;
	const nx = (px - cx) / rx;
	const ny = (py - cy) / ry;
	return nx * nx + ny * ny <= 1;
}

function hitStroke(el: Extract<Element, { type: 'stroke' }>, px: number, py: number, tolerance: number): boolean {
	const points = el.points;
	const threshold = el.width / 2 + tolerance;
	if (points.length === 1) return distance(px, py, points[0].x, points[0].y) <= threshold;
	for (let i = 1; i < points.length; i++) {
		if (segmentDistance(px, py, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y) <= threshold) {
			return true;
		}
	}
	return false;
}

// Precise hit test in page units, `tolerance` should scale with zoom (e.g. 4 / zoom)
export function hitTestElement(el: Element, px: number, py: number, tolerance = 4): boolean {
	switch (el.type) {
		case 'stroke':
			return hitStroke(el, px, py, tolerance);
		case 'text':
			return pointInBounds(px, py, textBounds(el));
		default: {
			const threshold = el.strokeWidth / 2 + tolerance;
			if (el.shape === 'line' || el.shape === 'arrow') {
				const { x1, x2, y1, y2 } = shapeLine(el);
				return segmentDistance(px, py, x1, y1, x2, y2) <= threshold;
			}
			const box = normalizeBounds({ height: el.h, width: el.w, x: el.x, y: el.y });
			if (el.fill && pointInBounds(px, py, box) && el.shape === 'rect') return true;
			if (el.shape === 'rect') {
				const inner = {
					height: Math.max(box.height - threshold * 2, 0),
					width: Math.max(box.width - threshold * 2, 0),
					x: box.x + threshold,
					y: box.y + threshold,
				};
				return pointInBounds(px, py, box) && !pointInBounds(px, py, inner);
			}
			if (el.shape === 'ellipse') {
				const rx = box.width / 2;
				const ry = box.height / 2;
				const cx = box.x + rx;
				const cy = box.y + ry;
				if (el.fill && pointInEllipse(px, py, cx, cy, rx, ry)) return true;
				const outer = pointInEllipse(px, py, cx, cy, rx + threshold, ry + threshold);
				const inner = pointInEllipse(px, py, cx, cy, Math.max(rx - threshold, 0), Math.max(ry - threshold, 0));
				return outer && !inner;
			}
			return pointInBounds(px, py, {
				height: box.height + threshold,
				width: box.width + threshold,
				x: box.x - threshold,
				y: box.y - threshold,
			});
		}
	}
}

// Used by the object eraser and marquee selection.
export function elementIntersectsCircle(el: Element, cx: number, cy: number, radius: number): boolean {
	const b = elementBounds(el);
	if (cx + radius < b.x || cx - radius > b.x + b.width || cy + radius < b.y || cy - radius > b.y + b.height)
		return false;

	if (el.type === 'stroke') {
		const threshold = el.width / 2 + radius;
		for (let i = 1; i < el.points.length; i++) {
			const d = segmentDistance(cx, cy, el.points[i - 1].x, el.points[i - 1].y, el.points[i].x, el.points[i].y);
			if (d <= threshold) return true;
		}
		return el.points.length === 1 && distance(cx, cy, el.points[0].x, el.points[0].y) <= threshold;
	}
	return boundsIntersect(b, { height: radius * 2, width: radius * 2, x: cx - radius, y: cy - radius });
}

export function translateElement<T extends Element>(el: T, dx: number, dy: number): T {
	switch (el.type) {
		case 'stroke':
			return {
				...el,
				points: el.points.map((p) => ({ pressure: p.pressure, x: p.x + dx, y: p.y + dy })),
			};
		case 'shape':
			return { ...el, x: el.x + dx, y: el.y + dy };
		default:
			return { ...el, x: el.x + dx, y: el.y + dy };
	}
}

export function simplifyStroke(points: Point[], tolerance = 0.35): Point[] {
	if (points.length <= 2) return points;
	const keep = new Array<boolean>(points.length).fill(false);
	keep[0] = true;
	keep[points.length - 1] = true;

	const stack: Array<[number, number]> = [[0, points.length - 1]];
	while (stack.length > 0) {
		const [first, last] = stack.pop() as [number, number];
		let maxDistance = 0;
		let index = -1;
		for (let i = first + 1; i < last; i++) {
			const d = segmentDistance(
				points[i].x,
				points[i].y,
				points[first].x,
				points[first].y,
				points[last].x,
				points[last].y
			);
			if (d > maxDistance) {
				maxDistance = d;
				index = i;
			}
		}
		if (maxDistance > tolerance && index > 0) {
			keep[index] = true;
			stack.push([first, index], [index, last]);
		}
	}
	return points.filter((_, i) => keep[i]);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function snap(value: number, step: number): number {
	return step > 0 ? Math.round(value / step) * step : value;
}

export function constrainPoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
	const dx = bx - ax;
	const dy = by - ay;
	const angle = Math.atan2(dy, dx);
	const step = Math.PI / 4;
	const snapped = Math.round(angle / step) * step;
	const length = Math.hypot(dx, dy);
	if (Math.abs(Math.cos(snapped)) < 1e-6 || Math.abs(Math.sin(snapped)) < 1e-6) {
		if (Math.abs(dx) > Math.abs(dy)) return { x: ax + Math.sign(dx) * length, y: ay };
		return { x: ax, y: ay + Math.sign(dy) * length };
	}
	return { x: ax + Math.cos(snapped) * length, y: ay + Math.sin(snapped) * length };
}
