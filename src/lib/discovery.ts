import { Bonjour, type Service } from 'bonjour-service';
import * as mqtt from 'mqtt';

interface DiscoveredDevice {
    name: string;
    host: string;
    ip: string;
    port: number;
    portalId: string;
    model: string;
    firmware: string;
}

/**
 * Discover Victron Cerbo GX devices on the local network via mDNS.
 * Cerbo GX advertises _mqtt._tcp via Avahi/mDNS.
 * After finding MQTT brokers, we briefly connect to check if they are Victron devices.
 */
export async function discoverCerboDevices(adapter: ioBroker.Adapter, timeout?: number): Promise<DiscoveredDevice[]> {
    const discoveryTimeout = timeout || 5000;
    const devices: DiscoveredDevice[] = [];
    const checkedHosts = new Set<string>();

    // Step 1: Find MQTT brokers via mDNS
    const mqttBrokers = await findMqttBrokers(adapter, discoveryTimeout);
    adapter.log.debug(`mDNS found ${mqttBrokers.length} MQTT broker(s)`);

    // Step 2: Connect to each and check if it's a Victron Cerbo
    for (const broker of mqttBrokers) {
        const hostKey = `${broker.ip}:${broker.port}`;
        if (checkedHosts.has(hostKey)) {
            continue;
        }
        checkedHosts.add(hostKey);

        try {
            const device = await probeVictronBroker(adapter, broker.ip, broker.port, broker.name);
            if (device) {
                devices.push(device);
            }
        } catch (err) {
            adapter.log.debug(`Probe failed for ${hostKey}: ${(err as Error).message}`);
        }
    }

    return devices;
}

interface MdnsBroker {
    name: string;
    ip: string;
    port: number;
}

function findMqttBrokers(adapter: ioBroker.Adapter, timeout: number): Promise<MdnsBroker[]> {
    return new Promise(resolve => {
        const brokers: MdnsBroker[] = [];

        const instance = new Bonjour();

        const browser = instance.find({ type: 'mqtt' }, (service: Service) => {
            adapter.log.debug(
                `mDNS found: ${service.name} at ${service.host}:${service.port} addresses=${JSON.stringify(service.addresses)}`,
            );

            // Get IPv4 address
            const ipv4 = service.addresses?.find((addr: string) => addr.includes('.') && !addr.startsWith('169.254'));
            if (ipv4) {
                brokers.push({
                    name: service.name || service.host,
                    ip: ipv4,
                    port: service.port || 1883,
                });
            }
        });

        setTimeout(() => {
            browser.stop();
            instance.destroy();
            resolve(brokers);
        }, timeout);
    });
}

/**
 * Connect briefly to an MQTT broker to verify it's a Victron device.
 * Subscribes to N/+/system/0/Serial and sends a keepalive to trigger a response.
 */
function probeVictronBroker(
    adapter: ioBroker.Adapter,
    ip: string,
    port: number,
    name: string,
): Promise<DiscoveredDevice | null> {
    return new Promise((resolve, _reject) => {
        const probeTimeout = 8000;
        let resolved = false;
        let portalId = '';
        let model = '';
        let firmware = '';

        const client = mqtt.connect(`mqtt://${ip}:${port}`, {
            clientId: `iobroker_victron_probe_${Math.random().toString(16).substring(2, 8)}`,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 0, // no reconnect for probe
        });

        const cleanup = (): void => {
            if (!resolved) {
                resolved = true;
                try {
                    client.end(true);
                } catch {
                    // ignore
                }
            }
        };

        const timer = setTimeout(() => {
            // Timeout - if we got a portalId, it's a Victron device
            if (portalId) {
                resolved = true;
                client.end(true);
                resolve({
                    name,
                    host: name,
                    ip,
                    port,
                    portalId,
                    model,
                    firmware,
                });
            } else {
                cleanup();
                resolve(null);
            }
        }, probeTimeout);

        client.on('connect', () => {
            adapter.log.debug(`Probe connected to ${ip}:${port}`);

            // Subscribe to discovery topics
            client.subscribe([
                'N/+/system/0/Serial',
                'N/+/platform/0/Device/Model',
                'N/+/platform/0/Firmware/Installed/Version',
            ]);

            // Trigger data by sending keepalive with wildcard
            // We don't know the portalId yet, so we send to a broad topic
            client.publish('R/+/keepalive', '');
        });

        client.on('message', (topic: string, message: Buffer) => {
            try {
                const parts = topic.split('/');
                if (parts[0] !== 'N' || parts.length < 4) {
                    return;
                }

                const id = parts[1];
                const payload = JSON.parse(message.toString());
                const value = payload.value;

                if (topic.endsWith('/system/0/Serial')) {
                    portalId = String(value || id);
                    adapter.log.debug(`Probe: found portalId=${portalId}`);

                    // Now that we know the portalId, request more info
                    client.publish(`R/${portalId}/system/0/Serial`, '');
                } else if (topic.endsWith('/Device/Model')) {
                    model = String(value || '');
                } else if (topic.endsWith('/Firmware/Installed/Version')) {
                    firmware = String(value || '');
                }

                // If we have all info, resolve early
                if (portalId && model) {
                    clearTimeout(timer);
                    resolved = true;
                    client.end(true);
                    resolve({
                        name: model || name,
                        host: name,
                        ip,
                        port,
                        portalId,
                        model,
                        firmware,
                    });
                }
            } catch {
                // ignore parse errors
            }
        });

        client.on('error', () => {
            clearTimeout(timer);
            cleanup();
            resolve(null);
        });
    });
}
