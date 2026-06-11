declare module "tmi.js" {
  export interface ChatUserstate {
    id?: string;
    "user-id"?: string;
    "display-name"?: string;
    username?: string;
    color?: string;
    [key: string]: unknown;
  }
  export class Client {
    constructor(opts: Record<string, unknown>);
    on(event: string, handler: (...args: unknown[]) => void): void;
    connect(): Promise<[string, number]>;
    disconnect(): Promise<[string, number]>;
  }
}
