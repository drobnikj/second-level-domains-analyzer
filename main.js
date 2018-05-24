const Apify = require('apify');
const { URL } = require('url');
const Wappalyzer = require('wappalyzer/wappalyzer');
const appsJson = require('wappalyzer/apps.json');
const dns = require('dns');
const { promisify } = require('util');

const MAX_PAGE_PER_DOMAIN = 3;

const dnsLookup = promisify(dns.lookup);
const dnsResolve6 = promisify(dns.resolve6);

/**
 * Return all deduplicate links from puppeteer page,
 * omits query strings and hash tags from all links
 * @param page
 * @return {Promise<*>}
 */
const findLinksOnPage = async (page) => {
    const links = await page.$$eval('a[href]', (els) => {
        const dedupHrefs = {};
        els.forEach(el => {
            if (el.href) {
                // Omit query params and hash tags
                const url = el.href.split('#')[0].split('?')[0];
                dedupHrefs[url] = '';
            }
        });
        return dedupHrefs;
    });
    return Object.keys(links);
};

/**
 * TODO formats and comments
 */
const pageTechnologyAnalyzer = async (pageResponse, page) => {
    const foundTechnologise = {};
    // Create instance of Wappalyzer
    const wappalyzer = new Wappalyzer();
    wappalyzer.apps = appsJson.apps;
    wappalyzer.categories = appsJson.categories;
    wappalyzer.parseJsPatterns();
    wappalyzer.driver.log = (message, source, type) => console.log(`Wappalyzer: ${message}`, source, type);
    wappalyzer.driver.displayApps = (detected) => {
        Object.keys(detected).forEach(appName => {
            const app = detected[appName];
            foundTechnologise[appName] = {
                name: app.name,
                confidence: app.confidenceTotal.toString(),
                version: app.version,
                icon: app.props.icon || 'default.svg',
                website: app.props.website,
                categories: app.props.cats,
            };
        });
    };
    const parseJs = async (wappalyzer, page) => {
        const patterns = wappalyzer.jsPatterns;
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
    const headers = pageResponse.headers();
    const updatedHeaders = {};
    Object.keys(headers).forEach(key => updatedHeaders[key] = [headers[key]]);
    await wappalyzer.analyze(page.url(), {
        headers: updatedHeaders,
        html: await page.evaluate('document.documentElement.outerHTML'),
        scripts: await page.$$eval('script', scripts => scripts.map(script => script.getAttribute('src'))),
        js: await parseJs(wappalyzer, page),
        cookies: await page.cookies(),
    });

    return Object.values(foundTechnologise);
};

Apify.main(async () => {
    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    // const requestList = new Apify.RequestList({
    //     sources: [
    //         { requestsFromUrl: 'https://api.apify.com/v2/key-value-stores/hn5YoQaAAYgjiDrjN/records/OUTPUT?disableRedirect=true' },
    //     ],
    //     persistStateKey: 'url-list',
    // });
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.cwordpress.cz/' },
        ],
        persistStateKey: 'url-list',
    });


    await requestList.initialize();

    // Cache for add domains
    const addedDomains = {};

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        minConcurrency: (Apify.isAtHome()) ? 20 : 1,
        launchPuppeteerOptions: { apifyProxyGroups: ['SHADER'] },


        handlePageFunction: async ({ page, request }) => {
            const gotoPageResponse = await page.goto(request.url);
            console.log(`Start analysis ${request.url}`);
            const homePageTitle = await page.title();
            const homePageUrl = new URL(page.url());

            // Finds links with on home page
            const homePageLinks = await findLinksOnPage(page);
            // Find new SLD on page and add them to queue
            const domains = {};
            const nextLinks = {};
            homePageLinks.map(link => {
                try {
                    const url = new URL(link);
                    let spitedHostname = url.hostname.split('.');
                    if (spitedHostname.length >= 3) spitedHostname = spitedHostname.slice(-2); // omit 3rd and more domain
                    if (spitedHostname.slice(-2)[0] === homePageUrl.hostname.split('.').slice(-2)[0]) {
                        // Same host name
                        nextLinks[link] = 'toAdd';
                    } else {
                        // Different host name
                        if (spitedHostname.slice(-1)[0] === 'cz') {
                            const domain = spitedHostname.join('.');
                            if (!addedDomains[domain]) domains[domain] = 'toAdd'
                        }
                    }
                } catch (err) {
                    // maybe bad href
                    console.log(`Error: Bad links ${link}, ${err.message}`);
                }
            });
            // Add domains to queue
            const foundDomains = [];
            for (const domain of Object.keys(domains)) {
                const addToQueue = await requestQueue.addRequest(new Apify.Request({ url: `http://${domain}` }));
                if (!addToQueue.wasAlreadyPresent && !addToQueue.wasAlreadyHandled) foundDomains.push(domain);
                addedDomains[domain] = 'added';
            }
            if (foundDomains.length) console.log(`${request.url} - Found domains ${foundDomains.join(', ')}`);

            const foundNextLinks = Object.keys(nextLinks);
            if(foundNextLinks.length) console.log(`${request.url} - Found next links ${foundNextLinks.join(', ')}`);

            // Page technologies analysis
            const technologyLookupResults = await pageTechnologyAnalyzer(gotoPageResponse, page);

            // Dns lookup for server IP and maybe IPv6 support
            const { address: serverIPv4address } = await dnsLookup(homePageUrl.hostname, { family: 4 });
            let isIPv6Support = false;
            try {
                await dnsResolve6(homePageUrl.hostname);
                isIPv6Support = true;
            } catch (e) {
                // No data for IPv6 lookup
            }



            await Apify.pushData({
                url: page.url(),
                domain: homePageUrl.hostname.split('.').slice(-2).join('.'),
                protocol: homePageUrl.protocol,
                title: homePageTitle,
                foundDomains,
                foundNextLinks,
                technologies: technologyLookupResults,
                serverIPv4address,
                isIPv6Support,
            });

            console.log(`Finish analysis for ${request.url}`);
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
            await Apify.pushData({
                url: request.url,
                isFailed: true,
                errors: request.errorMessages
            });
        },
    });

    // Run crawler.
    await crawler.run();
});
