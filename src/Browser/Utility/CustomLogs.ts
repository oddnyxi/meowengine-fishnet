interface LogLevel {
  name: string;
  priority: number;
  color: string;
}

interface LogLevels {
  DEBUG: LogLevel;
  INFO: LogLevel;
  WARN: LogLevel;
  ERROR: LogLevel;
  SUCCESS: LogLevel;
  JOIN: LogLevel;
  LEAVE: LogLevel;
  MEOW: LogLevel;
}

interface CustomLogsOptions {
  title?: string;
  minLevel?: string;
  enabled?: boolean;
  showTimestamp?: boolean;
}

/**
 * CustomLogs - A customizable logger for browser environments
 * Features:
 * - Colored log outputs based on log level
 * - Customizable app title
 * - Timestamp prefixing
 * - Multiple log levels (debug, info, warn, error, success)
 * - Log filtering by minimum level
 * - Group logging support
 * - Ability to disable logs
 */
export class CustomLogs {
  // Available log levels
  static LEVELS: LogLevels = {
    DEBUG: { name: "DEBUG", priority: 0, color: "#9B9B9B" },
    INFO: { name: "INFO", priority: 1, color: "#3498DB" },
    WARN: { name: "WARN", priority: 2, color: "#F39C12" },
    ERROR: { name: "ERROR", priority: 3, color: "#E74C3C" },
    SUCCESS: { name: "SUCCESS", priority: 4, color: "#2ECC71" },
    JOIN: { name: "JOIN", priority: 5, color: "#9B59B6" },
    LEAVE: { name: "LEAVE", priority: 5, color: "#34495E" },
    MEOW: { name: "MEOW", priority: 6, color: "#00ffaa" },
  };

  private title: string;
  private minLevel: LogLevel;
  private enabled: boolean;
  private showTimestamp: boolean;

  constructor(options: CustomLogsOptions = {}) {
    this.title = options.title || "APP";
    this.minLevel = options.minLevel
      ? CustomLogs.LEVELS[options.minLevel as keyof LogLevels]
      : CustomLogs.LEVELS.DEBUG;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.showTimestamp =
      options.showTimestamp !== undefined ? options.showTimestamp : true;
  }

  private _getTimestamp(): string {
    const now: Date = new Date();
    const hours: string = String(now.getHours()).padStart(2, "0");
    const minutes: string = String(now.getMinutes()).padStart(2, "0");
    const seconds: string = String(now.getSeconds()).padStart(2, "0");
    const milliseconds: string = String(now.getMilliseconds()).padStart(3, "0");

    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  private _formatLogPrefix(level: LogLevel): (string | any)[] {
    const parts: any[] = [];
    let formatString: string = "";

    if (this.showTimestamp) {
      formatString += "%c[%s]";
      parts.push("color: #888; font-weight: bold;", this._getTimestamp());
    }

    formatString += "%c[%s]";
    parts.push(`color: #00ffaa; font-weight: bold;`, this.title);

    formatString += "%c[%s]:%c";
    parts.push(
      `color: ${level.color}; font-weight: bold;`,
      level.name,
      "color: inherit;"
    );

    return [formatString, ...parts];
  }

  private _log(level: LogLevel, ...args: any[]): void {
    if (!this.enabled || level.priority < this.minLevel.priority) {
      return;
    }

    const logPrefix: (string | any)[] = this._formatLogPrefix(level);
    console.log(...logPrefix, ...args);
  }

  join(username: string, details: Record<string, any> = {}): void {
    const message: string = `${username} joined`;

    if (Object.keys(details).length > 0) {
      this._log(CustomLogs.LEVELS.JOIN, message, details);
    } else {
      this._log(CustomLogs.LEVELS.JOIN, message);
    }
  }

  leave(username: string, reason: string = "", details: Record<string, any> = {}): void {
    let message: string = `${username} left`;
    if (reason) {
      message += ` (${reason})`;
    }

    if (Object.keys(details).length > 0) {
      this._log(CustomLogs.LEVELS.LEAVE, message, details);
    } else {
      this._log(CustomLogs.LEVELS.LEAVE, message);
    }
  }

  debug(...args: any[]): void {
    this._log(CustomLogs.LEVELS.DEBUG, ...args);
  }

  info(...args: any[]): void {
    this._log(CustomLogs.LEVELS.INFO, ...args);
  }

  warn(...args: any[]): void {
    this._log(CustomLogs.LEVELS.WARN, ...args);
  }

  error(...args: any[]): void {
    this._log(CustomLogs.LEVELS.ERROR, ...args);
  }

  success(...args: any[]): void {
    this._log(CustomLogs.LEVELS.SUCCESS, ...args);
  }

  group(groupName: string, level: LogLevel = CustomLogs.LEVELS.INFO, callback?: () => void): void {
    if (!this.enabled || level.priority < this.minLevel.priority) {
      return;
    }

    const logPrefix: (string | any)[] = this._formatLogPrefix(level);
    console.groupCollapsed(...logPrefix, groupName);

    if (typeof callback === "function") {
      callback();
    }

    console.groupEnd();
  }

  setMinLevel(levelName: keyof LogLevels): void {
    if (CustomLogs.LEVELS[levelName]) {
      this.minLevel = CustomLogs.LEVELS[levelName];
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = !!enabled;
  }

  setTitle(title: string): void {
    this.title = title;
  }
}

export default CustomLogs;