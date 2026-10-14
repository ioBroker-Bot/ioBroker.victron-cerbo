"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VictronCerboAdapter = void 0;
/**
 *      ioBroker victron-cerbo Adapter
 *
 *      (c) 2026 Denis Haev
 *
 *      MIT License
 */
const adapter_core_1 = require("@iobroker/adapter-core");
const client_1 = require("./lib/client");
const webServer_1 = require("./lib/webServer");
class VictronCerboAdapter extends adapter_core_1.Adapter {
    client = null;
    webServer = null;
    constructor(options = {}) {
        super({
            ...options,
            name: 'victron-cerbo',
            ready: () => this.main(),
            unload: async (cb) => {
                if (this.webServer) {
                    await this.webServer.stop();
                    this.webServer = null;
                }
                if (this.client) {
                    await this.client.destroy();
                    this.client = null;
                }
                await this.setStateAsync('info.connection', false, true);
                if (typeof cb === 'function') {
                    cb();
                }
            },
            stateChange: (id, state) => {
                if (state && !state.ack) {
                    this.client
                        ?.onStateChange(id, state)
                        .catch(err => this.log.error(`Cannot process state change: ${err.message}`));
                }
            },
        });
    }
    main() {
        void this.setState('info.connection', false, true);
        this.subscribeStates('*');
        this.client = new client_1.VictronMqttClient(this);
        this.startWebServer();
    }
    /** Web server for the tab in admin, which shows the web interface of the Cerbo */
    startWebServer() {
        if (!this.config.webServer) {
            return;
        }
        if (!this.config.mqttHost) {
            this.log.warn('No address of the Cerbo configured, its web interface is not shown in admin');
            return;
        }
        const port = parseInt(String(this.config.port), 10);
        if (!(port > 0 && port < 65536)) {
            this.log.warn(`Invalid port "${this.config.port}" for the web server of the Cerbo`);
            return;
        }
        this.webServer = new webServer_1.CerboWebServer(this, this.config.mqttHost, port, this.config.bind);
        void this.webServer.start();
    }
}
exports.VictronCerboAdapter = VictronCerboAdapter;
if (require.main !== module) {
    module.exports = (options) => new VictronCerboAdapter(options);
}
else {
    (() => new VictronCerboAdapter())();
}
//# sourceMappingURL=main.js.map