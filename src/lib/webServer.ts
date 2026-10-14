import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { CerboProxy, rejectUpgrade, sanitizePrefix } from './cerboProxy';

/**
 * Own web server of the adapter for the tab in admin.
 *
 * Admin (with `common.adminTab.proxy`) passes `/proxy/victron-cerbo.0/…` on to `native.bind`:`native.port` of the
 * instance, behind its own login, and tells the prefix in `X-Forwarded-Prefix`. This server passes the requests on to
 * the Cerbo. By default it listens on 127.0.0.1 only, so the Cerbo is not reachable through it from the outside.
 */

// Exclusive-resource registry of js-controller 8 (the part used here). The installed types and
// older controllers do not have it, so it is probed at runtime.
type TcpPortResource = { port: number; bind?: string };
interface ResourceRegistry {
    registerUsedResource(type: 'tcpPort', data: TcpPortResource): Promise<void>;
    checkUsedResource?(type: 'tcpPort', data?: Partial<TcpPortResource>): Promise<{ instance: string }[]>;
}

export class CerboWebServer {
    private readonly adapter: ioBroker.Adapter;

    private readonly proxy: CerboProxy;

    private readonly port: number;

    private readonly bind: string;

    private server: http.Server | null = null;

    /**
     * @param adapter adapter instance
     * @param cerboHost host name or IP address of the Cerbo
     * @param port port to listen on
     * @param bind address to listen on
     */
    constructor(adapter: ioBroker.Adapter, cerboHost: string, port: number, bind: string) {
        this.adapter = adapter;
        this.proxy = new CerboProxy(cerboHost, adapter.log);
        this.port = port;
        this.bind = bind || '127.0.0.1';
    }

    /** The exclusive-resource API of js-controller 8, or null if the controller does not have it */
    private resourceRegistry(): ResourceRegistry | null {
        const registry = this.adapter as unknown as ResourceRegistry;
        return typeof registry.registerUsedResource === 'function' ? registry : null;
    }

    /** Address for the registry entries; a wildcard bind is the registry's default anyway */
    private usedBind(): string | undefined {
        return this.bind !== '0.0.0.0' ? this.bind : undefined;
    }

    private async warnIfPortUsed(): Promise<void> {
        const registry = this.resourceRegistry();
        if (!registry?.checkUsedResource) {
            return;
        }
        try {
            const holders = await registry.checkUsedResource('tcpPort', { port: this.port, bind: this.usedBind() });
            if (holders.length) {
                this.adapter.log.warn(
                    `Port ${this.port} is already used by ${holders.map(h => h.instance).join(', ')}. The web server for the Cerbo will probably not start.`,
                );
            }
        } catch (err) {
            this.adapter.log.debug(`Cannot check if port ${this.port} is free: ${(err as Error).message}`);
        }
    }

    /** Reports the port to js-controller (>= 8), so it shows up as occupied */
    private async registerUsedPort(): Promise<void> {
        const registry = this.resourceRegistry();
        if (!registry) {
            return;
        }
        try {
            await registry.registerUsedResource('tcpPort', { port: this.port, bind: this.usedBind() });
        } catch (err) {
            this.adapter.log.warn(`Cannot register port ${this.port} as used: ${(err as Error).message}`);
        }
    }

    private onRequest = (req: IncomingMessage, res: ServerResponse): void => {
        this.proxy.handleRequest(req, res, req.url || '/', sanitizePrefix(req.headers['x-forwarded-prefix']));
    };

    private onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
        if (!req.url?.startsWith('/')) {
            rejectUpgrade(socket, 404, 'Not Found');
            return;
        }
        this.proxy.handleUpgrade(req, socket, head, req.url);
    };

    async start(): Promise<void> {
        await this.warnIfPortUsed();

        const server = http.createServer(this.onRequest);
        server.on('upgrade', this.onUpgrade);
        this.server = server;

        await new Promise<void>(resolve => {
            server.once('error', (err: Error) => {
                this.adapter.log.error(
                    `Cannot start the web server for the Cerbo on ${this.bind}:${this.port}: ${err}`,
                );
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

    stop(): Promise<void> {
        const server = this.server;
        this.server = null;
        if (!server) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            server.close(() => resolve());
            // Open web sockets of GUI v2 would keep the server alive
            server.closeAllConnections();
        });
    }
}
