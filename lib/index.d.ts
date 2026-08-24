import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
export declare const name = "dsh-desktop-kit";
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<{
    /** Explicit shell binary path; empty resolves $DSH_HOME/bin → PATH → ~/.local/bin. */
    bin: z<string, string>;
    /** Window title, passed to the shell as argv[2]. */
    title: z<string, string>;
}>, Schemastery.ObjectT<{
    /** Explicit shell binary path; empty resolves $DSH_HOME/bin → PATH → ~/.local/bin. */
    bin: z<string, string>;
    /** Window title, passed to the shell as argv[2]. */
    title: z<string, string>;
}>>;
export interface Config {
    bin: string;
    title: string;
}
/** The slice of the webServer service this plugin reads. */
export interface WebServerLike {
    port: number;
}
export interface LoggerLike {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
/** Subset of the plugin context used here, structurally typed for tests. */
export interface CtxLike {
    get(name: 'webServer'): WebServerLike | undefined;
    get(name: 'appExit'): ((code: number) => void) | undefined;
    get(name: 'loader'): {
        await(): Promise<unknown>;
    } | undefined;
    get(name: string): unknown;
    effect(fn: () => void | (() => void), label?: string): void;
    logger: LoggerLike;
}
/** The subset of ChildProcess the plugin relies on (structural, test-friendly). */
export interface ChildLike {
    exitCode: number | null;
    killed: boolean;
    kill(signal?: NodeJS.Signals): boolean;
    on(event: 'error', listener: (error: Error) => void): unknown;
    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}
export type SpawnLike = (bin: string, args: string[], options: {
    env: NodeJS.ProcessEnv;
    stdio: ['ignore', 'inherit', 'inherit'];
}) => ChildLike;
export interface ApplyOverrides {
    spawn?: SpawnLike;
    dshHome?: string;
    pathDirs?: string[];
    localBin?: string;
    /** Test-only escape hatch for exercising legacy resolution without package assets. */
    installBundled?: boolean;
    console?: Pick<Console, 'log' | 'error'>;
}
/**
 * Resolve the native shell binary to spawn, in order: explicit config/env →
 * $DSH_HOME/bin → PATH → ~/.local/bin. A path-bearing explicit value must
 * exist (a config error, not a fallback case); a bare name is left for PATH
 * resolution by the OS.
 */
export declare function resolveShellBinary(explicitBin: string | undefined, env?: NodeJS.ProcessEnv, dshHome?: string, pathDirs?: string[], localBin?: string): string | undefined;
export declare function apply(ctx: Context, config: Config, overrides?: ApplyOverrides): void;
