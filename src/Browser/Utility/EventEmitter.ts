type EventListener<T = any> = (data: T) => void;

interface Events {
    [event: string]: EventListener[];
}

export class EventEmitter {
    private events: Events;

    constructor() {
        this.events = {};
    }

    addListener<T = any>(event: string, listener: EventListener<T>): void {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }

    removeListener<T = any>(event: string, listener: EventListener<T>): void {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(l => l !== listener);
    }

    emit<T = any>(event: string, data: T): void {
        if (!this.events[event]) return;
        this.events[event].forEach(listener => listener(data));
    }
}

export default EventEmitter;