export interface VictronCerboAdapterConfig {
    mqttHost: string;
    mqttPort: number | string;
    mqttClientId: string;
    portalId: string;
    keepaliveInterval: number;
    user: string;
    password: string;
}
