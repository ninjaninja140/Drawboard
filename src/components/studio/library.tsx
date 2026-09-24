import { TitleBar } from '@/components/studio/window-chrome.tsx';
import { useTheme } from '@/components/theme-provider.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPanel,
	DialogPopup,
	DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu.tsx';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { parseNotebookJson } from '@/drawing/export.ts';
import { migrateNotebook, storage } from '@/drawing/persistence.ts';
import { createWorkspace, studio, useStudioSelection } from '@/drawing/store.ts';
import { WORKSPACE_PRESETS } from '@/drawing/types.ts';
import { BookOpen, Ellipsis, FileUp, Moon, NotebookPen, Plus, Sun, Trash } from 'lucide-react';
import * as React from 'react';

const SIZE_ITEMS = WORKSPACE_PRESETS.map((preset) => ({ label: preset.name, value: preset.name }));

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Library(): React.ReactElement {
	const library = useStudioSelection((state) => state.library);
	const { theme, setTheme } = useTheme();
	const [creating, setCreating] = React.useState(false);
	const [name, setName] = React.useState('Untitled notebook');
	const [presetName, setPresetName] = React.useState<string>(WORKSPACE_PRESETS[0].name);
	const [importing, setImporting] = React.useState(false);
	const fileInput = React.useRef<HTMLInputElement | null>(null);

	const createNotebook = () => {
		const preset = WORKSPACE_PRESETS.find((item) => item.name === presetName) ?? WORKSPACE_PRESETS[0];
		const page = createWorkspace({ height: preset.height, name: 'Page 1', width: preset.width });
		studio.newNotebook(name.trim() || 'Untitled notebook', [page]);
		setCreating(false);
		setName('Untitled notebook');
	};

	const importFile = async (file: File) => {
		setImporting(true);
		const notebook = parseNotebookJson(await file.text());
		setImporting(false);
		if (notebook) studio.openNotebook(notebook);
	};

	const deleteNotebook = async (id: string) => {
		await storage.remove(id);
		studio.setLibrary(await storage.list());
	};

	return (
		<div className='flex min-h-0 flex-1 flex-col bg-muted/30'>
			<TitleBar>
				<NotebookPen className='size-4.5 shrink-0 text-primary' />
				<h1 className='shrink-0 font-semibold text-sm'>Drawboard Studio</h1>
				<span className='hidden min-w-0 truncate text-muted-foreground text-xs lg:inline'>
					Notebooks are stored locally on this device.
				</span>
				<div className='ms-auto flex shrink-0 items-center gap-1'>
					<Button
						aria-label='Toggle theme'
						onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
						size='icon-sm'
						title='Toggle dark mode'
						variant='ghost'
					>
						{theme === 'dark' ? <Sun /> : <Moon />}
					</Button>
					<Button onClick={() => fileInput.current?.click()} size='sm' variant='outline'>
						<FileUp />
						Import
					</Button>
					<Button onClick={() => setCreating(true)} size='sm'>
						<Plus />
						New notebook
					</Button>
				</div>
			</TitleBar>

			<input
				accept='application/json,.json'
				className='hidden'
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = '';
					if (file) void importFile(file);
				}}
				ref={fileInput}
				type='file'
			/>

			<div className='min-h-0 flex-1 overflow-y-auto'>
				<div className='mx-auto grid w-full max-w-5xl gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3'>
					{library.map((item) => (
						<div
							className='group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md'
							key={item.id}
						>
							<button
								className='flex items-start gap-3 text-left'
								onClick={() => void openNotebookById(item.id)}
								type='button'
							>
								<span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
									<BookOpen className='size-5' />
								</span>
								<span className='min-w-0 flex-1'>
									<span className='block truncate font-medium text-sm'>{item.name}</span>
									<span className='block text-muted-foreground text-xs'>
										{item.workspaceCount} page{item.workspaceCount === 1 ? '' : 's'}
									</span>
									<span className='block text-muted-foreground text-[11px]'>
										Edited {DATE_FORMAT.format(new Date(item.updatedAt))}
									</span>
								</span>
							</button>
							<div className='flex items-center justify-end gap-1'>
								<Button onClick={() => void openNotebookById(item.id)} size='xs' variant='outline'>
									Open
								</Button>
								<Menu>
									<MenuTrigger
										render={<Button aria-label='Notebook options' size='icon-xs' variant='ghost' />}
									>
										<Ellipsis />
									</MenuTrigger>
									<MenuPopup align='end'>
										<MenuItem onClick={() => void deleteNotebook(item.id)} variant='destructive'>
											<Trash />
											Delete notebook
										</MenuItem>
									</MenuPopup>
								</Menu>
							</div>
						</div>
					))}

					<button
						className='flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 text-muted-foreground transition-colors hover:border-primary hover:text-primary'
						onClick={() => setCreating(true)}
						type='button'
					>
						<Plus className='size-5' />
						<span className='text-sm'>New notebook</span>
					</button>
				</div>

				{library.length === 0 ? (
					<p className='px-6 pb-8 text-center text-muted-foreground text-sm'>
						{importing
							? 'Importing…'
							: 'Nothing here yet — create a notebook or import a .drawboard.json file.'}
					</p>
				) : null}
			</div>

			<Dialog onOpenChange={setCreating} open={creating}>
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>New notebook</DialogTitle>
						<DialogDescription>Pick a name and the page size used for its first page.</DialogDescription>
					</DialogHeader>
					<DialogPanel className='flex flex-col gap-3'>
						<div className='flex flex-col gap-1.5'>
							<Label htmlFor='notebook-name'>Name</Label>
							<Input id='notebook-name' onChange={(event) => setName(event.target.value)} value={name} />
						</div>
						<div className='flex flex-col gap-1.5'>
							<Label>Page size</Label>
							<Select
								items={SIZE_ITEMS}
								onValueChange={(value) => setPresetName(String(value))}
								value={presetName}
							>
								<SelectTrigger>
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
						</div>
					</DialogPanel>
					<DialogFooter>
						<Button onClick={() => setCreating(false)} variant='outline'>
							Cancel
						</Button>
						<Button onClick={createNotebook}>Create</Button>
					</DialogFooter>
				</DialogPopup>
			</Dialog>
		</div>
	);
}

async function openNotebookById(id: string): Promise<void> {
	const raw = await storage.load(id);
	const notebook = raw ? migrateNotebook(raw) : null;
	if (notebook) studio.openNotebook(notebook);
}
