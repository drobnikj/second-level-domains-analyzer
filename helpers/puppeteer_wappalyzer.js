const Wappalyzer = require('wappalyzer/wappalyzer');
const appsJson = require('wappalyzer/apps.json');

const APPS = appsJson.apps;
const CATEGORIES = appsJson.categories;


/**
 * Class extends Wappalyzer class for using Puppeteer page
 * TODO: Create npm package from this module, we can use it in other Apify projects
 */
module.exports = class PuppeteerWappalyzer extends Wappalyzer {
    constructor() {
        super();
        this.detectedApps = {};
        this.apps = APPS;
        this.categories = CATEGORIES;
        this.parseJsPatterns();
        this.driver.log = (message, source, type) => console.log(`Wappalyzer: ${message}`, source, type);
        this.driver.displayApps = (detected) => {
            Object.keys(detected).forEach(appName => {
                const app = detected[appName];
                this.detectedApps[appName] = {
                    name: app.name,
                    confidence: app.confidenceTotal.toString(),
                    version: app.version,
                    icon: app.props.icon || 'default.svg',
                    website: app.props.website,
                    categories: app.props.cats,
                };
            });
        };
    }

    async parseJs(page) {
        const patterns = this.jsPatterns;

        return await page.evaluate(async (patterns) => {
            const js = {};
            Object.keys(patterns).forEach(appName => {
                js[appName] = {};

                Object.keys(patterns[appName]).forEach(chain => {
                    js[appName][chain] = {};

                    patterns[appName][chain].forEach((pattern, index) => {
                        const properties = chain.split('.');

                        let value = properties.reduce((parent, property) => {
                            return parent && parent.hasOwnProperty(property) ? parent[property] : null;
                        }, window);

                        value = typeof value === 'string' || typeof value === 'number' ? value : !!value;

                        if (value) {
                            js[appName][chain][index] = value;
                        }
                    });
                });
            });
            return js;
        }, patterns);
    };

    parseHeaders(puppeteerHeaders) {
        const parsedHeaders = {};
        Object.keys(puppeteerHeaders).forEach(key => parsedHeaders[key] = [puppeteerHeaders[key]]);
        return parsedHeaders;
    };

    async analyze(headers, page) {
        // Analyse
        const url = page.url();
        console.time(`${url} technologyAnalyser.analyse`);
        const parsedHeaders = this.parseHeaders(headers);
        const html = await page.evaluate('document.documentElement.outerHTML');
        const scripts = await page.$$eval('script', scripts => scripts.map(script => script.getAttribute('src')));
        const js = await this.parseJs(page);
        const cookies = await page.cookies();
        await super.analyze(url, {
            parsedHeaders,
            html,
            scripts,
            js,
            cookies,
        }, { url });

        console.timeEnd(`${url} technologyAnalyser.analyse`);
        return Object.values(this.detectedApps);
    }
};
