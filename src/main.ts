/**
 *      ioBroker victron-cerbo Adapter
 *
 *      (c) 2026 Denis Haev
 *
 *      MIT License
 */
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import { VictronMqttClient } from './lib/client';
import { CerboWebServer } from './lib/webServer';
import type { VictronCerboAdapterConfig } from './types';

export class VictronCerboAdapter extends Adapter {
    declare config: VictronCerboAdapterConfig;
    client: VictronMqttClient | null = null;
    webServer: CerboWebServer | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'victron-cerbo',
            ready: () => this.main(),
            unload: async (cb?: () => void): Promise<void> => {
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
            stateChange: (id: string, state: ioBroker.State | null | undefined): void => {
                if (state && !state.ack) {
                    this.client
                        ?.onStateChange(id, state)
                        .catch(err => this.log.error(`Cannot process state change: ${err.message}`));
                }
            },
        });
    }

    private main(): void {
        void this.setState('info.connection', false, true);
        this.subscribeStates('*');
        this.client = new VictronMqttClient(this as ioBroker.Adapter);
        this.startWebServer();
    }

    /** Web server for the tab in admin, which shows the web interface of the Cerbo */
    private startWebServer(): void {
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
        this.webServer = new CerboWebServer(this as ioBroker.Adapter, this.config.mqttHost, port, this.config.bind);
        void this.webServer.start();
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<AdapterOptions> | undefined) => new VictronCerboAdapter(options);
} else {
    (() => new VictronCerboAdapter())();
}
