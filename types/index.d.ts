export declare interface ServerInfo {
    id: string
    host: string
    hostname: string
    port: string | number
    type: string
    version: string
    alive: number
}

export declare interface Session {
    readonly id: string
    readonly binded: string
    readonly frontend: string
    readonly headers: { [ids: string]: any }

    sync(): Promise<Session>
    save(keys?: string[]): Promise<'OK' | undefined>

    ttl(): Promise<number>
    remove(key?: string): Promise<void>
    expire(delay?: number): Promise<void>

    set(key: string, value: string): Session
    get(key: string): string | undefined

    setCookie(key: string, value: string, exipres: number): Promise<void>
    pushMessage(event: string, msg: any): Promise<void>
    kickout(reason: string): Promise<void>

    close(code: number, reason?: string): Promise<void>

    on(event: 'close', listener: () => void): this
    once(event: 'close', listener: () => void): this
}

export declare interface SessionService {
    getSession(id: string): Session
    broadcast(stype: string, event: string, msg: any): Promise<void>
}

export declare interface ChannelService {
    add(channel: string, session: Session): Promise<void>
    leave(channel: string, session: Session): Promise<void>
    broadcast(channel: string, event: string, msg: any, opts: any): Promise<void>
    members(channel: string): Promise<{ id: string; uid: string; frontend: string }[]>
    channels(uid: string): Promise<string[]>
}

export declare interface Application {
    id: string
    type: string
    workspace: string
    version: string
    sessionService: SessionService
    channelService: ChannelService
    alive: number
    readonly curServer: ServerInfo

    start(): void
    route(
        type: string,
        fn: (session: Session, msg: { type: string; service: string; method: string; params: any }, servers: ServerInfo[]) => Promise<string | undefined>
    ): void
}

export declare interface Socket {
    readonly address: string
    readonly live: number
    readonly state: number

    send(binary: Buffer): number
    close(code: number): void

    on(event: 'message', listener: (binary: Buffer) => void): this
    on(event: 'close', listener: () => void): this
    on(event: 'timeout', listener: () => void): this
}

export declare interface Connector {
    on(event: 'connection', listener: (socket: Socket) => void): this
    listen(port?: string): void
    shoutdown(): void
}

export declare class FrontendServer {
    constructor(app: Application, connector: Connector)

    start(): Promise<void>

    shoutdown(): Promise<void>
}

export declare class MonitorServer {
    constructor(app: Application)

    start(): Promise<void>

    shoutdown(): Promise<void>
}

export declare class BackendServer {
    constructor(app: Application)

    start(): Promise<void>

    shoutdown(): Promise<void>
}

export declare const ARGS: {
    id: string
    port: string | undefined
    workspace: string | undefined
    type: string
}

declare namespace Tsingtao {
    export function createApp(opts: { version: string }): Application
}

export default Tsingtao
