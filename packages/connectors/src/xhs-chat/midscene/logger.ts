// 极简 stderr logger，替换 mcp-xhs-chat 的 pino + 文件日志实现。
// 进程内运行不需要 MCP 那套 stdout 抑制 hack，也不写日志文件。

type LogFn = (...args: unknown[]) => void;

export interface ToolLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

function emit(level: string, tool: string, args: unknown[]): void {
  const time = new Date().toISOString();
  // 统一写到 stderr，避免污染调用方 stdout。
  // eslint-disable-next-line no-console
  console.error(`[${time}] [${level}] [${tool}]`, ...args);
}

export function createToolLogger(toolName: string): ToolLogger {
  return {
    info: (...args) => emit("info", toolName, args),
    warn: (...args) => emit("warn", toolName, args),
    error: (...args) => emit("error", toolName, args),
    debug: (...args) => emit("debug", toolName, args),
  };
}
