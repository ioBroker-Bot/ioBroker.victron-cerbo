import * as mqtt from 'mqtt';
import type { VictronCerboAdapterConfig } from '../types';
import knownStates from './knownStates';
import { inferFromName } from './nameInference';

const FORBIDDEN_CHARS = /[\][*,;'"`<>\\?]/g;

export class VictronMqttClient {
    private readonly adapter: ioBroker.Adapter;
    private readonly config: VictronCerboAdapterConfig;
    private mqttClient: mqtt.MqttClient | null = null;
    private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
    private readonly existingObjects = new Set<string>();
    private readonly stateTypes = new Map<string, ioBroker.CommonType>();
    private portalId: string;

    constructor(adapter: ioBroker.Adapter) {
        this.adapter = adapter;
        this.config = adapter.config as VictronCerboAdapterConfig;
        this.portalId = (this.config.portalId || '').trim();

        if (!this.config.mqttHost) {
            this.adapter.log.error('No MQTT host configured');
            return;
        }

        this.connect();
    }

    private connect(): void {
        const port = parseInt(String(this.config.mqttPort), 10) || 1883;
        const url = `mqtt://${this.config.mqttHost}:${port}`;

        const options: mqtt.IClientOptions = {
            clientId:
                this.config.mqttClientId || `iobroker_victron_cerbo_${Math.random().toString(16).substring(2, 10)}`,
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

        this.mqttClient.on('message', (topic: string, message: Buffer) => {
            this.onMessage(topic, message).catch(err =>
                this.adapter.log.error(`Error processing message: ${err.message}`),
            );
        });

        this.mqttClient.on('error', (err: Error) => {
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

    private subscribe(): void {
        if (!this.mqttClient) {
            return;
        }

        if (this.portalId) {
            // Subscribe to all topics for this portal ID
            this.mqttClient.subscribe(`N/${this.portalId}/#`, err => {
                if (err) {
                    this.adapter.log.error(`Failed to subscribe: ${err.message}`);
                } else {
                    this.adapter.log.info(`Subscribed to N/${this.portalId}/#`);
                }
            });
        } else {
            // No portal ID configured - discover it
            this.adapter.log.info('No Portal ID configured, trying to discover...');
            this.mqttClient.subscribe('N/+/system/0/Serial', err => {
                if (err) {
                    this.adapter.log.error(`Failed to subscribe for discovery: ${err.message}`);
                }
            });
        }
    }

    private startKeepalive(): void {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
        }

        const interval = (parseInt(String(this.config.keepaliveInterval), 10) || 30) * 1000;

        // Send it immediately
        this.sendKeepalive();

        this.keepaliveTimer = setInterval(() => this.sendKeepalive(), interval);
    }

    private sendKeepalive(): void {
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

    private async onMessage(topic: string, message: Buffer): Promise<void> {
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
                    } else {
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
        let value: unknown;

        try {
            const parsed = JSON.parse(payload);
            value = parsed.value;
        } catch {
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
            await this.expandObject(stateId, serviceType, dbusPath, value as Record<string, unknown>);
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
    private async expandArray(parentId: string, serviceType: string, dbusPath: string, arr: unknown[]): Promise<void> {
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
                await this.expandObject(elementId, serviceType, `${dbusPath}/${i}`, element as Record<string, unknown>);
            } else {
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
    private async expandObject(
        parentId: string,
        serviceType: string,
        dbusPath: string,
        obj: Record<string, unknown>,
    ): Promise<void> {
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
            } else if (val !== null && typeof val === 'object') {
                await this.expandObject(childId, serviceType, childDbusPath, val as Record<string, unknown>);
            } else {
                await this.setScalarValue(childId, serviceType, childDbusPath, val);
            }
        }
    }

    /**
     * Set a scalar value: ensures the state object exists, coerces the value to match the registered state type.
     */
    private async setScalarValue(
        stateId: string,
        serviceType: string,
        dbusPath: string,
        value: unknown,
    ): Promise<void> {
        await this.ensureState(stateId, serviceType, dbusPath, value);

        const val = this.coerceValue(stateId, serviceType, dbusPath, value);
        await this.adapter.setStateAsync(stateId, { val, ack: true });
    }

    /**
     * Coerce a value to match the registered state type.
     * Handles Victron API inconsistencies where the same state may send number (0/1) and boolean (true/false).
     */
    private coerceValue(stateId: string, _serviceType: string, _dbusPath: string, value: unknown): ioBroker.StateValue {
        // null means "no value" – pass through without conversion
        if (value === null || value === undefined) {
            return null;
        }

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
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            return value.toString();
        }

        return value as ioBroker.StateValue;
    }

    private async ensureState(stateId: string, serviceType: string, dbusPath: string, value: unknown): Promise<void> {
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
        const known = knownStates[lookupKey];

        // Infer role/unit from the state name (e.g. "Temperature" → °C, "Voltage" → V)
        const stateName = dbusPath.split('/').pop() || stateId;
        const inferred = !known ? inferFromName(stateName) : null;

        // Determine type from value if not known
        let stateType: ioBroker.CommonType = 'mixed';
        if (known) {
            stateType = known.type;
        } else if (inferred?.asBoolean) {
            // Boolean-like states (Connected, Active, Enabled, Silenced, etc.) are always boolean
            stateType = 'boolean';
        } else if (typeof value === 'number') {
            stateType = 'number';
        } else if (typeof value === 'string') {
            stateType = 'string';
        } else if (typeof value === 'boolean') {
            stateType = 'boolean';
        }

        // Check if state already exists from a previous adapter run
        const existingObj = await this.adapter.getObjectAsync(stateId);
        if (existingObj) {
            const existingType = existingObj.common?.type as ioBroker.CommonType | undefined;

            // Only recreate when we have a strong reason: known state definition or inferred boolean
            const shouldRecreate = existingType && existingType !== stateType && (!!known || !!inferred?.asBoolean);

            if (shouldRecreate) {
                // Type definition changed – delete and recreate with correct type
                this.adapter.log.debug(
                    `State ${stateId}: type changed from ${existingType} to ${stateType}, recreating`,
                );
                await this.adapter.delObjectAsync(stateId);
                // Fall through to create the state with the correct type
            } else {
                this.existingObjects.add(stateId);
                // Use the stored type for coercion to avoid type mismatch errors
                this.stateTypes.set(stateId, existingType || stateType);
                return;
            }
        }

        const common: ioBroker.StateCommon = {
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
    async onStateChange(id: string, state: ioBroker.State): Promise<void> {
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
        let writeTopic: string;
        if (obj.native?.topic) {
            // Replace N/ prefix with W/
            writeTopic = (obj.native.topic as string).replace(/^N\//, 'W/');
        } else {
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

    async destroy(): Promise<void> {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }

        if (this.mqttClient) {
            await new Promise<void>(resolve => {
                this.mqttClient!.end(false, () => resolve());
            });
            this.mqttClient = null;
        }
    }
}
