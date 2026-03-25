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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VictronMqttClient = void 0;
const mqtt = __importStar(require("mqtt"));
const knownStates_1 = __importDefault(require("./knownStates"));
const nameInference_1 = require("./nameInference");
const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;
class VictronMqttClient {
    adapter;
    config;
    mqttClient = null;
    keepaliveTimer = null;
    existingObjects = new Set();
    stateTypes = new Map();
    portalId;
    constructor(adapter) {
        this.adapter = adapter;
        this.config = adapter.config;
        this.portalId = (this.config.portalId || '').trim();
        if (!this.config.mqttHost) {
            this.adapter.log.error('No MQTT host configured');
            return;
        }
        this.connect();
    }
    connect() {
        const port = parseInt(String(this.config.mqttPort), 10) || 1883;
        const url = `mqtt://${this.config.mqttHost}:${port}`;
        const options = {
            clientId: this.config.mqttClientId || `iobroker_victron_cerbo_${Math.random().toString(16).substring(2, 10)}`,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 10000,
        };
        if (this.config.user) {
            options.username = this.config.user;
        }
        if (this.config.password) {
            options.password = this.config.password;
        }
        this.adapter.log.info(`Connecting to Victron Cerbo MQTT broker at ${url}`);
        this.mqttClient = mqtt.connect(url, options);
        this.mqttClient.on('connect', () => {
            this.adapter.log.info('Connected to Victron Cerbo MQTT broker');
            void this.adapter.setState('info.connection', true, true);
            this.subscribe();
            this.startKeepalive();
        });
        this.mqttClient.on('message', (topic, message) => {
            this.onMessage(topic, message).catch(err => this.adapter.log.error(`Error processing message: ${err.message}`));
        });
        this.mqttClient.on('error', (err) => {
            this.adapter.log.error(`MQTT error: ${err.message}`);
        });
        this.mqttClient.on('close', () => {
            this.adapter.log.info('MQTT connection closed');
            void this.adapter.setState('info.connection', false, true);
        });
        this.mqttClient.on('offline', () => {
            this.adapter.log.warn('MQTT client offline');
            void this.adapter.setState('info.connection', false, true);
        });
        this.mqttClient.on('reconnect', () => {
            this.adapter.log.debug('MQTT reconnecting...');
        });
    }
    subscribe() {
        if (!this.mqttClient) {
            return;
        }
        if (this.portalId) {
            // Subscribe to all topics for this portal ID
            this.mqttClient.subscribe(`N/${this.portalId}/#`, err => {
                if (err) {
                    this.adapter.log.error(`Failed to subscribe: ${err.message}`);
                }
                else {
                    this.adapter.log.info(`Subscribed to N/${this.portalId}/#`);
                }
            });
        }
        else {
            // No portal ID configured - discover it
            this.adapter.log.info('No Portal ID configured, trying to discover...');
            this.mqttClient.subscribe('N/+/system/0/Serial', err => {
                if (err) {
                    this.adapter.log.error(`Failed to subscribe for discovery: ${err.message}`);
                }
            });
        }
    }
    startKeepalive() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
        }
        const interval = (parseInt(String(this.config.keepaliveInterval), 10) || 30) * 1000;
        // Send immediately
        this.sendKeepalive();
        this.keepaliveTimer = setInterval(() => this.sendKeepalive(), interval);
    }
    sendKeepalive() {
        if (!this.mqttClient || !this.portalId) {
            // If no portal ID, try wildcard keepalive for discovery
            if (this.mqttClient) {
                this.mqttClient.publish('R/+/keepalive', '');
            }
            return;
        }
        this.mqttClient.publish(`R/${this.portalId}/keepalive`, '');
        this.adapter.log.debug('Keepalive sent');
    }
    async onMessage(topic, message) {
        // Parse topic: N/{portalId}/{serviceType}/{deviceInstance}/{path...}
        const parts = topic.split('/');
        if (parts.length < 4 || parts[0] !== 'N') {
            return;
        }
        const receivedPortalId = parts[1];
        // If we don't have a portal ID yet, discover it
        if (!this.portalId) {
            this.portalId = receivedPortalId;
            this.adapter.log.info(`Discovered Portal ID: ${this.portalId}`);
            // Now subscribe to all topics
            if (this.mqttClient) {
                this.mqttClient.unsubscribe('N/+/system/0/Serial');
                this.mqttClient.subscribe(`N/${this.portalId}/#`, err => {
                    if (err) {
                        this.adapter.log.error(`Failed to subscribe: ${err.message}`);
                    }
                    else {
                        this.adapter.log.info(`Subscribed to N/${this.portalId}/#`);
                    }
                });
                this.startKeepalive();
            }
        }
        if (receivedPortalId !== this.portalId) {
            return;
        }
        // Parse payload
        const payload = message.toString();
        let value;
        try {
            const parsed = JSON.parse(payload);
            value = parsed.value;
        }
        catch {
            this.adapter.log.debug(`Non-JSON payload on ${topic}: ${payload}`);
            return;
        }
        // Build state path: {serviceType}.{deviceInstance}.{remaining/path}
        const serviceType = parts[2];
        const deviceInstance = parts[3];
        const dbusPath = parts.slice(4).join('/');
        // Build ioBroker state ID
        const stateIdParts = [serviceType, deviceInstance];
        if (dbusPath) {
            // Replace / with . for ioBroker ID and sanitize
            stateIdParts.push(...dbusPath.split('/'));
        }
        const stateId = stateIdParts.map(p => p.replace(FORBIDDEN_CHARS, '_')).join('.');
        // Skip undefined values
        if (value === undefined) {
            return;
        }
        // Handle arrays of objects: expand into channels with individual states
        if (Array.isArray(value)) {
            await this.expandArray(stateId, serviceType, dbusPath, value);
            return;
        }
        // Handle plain objects: expand into individual states
        if (value !== null && typeof value === 'object') {
            await this.expandObject(stateId, serviceType, dbusPath, value);
            return;
        }
        // Scalar value - ensure object exists and set state
        await this.setScalarValue(stateId, serviceType, dbusPath, value);
    }
    /**
     * Expand an array value into channels with individual states.
     * e.g. Batteries = [{name:"X", soc:99, ...}, ...] becomes:
     *   Batteries.0.name = "X"
     *   Batteries.0.soc = 99
     */
    async expandArray(parentId, serviceType, dbusPath, arr) {
        // Ensure the parent channel exists
        if (!this.existingObjects.has(parentId)) {
            this.existingObjects.add(parentId);
            await this.adapter.setObjectNotExistsAsync(parentId, {
                type: 'channel',
                common: {
                    name: dbusPath.split('/').pop() || parentId,
                },
                native: {},
            });
        }
        for (let i = 0; i < arr.length; i++) {
            const element = arr[i];
            const elementId = `${parentId}.${i}`;
            if (element !== null && typeof element === 'object' && !Array.isArray(element)) {
                await this.expandObject(elementId, serviceType, `${dbusPath}/${i}`, element);
            }
            else {
                // Primitive array element
                const childDbusPath = `${dbusPath}/${i}`;
                await this.setScalarValue(elementId, serviceType, childDbusPath, element);
            }
        }
    }
    /**
     * Expand an object value into individual states.
     * e.g. {name:"X", soc:99, voltage:14.4} becomes:
     *   parent.name = "X"
     *   parent.soc = 99
     *   parent.voltage = 14.4
     */
    async expandObject(parentId, serviceType, dbusPath, obj) {
        // Ensure the parent channel exists
        if (!this.existingObjects.has(parentId)) {
            this.existingObjects.add(parentId);
            await this.adapter.setObjectNotExistsAsync(parentId, {
                type: 'channel',
                common: {
                    name: dbusPath.split('/').pop() || parentId,
                },
                native: {},
            });
        }
        for (const [key, val] of Object.entries(obj)) {
            if (val === undefined) {
                continue;
            }
            const childId = `${parentId}.${key.replace(FORBIDDEN_CHARS, '_')}`;
            const childDbusPath = `${dbusPath}/${key}`;
            if (Array.isArray(val)) {
                await this.expandArray(childId, serviceType, childDbusPath, val);
            }
            else if (val !== null && typeof val === 'object') {
                await this.expandObject(childId, serviceType, childDbusPath, val);
            }
            else {
                await this.setScalarValue(childId, serviceType, childDbusPath, val);
            }
        }
    }
    /**
     * Set a scalar value: ensures the state object exists, coerces the value to match the registered state type.
     */
    async setScalarValue(stateId, serviceType, dbusPath, value) {
        await this.ensureState(stateId, serviceType, dbusPath, value);
        const val = this.coerceValue(stateId, serviceType, dbusPath, value);
        await this.adapter.setStateAsync(stateId, { val, ack: true });
    }
    /**
     * Coerce a value to match the registered state type.
     * Handles Victron API inconsistencies where the same state may send number (0/1) and boolean (true/false).
     */
    coerceValue(stateId, serviceType, dbusPath, value) {
        const registeredType = this.stateTypes.get(stateId);
        if (registeredType === 'boolean') {
            if (typeof value === 'number') {
                return value !== 0;
            }
            if (typeof value === 'string') {
                return value === 'true' || value === '1';
            }
            return Boolean(value);
        }
        if (registeredType === 'number') {
            if (typeof value === 'boolean') {
                return value ? 1 : 0;
            }
            if (typeof value === 'string') {
                const num = Number(value);
                return isNaN(num) ? 0 : num;
            }
        }
        if (registeredType === 'string' && typeof value !== 'string') {
            return String(value);
        }
        // For asBoolean inference: convert 0/1 to boolean even if not yet registered
        if (!registeredType && typeof value === 'number' && (value === 0 || value === 1)) {
            const stateName = dbusPath.split('/').pop() || '';
            const lookupKey = `${serviceType}/${dbusPath}`;
            if (!knownStates_1.default[lookupKey]) {
                const inferred = (0, nameInference_1.inferFromName)(stateName);
                if (inferred?.asBoolean) {
                    return value === 1;
                }
            }
        }
        return value;
    }
    async ensureState(stateId, serviceType, dbusPath, value) {
        if (this.existingObjects.has(stateId)) {
            return;
        }
        // Ensure parent folders exist
        const idParts = stateId.split('.');
        for (let i = 1; i < idParts.length; i++) {
            const folderId = idParts.slice(0, i).join('.');
            if (!this.existingObjects.has(folderId)) {
                this.existingObjects.add(folderId);
                await this.adapter.setObjectNotExistsAsync(folderId, {
                    type: i === 1 ? 'device' : 'channel',
                    common: {
                        name: idParts[i - 1],
                    },
                    native: {},
                });
            }
        }
        // Look up known state definition
        const lookupKey = `${serviceType}/${dbusPath}`;
        const known = knownStates_1.default[lookupKey];
        // Infer role/unit from the state name (e.g. "Temperature" → °C, "Voltage" → V)
        const stateName = dbusPath.split('/').pop() || stateId;
        const inferred = !known ? (0, nameInference_1.inferFromName)(stateName) : null;
        // Determine type from value if not known
        let stateType = 'mixed';
        if (known) {
            stateType = known.type;
        }
        else if (inferred?.asBoolean && typeof value === 'number' && (value === 0 || value === 1)) {
            stateType = 'boolean';
        }
        else if (typeof value === 'number') {
            stateType = 'number';
        }
        else if (typeof value === 'string') {
            stateType = 'string';
        }
        else if (typeof value === 'boolean') {
            stateType = 'boolean';
        }
        const common = {
            name: known?.name || stateName,
            type: stateType,
            role: known?.role || inferred?.role || (stateType === 'number' ? 'value' : 'state'),
            read: known?.read ?? true,
            write: known?.write ?? false,
        };
        const unit = known?.unit || inferred?.unit;
        if (unit) {
            common.unit = unit;
        }
        if (known?.min !== undefined) {
            common.min = known.min;
        }
        if (known?.max !== undefined) {
            common.max = known.max;
        }
        if (known?.states) {
            common.states = known.states;
        }
        this.existingObjects.add(stateId);
        this.stateTypes.set(stateId, stateType);
        await this.adapter.setObjectNotExistsAsync(stateId, {
            type: 'state',
            common,
            native: {
                topic: `N/${this.portalId}/${serviceType}/${stateId.split('.')[1]}/${dbusPath}`,
            },
        });
    }
    /**
     * Handle state changes from ioBroker - write back to Victron via MQTT W/ topic
     */
    async onStateChange(id, state) {
        if (!this.mqttClient || !this.portalId) {
            return;
        }
        // id format: victron-cerbo.0.{serviceType}.{instance}.{path...}
        const adapterPrefix = `${this.adapter.namespace}.`;
        if (!id.startsWith(adapterPrefix)) {
            return;
        }
        const localId = id.substring(adapterPrefix.length);
        // Check if state is writable
        const obj = await this.adapter.getObjectAsync(localId);
        if (!obj || !obj.common || !obj.common.write) {
            this.adapter.log.warn(`State ${id} is not writable`);
            return;
        }
        // Build MQTT topic from native.topic or reconstruct from state ID
        let writeTopic;
        if (obj.native?.topic) {
            // Replace N/ prefix with W/
            writeTopic = obj.native.topic.replace(/^N\//, 'W/');
        }
        else {
            // Reconstruct: victron-cerbo.0.{service}.{instance}.{path...}
            const parts = localId.split('.');
            const service = parts[0];
            const instance = parts[1];
            const path = parts.slice(2).join('/');
            writeTopic = `W/${this.portalId}/${service}/${instance}/${path}`;
        }
        const payload = JSON.stringify({ value: state.val });
        this.adapter.log.debug(`Writing to ${writeTopic}: ${payload}`);
        this.mqttClient.publish(writeTopic, payload);
    }
    async destroy() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
        if (this.mqttClient) {
            await new Promise(resolve => {
                this.mqttClient.end(false, () => resolve());
            });
            this.mqttClient = null;
        }
    }
}
exports.VictronMqttClient = VictronMqttClient;
//# sourceMappingURL=client.js.map