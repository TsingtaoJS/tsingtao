import { credentials } from '@grpc/grpc-js'
import EventEmitter from 'events'
import { Redis } from 'ioredis'
import { getLogger } from 'log4js'
import { ServerInfo } from '../../types'
import { Application } from '../application'
import { Session } from '../modules/session'
import { FrontendServer } from '../server/frontend/frontend'
import { PROTOS } from '../utils/protos'

declare interface FrontendInfo extends ServerInfo {
    session?: any
}

const logger = getLogger('tsingtao')
export default class SessionService extends EventEmitter {
    redis: Redis

    globalEventListener: Redis
    _listeners: Map<string, EventEmitter> = new Map()
    constructor(private app: Application) {
        super()

        this.redis = new Redis(process.env.TSINGTAO_MASTER || 'redis://localhost:6379', { keyPrefix: 'tsingtao:session:' })
        this.globalEventListener = new Redis(process.env.TSINGTAO_MASTER || 'redis://localhost:6379')
        this.globalEventListener.psubscribe('session@*')
        this.globalEventListener.on('pmessage', (pattern, channel, message) => {
            if (channel === 'session@close') {
                const listener = this._listeners.get(message)
                if (listener) {
                    listener.emit('close')
                    process.nextTick(() => this._listeners.delete(message))
                }
            }
        })
    }

    getSession(id: string) {
        if (this.app.server instanceof FrontendServer) {
            const s = this.app.server.sessions.get(id)
            if (s) return s
        }

        return new Session(id, this.app)
    }

    async broadcast(stype: string, event: string, msg: any, opts: any) {
        for (let i in this.app.master.serverTypes[stype]) {
            const server = this.app.master.serverTypes[stype][i]
            if (server.id !== this.app.curServer.id) {
                const client = this.getRemoteRpcClient(server.id)
                if (!client) continue
                client.Broadcast({ event, msg: JSON.stringify(msg), opts }, (err: Error) => {
                    if (err) {
                        this.remRemoteRpcClient(server.id)
                        return
                    }
                })
            } else {
                const sessions = (this.app.server as FrontendServer).sessions
                sessions.forEach((session) => {
                    session.sendJson({ event, body: msg })
                })
            }
        }
    }

    getRemoteRpcClient(id: string) {
        const frontend = this.app.master.servers[id] as FrontendInfo
        if (!frontend) {
            logger.warn(`getRemoteRpcClient failed`, { id, servers: Object.keys(this.app.master.servers) })
            return
        }

        if (frontend && !frontend.session) {
            Object.defineProperty(frontend, 'session', {
                value: new PROTOS.session.Session(`${frontend.hostname}:${frontend.port}`, credentials.createInsecure()),
                enumerable: false,
                configurable: true
            })
        }
        return frontend.session
    }

    remRemoteRpcClient(id: string) {
        const frontend = this.app.master.servers[id] as FrontendInfo
        if (frontend) {
            delete frontend.session
        }
    }
}
