import { Redis } from 'ioredis'
import { Application } from '../application'
import { Session } from '../modules/session'
import { FrontendServer } from '../server/frontend/frontend'

export class ChannelService {
    private redis: Redis
    constructor(private app: Application) {
        this.redis = new Redis(process.env.TSINGTAO_MASTER || 'redis://localhost:6379', { keyPrefix: 'tsingtao:channel:' })
    }

    async add(channel: string, session: Session) {
        await this.redis.sadd(channel, JSON.stringify({ id: session.id, uid: session.binded, frontend: session.frontend }))
        session.binded && (await this.redis.sadd(session.binded, channel))
    }

    async leave(channel: string, session: Session) {
        await this.redis.srem(channel, JSON.stringify({ id: session.id, uid: session.binded, frontend: session.frontend }))
        session.binded && (await this.redis.srem(session.binded, channel))
    }

    async broadcast(channel: string, event: string, msg: any, opts: any) {
        const sessions = await this.members(channel)
        const servers: { [ids: string]: string[] } = {}
        for (let i = 0; i < sessions.length; i++) {
            if (!servers[sessions[i].frontend]) servers[sessions[i].frontend] = []
            servers[sessions[i].frontend].push(sessions[i].id)
        }
        for (let sid in servers) {
            if (sid === this.app.id) {
                const sessions = (this.app.server as FrontendServer).sessions
                sessions.forEach((session) => {
                    session.sendJson({ event, body: msg })
                })
            } else {
                const client = this.app.sessionService.getRemoteRpcClient(sid)
                if (client) {
                    return await new Promise((resolve, reject) => {
                        client.PushMessage(
                            { ids: servers[sid], event, message: typeof msg === 'object' ? JSON.stringify(msg) : msg.toString() },
                            (err: Error, response: { failed: string[] }) => {
                                if (err) {
                                    this.app.sessionService.remRemoteRpcClient(sid)
                                    return reject(err)
                                }
                                return resolve(response)
                            }
                        )
                    })
                }
            }
        }
    }

    async members(channel: string) {
        return (await this.redis.smembers(channel)).map((s) => JSON.parse(s) as { id: string; uid: string; frontend: string })
    }

    async channels(uid: string) {
        return await this.redis.smembers(uid)
    }
}
