import { getStroke } from 'perfect-freehand';
import type { Point, StrokeElement } from './types.ts';

export interface InkOptions {
	size: number;
	thinning: number;
	streamline: number;
	simulatePressure: boolean;
	complete: boolean;
}

const pathCache = new WeakMap<StrokeElement, Path2D>();

function toInputPoints(points: Point[], simulatePressure: boolean): number[][] {
	return points.map((p) => (simulatePressure ? [p.x, p.y] : [p.x, p.y, p.pressure]));
}

function densify(points: Point[]): Point[] {
	const [from, to] = points;
	const steps = 12;
	const dense: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		dense.push({
			pressure: from.pressure + (to.pressure - from.pressure) * t,
			x: from.x + (to.x - from.x) * t,
			y: from.y + (to.y - from.y) * t,
		});
	}
	return dense;
}

export function strokeOutline(points: Point[], options: InkOptions): number[][] {
	if (points.length === 0) return [];
	const samples = points.length === 2 && !options.simulatePressure ? densify(points) : points;
	return getStroke(toInputPoints(samples, options.simulatePressure), {
		easing: (t) => t,
		end: { cap: true, taper: 0 },
		last: options.complete,
		simulatePressure: options.simulatePressure,
		smoothing: 0.5,
		start: { cap: true, taper: 0 },
		streamline: options.streamline,
		thinning: options.thinning,
		size: options.size,
	});
}

function appendPolygon(path: Path2D, polygon: number[][]): Path2D {
	if (polygon.length < 2) {
		if (polygon.length === 1) {
			path.moveTo(polygon[0][0], polygon[0][1]);
			path.lineTo(polygon[0][0] + 0.01, polygon[0][1]);
		}
		return path;
	}
	path.moveTo(polygon[0][0], polygon[0][1]);
	for (let i = 0; i < polygon.length; i++) {
		const current = polygon[i];
		const next = polygon[(i + 1) % polygon.length];
		path.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
	}
	path.closePath();
	return path;
}

export function polygonToPath(polygon: number[][]): Path2D {
	return appendPolygon(new Path2D(), polygon);
}

export function inkOptionsFor(el: StrokeElement, complete: boolean): InkOptions {
	const isHighlighter = el.mode === 'highlighter';
	return {
		complete,
		simulatePressure: isHighlighter || el.input !== 'pen',
		size: el.width,
		streamline: el.streamline,
		thinning: isHighlighter ? 0 : el.thinning,
	};
}

export function strokePath(points: Point[], options: InkOptions): Path2D {
	return polygonToPath(strokeOutline(points, options));
}

export function strokePathForElement(el: StrokeElement): Path2D {
	const cached = pathCache.get(el);
	if (cached) return cached;
	const path = strokePath(el.points, inkOptionsFor(el, true));
	pathCache.set(el, path);
	return path;
}
