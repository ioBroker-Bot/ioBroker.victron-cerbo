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
class VictronCerboAdapter extends adapter_core_1.Adapter {
    client = null;
    constructor(options = {}) {
        super({
            ...options,
            name: 'victron-cerbo',
            ready: () => this.main(),
            unload: async (cb) => {
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
            }
        });
    }
    main() {
        void this.setState('info.connection', false, true);
        this.subscribeStates('*');
        this.client = new client_1.VictronMqttClient(this);
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