// dsh-desktop-kit — self-owned desktop shell for DeepSeek Harness.
//
// Host half. After the web server binds, spawn the native Tauri shell on the
// served loopback URL. The shell is a plain *decorated* window: native macOS
// fullscreen (green button / Ctrl+Cmd+F) works out of the box — unlike
// frameless shells that have to wire it up by hand. The shell exits with
// code 0 when its window closes, which this plugin treats as a request to
// shut the harness down (ctx.appExit). Any other exit keeps the web surface
// running in the browser.
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import z from 'schemastery';
export const name = 'dsh-desktop-kit';
// webServer is INJECTED so apply() runs only after the server is bound and
// the port is the real (possibly OS-assigned) one.
export const inject = ['webServer'];
export const Config = z.object({
    /** Explicit shell binary path; empty resolves $DSH_HOME/bin → PATH → ~/.local/bin. */
    bin: z.string().default(''),
    /** Window title, passed to the shell as argv[2]. */
    title: z.string().default('DeepSeek Harness'),
});
const SHELL_NAME = 'dsh-desktop-kit';
const LOOPBACK_HOST = '127.0.0.1';
const PACKAGE_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
function bundledAsset(name) {
    return join(PACKAGE_ROOT, name);
}
function bundledVersion() {
    try {
        const manifest = JSON.parse(readFileSync(bundledAsset('package.json'), 'utf8'));
        return typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : 'bundled';
    }
    catch {
        return 'bundled';
    }
}
/**
 * Install the packaged macOS shell and clickable app once per package version.
 * The release tarball contains these assets; source checkouts do not, so local
 * development keeps using the existing ~/.dsh/bin/PATH resolution path.
 */
function ensureBundledDesktopInstall(dshHome, log) {
    if (process.platform !== 'darwin' || process.arch !== 'arm64')
        return undefined;
    const sourceBin = bundledAsset(`bin/${SHELL_NAME}`);
    if (!existsSync(sourceBin))
        return undefined;
    const version = bundledVersion();
    const targetDir = join(dshHome, 'bin');
    const targetBin = join(targetDir, SHELL_NAME);
    const versionFile = join(targetDir, `.${SHELL_NAME}.version`);
    try {
        mkdirSync(targetDir, { recursive: true });
        let installedVersion = '';
        try {
            installedVersion = readFileSync(versionFile, 'utf8').trim();
        }
        catch {
            // Missing marker means an older/manual install; refresh it from the package.
        }
        if (!existsSync(targetBin) || installedVersion !== version) {
            copyFileSync(sourceBin, targetBin);
            chmodSync(targetBin, 0o755);
            writeFileSync(versionFile, `${version}\n`);
            log.log(`dsh desktop-kit: installed native shell ${version} to ${targetBin}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`dsh desktop-kit: could not install native shell: ${message}`);
        // An older shell is still better than stopping the web surface entirely.
        if (!existsSync(targetBin))
            return undefined;
    }
    const appDir = join(homedir(), 'Applications', 'DSH.app');
    const appVersionFile = join(appDir, 'Contents', 'Resources', `${SHELL_NAME}.version`);
    let installedAppVersion = '';
    try {
        installedAppVersion = readFileSync(appVersionFile, 'utf8').trim();
    }
    catch {
        // Missing marker means the app needs to be created or refreshed.
    }
    if (installedAppVersion !== version) {
        const installer = bundledAsset('app/install.sh');
        if (existsSync(installer)) {
            try {
                execFileSync('/bin/bash', [installer], { stdio: 'ignore' });
                mkdirSync(join(appDir, 'Contents', 'Resources'), { recursive: true });
                writeFileSync(appVersionFile, `${version}\n`);
                log.log(`dsh desktop-kit: installed DSH.app ${version} to ${appDir}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log.error(`dsh desktop-kit: could not install DSH.app: ${message}`);
            }
        }
    }
    return targetBin;
}
function resolveDshHome() {
    return process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
        ? process.env.DSH_HOME
        : join(homedir(), '.dsh');
}
function findOnPath(name, pathDirs) {
    const dirs = pathDirs ?? (process.env.PATH ?? '').split(delimiter).filter(Boolean);
    for (const dir of dirs) {
        const candidate = join(dir, name);
        if (existsSync(candidate))
            return candidate;
    }
    return undefined;
}
/**
 * Resolve the native shell binary to spawn, in order: explicit config/env →
 * $DSH_HOME/bin → PATH → ~/.local/bin. A path-bearing explicit value must
 * exist (a config error, not a fallback case); a bare name is left for PATH
 * resolution by the OS.
 */
export function resolveShellBinary(explicitBin, env = process.env, dshHome = resolveDshHome(), pathDirs, localBin = join(homedir(), '.local', 'bin', SHELL_NAME)) {
    const explicit = [explicitBin, env.DSH_DESKTOP_KIT_BIN].find((value) => typeof value === 'string' && value.trim() !== '');
    if (explicit !== undefined) {
        if (explicit.includes('/') || explicit.includes('\\')) {
            if (!existsSync(explicit))
                throw new Error(`configured shell binary not found: ${explicit}`);
            return explicit;
        }
        return explicit;
    }
    const homeBin = join(dshHome, 'bin', process.platform === 'win32' ? `${SHELL_NAME}.exe` : SHELL_NAME);
    if (existsSync(homeBin))
        return homeBin;
    const onPath = findOnPath(SHELL_NAME, pathDirs);
    if (onPath !== undefined)
        return onPath;
    if (existsSync(localBin))
        return localBin;
    return undefined;
}
export function apply(ctx, config, overrides = {}) {
    const ctxLike = ctx;
    const log = overrides.console ?? console;
    const doSpawn = overrides.spawn ?? ((bin, args, options) => spawn(bin, args, options));
    const settled = ctxLike.get('loader')?.await();
    const exit = ctxLike.get('appExit');
    let child;
    // Plugin teardown kills the shell; the reverse (window closed) is handled
    // in the exit listener below.
    ctxLike.effect(() => () => {
        if (child !== undefined && child.exitCode === null && !child.killed)
            child.kill('SIGTERM');
    }, 'desktop-kit: kill shell on dispose');
    const open = () => {
        const server = ctxLike.get('webServer');
        if (server === undefined)
            return;
        const url = `http://${LOOPBACK_HOST}:${server.port}`;
        let bin;
        try {
            const dshHome = overrides.dshHome ?? resolveDshHome();
            if (overrides.installBundled !== false &&
                config.bin.trim() === '' &&
                (process.env.DSH_DESKTOP_KIT_BIN ?? '').trim() === '') {
                ensureBundledDesktopInstall(dshHome, log);
            }
            bin = resolveShellBinary(config.bin, process.env, overrides.dshHome, overrides.pathDirs, overrides.localBin);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`dsh desktop-kit: ${message}`);
            ctxLike.logger.error(message);
            return;
        }
        if (bin === undefined) {
            log.error(`dsh desktop-kit: no shell binary found; keeping the web surface at ${url} — ` +
                'build the shell (shell/, cargo build --release) and install it to ~/.dsh/bin, or set DSH_DESKTOP_KIT_BIN');
            ctxLike.logger.warn('desktop-kit: no shell binary found; keeping the web surface');
            return;
        }
        log.log(`dsh desktop-kit: ${url} (window: ${bin})`);
        ctxLike.logger.info(`desktop-kit: opening ${url} with ${bin}`);
        child = doSpawn(bin, [url, config.title], {
            env: { ...process.env, DSH_HOME: overrides.dshHome ?? resolveDshHome() },
            // v1 has no control channel: stdin ignored, stdout/stderr inherited so
            // the shell's own log lines reach the harness terminal.
            stdio: ['ignore', 'inherit', 'inherit'],
        });
        child.on('error', (error) => {
            log.error(`dsh desktop-kit: failed to start ${bin}: ${error.message}; keeping the web surface at ${url}`);
            ctxLike.logger.error(`desktop-kit: failed to start ${bin}: ${error.message}`);
        });
        child.on('exit', (code, signal) => {
            if (signal !== null || code === null)
                return; // we killed it, or it died by a signal
            if (code === 0) {
                log.log('dsh desktop-kit: window closed; shutting the harness down');
                ctxLike.logger.info('desktop-kit: window closed; shutting the harness down');
                if (exit !== undefined)
                    exit(0);
            }
            else {
                log.error(`dsh desktop-kit: shell exited with code ${code}; keeping the web surface at ${url}`);
                ctxLike.logger.warn(`desktop-kit: shell exited with code ${code}`);
            }
        });
    };
    if (settled === undefined)
        open();
    else
        settled.then(open, () => { });
}
