import { studio, summarizeNotebook } from './store.ts';
import { DEFAULT_PREFS, NOTEBOOK_VERSION, type Notebook, type NotebookSummary, type Prefs } from './types.ts';

const DB_NAME = 'drawboard-studio';
const DB_VERSION = 1;
const NOTEBOOK_STORE = 'notebooks';
const META_STORE = 'meta';
const LAST_OPENED_KEY = 'lastOpened';
const PREFS_KEY = 'prefs';
const AUTOSAVE_DELAY = 700;

const memory = {
	meta: new Map<string, unknown>(),
	notebooks: new Map<string, Notebook>(),
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve) => {
		if (typeof indexedDB === 'undefined') {
			resolve(null);
			return;
		}
		const open = indexedDB.open(DB_NAME, DB_VERSION);
		open.onupgradeneeded = () => {
			const db = open.result;
			if (!db.objectStoreNames.contains(NOTEBOOK_STORE)) {
				db.createObjectStore(NOTEBOOK_STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
			}
			if (!db.objectStoreNames.contains(META_STORE)) {
				db.createObjectStore(META_STORE);
			}
		};
		open.onsuccess = () => resolve(open.result);
		open.onerror = () => {
			console.warn('IndexedDB unavailable, falling back to in-memory storage.', open.error);
			resolve(null);
		};
	});
	return dbPromise;
}

async function readAll<T>(storeName: string): Promise<T[]> {
	const db = await openDatabase();
	if (!db) return [...memory.notebooks.values()] as unknown as T[];
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly');
		const req = tx.objectStore(storeName).getAll();
		req.onsuccess = () => resolve(req.result as T[]);
		req.onerror = () => reject(req.error ?? new Error('Failed to read store'));
	});
}

async function write(storeName: string, value: unknown, key?: string): Promise<void> {
	const db = await openDatabase();
	if (!db) {
		if (storeName === NOTEBOOK_STORE) memory.notebooks.set((value as Notebook).id, value as Notebook);
		else memory.meta.set(key ?? '', value);
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite');
		const store = tx.objectStore(storeName);
		const req = key === undefined ? store.put(value) : store.put(value, key);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error ?? new Error('Failed to write store'));
	});
}

async function readValue<T>(storeName: string, key: string): Promise<T | null> {
	const db = await openDatabase();
	if (!db) {
		if (storeName === NOTEBOOK_STORE) return (memory.notebooks.get(key) as unknown as T) ?? null;
		return (memory.meta.get(key) as T | undefined) ?? null;
	}
	return new Promise((resolve, reject) => {
		const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
		req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
		req.onerror = () => reject(req.error ?? new Error('Failed to read store'));
	});
}

async function remove(storeName: string, key: string): Promise<void> {
	const db = await openDatabase();
	if (!db) {
		memory.notebooks.delete(key);
		memory.meta.delete(key);
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error ?? new Error('Failed to delete record'));
	});
}

export const storage = {
	async list(): Promise<NotebookSummary[]> {
		const notebooks = await readAll<Notebook>(NOTEBOOK_STORE);
		return notebooks.map(summarizeNotebook).sort((a, b) => b.updatedAt - a.updatedAt);
	},

	async load(id: string): Promise<Notebook | null> {
		return readValue<Notebook>(NOTEBOOK_STORE, id);
	},

	async save(notebook: Notebook): Promise<void> {
		await write(NOTEBOOK_STORE, notebook);
	},

	async remove(id: string): Promise<void> {
		await remove(NOTEBOOK_STORE, id);
	},

	async loadLastOpenedId(): Promise<string | null> {
		return readValue<string>(META_STORE, LAST_OPENED_KEY);
	},

	async saveLastOpenedId(id: string | null): Promise<void> {
		await write(META_STORE, id, LAST_OPENED_KEY);
	},

	async loadPrefs(): Promise<Prefs | null> {
		return readValue<Prefs>(META_STORE, PREFS_KEY);
	},

	async savePrefs(prefs: Prefs): Promise<void> {
		await write(META_STORE, prefs, PREFS_KEY);
	},
};

function isNotebook(value: unknown): value is Notebook {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<Notebook>;
	return typeof candidate.id === 'string' && Array.isArray(candidate.workspaces);
}

export function migrateNotebook(raw: unknown): Notebook | null {
	if (!isNotebook(raw)) return null;
	const notebook = raw as Notebook;
	return {
		...notebook,
		createdAt: notebook.createdAt ?? Date.now(),
		name: notebook.name || 'Untitled notebook',
		updatedAt: notebook.updatedAt ?? Date.now(),
		version: NOTEBOOK_VERSION,
		workspaces: notebook.workspaces.map((workspace) => ({
			...workspace,
			background: workspace.background ?? 'blank',
			color: workspace.color ?? '#ffffff',
			elements: workspace.elements ?? [],
			layers: workspace.layers?.length
				? workspace.layers
				: [{ id: `${workspace.id}-layer`, name: 'Layer 1', opacity: 1, visible: true, locked: false }],
		})),
	};
}

export async function hydrateFromStorage(): Promise<void> {
	studio.setLibrary(await storage.list());
	const prefs = await storage.loadPrefs();
	if (prefs) studio.setPrefs({ ...DEFAULT_PREFS, ...prefs });

	studio.setHydrated(true);

	const lastOpened = await storage.loadLastOpenedId();
	if (!lastOpened) return;
	const notebook = await storage.load(lastOpened);
	const migrated = notebook ? migrateNotebook(notebook) : null;
	if (migrated) studio.openNotebook(migrated);
}

export function attachAutosave(): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending: Notebook | null = null;
	let saved: Notebook | null = null;
	let savedPrefs: Prefs | null = null;

	const flush = async () => {
		timer = null;
		const notebook = pending;
		pending = null;
		if (notebook && notebook !== saved) {
			saved = notebook;
			studio.setStatus('saving');
			try {
				await storage.save(notebook);
				await storage.saveLastOpenedId(notebook.id);
				studio.markSaved();
				studio.setLibrary(await storage.list());
			} catch (error) {
				console.error('Failed to save notebook', error);
				studio.setStatus('error');
			}
		}
		if (savedPrefs) {
			const prefs = savedPrefs;
			savedPrefs = null;
			void storage.savePrefs(prefs).catch((error) => console.error('Failed to save preferences', error));
		}
	};

	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void flush(), AUTOSAVE_DELAY);
	};

	const unsubscribe = studio.subscribe(() => {
		const current = studio.getState();
		if (current.notebook && current.notebook !== saved) {
			pending = current.notebook;
			schedule();
		}
		if (current.prefs !== savedPrefs && current.prefs !== DEFAULT_PREFS) {
			savedPrefs = current.prefs;
			schedule();
		}
	});

	const onHide = () => {
		if (timer) clearTimeout(timer);
		void flush();
	};
	window.addEventListener('beforeunload', onHide);
	document.addEventListener('visibilitychange', onHide);

	return () => {
		unsubscribe();
		window.removeEventListener('beforeunload', onHide);
		document.removeEventListener('visibilitychange', onHide);
		if (timer) clearTimeout(timer);
	};
}
