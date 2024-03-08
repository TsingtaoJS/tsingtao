export function decode(binary: Buffer) {
    return JSON.parse(binary.toString('utf8')) as { id: number; route: string; params: any }
}

export function encode(id: number, route: string, params: any) {
    return Buffer.from(JSON.stringify({ id, route, params }))
}
