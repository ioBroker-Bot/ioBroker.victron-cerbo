/* jshint -W097 */
/* jshint strict: true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const path = require('path');
const { tests } = require('@iobroker/testing');

// Portal ID used in all test messages
const PORTAL_ID = 'c0619ab12345';
const MQTT_PORT = 18830;

/**
 * Helper: build a Victron N/ topic
 */
function topic(service, instance, dbusPath) {
    return `N/${PORTAL_ID}/${service}/${instance}/${dbusPath}`;
}

/**
 * Helper: build a Victron JSON payload
 */
function payload(value) {
    return JSON.stringify({ value });
}

/**
 * Test rules – Victron MQTT messages to publish and expected ioBroker states.
 *
 * Each rule has:
 *   topic    – full MQTT topic (N/{portalId}/...)
 *   payload  – JSON string {"value": ...}
 *   stateId  – expected ioBroker state path (under victron-cerbo.0.)
 *   val      – expected value after coercion
 *   type     – expected common.type  (optional)
 *   role     – expected common.role  (optional)
 *   unit     – expected common.unit  (optional)
 *   write    – expected common.write (optional)
 *   min      – expected common.min   (optional)
 *   max      – expected common.max   (optional)
 *   hasStates – if true, verify common.states is set (optional)
 */
const rules = [
    // ========== battery ==========
    {
        name: 'Battery voltage (known state)',
        topic: topic('battery', 256, 'Dc/0/Voltage'),
        payload: payload(12.85),
        stateId: 'battery.256.Dc.0.Voltage',
        val: 12.85,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'Battery current (known state)',
        topic: topic('battery', 256, 'Dc/0/Current'),
        payload: payload(-5.2),
        stateId: 'battery.256.Dc.0.Current',
        val: -5.2,
        type: 'number',
        role: 'value.current',
        unit: 'A',
    },
    {
        name: 'Battery power (known state)',
        topic: topic('battery', 256, 'Dc/0/Power'),
        payload: payload(-66.56),
        stateId: 'battery.256.Dc.0.Power',
        val: -66.56,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'Battery temperature (known state)',
        topic: topic('battery', 256, 'Dc/0/Temperature'),
        payload: payload(25.3),
        stateId: 'battery.256.Dc.0.Temperature',
        val: 25.3,
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
    },
    {
        name: 'Battery SOC (known state with min/max)',
        topic: topic('battery', 256, 'Soc'),
        payload: payload(85.5),
        stateId: 'battery.256.Soc',
        val: 85.5,
        type: 'number',
        role: 'value.battery',
        unit: '%',
        min: 0,
        max: 100,
    },
    {
        name: 'Battery capacity (known state)',
        topic: topic('battery', 256, 'Capacity'),
        payload: payload(200),
        stateId: 'battery.256.Capacity',
        val: 200,
        type: 'number',
        unit: 'Ah',
    },
    {
        name: 'Battery product name (string)',
        topic: topic('battery', 256, 'ProductName'),
        payload: payload('SmartShunt 500A'),
        stateId: 'battery.256.ProductName',
        val: 'SmartShunt 500A',
        type: 'string',
        role: 'info.name',
    },
    {
        name: 'Battery serial (string)',
        topic: topic('battery', 256, 'Serial'),
        payload: payload('HQ2145ABCDE'),
        stateId: 'battery.256.Serial',
        val: 'HQ2145ABCDE',
        type: 'string',
        role: 'info.serial',
    },
    {
        name: 'Battery alarm (enum states)',
        topic: topic('battery', 256, 'Alarms/Alarm'),
        payload: payload(0),
        stateId: 'battery.256.Alarms.Alarm',
        val: 0,
        type: 'number',
        role: 'indicator.alarm',
        hasStates: true,
    },
    {
        name: 'Battery low voltage alarm',
        topic: topic('battery', 256, 'Alarms/LowVoltage'),
        payload: payload(1),
        stateId: 'battery.256.Alarms.LowVoltage',
        val: 1,
        type: 'number',
        role: 'indicator.alarm',
        hasStates: true,
    },
    {
        name: 'Battery consumed amphours',
        topic: topic('battery', 256, 'ConsumedAmphours'),
        payload: payload(12.4),
        stateId: 'battery.256.ConsumedAmphours',
        val: 12.4,
        type: 'number',
        unit: 'Ah',
    },
    {
        name: 'Battery time to go',
        topic: topic('battery', 256, 'TimeToGo'),
        payload: payload(36000),
        stateId: 'battery.256.TimeToGo',
        val: 36000,
        type: 'number',
        unit: 's',
    },
    {
        name: 'Battery starter voltage',
        topic: topic('battery', 256, 'Dc/1/Voltage'),
        payload: payload(12.1),
        stateId: 'battery.256.Dc.1.Voltage',
        val: 12.1,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },

    // ========== solarcharger ==========
    {
        name: 'Solar charger PV power',
        topic: topic('solarcharger', 258, 'Yield/Power'),
        payload: payload(1250),
        stateId: 'solarcharger.258.Yield.Power',
        val: 1250,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'Solar charger PV voltage',
        topic: topic('solarcharger', 258, 'Pv/V'),
        payload: payload(75.3),
        stateId: 'solarcharger.258.Pv.V',
        val: 75.3,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'Solar charger PV current',
        topic: topic('solarcharger', 258, 'Pv/I'),
        payload: payload(16.6),
        stateId: 'solarcharger.258.Pv.I',
        val: 16.6,
        type: 'number',
        role: 'value.current',
        unit: 'A',
    },
    {
        name: 'Solar charger battery voltage',
        topic: topic('solarcharger', 258, 'Dc/0/Voltage'),
        payload: payload(13.2),
        stateId: 'solarcharger.258.Dc.0.Voltage',
        val: 13.2,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'Solar charger state (enum)',
        topic: topic('solarcharger', 258, 'State'),
        payload: payload(3),
        stateId: 'solarcharger.258.State',
        val: 3,
        type: 'number',
        hasStates: true,
    },
    {
        name: 'Solar charger error code',
        topic: topic('solarcharger', 258, 'ErrorCode'),
        payload: payload(0),
        stateId: 'solarcharger.258.ErrorCode',
        val: 0,
        type: 'number',
    },
    {
        name: 'Solar charger user yield',
        topic: topic('solarcharger', 258, 'Yield/User'),
        payload: payload(456.7),
        stateId: 'solarcharger.258.Yield.User',
        val: 456.7,
        type: 'number',
        unit: 'kWh',
    },

    // ========== system ==========
    {
        name: 'System battery voltage',
        topic: topic('system', 0, 'Dc/Battery/Voltage'),
        payload: payload(12.9),
        stateId: 'system.0.Dc.Battery.Voltage',
        val: 12.9,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'System battery SOC',
        topic: topic('system', 0, 'Dc/Battery/Soc'),
        payload: payload(92),
        stateId: 'system.0.Dc.Battery.Soc',
        val: 92,
        type: 'number',
        role: 'value.battery',
        unit: '%',
    },
    {
        name: 'System PV power',
        topic: topic('system', 0, 'Dc/Pv/Power'),
        payload: payload(1450),
        stateId: 'system.0.Dc.Pv.Power',
        val: 1450,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'System serial / portal ID',
        topic: topic('system', 0, 'Serial'),
        payload: payload(PORTAL_ID),
        stateId: 'system.0.Serial',
        val: PORTAL_ID,
        type: 'string',
        role: 'info.serial',
    },
    {
        name: 'System DVCC (known number type, value 1)',
        topic: topic('system', 0, 'Control/Dvcc'),
        payload: payload(1),
        stateId: 'system.0.Control.Dvcc',
        val: 1,
        type: 'number',
    },
    {
        name: 'System MaxChargeCurrent (known number, value 150)',
        topic: topic('system', 0, 'Control/MaxChargeCurrent'),
        payload: payload(150),
        stateId: 'system.0.Control.MaxChargeCurrent',
        val: 150,
        type: 'number',
        unit: 'A',
    },
    {
        name: 'Grid power L1',
        topic: topic('system', 0, 'Ac/Grid/L1/Power'),
        payload: payload(450.5),
        stateId: 'system.0.Ac.Grid.L1.Power',
        val: 450.5,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'Consumption L1',
        topic: topic('system', 0, 'Ac/Consumption/L1/Power'),
        payload: payload(320),
        stateId: 'system.0.Ac.Consumption.L1.Power',
        val: 320,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },

    // ========== inverter ==========
    {
        name: 'Inverter AC output voltage',
        topic: topic('inverter', 276, 'Ac/Out/L1/V'),
        payload: payload(230.1),
        stateId: 'inverter.276.Ac.Out.L1.V',
        val: 230.1,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'Inverter AC output power',
        topic: topic('inverter', 276, 'Ac/Out/L1/P'),
        payload: payload(185),
        stateId: 'inverter.276.Ac.Out.L1.P',
        val: 185,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'Inverter mode (writable, enum)',
        topic: topic('inverter', 276, 'Mode'),
        payload: payload(2),
        stateId: 'inverter.276.Mode',
        val: 2,
        type: 'number',
        role: 'level',
        write: true,
        hasStates: true,
    },
    {
        name: 'Inverter state (enum)',
        topic: topic('inverter', 276, 'State'),
        payload: payload(9),
        stateId: 'inverter.276.State',
        val: 9,
        type: 'number',
        hasStates: true,
    },
    {
        name: 'Inverter DC input voltage',
        topic: topic('inverter', 276, 'Dc/0/Voltage'),
        payload: payload(12.7),
        stateId: 'inverter.276.Dc.0.Voltage',
        val: 12.7,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },

    // ========== vebus ==========
    {
        name: 'VEBus mode (writable)',
        topic: topic('vebus', 276, 'Mode'),
        payload: payload(3),
        stateId: 'vebus.276.Mode',
        val: 3,
        type: 'number',
        role: 'level',
        write: true,
    },
    {
        name: 'VEBus state (enum)',
        topic: topic('vebus', 276, 'State'),
        payload: payload(5),
        stateId: 'vebus.276.State',
        val: 5,
        type: 'number',
        hasStates: true,
    },
    {
        name: 'VEBus AC output voltage L1',
        topic: topic('vebus', 276, 'Ac/Out/L1/V'),
        payload: payload(229.5),
        stateId: 'vebus.276.Ac.Out.L1.V',
        val: 229.5,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'VEBus SOC',
        topic: topic('vebus', 276, 'Soc'),
        payload: payload(88),
        stateId: 'vebus.276.Soc',
        val: 88,
        type: 'number',
        role: 'value.battery',
        unit: '%',
    },

    // ========== charger ==========
    {
        name: 'Charger output voltage',
        topic: topic('charger', 261, 'Dc/0/Voltage'),
        payload: payload(14.2),
        stateId: 'charger.261.Dc.0.Voltage',
        val: 14.2,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'Charger AC input current limit (writable)',
        topic: topic('charger', 261, 'Ac/In/CurrentLimit'),
        payload: payload(16),
        stateId: 'charger.261.Ac.In.CurrentLimit',
        val: 16,
        type: 'number',
        role: 'level',
        write: true,
        unit: 'A',
    },
    {
        name: 'Charger state (enum)',
        topic: topic('charger', 261, 'State'),
        payload: payload(4),
        stateId: 'charger.261.State',
        val: 4,
        type: 'number',
        hasStates: true,
    },
    {
        name: 'Charger mode (writable, enum)',
        topic: topic('charger', 261, 'Mode'),
        payload: payload(1),
        stateId: 'charger.261.Mode',
        val: 1,
        type: 'number',
        role: 'level',
        write: true,
        hasStates: true,
    },

    // ========== grid ==========
    {
        name: 'Grid power L1',
        topic: topic('grid', 30, 'Ac/L1/Power'),
        payload: payload(550),
        stateId: 'grid.30.Ac.L1.Power',
        val: 550,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'Grid energy imported',
        topic: topic('grid', 30, 'Ac/Energy/Forward'),
        payload: payload(12345.67),
        stateId: 'grid.30.Ac.Energy.Forward',
        val: 12345.67,
        type: 'number',
        unit: 'kWh',
    },
    {
        name: 'Grid energy exported',
        topic: topic('grid', 30, 'Ac/Energy/Reverse'),
        payload: payload(8765.43),
        stateId: 'grid.30.Ac.Energy.Reverse',
        val: 8765.43,
        type: 'number',
        unit: 'kWh',
    },

    // ========== tank ==========
    {
        name: 'Tank level (min/max)',
        topic: topic('tank', 100, 'Level'),
        payload: payload(67.5),
        stateId: 'tank.100.Level',
        val: 67.5,
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
    },
    {
        name: 'Tank fluid type (enum)',
        topic: topic('tank', 100, 'FluidType'),
        payload: payload(1),
        stateId: 'tank.100.FluidType',
        val: 1,
        type: 'number',
        hasStates: true,
    },
    {
        name: 'Tank remaining volume',
        topic: topic('tank', 100, 'Remaining'),
        payload: payload(0.135),
        stateId: 'tank.100.Remaining',
        val: 0.135,
        type: 'number',
        unit: 'm³',
    },

    // ========== temperature ==========
    {
        name: 'Temperature sensor',
        topic: topic('temperature', 24, 'Temperature'),
        payload: payload(23.7),
        stateId: 'temperature.24.Temperature',
        val: 23.7,
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
    },
    {
        name: 'Temperature sensor status',
        topic: topic('temperature', 24, 'Status'),
        payload: payload(0),
        stateId: 'temperature.24.Status',
        val: 0,
        type: 'number',
        hasStates: true,
    },

    // ========== pvinverter ==========
    {
        name: 'PV inverter power L1',
        topic: topic('pvinverter', 20, 'Ac/L1/Power'),
        payload: payload(980),
        stateId: 'pvinverter.20.Ac.L1.Power',
        val: 980,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'PV inverter energy total',
        topic: topic('pvinverter', 20, 'Ac/Energy/Forward'),
        payload: payload(5432.1),
        stateId: 'pvinverter.20.Ac.Energy.Forward',
        val: 5432.1,
        type: 'number',
        unit: 'kWh',
    },

    // ========== settings (writable) ==========
    {
        name: 'Grid setpoint (writable)',
        topic: topic('settings', 0, 'Settings/CGwacs/AcPowerSetPoint'),
        payload: payload(50),
        stateId: 'settings.0.Settings.CGwacs.AcPowerSetPoint',
        val: 50,
        type: 'number',
        write: true,
        unit: 'W',
    },
    {
        name: 'Minimum SOC limit (writable, min/max)',
        topic: topic('settings', 0, 'Settings/CGwacs/BatteryLife/MinimumSocLimit'),
        payload: payload(20),
        stateId: 'settings.0.Settings.CGwacs.BatteryLife.MinimumSocLimit',
        val: 20,
        type: 'number',
        write: true,
        min: 0,
        max: 100,
    },
    {
        name: 'Max charge power (writable)',
        topic: topic('settings', 0, 'Settings/CGwacs/MaxChargePower'),
        payload: payload(3000),
        stateId: 'settings.0.Settings.CGwacs.MaxChargePower',
        val: 3000,
        type: 'number',
        write: true,
        unit: 'W',
    },
    {
        name: 'ESS Battery life state (writable, enum)',
        topic: topic('settings', 0, 'Settings/CGwacs/BatteryLife/State'),
        payload: payload(10),
        stateId: 'settings.0.Settings.CGwacs.BatteryLife.State',
        val: 10,
        type: 'number',
        write: true,
        hasStates: true,
    },
    {
        name: 'ESS mode (writable, enum)',
        topic: topic('settings', 0, 'Settings/CGwacs/Hub4Mode'),
        payload: payload(1),
        stateId: 'settings.0.Settings.CGwacs.Hub4Mode',
        val: 1,
        type: 'number',
        write: true,
        hasStates: true,
    },

    // ========== platform ==========
    {
        name: 'Platform device model',
        topic: topic('platform', 0, 'Device/Model'),
        payload: payload('Cerbo GX'),
        stateId: 'platform.0.Device.Model',
        val: 'Cerbo GX',
        type: 'string',
        role: 'info.name',
    },
    {
        name: 'Platform unique ID',
        topic: topic('platform', 0, 'Device/UniqueId'),
        payload: payload(PORTAL_ID),
        stateId: 'platform.0.Device.UniqueId',
        val: PORTAL_ID,
        type: 'string',
        role: 'info.serial',
    },
    {
        name: 'Platform firmware version',
        topic: topic('platform', 0, 'Firmware/Installed/Version'),
        payload: payload('v3.30'),
        stateId: 'platform.0.Firmware.Installed.Version',
        val: 'v3.30',
        type: 'string',
        role: 'info.firmware',
    },

    // ========== Name inference (states NOT in knownStates) ==========
    {
        name: 'Inferred: Voltage from name',
        topic: topic('custom', 0, 'BusVoltage'),
        payload: payload(48.2),
        stateId: 'custom.0.BusVoltage',
        val: 48.2,
        type: 'number',
        role: 'value.voltage',
        unit: 'V',
    },
    {
        name: 'Inferred: Temperature from name',
        topic: topic('custom', 0, 'HeatsinkTemperature'),
        payload: payload(35),
        stateId: 'custom.0.HeatsinkTemperature',
        val: 35,
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
    },
    {
        name: 'Inferred: Power from name',
        topic: topic('custom', 0, 'MaxDischargePower'),
        payload: payload(5000),
        stateId: 'custom.0.MaxDischargePower',
        val: 5000,
        type: 'number',
        role: 'value.power',
        unit: 'W',
    },
    {
        name: 'Inferred: Frequency from name',
        topic: topic('custom', 0, 'Frequency'),
        payload: payload(50.01),
        stateId: 'custom.0.Frequency',
        val: 50.01,
        type: 'number',
        unit: 'Hz',
    },
    {
        name: 'Inferred: generic number (no pattern match)',
        topic: topic('custom', 0, 'SomethingUnknown'),
        payload: payload(42),
        stateId: 'custom.0.SomethingUnknown',
        val: 42,
        type: 'number',
        role: 'value',
    },
    {
        name: 'Inferred: generic string',
        topic: topic('custom', 0, 'Description'),
        payload: payload('test string value'),
        stateId: 'custom.0.Description',
        val: 'test string value',
        type: 'string',
        role: 'state',
    },

    // ========== Boolean inference (0/1 → true/false) ==========
    {
        name: 'Boolean: Connected 1 → true',
        topic: topic('custom', 0, 'Connected'),
        payload: payload(1),
        stateId: 'custom.0.Connected',
        val: true,
        type: 'boolean',
        role: 'indicator.connected',
    },
    {
        name: 'Boolean: Active 0 → false',
        topic: topic('custom', 0, 'Active'),
        payload: payload(0),
        stateId: 'custom.0.Active',
        val: false,
        type: 'boolean',
        role: 'indicator',
    },
    {
        name: 'Boolean: Silenced 0 → false',
        topic: topic('custom', 0, 'Silenced'),
        payload: payload(0),
        stateId: 'custom.0.Silenced',
        val: false,
        type: 'boolean',
        role: 'indicator',
    },
    {
        name: 'Boolean: Enabled 1 → true',
        topic: topic('custom', 0, 'Enabled'),
        payload: payload(1),
        stateId: 'custom.0.Enabled',
        val: true,
        type: 'boolean',
        role: 'indicator',
    },
    {
        name: 'Boolean: Present 1 → true',
        topic: topic('custom', 0, 'Present'),
        payload: payload(1),
        stateId: 'custom.0.Present',
        val: true,
        type: 'boolean',
        role: 'indicator',
    },
    {
        name: 'Boolean: BmsPresent 0 → false',
        topic: topic('custom', 0, 'BmsPresent'),
        payload: payload(0),
        stateId: 'custom.0.BmsPresent',
        val: false,
        type: 'boolean',
        role: 'indicator',
    },

    // ========== Type coercion – the specific bugs ==========
    {
        name: 'Coercion: MaxChargeCurrent receives false → 0',
        topic: topic('system', 0, 'Control/MaxChargeCurrent'),
        payload: payload(false),
        stateId: 'system.0.Control.MaxChargeCurrent',
        val: 0,
        type: 'number',
    },
    {
        name: 'Coercion: MaxChargeCurrent receives true → 1',
        topic: topic('system', 0, 'Control/MaxChargeCurrent'),
        payload: payload(true),
        stateId: 'system.0.Control.MaxChargeCurrent',
        val: 1,
        type: 'number',
    },
    {
        name: 'Coercion: MaxChargeCurrent back to number 200',
        topic: topic('system', 0, 'Control/MaxChargeCurrent'),
        payload: payload(200),
        stateId: 'system.0.Control.MaxChargeCurrent',
        val: 200,
        type: 'number',
    },
    {
        name: 'Coercion: Dvcc receives 0 stays number',
        topic: topic('system', 0, 'Control/Dvcc'),
        payload: payload(0),
        stateId: 'system.0.Control.Dvcc',
        val: 0,
        type: 'number',
    },
    {
        name: 'Coercion: Silenced with number 1 → boolean true',
        topic: topic('custom', 0, 'Silenced'),
        payload: payload(1),
        stateId: 'custom.0.Silenced',
        val: true,
        type: 'boolean',
    },
    {
        name: 'Coercion: Connected with number 0 → boolean false',
        topic: topic('custom', 0, 'Connected'),
        payload: payload(0),
        stateId: 'custom.0.Connected',
        val: false,
        type: 'boolean',
    },
];

// Run integration tests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Victron Cerbo MQTT Client Tests', getHarness => {
            let harness;
            let broker;
            let server;
            let adapterPublished;

            /**
             * Publish a message from the mock broker to all subscribers (the adapter).
             * Includes a safety timeout in case the aedes callback doesn't fire.
             */
            function publishFromBroker(mqttTopic, mqttPayload) {
                return new Promise(resolve => {
                    const timer = setTimeout(resolve, 100);
                    broker.publish(
                        {
                            topic: mqttTopic,
                            payload: Buffer.from(mqttPayload),
                            qos: 0,
                            retain: false,
                            cmd: 'publish',
                            dup: false,
                        },
                        () => {
                            clearTimeout(timer);
                            resolve();
                        },
                    );
                });
            }

            /** Wait for the adapter to process an MQTT message */
            const PROCESS_WAIT = 800;

            before(async function () {
                this.timeout(60000);

                // Start mock MQTT broker (aedes 0.51.x)
                const aedes = require('aedes');
                const net = require('node:net');
                broker = aedes();
                server = net.createServer(broker.handle);
                await new Promise(resolve => server.listen(MQTT_PORT, resolve));
                console.log(`Mock MQTT broker started on port ${MQTT_PORT}`);

                // Track messages published by the adapter (client !== null means from a client)
                adapterPublished = [];
                broker.on('publish', (packet, client) => {
                    if (client) {
                        adapterPublished.push({
                            topic: packet.topic,
                            payload: packet.payload.toString(),
                        });
                    }
                });

                harness = getHarness();

                // Configure adapter to connect to our mock broker
                await harness.changeAdapterConfig('victron-cerbo', {
                    native: {
                        mqttHost: '127.0.0.1',
                        mqttPort: MQTT_PORT,
                        portalId: PORTAL_ID,
                        keepaliveInterval: 5,
                        user: '',
                        password: '',
                        mqttClientId: 'iobroker_test_client',
                    },
                });

                // Start adapter
                await harness.startAdapterAndWait();

                // Wait for MQTT connection and subscription
                await new Promise(resolve => setTimeout(resolve, 3000));
            });

            after(async function () {
                this.timeout(10000);
                broker?.close();
                server?.close();
            });

            // ===== Connection test =====
            it('Should connect to the MQTT broker', async function () {
                this.timeout(5000);
                const state = await harness.states.getStateAsync('victron-cerbo.0.info.connection');
                if (!state?.val) {
                    throw new Error(`Expected info.connection = true, got ${state ? state.val : 'null'}`);
                }
            });

            // ===== Keepalive test =====
            it('Should send keepalive messages', async function () {
                this.timeout(10000);
                adapterPublished.length = 0;
                // Wait for a keepalive (interval is 5s)
                await new Promise(resolve => setTimeout(resolve, 6000));
                const keepalives = adapterPublished.filter(m => m.topic === `R/${PORTAL_ID}/keepalive`);
                if (keepalives.length === 0) {
                    throw new Error('Expected at least one keepalive message');
                }
            });

            // ===== Generate a test for each rule =====
            for (const rule of rules) {
                it(`Should process: ${rule.name}`, async function () {
                    this.timeout(5000);

                    await publishFromBroker(rule.topic, rule.payload);
                    await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                    const fullId = `victron-cerbo.0.${rule.stateId}`;

                    // 1) Object must exist as type "state"
                    const obj = await harness.objects.getObjectAsync(fullId);
                    if (!obj) {
                        throw new Error(`Object ${fullId} should exist`);
                    }
                    if (obj.type !== 'state') {
                        throw new Error(`Object ${fullId} should be type "state", got "${obj.type}"`);
                    }

                    // 2) Value must match
                    const state = await harness.states.getStateAsync(fullId);
                    if (!state) {
                        throw new Error(`State ${fullId} should have a value`);
                    }
                    if (state.val !== rule.val) {
                        throw new Error(
                            `${fullId}: expected val=${JSON.stringify(rule.val)}, got ${JSON.stringify(state.val)}`,
                        );
                    }
                    if (state.ack !== true) {
                        throw new Error(`${fullId} should have ack=true`);
                    }

                    // 3) Type
                    if (rule.type && obj.common.type !== rule.type) {
                        throw new Error(`${fullId}: expected type="${rule.type}", got "${obj.common.type}"`);
                    }

                    // 4) Role
                    if (rule.role && obj.common.role !== rule.role) {
                        throw new Error(`${fullId}: expected role="${rule.role}", got "${obj.common.role}"`);
                    }

                    // 5) Unit
                    if (rule.unit && obj.common.unit !== rule.unit) {
                        throw new Error(`${fullId}: expected unit="${rule.unit}", got "${obj.common.unit}"`);
                    }

                    // 6) Write flag
                    if (rule.write !== undefined && obj.common.write !== rule.write) {
                        throw new Error(`${fullId}: expected write=${rule.write}, got ${obj.common.write}`);
                    }

                    // 7) Min
                    if (rule.min !== undefined && obj.common.min !== rule.min) {
                        throw new Error(`${fullId}: expected min=${rule.min}, got ${obj.common.min}`);
                    }

                    // 8) Max
                    if (rule.max !== undefined && obj.common.max !== rule.max) {
                        throw new Error(`${fullId}: expected max=${rule.max}, got ${obj.common.max}`);
                    }

                    // 9) States enum
                    if (rule.hasStates && !obj.common.states) {
                        throw new Error(`${fullId}: expected common.states to be set`);
                    }
                });
            }

            // ===== Object expansion test =====
            it('Should expand object values into individual states', async function () {
                this.timeout(5000);

                await publishFromBroker(
                    topic('battery', 257, 'Info'),
                    payload({ MaxChargeVoltage: 14.4, MaxChargeCurrent: 50, MaxDischargeCurrent: 100 }),
                );
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // Check channel exists
                const channel = await harness.objects.getObjectAsync('victron-cerbo.0.battery.257.Info');
                if (!channel || channel.type !== 'channel') {
                    throw new Error('Expected battery.257.Info to be a channel');
                }

                // Check individual states
                const voltage = await harness.states.getStateAsync('victron-cerbo.0.battery.257.Info.MaxChargeVoltage');
                if (!voltage || voltage.val !== 14.4) {
                    throw new Error(`Expected MaxChargeVoltage=14.4, got ${voltage?.val}`);
                }

                const current = await harness.states.getStateAsync('victron-cerbo.0.battery.257.Info.MaxChargeCurrent');
                if (!current || current.val !== 50) {
                    throw new Error(`Expected MaxChargeCurrent=50, got ${current?.val}`);
                }

                const discharge = await harness.states.getStateAsync(
                    'victron-cerbo.0.battery.257.Info.MaxDischargeCurrent',
                );
                if (!discharge || discharge.val !== 100) {
                    throw new Error(`Expected MaxDischargeCurrent=100, got ${discharge?.val}`);
                }
            });

            // ===== Array expansion test =====
            it('Should expand array values into indexed channels', async function () {
                this.timeout(5000);

                await publishFromBroker(
                    topic('system', 0, 'Batteries'),
                    payload([
                        { soc: 85, voltage: 12.8 },
                        { soc: 90, voltage: 13.1 },
                    ]),
                );
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // Parent channel
                const parent = await harness.objects.getObjectAsync('victron-cerbo.0.system.0.Batteries');
                if (!parent || parent.type !== 'channel') {
                    throw new Error('Expected system.0.Batteries to be a channel');
                }

                // Array element 0
                const soc0 = await harness.states.getStateAsync('victron-cerbo.0.system.0.Batteries.0.soc');
                if (!soc0 || soc0.val !== 85) {
                    throw new Error(`Expected Batteries.0.soc=85, got ${soc0?.val}`);
                }

                const voltage0 = await harness.states.getStateAsync('victron-cerbo.0.system.0.Batteries.0.voltage');
                if (!voltage0 || voltage0.val !== 12.8) {
                    throw new Error(`Expected Batteries.0.voltage=12.8, got ${voltage0?.val}`);
                }

                // Array element 1
                const soc1 = await harness.states.getStateAsync('victron-cerbo.0.system.0.Batteries.1.soc');
                if (!soc1 || soc1.val !== 90) {
                    throw new Error(`Expected Batteries.1.soc=90, got ${soc1?.val}`);
                }

                const voltage1 = await harness.states.getStateAsync('victron-cerbo.0.system.0.Batteries.1.voltage');
                if (!voltage1 || voltage1.val !== 13.1) {
                    throw new Error(`Expected Batteries.1.voltage=13.1, got ${voltage1?.val}`);
                }
            });

            // ===== Nested object + array expansion (Notifications with Silenced boolean) =====
            it('Should expand deeply nested objects with arrays', async function () {
                this.timeout(5000);

                await publishFromBroker(
                    topic('platform', 0, 'Notifications'),
                    payload([
                        { Acknowledge: 0, Silenced: 0, Type: 'warning' },
                        { Acknowledge: 1, Silenced: 1, Type: 'alarm' },
                    ]),
                );
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // Check Silenced states (should be boolean from inference)
                const silenced0 = await harness.states.getStateAsync(
                    'victron-cerbo.0.platform.0.Notifications.0.Silenced',
                );
                if (!silenced0) {
                    throw new Error('Expected Notifications.0.Silenced to exist');
                }
                if (silenced0.val !== false) {
                    throw new Error(`Expected Notifications.0.Silenced=false, got ${silenced0.val}`);
                }

                const silenced1 = await harness.states.getStateAsync(
                    'victron-cerbo.0.platform.0.Notifications.1.Silenced',
                );
                if (!silenced1) {
                    throw new Error('Expected Notifications.1.Silenced to exist');
                }
                if (silenced1.val !== true) {
                    throw new Error(`Expected Notifications.1.Silenced=true, got ${silenced1.val}`);
                }

                // Check Silenced object type is boolean
                const silencedObj = await harness.objects.getObjectAsync(
                    'victron-cerbo.0.platform.0.Notifications.1.Silenced',
                );
                if (silencedObj.common.type !== 'boolean') {
                    throw new Error(`Expected Silenced type=boolean, got ${silencedObj.common.type}`);
                }

                // Check Type is string
                const type1 = await harness.states.getStateAsync('victron-cerbo.0.platform.0.Notifications.1.Type');
                if (!type1 || type1.val !== 'alarm') {
                    throw new Error(`Expected Notifications.1.Type="alarm", got ${type1?.val}`);
                }
            });

            // ===== Write-back test: inverter mode =====
            it('Should publish W/ topic when writable state changes', async function () {
                this.timeout(5000);

                // Ensure state exists
                await publishFromBroker(topic('inverter', 276, 'Mode'), payload(2));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // Clear tracked messages
                adapterPublished.length = 0;

                // Simulate user change (ack=false)
                await harness.states.setStateAsync('victron-cerbo.0.inverter.276.Mode', 4, false);
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const writeMsg = adapterPublished.find(m => m.topic.startsWith('W/'));
                if (!writeMsg) {
                    throw new Error('Expected a W/ topic to be published');
                }
                if (writeMsg.topic !== `W/${PORTAL_ID}/inverter/276/Mode`) {
                    throw new Error(`Expected topic W/${PORTAL_ID}/inverter/276/Mode, got ${writeMsg.topic}`);
                }
                const parsed = JSON.parse(writeMsg.payload);
                if (parsed.value !== 4) {
                    throw new Error(`Expected payload value 4, got ${parsed.value}`);
                }
            });

            // ===== Write-back test: settings =====
            it('Should write settings via W/ topic', async function () {
                this.timeout(5000);

                // Ensure state exists
                await publishFromBroker(topic('settings', 0, 'Settings/CGwacs/AcPowerSetPoint'), payload(50));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                adapterPublished.length = 0;

                await harness.states.setStateAsync(
                    'victron-cerbo.0.settings.0.Settings.CGwacs.AcPowerSetPoint',
                    100,
                    false,
                );
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const writeMsg = adapterPublished.find(
                    m => m.topic === `W/${PORTAL_ID}/settings/0/Settings/CGwacs/AcPowerSetPoint`,
                );
                if (!writeMsg) {
                    throw new Error('Expected W/ topic for settings write-back');
                }
                const parsed = JSON.parse(writeMsg.payload);
                if (parsed.value !== 100) {
                    throw new Error(`Expected value 100, got ${parsed.value}`);
                }
            });

            // ===== Read-only state should NOT allow write =====
            it('Should not publish W/ topic for read-only states', async function () {
                this.timeout(5000);

                // Ensure state exists
                await publishFromBroker(topic('battery', 256, 'Dc/0/Voltage'), payload(12.85));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                adapterPublished.length = 0;

                await harness.states.setStateAsync('victron-cerbo.0.battery.256.Dc.0.Voltage', 13.0, false);
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const writeMsg = adapterPublished.find(m => m.topic === `W/${PORTAL_ID}/battery/256/Dc/0/Voltage`);
                if (writeMsg) {
                    throw new Error('Should not publish W/ topic for read-only state');
                }
            });

            // ===== Non-JSON payload should be ignored =====
            it('Should ignore non-JSON payloads', async function () {
                this.timeout(5000);

                // First set a known value
                await publishFromBroker(topic('battery', 256, 'Dc/0/Voltage'), payload(12.85));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // Now send invalid JSON
                await publishFromBroker(`N/${PORTAL_ID}/battery/256/Dc/0/Voltage`, 'this is not json');
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // Value should still be 12.85
                const state = await harness.states.getStateAsync('victron-cerbo.0.battery.256.Dc.0.Voltage');
                if (state && state.val !== 12.85) {
                    throw new Error(`Expected value 12.85 to be preserved, got ${state.val}`);
                }
            });

            // ===== Undefined value (empty JSON) should skip =====
            it('Should skip messages with undefined value', async function () {
                this.timeout(5000);

                await publishFromBroker(`N/${PORTAL_ID}/custom/0/SkipThis`, JSON.stringify({}));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const obj = await harness.objects.getObjectAsync('victron-cerbo.0.custom.0.SkipThis');
                if (obj) {
                    throw new Error('State should not be created for undefined value');
                }
            });

            // ===== Wrong prefix (not N/) should be ignored =====
            it('Should ignore non-N/ topics', async function () {
                this.timeout(5000);

                await publishFromBroker(`X/${PORTAL_ID}/battery/256/Dc/0/Voltage`, payload(999));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                // The battery voltage should still have the value from before (12.85)
                const state = await harness.states.getStateAsync('victron-cerbo.0.battery.256.Dc.0.Voltage');
                if (state && state.val === 999) {
                    throw new Error('Non-N/ topics should be ignored');
                }
            });

            // ===== Null value test =====
            it('Should handle null value', async function () {
                this.timeout(5000);

                await publishFromBroker(topic('battery', 256, 'CustomName'), payload(null));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const state = await harness.states.getStateAsync('victron-cerbo.0.battery.256.CustomName');
                if (!state) {
                    throw new Error('State should exist for null value');
                }
                if (state.val !== null) {
                    throw new Error(`Expected null, got ${JSON.stringify(state.val)}`);
                }
            });

            // ===== Wrong portal ID should be ignored =====
            it('Should ignore messages from different portal ID', async function () {
                this.timeout(5000);

                await publishFromBroker(`N/differentPortalId/battery/256/Dc/0/Voltage`, payload(777));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const state = await harness.states.getStateAsync('victron-cerbo.0.battery.256.Dc.0.Voltage');
                if (state && state.val === 777) {
                    throw new Error('Messages with different portal ID should be ignored');
                }
            });

            // ===== Verify parent folder structure =====
            it('Should create device and channel hierarchy', async function () {
                this.timeout(5000);

                // After all previous tests, check hierarchy for battery
                const device = await harness.objects.getObjectAsync('victron-cerbo.0.battery');
                if (!device || device.type !== 'device') {
                    throw new Error('Expected battery to be a device object');
                }

                const channel = await harness.objects.getObjectAsync('victron-cerbo.0.battery.256');
                if (!channel || channel.type !== 'channel') {
                    throw new Error('Expected battery.256 to be a channel object');
                }

                const subChannel = await harness.objects.getObjectAsync('victron-cerbo.0.battery.256.Dc');
                if (!subChannel || subChannel.type !== 'channel') {
                    throw new Error('Expected battery.256.Dc to be a channel object');
                }
            });

            // ===== Charger relay state (writable, enum) =====
            it('Should handle charger relay write-back', async function () {
                this.timeout(5000);

                await publishFromBroker(topic('charger', 261, 'Relay/0/State'), payload(0));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const obj = await harness.objects.getObjectAsync('victron-cerbo.0.charger.261.Relay.0.State');
                if (!obj) {
                    throw new Error('Charger relay state should exist');
                }
                if (obj.common.write !== true) {
                    throw new Error('Charger relay state should be writable');
                }
                if (!obj.common.states) {
                    throw new Error('Charger relay state should have states enum');
                }

                // Write-back test
                adapterPublished.length = 0;
                await harness.states.setStateAsync('victron-cerbo.0.charger.261.Relay.0.State', 1, false);
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                const writeMsg = adapterPublished.find(m => m.topic === `W/${PORTAL_ID}/charger/261/Relay/0/State`);
                if (!writeMsg) {
                    throw new Error('Expected W/ topic for charger relay write-back');
                }
                const parsed = JSON.parse(writeMsg.payload);
                if (parsed.value !== 1) {
                    throw new Error(`Expected value 1, got ${parsed.value}`);
                }
            });

            // ===== Value update test – same state, new value =====
            it('Should update existing state value', async function () {
                this.timeout(5000);

                // First value
                await publishFromBroker(topic('battery', 256, 'Dc/0/Voltage'), payload(12.5));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                let state = await harness.states.getStateAsync('victron-cerbo.0.battery.256.Dc.0.Voltage');
                if (!state || state.val !== 12.5) {
                    throw new Error(`Expected 12.5, got ${state?.val}`);
                }

                // Updated value
                await publishFromBroker(topic('battery', 256, 'Dc/0/Voltage'), payload(13.2));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                state = await harness.states.getStateAsync('victron-cerbo.0.battery.256.Dc.0.Voltage');
                if (!state || state.val !== 13.2) {
                    throw new Error(`Expected 13.2, got ${state?.val}`);
                }
            });

            // ===== Boolean coercion after initial creation =====
            it('Should consistently coerce boolean-inferred states', async function () {
                this.timeout(5000);

                // Send 1 first
                await publishFromBroker(topic('custom', 1, 'Connected'), payload(1));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                let state = await harness.states.getStateAsync('victron-cerbo.0.custom.1.Connected');
                if (!state || state.val !== true) {
                    throw new Error(`Expected true, got ${state?.val}`);
                }

                // Send 0
                await publishFromBroker(topic('custom', 1, 'Connected'), payload(0));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                state = await harness.states.getStateAsync('victron-cerbo.0.custom.1.Connected');
                if (!state || state.val !== false) {
                    throw new Error(`Expected false, got ${state?.val}`);
                }

                // Send 1 again
                await publishFromBroker(topic('custom', 1, 'Connected'), payload(1));
                await new Promise(resolve => setTimeout(resolve, PROCESS_WAIT));

                state = await harness.states.getStateAsync('victron-cerbo.0.custom.1.Connected');
                if (!state || state.val !== true) {
                    throw new Error(`Expected true again, got ${state?.val}`);
                }
            });
        });
    },
});
