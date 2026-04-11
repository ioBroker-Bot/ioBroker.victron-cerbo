/**
 * Infer role and unit from a state name.
 * Handles both exact matches ("Voltage") and compound names ("ChargeVoltage", "MinCurrent").
 * The last matching keyword in the name wins.
 */

interface InferredMeta {
    role: string;
    unit: string;
    asBoolean?: boolean;
}

/**
 * Keywords to match against state names.
 * Order matters: more specific patterns first, generic ones last.
 * The regex is matched case-insensitively against the full state name.
 */
const NAME_PATTERNS: { pattern: RegExp; role: string; unit: string; asBoolean?: boolean }[] = [
    // Percentage values
    { pattern: /Soc$/i, role: 'value.battery', unit: '%' },
    { pattern: /Level$/i, role: 'value', unit: '%' },
    { pattern: /Percentage/i, role: 'value', unit: '%' },
    { pattern: /Humidity/i, role: 'value.humidity', unit: '%' },

    // Electrical - Voltage (must be before "age" false positive)
    { pattern: /Voltage/i, role: 'value.voltage', unit: 'V' },

    // Electrical - Current (Ampere)
    { pattern: /Current(?!Limit)/i, role: 'value.current', unit: 'A' },
    { pattern: /CurrentLimit/i, role: 'level', unit: 'A' },
    { pattern: /^I$/i, role: 'value.current', unit: 'A' },

    // Electrical - Power
    { pattern: /Power$/i, role: 'value.power', unit: 'W' },
    { pattern: /^P$/i, role: 'value.power', unit: 'W' },
    { pattern: /^S$/i, role: 'value.power', unit: 'VA' },

    // Energy
    { pattern: /Energy/i, role: 'value.power.consumption', unit: 'kWh' },
    { pattern: /Yield/i, role: 'value.power.consumption', unit: 'kWh' },
    { pattern: /ChargedEnergy/i, role: 'value', unit: 'kWh' },
    { pattern: /DischargedEnergy/i, role: 'value', unit: 'kWh' },

    // Temperature
    { pattern: /Temperature/i, role: 'value.temperature', unit: '°C' },
    { pattern: /Temp$/i, role: 'value.temperature', unit: '°C' },

    // Capacity / Amphours
    { pattern: /Amphours/i, role: 'value', unit: 'Ah' },
    { pattern: /Capacity$/i, role: 'value', unit: 'Ah' },
    { pattern: /TotalAhDrawn/i, role: 'value', unit: 'Ah' },

    // Time
    { pattern: /TimeToGo/i, role: 'value', unit: 's' },
    { pattern: /TimeSince/i, role: 'value', unit: 's' },
    { pattern: /Runtime$/i, role: 'value', unit: 's' },
    { pattern: /Timeout$/i, role: 'value', unit: 's' },

    // Frequency
    { pattern: /Frequency/i, role: 'value', unit: 'Hz' },

    // Pressure
    { pattern: /Pressure/i, role: 'value', unit: 'hPa' },

    // Volume
    { pattern: /Remaining$/i, role: 'value', unit: 'm³' },

    // Speed
    { pattern: /Speed$/i, role: 'value', unit: 'rpm' },

    // Factor
    { pattern: /Factor$/i, role: 'value', unit: '' },

    // Boolean-like patterns (0/1 values treated as boolean)
    { pattern: /^Connected$/i, role: 'indicator.connected', unit: '', asBoolean: true },
    { pattern: /^Active$/i, role: 'indicator', unit: '', asBoolean: true },
    { pattern: /^Enabled$/i, role: 'indicator', unit: '', asBoolean: true },
    { pattern: /^IsActive$/i, role: 'indicator', unit: '', asBoolean: true },
    { pattern: /^Present$/i, role: 'indicator', unit: '', asBoolean: true },
    { pattern: /^BmsPresent$/i, role: 'indicator', unit: '', asBoolean: true },
    { pattern: /^Silenced$/i, role: 'indicator', unit: '', asBoolean: true },

    // Alarm patterns
    { pattern: /^Alarm/i, role: 'indicator.alarm', unit: '' },

    // Info patterns
    { pattern: /^Serial$/i, role: 'info.serial', unit: '' },
    { pattern: /^ProductName$/i, role: 'info.name', unit: '' },
    { pattern: /^CustomName$/i, role: 'info.name', unit: '' },
    { pattern: /^FirmwareVersion$/i, role: 'info.firmware', unit: '' },
    { pattern: /^HardwareVersion$/i, role: 'info.hardware', unit: '' },
    { pattern: /^Hostname$/i, role: 'info.name', unit: '' },
    { pattern: /^IPAddress$/i, role: 'info.ip', unit: '' },
    { pattern: /^Address$/i, role: 'info.address', unit: '' },

    // Mode/State - writable
    { pattern: /^Mode$/i, role: 'level', unit: '' },

    // State - read only
    { pattern: /^State$/i, role: 'value', unit: '' },
    { pattern: /^ErrorCode$/i, role: 'value', unit: '' },
    { pattern: /^Status$/i, role: 'value', unit: '' },
];

export function inferFromName(name: string): InferredMeta | null {
    for (const entry of NAME_PATTERNS) {
        if (entry.pattern.test(name)) {
            return { role: entry.role, unit: entry.unit, asBoolean: entry.asBoolean };
        }
    }
    return null;
}
