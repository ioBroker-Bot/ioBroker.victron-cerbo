/**
 *      ioBroker victron-cerbo Adapter
 *
 *      (c) 2026 Denis Haev
 *
 *      MIT License
 */
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import { VictronMqttClient } from './lib/client';
import { discoverCerboDevices } from './lib/discovery';
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
            message: (obj: ioBroker.Message): void => {
                this.onMessage(obj);
            },
        });
    }

    private main(): void {
        this.subscribeStates('*');
        this.client = new VictronMqttClient(this as ioBroker.Adapter);
    }

    private onMessage(obj: ioBroker.Message): void {
        if (!obj?.callback) {
            return;
        }

        if (obj.command === 'discover') {
            this.log.info('Starting Victron Cerbo GX discovery...');
            discoverCerboDevices(this, (obj.message as { timeout?: number })?.timeout)
                .then(devices => {
                    this.log.info(`Discovery found ${devices.length} device(s)`);
                    this.sendTo(obj.from, obj.command, devices, obj.callback);
                })
                .catch(err => {
                    this.log.error(`Discovery error: ${err.message}`);
                    this.sendTo(obj.from, obj.command, { error: err.message }, obj.callback);
                });
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<AdapterOptions> | undefined) => new VictronCerboAdapter(options);
} else {
    (() => new VictronCerboAdapter())();
}
