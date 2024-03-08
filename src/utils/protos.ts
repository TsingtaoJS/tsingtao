import * as grpc from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { join } from 'path'

function load(name: string) {
    return grpc.loadPackageDefinition(loadSync(join(__dirname, '../../protos/', name)))
}

export const PROTOS: { [ids: string]: any } = {
    session: load('session.proto').session,
    monitor: load('monitor.proto').monitor,
    backward: load('backward.proto').backward,
}

export function createClient(uri: string, proto: string) {
    return new (PROTOS[proto] as any)[proto](uri, grpc.credentials.createInsecure())
}
