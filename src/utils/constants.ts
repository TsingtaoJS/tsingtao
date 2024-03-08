import { crc32 } from 'crc'
import { createHash } from 'crypto'
import { sample } from 'lodash'
import { hostname, networkInterfaces } from 'os'
import { ServerInfo } from '../../types'

declare interface HashSever extends ServerInfo {
    hash: number
}

const yargsparser = require('yargs-parser')
const argv = yargsparser(process.argv.slice(2))
export const ARGS = {
    id: (argv.i || argv.id || `${argv.t || argv.type}-${hostname()}`) as string,
    port: (argv.p || argv.port) as string | undefined,
    workspace: (argv.d || argv.dir) as string | undefined,
    type: (argv.t || argv.type) as string,
}

export function getLocalIPAddresses() {
    const interfaces = networkInterfaces()
    const addresses: string[] = []

    for (const interfaceName in interfaces) {
        const _interface = interfaces[interfaceName]
        if (!_interface) continue

        for (const network of _interface) {
            if (network.family === 'IPv4' && !network.internal) {
                addresses.push(network.address)
            }
        }
    }
    return addresses.filter((address) => address !== '127.0.0.1' && address !== 'localhost')
}

export function hash_number(str: string, maxnum: number = 100000) {
    return crc32(createHash('md5').update(str).digest('hex')) % maxnum
}

export function sample_route(session: { id: string; frontend: string; uid?: string }, msg: any, servers: ServerInfo[]) {
    const taret = sample(servers)
    if (taret) {
        return taret.id
    }
}

export function hash_route(session: { id: string; frontend: string; uid?: string }, msg: any, servers: ServerInfo[]) {
    const hash = hash_number(session.uid || session.id)
    const taeget = servers.find((one) => (one as HashSever).hash >= hash) || servers[servers.length - 1]
    if (taeget) {
        return taeget.id
    }
}
