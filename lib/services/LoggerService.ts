import { invoke } from "@tauri-apps/api/core";
import StackTrace from "stacktrace-js";
import { LOGGER_SETTINGS } from "@/constants/logger_settings";

export class LoggerService {
    private initialized = false;
    private isDev = process.env.NODE_ENV === "development";

    constructor() {
        void this.init();
    }

    private async init() {
        if (this.initialized) return;
        // Ensure we are in the browser environment before invoking Tauri commands
        if (typeof window === "undefined") return;

        try {
            // Map TS settings to Rust struct keys (snake_case)
            const settings = {
                log_path: LOGGER_SETTINGS.logPath || null,
                log_type: LOGGER_SETTINGS.logType,
                max_file_size: LOGGER_SETTINGS.maxFileSize,
                console_level: LOGGER_SETTINGS.consoleLevel,
                file_level: LOGGER_SETTINGS.fileLevel,
            };

            await invoke("init_logger_cmd", { settings });
            this.initialized = true;
            console.log("Logger initialized successfully");
        } catch (error) {
            console.error("Failed to initialize logger:", error);
        }
    }

    private async getCallerLocation(from?: string): Promise<string> {
        // Production Mode: Use manual from if provided
        if (!this.isDev && from) {
            return from;
        }

        // Development Mode (or Prod fallback): Try to resolve source location
        if (this.isDev) {
            try {
                const stackframes = await StackTrace.get();
                // 0: getCallerLocation, 1: log method, 2: public method, 3: caller
                const callerFrame = stackframes[3];

                if (callerFrame) {
                    let fileName = callerFrame.fileName || "unknown";

                    // Clean up common Next.js/Webpack prefixes
                    fileName = fileName
                        .replace(/^webpack-internal:\/\/\/\.\//, "")
                        .replace(/^webpack-internal:\/\/\//, "")
                        .replace(/^file:\/\//, "");

                    if (fileName.startsWith("http")) {
                        try {
                            const path = new URL(fileName).pathname;
                            fileName = path.replace(/^\/_next\/static\/chunks\//, "");
                        } catch {}
                    }

                    // Try to find project root relative path
                    const match = fileName.match(
                        /.*[/\\]((?:app|src|components|lib|hooks|constants|types)[/\\].*)/,
                    );
                    if (match?.[1]) {
                        fileName = match[1];
                    }

                    const line = callerFrame.lineNumber || "?";
                    return `${fileName}:${line}`;
                }
            } catch (e) {
                console.warn("Failed to resolve stack trace:", e);
            }
        }

        return from || "unknown";
    }

    private async log(level: string, message: string, from?: string) {
        const location = await this.getCallerLocation(from);

        // Also log to console for dev
        const console_map = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: console.debug.bind(console),
            trace: console.trace.bind(console),
        } as const;
        const custom_console =
            console_map[level as keyof typeof console_map] || console.log.bind(console);
        const prefix = from ? `[${from}]` : "";
        custom_console(`[${level.toUpperCase()}] ${prefix} ${message}`);

        try {
            await invoke("log_frontend_message", {
                level,
                message,
                location,
            });
        } catch (error) {
            console.error("Failed to send log to backend:", error);
        }
    }

    public async info(message: string, from?: string) {
        await this.log("info", message, from);
    }

    public async warn(message: string, from?: string) {
        await this.log("warn", message, from);
    }

    public async error(message: string, from?: string) {
        await this.log("error", message, from);
    }

    public async debug(message: string, from?: string) {
        await this.log("debug", message, from);
    }

    public async trace(message: string, from?: string) {
        await this.log("trace", message, from);
    }
}

export const Logger = new LoggerService();
