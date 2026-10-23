type ConsoleMethod = 'log' | 'error' | 'warn' | 'info' | 'debug';
type ConsoleFunction = (...args: any[]) => void;
type FilterPattern = string | RegExp;

interface OriginalMethods {
    log: ConsoleFunction;
    error: ConsoleFunction;
    warn: ConsoleFunction;
    info: ConsoleFunction;
    debug: ConsoleFunction;
}

export class ConsoleFilter {
    private filterPatterns: RegExp[];
    private originalMethods: OriginalMethods;
    private active: boolean;

    constructor(filterPatterns: FilterPattern[] = []) {
        this.filterPatterns = filterPatterns.map(pattern => 
            pattern instanceof RegExp ? pattern : new RegExp(pattern, "i")
        );
        
        this.originalMethods = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info,
            debug: console.debug
        };

        this.active = false;
    }

    addFilter(pattern: FilterPattern): this {
        if (pattern instanceof RegExp) {
            this.filterPatterns.push(pattern);
        } else {
            this.filterPatterns.push(new RegExp(pattern, "i"));
        }

        if (this.active) {
            this.enable();
        }

        return this;
    }

    removeFilter(pattern: FilterPattern): this {
        const patternStr = pattern instanceof RegExp ? pattern.toString() : pattern;
        this.filterPatterns = this.filterPatterns.filter(
            p => p.toString() !== patternStr
        );

        if (this.active) {
            this.enable();
        }

        return this;
    }

    clearFilters(): this {
        this.filterPatterns = [];

        if (this.active) {
            this.enable();
        }

        return this;
    }

    private shouldFilter(args: any[]): boolean {
        if (this.filterPatterns.length === 0) return false;

        return args.some(arg => {
            const stringArg = String(arg);
            return this.filterPatterns.some(pattern =>
                stringArg.match(pattern)
            );
        });
    }

    enable(): this {
        this.originalMethods = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info,
            debug: console.debug
        };

        console.log = (...args: any[]): void => {
            if (!this.shouldFilter(args)) {
                this.originalMethods.log.apply(console, args);
            }
        };

        console.error = (...args: any[]): void => {
            if (!this.shouldFilter(args)) {
                this.originalMethods.error.apply(console, args);
            }
        };

        console.warn = (...args: any[]): void => {
            if (!this.shouldFilter(args)) {
                this.originalMethods.warn.apply(console, args);
            }
        };

        console.info = (...args: any[]): void => {
            if (!this.shouldFilter(args)) {
                this.originalMethods.info.apply(console, args);
            }
        };

        console.debug = (...args: any[]): void => {
            if (!this.shouldFilter(args)) {
                this.originalMethods.debug.apply(console, args);
            }
        };

        this.active = true;
        return this;
    }

    disable(): this {
        (Object.keys(this.originalMethods) as ConsoleMethod[]).forEach(method => {
            (console as any)[method] = this.originalMethods[method];
        });

        this.active = false;
        return this;
    }

    toggle(): this {
        return this.active ? this.disable() : this.enable();
    }

    isActive(): boolean {
        return this.active;
    }

    getFilterPatterns(): RegExp[] {
        return [...this.filterPatterns];
    }

    getFilterCount(): number {
        return this.filterPatterns.length;
    }
}

export default ConsoleFilter;