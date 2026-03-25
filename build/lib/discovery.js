"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverCerboDevices = discoverCerboDevices;
const bonjour_service_1 = require("bonjour-service");
const mqtt = __importStar(require("mqtt"));
/**
 * Discover Victron Cerbo GX devices on the local network via mDNS.
 * Cerbo GX advertises _mqtt._tcp via Avahi/mDNS.
 * After finding MQTT brokers, we briefly connect to check if they are Victron devices.
 */
async function discoverCerboDevices(adapter, timeout) {
    const discoveryTimeout = timeout || 5000;
    const devices = [];
    const checkedHosts = new Set();
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
        }
        catch (err) {
            adapter.log.debug(`Probe failed for ${hostKey}: ${err.message}`);
        }
    }
    return devices;
}
function findMqttBrokers(adapter, timeout) {
    return new Promise(resolve => {
        const brokers = [];
        const instance = new bonjour_service_1.Bonjour();
        const browser = instance.find({ type: 'mqtt' }, (service) => {
            adapter.log.debug(`mDNS found: ${service.name} at ${service.host}:${service.port} addresses=${JSON.stringify(service.addresses)}`);
            // Get IPv4 address
            const ipv4 = service.addresses?.find((addr) => addr.includes('.') && !addr.startsWith('169.254'));
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
function probeVictronBroker(adapter, ip, port, name) {
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
        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                try {
                    client.end(true);
                }
                catch {
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
            }
            else {
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
        client.on('message', (topic, message) => {
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
                }
                else if (topic.endsWith('/Device/Model')) {
                    model = String(value || '');
                }
                else if (topic.endsWith('/Firmware/Installed/Version')) {
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
            }
            catch {
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
//# sourceMappingURL=discovery.js.map