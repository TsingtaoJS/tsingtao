import { Application } from '../../application'
import Server from '../server'

export class BackendServer extends Server {
    constructor(app: Application) {
        super(app)
    }
}
