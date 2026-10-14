"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cerboProxy_1 = require("./cerboProxy");
/** Read the cookies of a request */
function parseCookies(header) {
    const cookies = {};
    for (const part of (header || '').split(';')) {
        const pos = part.indexOf('=');
        if (pos > 0) {
            try {
                cookies[part.substring(0, pos).trim()] = decodeURIComponent(part.substring(pos + 1).trim());
            }
            catch {
                // malformed cookie
            }
        }
    }
    return cookies;
}
class VictronCerboWebExtension {
    adapter;
    webSettings;
    /** `victron-cerbo.0` */
    namespace;
    /** `/victron-cerbo.0` */
    prefix;
    proxy = null;
    stopped = false;
    restoreUpgrades = null;
    constructor(server, webSettings, adapter, instanceSettings, app) {
        this.adapter = adapter;
        this.webSettings = webSettings;
        this.namespace = instanceSettings._id.substring('system.adapter.'.length);
        this.prefix = `/${this.namespace}`;
        const config = instanceSettings.native;
        if (!config.mqttHost) {
            adapter.log.warn(`No address of the Cerbo configured in ${this.namespace}, its web interface is not shown`);
            return;
        }
        this.proxy = new cerboProxy_1.CerboProxy(config.mqttHost, adapter.log);
        app.use(this.prefix, this.onRequest);
        this.restoreUpgrades = (0, cerboProxy_1.interceptUpgrades)(server, this.onUpgrade);
        adapter.log.info(`Install extension on ${this.prefix}/ -> http://${config.mqttHost}/`);
    }
    onRequest = (req, res, next) => {
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
    onUpgrade = (req, socket, head) => {
        const url = req.url || '';
        if (this.stopped || !this.proxy || !url.startsWith(`${this.prefix}/`)) {
            return false;
        }
        const path = url.substring(this.prefix.length);
        void this.isAuthenticated(req).then(ok => {
            if (ok) {
                this.proxy.handleUpgrade(req, socket, head, path);
            }
            else {
                (0, cerboProxy_1.rejectUpgrade)(socket, 401, 'Unauthorized');
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
    async isAuthenticated(req) {
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
    getSession(id) {
        return new Promise(resolve => {
            try {
                this.adapter.getSession(id, obj => resolve(obj || null));
            }
            catch {
                resolve(null);
            }
        });
    }
    /** Entry on the start page of web */
    welcomePage() {
        return {
            link: `${this.namespace}/gui-v2/`,
            name: 'Victron Cerbo GX',
            img: 'adapter/victron-cerbo/victron-cerbo.svg',
            color: '#1f2535',
            order: 10,
            pro: false,
        };
    }
    unload() {
        // The express route stays, but passes everything on from now
        this.stopped = true;
        this.restoreUpgrades?.();
        this.restoreUpgrades = null;
        return Promise.resolve();
    }
}
exports.default = VictronCerboWebExtension;
//# sourceMappingURL=web.js.map