import { migrateNotebook } from './persistence.ts';
import { renderWorkspaceToCanvas } from './render.ts';
import type { Notebook, Workspace } from './types.ts';

function safeName(name: string): string {
	return name.replace(/[^\w\-. ]+/g, '_').trim() || 'notebook';
}

export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.download = filename;
	link.href = url;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportNotebookJson(notebook: Notebook): void {
	const blob = new Blob([JSON.stringify(notebook, null, '\t')], { type: 'application/json' });
	downloadBlob(`${safeName(notebook.name)}.drawboard.json`, blob);
}

export function parseNotebookJson(text: string): Notebook | null {
	try {
		return migrateNotebook(JSON.parse(text) as unknown);
	} catch (error) {
		console.error('Notebook file is not valid JSON', error);
		return null;
	}
}

function workspaceCanvas(workspace: Workspace, scale: number): HTMLCanvasElement {
	return renderWorkspaceToCanvas(workspace, { background: workspace.color, chrome: false, scale });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export async function exportWorkspacePng(workspace: Workspace, notebookName: string, scale = 2): Promise<void> {
	const blob = await toBlob(workspaceCanvas(workspace, scale));
	if (blob) downloadBlob(`${safeName(notebookName)} - ${safeName(workspace.name)}.png`, blob);
}

export async function exportAllWorkspacesPng(notebook: Notebook, scale = 2): Promise<void> {
	for (const workspace of notebook.workspaces) {
		await exportWorkspacePng(workspace, notebook.name, scale);
		await new Promise((resolve) => setTimeout(resolve, 350));
	}
}

export function workspaceDataUrl(workspace: Workspace, maxSize = 320): string {
	return workspaceCanvas(workspace, Math.min(maxSize / workspace.width, maxSize / workspace.height)).toDataURL(
		'image/png'
	);
}
