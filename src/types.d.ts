export interface VictronCerboAdapterConfig {
    mqttHost: string;
    mqttPort: number | string;
    mqttClientId: string;
    portalId: string;
    keepaliveInterval: number;
    user: string;
    password: string;
    /** Own web server for the tab in admin, which shows the web interface of the Cerbo */
    webServer: boolean;
    /** Address of the own web server; admin reaches it through `native.bind` */
    bind: string;
    /** Port of the own web server; admin reaches it through `native.port` */
    port: number | string;
    /** Web instance that shows the web interface of the Cerbo as an extension, `*` for all */
    webInstance: string;
}
