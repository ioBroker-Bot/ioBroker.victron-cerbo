/**
 * Web extension: runs in the process of ioBroker.web and shows the web interface of the Cerbo (GUI v2) under
 * `/victron-cerbo.0/`, behind the login of web and without a port of its own.
 */
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { CerboProxy, interceptUpgrades, rejectUpgrade } from './cerboProxy';
import type { VictronCerboAdapterConfig } from '../types';

// The part of express used here; express itself belongs to web
type Request = IncomingMessage & { url: string; originalUrl: string; rawBody?: Buffer };
type Response = ServerResponse & { redirect(status: number, url: string): void };
type NextFunction = () => void;
interface Express {
    use(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): void;
}

/** Read the cookies of a request */
function parseCookies(header: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const part of (header || '').split(';')) {
        const pos = part.indexOf('=');
        if (pos > 0) {
            try {
                cookies[part.substring(0, pos).trim()] = decodeURIComponent(part.substring(pos + 1).trim());
            } catch {
                // malformed cookie
            }
        }
    }
    return cookies;
}

export default class VictronCerboWebExtension {
    private readonly adapter: ioBroker.Adapter;

    private readonly webSettings: { auth?: boolean };

    /** `victron-cerbo.0` */
    private readonly namespace: string;

    /** `/victron-cerbo.0` */
    private readonly prefix: string;

    private readonly proxy: CerboProxy | null = null;

    private stopped = false;

    private restoreUpgrades: (() => void) | null = null;

    constructor(
        server: HttpServer | HttpsServer,
        webSettings: { secure: boolean; port: number; auth?: boolean; defaultUser?: string },
        adapter: ioBroker.Adapter,
        instanceSettings: ioBroker.InstanceObject,
        app: Express,
    ) {
        this.adapter = adapter;
        this.webSettings = webSettings;
        this.namespace = instanceSettings._id.substring('system.adapter.'.length);
        this.prefix = `/${this.namespace}`;
        const config = instanceSettings.native as VictronCerboAdapterConfig;

        if (!config.mqttHost) {
            adapter.log.warn(`No address of the Cerbo configured in ${this.namespace}, its web interface is not shown`);
            return;
        }
        this.proxy = new CerboProxy(config.mqttHost, adapter.log);

        app.use(this.prefix, this.onRequest);
        this.restoreUpgrades = interceptUpgrades(server as HttpServer, this.onUpgrade);

        adapter.log.info(`Install extension on ${this.prefix}/ -> http://${config.mqttHost}/`);
    }

    private onRequest = (req: Request, res: Response, next: NextFunction): void => {
        if (this.stopped || !this.proxy) {
            next();
            return;
        }
        // Without the trailing slash, the browser would resolve the relative URLs of GUI v2 next to the prefix
        if (req.originalUrl.split('?')[0] === this.prefix) {
            res.redirect(301, `${this.prefix}/gui-v2/`);
            return;
        }
        this.proxy.handleRequest(req, res, req.url, this.prefix);
    };

    private onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
        const url = req.url || '';
        if (this.stopped || !this.proxy || !url.startsWith(`${this.prefix}/`)) {
            return false;
        }
        const path = url.substring(this.prefix.length);
        void this.isAuthenticated(req).then(ok => {
            if (ok) {
                this.proxy!.handleUpgrade(req, socket, head, path);
            } else {
                rejectUpgrade(socket, 401, 'Unauthorized');
            }
        });
        return true;
    };

    /**
     * Upgrade requests do not pass the login of web (an express middleware), so it is checked here: the same token
     * or session the pages of web are opened with.
     *
     * @param req upgrade request
     */
    private async isAuthenticated(req: IncomingMessage): Promise<boolean> {
        if (!this.webSettings.auth) {
            return true;
        }
        const cookies = parseCookies(req.headers.cookie);
        const now = Date.now();

        if (cookies.access_token) {
            const session = await this.getSession(`a:${cookies.access_token}`);
            if (session?.user && session.aExp > now) {
                return true;
            }
        }
        // `s:<session id>.<signature>`
        const sid = cookies['connect.sid']?.startsWith('s:') ? cookies['connect.sid'].slice(2).split('.')[0] : '';
        if (sid) {
            const session = await this.getSession(sid);
            if (session?.passport?.user) {
                return true;
            }
        }
        return false;
    }

    private getSession(id: string): Promise<Record<string, any> | null> {
        return new Promise(resolve => {
            try {
                this.adapter.getSession(id, obj => resolve((obj as Record<string, any>) || null));
            } catch {
                resolve(null);
            }
        });
    }

    /** Entry on the start page of web */
    welcomePage(): { link: string; name: string; img: string; color: string; order: number; pro: boolean } {
        return {
            link: `${this.namespace}/gui-v2/`,
            name: 'Victron Cerbo GX',
            img: 'adapter/victron-cerbo/victron-cerbo.svg',
            color: '#1f2535',
            order: 10,
            pro: false,
        };
    }

    unload(): Promise<void> {
        // The express route stays, but passes everything on from now
        this.stopped = true;
        this.restoreUpgrades?.();
        this.restoreUpgrades = null;
        return Promise.resolve();
    }
}
