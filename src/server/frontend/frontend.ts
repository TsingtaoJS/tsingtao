import { getLogger } from 'log4js'
import { Connector } from '../../../types'
import { Application } from '../../application'

import { v4 } from 'uuid'
import { FrontSession } from '../../modules/frontsession'
import { PROTOS } from '../../utils/protos'
import Server from '../server'
import { decode } from './package'

const logger = getLogger('tsingtao')

export class FrontendServer extends Server {
    sessions: Map<string, FrontSession> = new Map()

    constructor(app: Application, public connector: Connector) {
        super(app)

        connector.on('connection', (socket) => {
            logger.trace('new connection', { ip: socket.address })
            const session = new FrontSession(socket, this.app)
            session.on('close', () => {
                session.remove()
                if (session.id) {
                    this.sessions.delete(session.id)
                }
                logger.debug('session close', { id: session.id })
            })

            session.on('message', (msg) => this.handMessage(session, msg))
            session.on('handshake', async (msg: { version: string; date: number; headers?: object; cookies: { [ids: string]: string } }) => {
                logger.trace('handshake', msg)
                if (session.id) {
                    logger.warn('session inited', { id: session.id })
                    return
                }
                if (msg.cookies.session && msg.cookies.session !== session.id) {
                    const old = await this.app.sessionService.getSession(msg.cookies.session).sync()
                    if (old && (await old.ttl()) >= -1) {
                        //if (old) old.close(3000)
                        logger.debug('session reconnect', { id: msg.cookies.session })
                        session.set('id', msg.cookies.session)
                        await session.sync()
                    }
                }
                if (!session.id) session.set('id', v4())

                msg.headers && session.set('headers', JSON.stringify(msg.headers))
                session.set('frontend', this.app.curServer.id)
                session.setCookie('session', session.id, 3600 * 24 * 7)
                await session.save()

                this.sessions.set(session.id, session)
                logger.debug('session handshake', { id: session.id, headers: msg.headers, cookies: msg.cookies, version: msg.version })
                session.ready({
                    distance: Date.now() - msg.date,
                    binded: session.binded,
                })
            })
        })
    }

    async start() {
        this.rpcServer.addService(PROTOS.session.Session.service, {
            PushMessage: ({ request }: { request: { ids: string[]; event: string; message: string } }, cb: Function) => {
                const failed: string[] = []
                request.ids.forEach((id) => {
                    const session = this.sessions.get(id)
                    if (session) {
                        try {
                            request.message = JSON.parse(request.message)
                        } catch (_) {}
                        session.sendJson({ event: request.event, body: request.message })
                    } else {
                        failed.push(id)
                    }
                })
                cb(null, { failed })
            },
            Broadcast: ({ request }: { request: { event: string; msg: string; opts: { binded: boolean } } }, cb: Function) => {
                let success = 0
                this.sessions.forEach((session) => {
                    try {
                        request.msg = JSON.parse(request.msg)
                    } catch (_) {}
                    session.sendJson({ event: request.event, msg: request.msg })
                    success++
                })
                cb(null, { success })
            },
            SetCookie: ({ request }: { request: { id: string; key: string; value: string; expires: number } }, cb: Function) => {
                const session = this.sessions.get(request.id)
                if (session) {
                    session.setCookie(request.key, request.value, request.expires)
                    cb(null, { success: true })
                } else {
                    cb(null, { success: false })
                }
            },
            Close: ({ request }: any, cb: Function) => {
                logger.trace('close session from back server', request)
                const session = this.sessions.get(request.id)
                if (session) {
                    if (request.reason) {
                        session.kickout(request.reason)
                    } else {
                        session.close(request.code)
                    }
                }
                cb(null, { success: true })
            },
        })

        await super.start()
        this.connector.listen()
    }

    async handMessage(session: FrontSession, msg: Buffer) {
        const { id, route, params } = decode(msg)
        const [type, service, method] = route.split('.')
        logger.debug('hand message', { type, service, method, id, route, params })

        const response =
            type === this.app.type
                ? await this.app.handMessage(session.id, service, method, params)
                : await this.app.backwardMessage(type, session, service, method, params)

        if (response && id) {
            session.sendJson({ body: response, id })
        }
    }
}
