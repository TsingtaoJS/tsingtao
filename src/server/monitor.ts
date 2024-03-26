import * as grpc from '@grpc/grpc-js'
import { getLogger } from 'log4js'
import { ServerInfo } from '../../types'
import { Application } from '../application'
import { PROTOS } from '../utils/protos'
import Server from './server'

const logger = getLogger('monitor')

declare interface RetriesInfo extends ServerInfo {
    retries?: number
    monitor?: any
}

export class MonitorServer extends Server {
    constructor(public app: Application) {
        super(app)

        this.on('health', this.checklist.bind(this))
    }

    async start() {
        super.start()
        process.nextTick(() => this.checklist(true))
    }

    async checklist(immediate?: boolean) {
        for (let i in this.app.master.servers) {
            let server = this.app.master.servers[i] as RetriesInfo
            if (server.id == this.app.id) {
                continue
            }
            if (!server.monitor) {
                const uri = `${server.hostname}:${server.port}`
                const monitor = new PROTOS.monitor.Monitor(uri, grpc.credentials.createInsecure())
                Object.defineProperty(server, 'monitor', { value: monitor, enumerable: false, configurable: true })
                logger.debug('connect to ', { uri })
            }
            if (server.monitor) {
                const req = server.monitor.GetState({ from: this.app.id }, (err: Error, response: any) => {
                    if (err) {
                        logger.error('server get state failed', { server, error: err.message })
                        return
                    }
                    logger.debug('server get state', { id: server.id, response })
                })
                req.on('status', (status: any) => {
                    if (status.code === 0) return delete server.retries
                    logger.warn('server status has an error', { code: status.code, details: status.details })
                    if (immediate || (server.retries && server.retries > 2)) this.app.master.lost(server)
                    server.retries = (server.retries || 0) + 1
                })
            }
        }

        setTimeout(() => this.emit('health'), 5000)
    }
}
