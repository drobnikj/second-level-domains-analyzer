const Wappalyzer = require('wappalyzer/wappalyzer');
const appsJson = require('wappalyzer/apps.json');


/**
 * Class extends Wappalyzer class for using Puppeteer page
 * TODO: Create npm package from this module, we can use it in other Apify projects
 */
module.exports = class PuppeteerWappalyzer extends Wappalyzer {
    constructor() {
        super();
        this.detectedApps = {};
        this.apps = appsJson.apps;
        this.categories = appsJson.categories;
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

    /**
     * This method preparses js for Wappalyzer
     * @param wappalyzer
     * @param page
     */
    async parseJs (page) {
        const patterns = this.jsPatterns;
        const js = {};

        for (const appName of Object.keys(patterns)) {
            js[appName] = {};

            for (const chain of Object.keys(patterns[appName])) {
                js[appName][chain] = {};

                let index = 0;
                for (const pattern of patterns[appName][chain]) {
                    const properties = chain.split('.');

                    const value = await page.evaluate((properties) => {
                        properties.reduce((parent, property) => {
                            return parent && parent.hasOwnProperty(property) ? parent[property] : null;
                        }, window);
                    }, properties);


                    if (value) {
                        js[appName][chain][index] = value;
                    }
                    index++
                }
            }
        }
        return js;
    };

    parseHeaders(puppeteerHeaders) {
        const parsedHeaders = {};
        Object.keys(puppeteerHeaders).forEach(key => parsedHeaders[key] = [puppeteerHeaders[key]]);
        return parsedHeaders;
    };

    async analyze(pageResponse, page) {
        // Analyse
        const url = page.url();
        const headers = this.parseHeaders(pageResponse.headers());
        const html = await page.evaluate('document.documentElement.outerHTML');
        const scripts = await page.$$eval('script', scripts => scripts.map(script => script.getAttribute('src')));
        const js = await this.parseJs(page);
        const cookies = await page.cookies();
        await super.analyze(url, {
            headers,
            html,
            scripts,
            js,
            cookies,
        }, { url });

        return Object.values(this.detectedApps);
    }
};
