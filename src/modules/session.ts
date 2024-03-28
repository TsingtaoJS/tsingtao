import { reduce } from 'lodash'
import { getLogger } from 'log4js'
import { EventEmitter } from 'stream'
import { Application } from '../application'

const logger = getLogger('session')

export class Session extends EventEmitter {
    private _settings: { [ids: string]: string } = {}
    constructor(id: string | undefined, protected app: Application) {
        super()
        if (id) this.set('id', id)
    }

    get id() {
        return this._settings.id as string
    }

    get binded() {
        return this._settings.uid as string | undefined
    }

    get frontend() {
        return this._settings.frontend
    }

    get headers() {
        return this._settings.headers ? JSON.parse(this._settings.headers) : {}
    }

    get status() {
        return this._settings.status
    }

    async sync() {
        if (!this.id) return null

        this._settings = (await this.app.sessionService.redis.hgetall(this.id)) || {}
        return this
    }

    async save(keys?: string[]) {
        if (!this.id) return

        if (keys && keys.length) {
            const updates = reduce(
                keys,
                (obj: { [ids: string]: string }, key) => {
                    obj[key] = this._settings[key]
                    return obj
                },
                {}
            )
            if ((await this.ttl()) >= -1) {
                return await this.app.sessionService.redis.hmset(this.id, updates)
            }
        } else {
            return await this.app.sessionService.redis.hmset(this.id, this._settings)
        }
    }

    async ttl() {
        if (this.id) return await this.app.sessionService.redis.ttl(this.id)
        return -1
    }

    async remove(key?: string) {
        if (!this.id) return

        if (key) {
            delete this._settings[key]
            this.app.sessionService.redis.hdel(this.id, key)
            return
        }
        this.expire()
    }

    async expire(delay: number = 3600 * 24 * 7) {
        if (!this.id) return

        this.app.sessionService.redis.expire(this.id, delay)
    }

    set(key: string, value: string) {
        this._settings[key] = value
        return this
    }

    get(key: string) {
        return this._settings[key]
    }

    bind(uid: string) {
        this._settings.uid = uid
        return this
    }

    async kickout(reason: string) {
        return await this.close(2000, reason)
    }

    async close(code: number, reason?: string) {
        if (!this.id) {
            logger.debug('ignore session close without id', { code, reason })
            return
        }

        const frontend = this.app.sessionService.getRemoteRpcClient(this.frontend)
        if (!frontend) {
            logger.debug('ignore session close without client', { code, reason })
            return
        }

        return await new Promise((resolve) => {
            frontend.Close({ id: this.id, code, reason }, (err: Error, response: { success: boolean }) => {
                if (err) {
                    logger.warn('session close failed', { id: this.id, code, reason, message: err.message })
                    this.app.sessionService.remRemoteRpcClient(this.frontend)
                    return false
                }
                return resolve(response.success)
            })
        })
    }

    async setCookie(key: string, value: string, expires: number) {
        if (!this.id) return

        const frontend = this.app.sessionService.getRemoteRpcClient(this.frontend)
        if (!frontend) return
        return await new Promise((resolve) => {
            frontend.SetCookie({ id: this.id, key, value, expires }, (err: Error, response: { success: boolean }) => {
                if (err) {
                    this.app.sessionService.remRemoteRpcClient(this.frontend)
                    return false
                }
                return resolve(response.success)
            })
        })
    }

    async pushMessage(event: string, body: any) {
        if (!this.id) return

        const frontend = this.app.sessionService.getRemoteRpcClient(this.frontend)
        if (!frontend) return

        return await new Promise((resolve, reject) => {
            frontend.PushMessage(
                { ids: [this.id], event, message: typeof body === 'object' ? JSON.stringify(body) : body.toString() },
                (err: Error, response: { failed: string[] }) => {
                    if (err) {
                        this.app.sessionService.remRemoteRpcClient(this.frontend)
                        return reject(err)
                    }
                    return resolve(response)
                }
            )
        })
    }
}
