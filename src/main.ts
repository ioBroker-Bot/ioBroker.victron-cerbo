/**
 *      ioBroker victron-cerbo Adapter
 *
 *      (c) 2026 Denis Haev
 *
 *      MIT License
 */
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import { VictronMqttClient } from './lib/client';
import type { VictronCerboAdapterConfig } from './types';

export class VictronCerboAdapter extends Adapter {
    declare config: VictronCerboAdapterConfig;
    client: VictronMqttClient | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'victron-cerbo',
            ready: () => this.main(),
            unload: async (cb?: () => void): Promise<void> => {
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
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<AdapterOptions> | undefined) => new VictronCerboAdapter(options);
} else {
    (() => new VictronCerboAdapter())();
}
