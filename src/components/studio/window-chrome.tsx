import { cn } from '@/lib/utils.ts';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as React from 'react';

export type WindowPlatform = 'linux' | 'macos' | 'windows';

type TauriWindow = ReturnType<typeof getCurrentWindow>;

/**
 * Native window-chrome flavour for this device. The Tauri shell runs undecorated, so the
 * actions bar below the header has to draw its own controls in the platform's own idiom.
 * `?chrome=macos|windows|linux` forces a flavour so both designs can be previewed on one machine.
 */
export const WINDOW_PLATFORM: WindowPlatform = detectPlatform();

function detectPlatform(): WindowPlatform {
	const override = new URLSearchParams(window.location.search).get('chrome');
	if (override === 'linux' || override === 'macos' || override === 'windows') return override;

	const reported = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
	if (reported === 'macOS' || reported === 'Windows') return reported === 'macOS' ? 'macos' : 'windows';

	const agent = navigator.userAgent;
	if (/Macintosh|Mac OS X|iPad|iPhone/.test(agent)) return 'macos';
	if (/Windows NT|Win32|Win64/.test(agent)) return 'windows';
	return 'linux';
}

interface WindowActions {
	close: () => void;
	maximized: boolean;
	minimize: () => void;
	toggleMaximize: () => void;
}

// Wires the caption buttons to the Tauri window. Every action is a no-op in a plain browser.
export function useWindowActions(): WindowActions {
	const [maximized, setMaximized] = React.useState(false);

	React.useEffect(() => {
		if (!isTauri()) return;
		const appWindow = getCurrentWindow();
		let live = true;

		const sync = () => {
			void appWindow.isMaximized().then((value) => {
				if (live) setMaximized(value);
			});
		};

		sync();
		const unlisten = appWindow.onResized(sync);
		return () => {
			live = false;
			void unlisten.then((off) => off());
		};
	}, []);

	const run = React.useCallback((command: (appWindow: TauriWindow) => Promise<unknown>) => {
		if (!isTauri()) return;
		void command(getCurrentWindow()).catch((error: unknown) => {
			console.error('Window command failed', error);
		});
	}, []);

	return {
		close: React.useCallback(() => run((appWindow) => appWindow.close()), [run]),
		maximized,
		minimize: React.useCallback(() => run((appWindow) => appWindow.minimize()), [run]),
		toggleMaximize: React.useCallback(() => run((appWindow) => appWindow.toggleMaximize()), [run]),
	};
}

interface TitleBarProps {
	children: React.ReactNode;
	className?: string;
}

/**
 * The actions bar: a frameless-window title bar that doubles as the app's toolbar. The whole
 * surface is a drag region (`deep`), so clicks land on the controls inside it and every other
 * pixel moves the window; Tauri also maps double-click there to maximize/restore on its own.
 */
export function TitleBar({ children, className }: TitleBarProps): React.ReactElement {
	const macos = WINDOW_PLATFORM === 'macos';

	return (
		<header
			className={cn(
				'relative flex h-12 shrink-0 select-none items-center gap-3 border-b bg-card',
				macos ? 'ps-19.5 pe-3' : 'ps-3 pe-34.5',
				className
			)}
			data-tauri-drag-region='deep'
		>
			{children}
			<WindowControls />
		</header>
	);
}

export function WindowControls(): React.ReactElement {
	const { close, maximized, minimize, toggleMaximize } = useWindowActions();

	if (WINDOW_PLATFORM === 'macos') {
		return (
			<div className='group/lights absolute inset-y-0 inset-s-0 flex items-center gap-2 ps-5'>
				<TrafficLight className='border-[#e0443e] bg-[#ff5f57]' label='Close' onClick={close}>
					<TrafficGlyph>
						<path d='M0.5 0.5 5.5 5.5M5.5 0.5 0.5 5.5' stroke='#4d0000' strokeWidth='1.4' />
					</TrafficGlyph>
				</TrafficLight>
				<TrafficLight className='border-[#dea123] bg-[#febc2e]' label='Minimize' onClick={minimize}>
					<TrafficGlyph>
						<path d='M0.5 3h5' stroke='#5a3c00' strokeWidth='1.4' />
					</TrafficGlyph>
				</TrafficLight>
				<TrafficLight
					className='border-[#1aab29] bg-[#28c840]'
					label={maximized ? 'Restore' : 'Maximize'}
					onClick={toggleMaximize}
				>
					<TrafficGlyph>
						<path d='M0.5 3.5V0.5h3z' fill='#0d4f14' />
						<path d='M5.5 2.5v3h-3z' fill='#0d4f14' />
					</TrafficGlyph>
				</TrafficLight>
			</div>
		);
	}

	return (
		<div className='absolute inset-y-0 inset-e-0 flex items-stretch'>
			<CaptionButton label='Minimize' onClick={minimize}>
				<Glyph>
					<path d='M0 5.5h10' stroke='currentColor' />
				</Glyph>
			</CaptionButton>
			<CaptionButton label={maximized ? 'Restore' : 'Maximize'} onClick={toggleMaximize}>
				<Glyph>
					{maximized ? (
						<>
							<path d='M2.5 2.5V0.5h7v7h-2' stroke='currentColor' />
							<rect height='7' stroke='currentColor' width='7' x='0.5' y='2.5' />
						</>
					) : (
						<rect height='9' stroke='currentColor' width='9' x='0.5' y='0.5' />
					)}
				</Glyph>
			</CaptionButton>
			<CaptionButton label='Close' onClick={close} tone='danger'>
				<Glyph>
					<path d='M0.5 0.5l9 9M9.5 0.5l-9 9' stroke='currentColor' />
				</Glyph>
			</CaptionButton>
		</div>
	);
}

function Glyph({ children }: { children: React.ReactNode }): React.ReactElement {
	return (
		<svg
			aria-hidden='true'
			className='size-2.5'
			fill='none'
			strokeWidth='1'
			viewBox='0 0 10 10'
			xmlns='http://www.w3.org/2000/svg'
		>
			{children}
		</svg>
	);
}

function TrafficGlyph({ children }: { children: React.ReactNode }): React.ReactElement {
	return (
		<svg
			aria-hidden='true'
			className='size-1.5'
			fill='none'
			strokeLinecap='round'
			viewBox='0 0 6 6'
			xmlns='http://www.w3.org/2000/svg'
		>
			{children}
		</svg>
	);
}

interface CaptionButtonProps {
	children: React.ReactNode;
	label: string;
	onClick: () => void;
	tone?: 'danger';
}

function CaptionButton({ children, label, onClick, tone }: CaptionButtonProps): React.ReactElement {
	return (
		<button
			aria-label={label}
			className={cn(
				'inline-flex w-11.5 cursor-default items-center justify-center text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
				tone === 'danger'
					? 'hover:bg-[#c42b1c] hover:text-white active:bg-[#b0261a] active:text-white'
					: 'hover:bg-foreground/6 active:bg-foreground/12'
			)}
			onClick={onClick}
			title={label}
			type='button'
		>
			{children}
		</button>
	);
}

interface TrafficLightProps {
	children: React.ReactNode;
	className: string;
	label: string;
	onClick: () => void;
}

function TrafficLight({ children, className, label, onClick }: TrafficLightProps): React.ReactElement {
	return (
		<button
			aria-label={label}
			className={cn(
				'flex size-3 cursor-default items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
				className
			)}
			onClick={onClick}
			type='button'
		>
			<span className='opacity-0 transition-opacity group-hover/lights:opacity-100'>{children}</span>
		</button>
	);
}
