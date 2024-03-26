import { credentials } from '@grpc/grpc-js'
import { getLogger } from 'log4js'
import { hostname } from 'os'
import { join } from 'path'
import { ServerInfo } from '../types'

import { Session } from './modules/session'
import Server from './server/server'

import Handler from './modules/handler'
import Master from './modules/master'
import { ChannelService } from './services/channelservice'
import SessionService from './services/sessionservice'
import { ARGS, getLocalIPAddresses, hash_route } from './utils/constants'
import { PROTOS } from './utils/protos'

declare interface BackwardServerInfo extends ServerInfo {
    backward: any
}

const logger = getLogger('tsingtao')
export class Application {
    workspace: string
    type: string

    version: string
    id: string

    alive: number = Date.now()
    sessionService: SessionService
    channelService: ChannelService

    routes: Map<string, (session: Session, msg: any, servers: ServerInfo[]) => Promise<string | void>> = new Map()
    handler: Handler

    server: Server
    master: Master = new Master(process.env.TSINGTAO_MASTER || 'redis://localhost:6379')
    constructor(opts: { version: string }) {
        this.version = opts.version

        this.workspace = ARGS.workspace || process.argv[1].replace('app.js', '')
        this.type = ARGS.type
        this.id = ARGS.id
        try {
            const main = require.resolve(join(this.workspace, 'apps', 'servers', this.type, 'server.js'))
            this.server = require(main).createServer(this)
        } catch (_) {
            const { createServer } = require(join(this.workspace, 'apps', 'servers', this.type, 'index.js'))
            this.server = createServer(this)
        }
        this.sessionService = new SessionService(this)
        this.channelService = new ChannelService(this)
        this.handler = new Handler(join(this.workspace, 'apps', 'servers', this.type, 'handler'))
    }

    get curServer() {
        return {
            id: this.id,
            version: this.version,
            type: this.type,
            host: getLocalIPAddresses()[0],
            hostname: hostname(),
            port: this.server.port,
            alive: this.alive
        } as ServerInfo
    }

    async start() {
        await this.handler.load().catch(() => {})

        await this.server.start()

        process.nextTick(() => {
            this.master.start(this.curServer)
        })
    }

    route(type: string, fn: (session: Session, msg: any, servers: ServerInfo[]) => Promise<string | void>) {
        this.routes.set(type, fn)
    }

    async handMessage(id: string, service: string, method: string, params: any) {
        const _sevice = this.handler.methods.get(service)
        if (_sevice) {
            const _method = _sevice[method]
            if (_method) {
                if (typeof _method === 'function') {
                    const session = await this.sessionService.getSession(id).sync()
                    return await _method(params, session, { app: this })
                } else {
                    return _method
                }
            }
        }
        return { code: 404, message: 'service not found' }
    }

    async backwardMessage(type: string, session: Session, service: string, method: string, params: any): Promise<any> {
        logger.trace('backward message', { type, session: session.id, service, method, params })
        const servers = this.master.serverTypes[type]
        if (servers) {
            const route = this.routes.get(type) || hash_route
            const id = await route(session, { type, service, method, params }, Object.values(servers))
            if (id && servers[id]) {
                const server = servers[id] as BackwardServerInfo
                if (!server.backward) {
                    const backward = new PROTOS.backward.Backward(`${server.hostname}:${server.port}`, credentials.createInsecure())
                    Object.defineProperty(server, 'backward', { value: backward, enumerable: false, configurable: true })
                    logger.debug('create backward connection', { server })
                }
                if (server.backward) {
                    return await new Promise((resolve) => {
                        const timer = setTimeout(() => resolve({ code: 500, message: 'time out' }), 5000)
                        server.backward.BackwardMessage(
                            { session: session.id, service, method, params: JSON.stringify(params) },
                            (err: any, res: { code?: number; message?: string; body?: string }) => {
                                if (timer) {
                                    clearTimeout(timer)
                                }
                                if (err) {
                                    logger.error('backward message error', { error: err.message })
                                    resolve({ code: 505, message: 'service unavailable' })
                                    delete server.backward
                                } else {
                                    if (res.code) {
                                        resolve({ code: res.code, message: res.message })
                                    } else {
                                        resolve(JSON.parse(res.body || '{}'))
                                    }
                                }
                            }
                        )
                    })
                }
            }
        }
        return { code: 404, message: 'service not found' }
    }
}
