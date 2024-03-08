import { Application } from './application'

export { BackendServer } from './server/backend/backend'
export { FrontendServer } from './server/frontend/frontend'
export { MonitorServer } from './server/monitor'
export { ARGS } from './utils/constants'

namespace Tsingtao {
    export function createApp(opts: { version: string }) {
        return new Application(opts)
    }
}

export default Tsingtao
