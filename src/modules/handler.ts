import { readdirSync, statSync } from 'fs'
import { getLogger } from 'log4js'
import { basename, join } from 'path'

const logger = getLogger('tsingtao')
export default class Handler {
    methods: Map<string, { [ids: string]: Function | Object | string }> = new Map()
    constructor(public dir: string) {}

    async load() {
        const files = readdirSync(this.dir)
        files.forEach((file) => {
            const stat = statSync(join(this.dir, file))
            if (stat && stat.isFile() && file.endsWith('.js')) {
                try {
                    this.methods.set(basename(file, '.js'), require(join(this.dir, file)))
                } catch (err: any) {
                    logger.warn('load handler failed', { error: err.message, file })
                }
            }
        })
    }
}
