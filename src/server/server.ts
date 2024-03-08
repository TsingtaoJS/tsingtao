import * as grpc from '@grpc/grpc-js'
import EventEmitter from 'events'
import { getLogger } from 'log4js'
import { Application } from '../application'

import { freemem, loadavg, totalmem } from 'os'
import { ARGS } from '../utils/constants'
import { PROTOS } from '../utils/protos'

const logger = getLogger('tsingtao')
export default class Server extends EventEmitter {
    rpcServer: grpc.Server
    port: string | number = ARGS.port || '1025'
    constructor(public app: Application) {
        super()

        this.rpcServer = new grpc.Server()
    }

    get status() {
        return {
            id: this.app.id,
            memory: totalmem(),
            free: freemem(),
            loadavg: loadavg(),
        }
    }

    async start() {
        this.rpcServer.addService(PROTOS.monitor.Monitor.service, {
            GetState: (_: any, cb: Function) => cb(null, this.status),
        })

        this.rpcServer.addService(PROTOS.backward.Backward.service, {
            BackwardMessage: async ({ request }: { request: { session: string; service: string; method: string; params: any } }, cb: Function) => {
                const response = await this.app.handMessage(request.session, request.service, request.method, JSON.parse(request.params))
                logger.debug('backward message', { request, response })
                cb(null, { body: typeof response === 'string' ? response : JSON.stringify(response) })
            },
        })

        await new Promise((resolve, reject) => {
            this.rpcServer.bindAsync(`${this.app.curServer.hostname}:${this.port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
                if (err) {
                    logger.error('server listen on failed', { err })
                    return reject(err)
                }
                logger.debug('server listening on', { port })
                resolve(port)
            })
        })
        this.rpcServer.start()
    }

    async shoutdown() {}
}
