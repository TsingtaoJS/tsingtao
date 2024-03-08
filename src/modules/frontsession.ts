import { getLogger } from 'log4js'
import { Socket } from '../../types'
import { Application } from '../application'
import { Session } from './session'

const logger = getLogger('session')

enum Events {
    NORMAL = 0,
    PING = 1,
    PONG = 2,
    HANDSHAKE = 3,
    READY = 4,
    KICK = 5,
    COOKIE = 6,
}

function decode(binary: Buffer) {
    const head = binary.readUInt32BE(0)
    const length = head & 0x00ffffff
    const event = head >> 24
    if (length === binary.length - 4) {
        const body = Buffer.alloc(length)
        binary.copy(body, 0, 4, binary.length)
        return { event, body }
    }
}

function encode(event: number, binary: Buffer) {
    const head = ((event & 0xff) << 24) | (binary.length & 0x00ffffff)
    const headBuffer = Buffer.alloc(4)
    headBuffer.writeUInt32BE(head)
    return Buffer.concat([headBuffer, binary])
}

enum SocketStatus {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

export class FrontSession extends Session {
    constructor(private socket: Socket, app: Application) {
        super(undefined, app)

        socket.on('close', () => {
            this.emit('close')
            if (this.id) {
                this.app.sessionService.redis.publish('session@close', this.id)
            }
        })

        socket.on('message', (binary) => {
            const msg = decode(binary)
            if (msg) {
                if (msg.event === Events.NORMAL) {
                    this.id && this.emit('message', msg.body)
                    return
                }
                if (msg.event === Events.PING) {
                    this.socket.send(encode(Events.PONG, Buffer.alloc(0)))
                    return
                }
                if (msg.event === Events.HANDSHAKE) {
                    try {
                        const body = JSON.parse(msg.body.toString('utf8')) as { version: string; date: number; cookies: { [ids: string]: string } }
                        this.emit('handshake', body)
                    } catch (err) {
                        logger.error('handshake error', err, msg.body.toString('utf8'))
                    }
                    return
                }
            }
        })
    }

    async kickout(reason: string) {
        await this.socket.send(
            encode(
                Events.KICK,
                Buffer.from(
                    JSON.stringify({
                        reason,
                    })
                )
            )
        )
    }

    async close(code: number) {
        if (!this.id) return

        logger.debug('close session', { id: this.id, code })
        if (this.socket.state === SocketStatus.OPEN || this.socket.state === SocketStatus.CONNECTING) {
            this.socket.close(code)
        }
    }

    async setCookie(key: string, value: string, expires: number) {
        this.socket.send(encode(Events.COOKIE, Buffer.from(JSON.stringify({ key, value, expires }))))
        logger.trace('set cookie', { id: this.id, key, value, expires })
    }

    async pushMessage(event: string, body: any) {
        this.sendJson({ event, body })
    }

    send(body: string) {
        this.sendRaw(Buffer.from(body))
    }

    sendJson(body: Object) {
        this.send(JSON.stringify(body))
    }

    sendRaw(body: Buffer) {
        this.socket.send(encode(Events.NORMAL, body))
    }

    ready(o: any) {
        this.socket.send(encode(Events.READY, Buffer.from(JSON.stringify(o))))
    }
}
