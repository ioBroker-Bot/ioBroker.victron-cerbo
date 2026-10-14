"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CerboWebServer = void 0;
const node_http_1 = __importDefault(require("node:http"));
const cerboProxy_1 = require("./cerboProxy");
class CerboWebServer {
    adapter;
    proxy;
    port;
    bind;
    server = null;
    /**
     * @param adapter adapter instance
     * @param cerboHost host name or IP address of the Cerbo
     * @param port port to listen on
     * @param bind address to listen on
     */
    constructor(adapter, cerboHost, port, bind) {
        this.adapter = adapter;
        this.proxy = new cerboProxy_1.CerboProxy(cerboHost, adapter.log);
        this.port = port;
        this.bind = bind || '127.0.0.1';
    }
    /** The exclusive-resource API of js-controller 8, or null if the controller does not have it */
    resourceRegistry() {
        const registry = this.adapter;
        return typeof registry.registerUsedResource === 'function' ? registry : null;
    }
    /** Address for the registry entries; a wildcard bind is the registry's default anyway */
    usedBind() {
        return this.bind !== '0.0.0.0' ? this.bind : undefined;
    }
    async warnIfPortUsed() {
        const registry = this.resourceRegistry();
        if (!registry?.checkUsedResource) {
            return;
        }
        try {
            const holders = await registry.checkUsedResource('tcpPort', { port: this.port, bind: this.usedBind() });
            if (holders.length) {
                this.adapter.log.warn(`Port ${this.port} is already used by ${holders.map(h => h.instance).join(', ')}. The web server for the Cerbo will probably not start.`);
            }
        }
        catch (err) {
            this.adapter.log.debug(`Cannot check if port ${this.port} is free: ${err.message}`);
        }
    }
    /** Reports the port to js-controller (>= 8), so it shows up as occupied */
    async registerUsedPort() {
        const registry = this.resourceRegistry();
        if (!registry) {
            return;
        }
        try {
            await registry.registerUsedResource('tcpPort', { port: this.port, bind: this.usedBind() });
        }
        catch (err) {
            this.adapter.log.warn(`Cannot register port ${this.port} as used: ${err.message}`);
        }
    }
    onRequest = (req, res) => {
        this.proxy.handleRequest(req, res, req.url || '/', (0, cerboProxy_1.sanitizePrefix)(req.headers['x-forwarded-prefix']));
    };
    onUpgrade = (req, socket, head) => {
        if (!req.url?.startsWith('/')) {
            (0, cerboProxy_1.rejectUpgrade)(socket, 404, 'Not Found');
            return;
        }
        this.proxy.handleUpgrade(req, socket, head, req.url);
    };
    async start() {
        await this.warnIfPortUsed();
        const server = node_http_1.default.createServer(this.onRequest);
        server.on('upgrade', this.onUpgrade);
        this.server = server;
        await new Promise(resolve => {
            server.once('error', (err) => {
                this.adapter.log.error(`Cannot start the web server for the Cerbo on ${this.bind}:${this.port}: ${err}`);
                this.server = null;
                resolve();
            });
            server.listen(this.port, this.bind, () => {
                this.adapter.log.info(`Web server for the Cerbo listens on ${this.bind}:${this.port}`);
                void this.registerUsedPort();
                resolve();
            });
        });
    }
    stop() {
        const server = this.server;
        this.server = null;
        if (!server) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            server.close(() => resolve());
            // Open web sockets of GUI v2 would keep the server alive
            server.closeAllConnections();
        });
    }
}
exports.CerboWebServer = CerboWebServer;
//# sourceMappingURL=webServer.js.map