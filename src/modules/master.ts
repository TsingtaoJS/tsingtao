import EventEmitter from 'events'
import { Redis } from 'ioredis'
import { getLogger } from 'log4js'
import { ServerInfo } from '../../types'
import { hash_number } from '../utils/constants'

const logger = getLogger('tsingtao')

export default class Master extends EventEmitter {
    client: Redis
    globalEvent: Redis

    servers: { [ids: string]: ServerInfo } = {}
    serverTypes: { [types: string]: { [ids: string]: ServerInfo } } = {}
    constructor(uri: string) {
        super()

        this.client = new Redis(uri, { keyPrefix: '{tsingtao}#' })
        this.globalEvent = new Redis(uri, {})

        this.client.once('ready', async () => {
            const servers = await this.client.hvals('servers')
            servers.forEach((one) => {
                const info = JSON.parse(one) as ServerInfo
                this.add(info)
            })
        })

        this.globalEvent.subscribe('online', 'offline')

        this.globalEvent.on('message', (channel, message) => {
            const info = JSON.parse(message) as ServerInfo
            if (channel === 'offline') {
                this.remove(info)
                logger.warn('server offline', info)
            }
            if (channel === 'online') {
                this.add(info)
                logger.warn('server online', info)
            }
        })
    }

    async start(cur: ServerInfo) {
        await this.client.hset('servers', cur.id, JSON.stringify(cur))
        await this.client.hset(`${cur.type}:servers`, cur.id, JSON.stringify(cur))

        process.nextTick(() => {
            this.client.publish('online', JSON.stringify(cur))
        })
    }

    async lost(server: ServerInfo) {
        this.client.hdel('servers', server.id)
        this.client.hdel(`${server.type}:servers`, server.id)
        this.client.publish('offline', JSON.stringify(server))
    }

    add(node: ServerInfo) {
        Object.defineProperty(node, 'hash', { value: hash_number(node.id), enumerable: false, configurable: true })
        if (!this.serverTypes[node.type]) {
            this.serverTypes[node.type] = {}
        }
        this.servers[node.id] = node
        this.serverTypes[node.type][node.id] = node
    }

    remove(node: ServerInfo) {
        delete this.servers[node.id]
        this.serverTypes[node.type] && delete this.serverTypes[node.type][node.id]
    }
}
