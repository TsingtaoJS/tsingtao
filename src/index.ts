import { Application } from './application'

export { BackendServer } from './server/backend/backend'
export { FrontendServer } from './server/frontend/frontend'
export { MonitorServer } from './server/monitor'
export { ARGS } from './utils/constants'

namespace Tsingtao {
    export let app: Application
    export function createApp(opts: { version: string }) {
        if (!app) app = new Application(opts)
        return app
    }
}

export default Tsingtao
