import http, {
    type IncomingHttpHeaders,
    type IncomingMessage,
    type OutgoingHttpHeaders,
    type Server,
    type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';
import zlib from 'node:zlib';

/**
 * Proxy to the web interface of the Cerbo GX (GUI v2 on port 80), so it can be opened below a path of admin or web.
 *
 * GUI v2 loads its files relatively, only the MQTT web socket goes to the root of the host:
 * `document.location.host + '/websocket-mqtt'` in `index.html`. Below a prefix that address is rewritten, and the
 * redirects and cookies of the Cerbo are moved below the prefix too.
 */

/** Headers of one connection, which are never passed on (RFC 9110, 7.6.1) */
const HOP_BY_HOP_HEADERS = [
    'connection',
    'keep-alive',
    'proxy-connection',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'http2-settings',
];

/** Cookies of the ioBroker login, which the Cerbo has no business with */
const IOBROKER_COOKIES = ['access_token', 'refresh_token', 'connect.sid'];

/** The web socket address of GUI v2 in `index.html`, as a quoted string */
const MQTT_WEBSOCKET_PATH = /(['"])\/websocket-mqtt\1/g;

/** A prefix only goes into a JavaScript string and into headers, so it may consist of path characters only */
const SAFE_PREFIX = /^(\/[A-Za-z0-9._~-]+)*$/;

interface Logger {
    debug(message: string): void;
    warn(message: string): void;
}

/** Request of web with the body that its body parsers have already read */
type ProxyRequest = IncomingMessage & { rawBody?: Buffer };

/**
 * Returns the prefix if it can be used as one, else an empty string
 *
 * @param prefix path below which the browser sees the Cerbo, without a trailing slash: `/proxy/victron-cerbo.0`
 */
export function sanitizePrefix(prefix: string | string[] | undefined): string {
    const value = (Array.isArray(prefix) ? prefix[0] : prefix || '').replace(/\/+$/, '');
    return SAFE_PREFIX.test(value) ? value : '';
}

/** Answer an upgrade request that is not passed on and close the connection */
export function rejectUpgrade(socket: Duplex, status: number, text: string): void {
    if (socket.writable) {
        socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } else {
        socket.destroy();
    }
}

/** Status line and headers of an answer to an upgrade request, as they go back to the browser */
function createHeaderBlock(statusLine: string, rawHeaders: string[]): string {
    const lines = [statusLine];
    for (let i = 0; i < rawHeaders.length; i += 2) {
        lines.push(`${rawHeaders[i]}: ${rawHeaders[i + 1]}`);
    }
    return `${lines.join('\r\n')}\r\n\r\n`;
}

/**
 * Take the upgrade requests for some URLs before the other listeners of the server see them.
 *
 * The web socket servers of admin and web take every upgrade request, and all listeners of an event are called, so
 * another `upgrade` listener cannot keep them away. The request is taken out of `emit` instead.
 *
 * @param server server whose upgrade requests are taken
 * @param handler returns true if it has taken the request
 * @returns function that gives the upgrade requests back to the server
 */
export function interceptUpgrades(
    server: Server,
    handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean,
): () => void {
    const emit = server.emit;
    const intercepted = ((event: string | symbol, ...args: any[]): boolean => {
        if (event === 'upgrade' && handler(args[0], args[1], args[2])) {
            return true;
        }
        return emit.apply(server, [event, ...args] as Parameters<typeof emit>);
    }) as typeof server.emit;
    server.emit = intercepted;

    // Node.js emits `upgrade` only if somebody listens to it
    const fallback = (_req: IncomingMessage, socket: Duplex): void => {
        if (server.listenerCount('upgrade') === 1) {
            socket.destroy();
        }
    };
    server.on('upgrade', fallback);

    return (): void => {
        server.off('upgrade', fallback);
        // Only if nobody has wrapped it again in the meantime
        if (server.emit === intercepted) {
            server.emit = emit;
        }
    };
}

export class CerboProxy {
    /** Host name or IP address of the Cerbo */
    private readonly host: string;

    private readonly log: Logger;

    /**
     * @param host host name or IP address of the Cerbo
     * @param log logger
     */
    constructor(host: string, log: Logger) {
        this.host = host;
        this.log = log;
    }

    /**
     * Headers for the request to the Cerbo: those of the browser, without the login of ioBroker
     *
     * @param headers headers of the browser
     */
    private getRequestHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
        const result: OutgoingHttpHeaders = {};
        for (const [name, value] of Object.entries(headers)) {
            // `:authority`, `:path` and the other pseudo-headers of HTTP/2
            if (value !== undefined && !name.startsWith(':') && !HOP_BY_HOP_HEADERS.includes(name)) {
                result[name] = value;
            }
        }
        // Basic or Bearer login of ioBroker
        delete result.authorization;
        delete result.referer;

        if (typeof headers.cookie === 'string') {
            const cookies = headers.cookie
                .split(';')
                .map(part => part.trim())
                .filter(part => part && !IOBROKER_COOKIES.includes(part.split('=')[0]));
            if (cookies.length) {
                result.cookie = cookies.join('; ');
            } else {
                delete result.cookie;
            }
        }

        // The Cerbo sees requests of its own page
        result.host = this.host;
        if (result.origin) {
            result.origin = `http://${this.host}`;
        }
        return result;
    }

    /**
     * A redirect of the Cerbo, e.g., from `/` to `/gui-v2`, must stay below the prefix
     *
     * @param location `Location` header of the Cerbo
     * @param prefix path below which the browser sees the Cerbo
     */
    private rewriteLocation(location: string, prefix: string): string {
        if (location.startsWith('/') && !location.startsWith('//')) {
            return `${prefix}${location}`;
        }
        try {
            const url = new URL(location);
            if (url.hostname === this.host && (!url.port || url.port === '80')) {
                return `${prefix}${url.pathname}${url.search}${url.hash}`;
            }
        } catch {
            // a relative location is resolved by the browser below the prefix anyway
        }
        return location;
    }

    /**
     * A cookie of the Cerbo with `Path=/` would belong to the whole server of admin or web
     *
     * @param cookie `Set-Cookie` header of the Cerbo
     * @param prefix path below which the browser sees the Cerbo
     */
    private static rewriteCookie(cookie: string, prefix: string): string {
        return cookie.replace(/;\s*domain=[^;]*/i, '').replace(/;\s*path=([^;]*)/i, (_match, path: string) => {
            const trimmed = path.trim();
            return `; Path=${prefix}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
        });
    }

    /** Decompressed body of an answer */
    private static decode(body: Buffer, encoding: string | undefined): Buffer {
        switch (encoding) {
            case 'gzip':
            case 'x-gzip':
                return zlib.gunzipSync(body);
            case 'deflate':
                return zlib.inflateSync(body);
            case 'br':
                return zlib.brotliDecompressSync(body);
            default:
                return body;
        }
    }

    /**
     * Pass an HTTP request on to the Cerbo
     *
     * @param req request of the browser
     * @param res answer to the browser
     * @param path path with query on the Cerbo, `/gui-v2/`
     * @param prefix path below which the browser sees the Cerbo, without a trailing slash, or an empty string
     */
    handleRequest(req: ProxyRequest, res: ServerResponse, path: string, prefix: string): void {
        const headers = this.getRequestHeaders(req.headers);
        // The body parsers of web may have read the body already
        const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : req.readableEnded ? Buffer.alloc(0) : null;
        if (body) {
            headers['content-length'] = body.length;
        }

        const proxyReq = http.request({ host: this.host, port: 80, method: req.method, path, headers });

        proxyReq.on('response', proxyRes => {
            const resHeaders: OutgoingHttpHeaders = {};
            for (const [name, value] of Object.entries(proxyRes.headers)) {
                if (value === undefined || HOP_BY_HOP_HEADERS.includes(name)) {
                    continue;
                }
                if (name === 'location' && typeof value === 'string') {
                    resHeaders[name] = this.rewriteLocation(value, prefix);
                } else if (name === 'set-cookie' && Array.isArray(value)) {
                    resHeaders[name] = prefix ? value.map(cookie => CerboProxy.rewriteCookie(cookie, prefix)) : value;
                } else {
                    resHeaders[name] = value;
                }
            }

            const isHtml = (proxyRes.headers['content-type'] || '').includes('text/html');
            if (!prefix || !isHtml || req.method === 'HEAD') {
                res.writeHead(proxyRes.statusCode || 502, resHeaders);
                proxyRes.pipe(res);
                return;
            }

            // A page of the Cerbo: the address of the MQTT web socket has to get the prefix
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('error', () => res.destroy());
            proxyRes.on('end', () => {
                let html: Buffer;
                try {
                    html = CerboProxy.decode(Buffer.concat(chunks), proxyRes.headers['content-encoding']);
                } catch (err) {
                    this.log.debug(`Cannot decode a page of the Cerbo: ${(err as Error).message}`);
                    res.writeHead(502).end('Invalid answer of the Cerbo');
                    return;
                }
                const text = html.toString('utf8').replace(MQTT_WEBSOCKET_PATH, `$1${prefix}/websocket-mqtt$1`);
                const result = Buffer.from(text, 'utf8');
                delete resHeaders['content-encoding'];
                // It is not the page of the Cerbo anymore
                delete resHeaders.etag;
                resHeaders['content-length'] = result.length;
                res.writeHead(proxyRes.statusCode || 502, resHeaders);
                res.end(result);
            });
        });

        proxyReq.on('error', err => {
            this.log.debug(`Request to the Cerbo ${this.host} failed: ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`Cerbo ${this.host} is not reachable`);
            } else {
                res.destroy();
            }
        });

        // A closed browser tab must not leave a request to the Cerbo behind
        res.on('close', () => {
            if (!res.writableFinished) {
                proxyReq.destroy();
            }
        });

        if (body) {
            proxyReq.end(body);
        } else {
            req.pipe(proxyReq);
        }
    }

    /**
     * Pass a web socket connection on to the Cerbo, i.e., the MQTT connection of GUI v2
     *
     * @param req upgrade request
     * @param socket connection to the browser
     * @param head first data of the connection
     * @param path path with query on the Cerbo, `/websocket-mqtt`
     */
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, path: string): void {
        socket.on('error', err => this.log.debug(`Web socket of the browser failed: ${err.message}`));

        const headers = this.getRequestHeaders(req.headers);
        headers.connection = 'Upgrade';
        headers.upgrade = req.headers.upgrade;

        const proxyReq = http.request({ host: this.host, port: 80, method: req.method, path, headers });

        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
            proxySocket.on('error', () => socket.destroy());
            socket.on('error', () => proxySocket.destroy());
            proxySocket.on('close', () => socket.destroy());
            socket.on('close', () => proxySocket.destroy());

            if (proxyHead?.length) {
                proxySocket.unshift(proxyHead);
            }
            socket.write(createHeaderBlock('HTTP/1.1 101 Switching Protocols', proxyRes.rawHeaders));
            proxySocket.pipe(socket).pipe(proxySocket);
        });

        // The Cerbo refused the upgrade: its answer goes back to the browser as it is
        proxyReq.on('response', proxyRes => {
            socket.write(
                createHeaderBlock(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}`, proxyRes.rawHeaders),
            );
            proxyRes.pipe(socket);
        });

        proxyReq.on('error', err => {
            this.log.debug(`Web socket to the Cerbo ${this.host} failed: ${err.message}`);
            rejectUpgrade(socket, 502, 'Bad Gateway');
        });

        if (head?.length) {
            socket.unshift(head);
        }
        proxyReq.end();
    }
}
