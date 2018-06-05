const Apify = require('apify');
const { URL } = require('url');
const PuppeteerWappalyzer = require('./helpers/puppeteer_wappalyzer');
const basicSEOAnalysis = require('./helpers/basic_seo_analysis');
const { jsonLdLookup, microdataLookup } = require('./helpers/ontology_lookups');
const { dnsLookup, dnsResolve6 } = require('./helpers/dns');
const { findLinksOnPage } = require('./helpers/misc');

// require('./helpers/cpuprofiler').init('./profiles_data');

const DEFAULT_PAGE_TIMEOUT = 120000;

Apify.main(async () => {
    const { apifyProxyGroups, requestListSources, tld } = await Apify.getValue('INPUT');

    if (!tld || !requestListSources) {
        throw new Error('Invalid input, you have to specified tld and requestListSources');
    }

    const launchPuppeteerOptions = {};
    if (apifyProxyGroups) {
        launchPuppeteerOptions.useApifyProxy = true;
        launchPuppeteerOptions.proxyGroups = apifyProxyGroups;
    }

    const requestQueue = await Apify.openRequestQueue();

    const requestList = new Apify.RequestList({
        sources: requestListSources,
        persistStateKey: 'url-list',
    });
    await requestList.initialize();

    // Cache for add domains
    const addedDomains = {};

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        pageOpsTimeoutMillis: 3*DEFAULT_PAGE_TIMEOUT,
        maxConcurrency: (Apify.isAtHome()) ? 20 : 1,
        // minConcurrency: 20,
        launchPuppeteerOptions,

        gotoFunction: async ({ request, page }) => {
            console.time(`${request.url} goto`);
            const gotoPageResponse = await page.goto(request.url, { timeout: DEFAULT_PAGE_TIMEOUT });
            request.userData = {
                gotoPageResponse
            };
            console.timeEnd(`${request.url} goto`);
        },

        handlePageFunction: async ({ page, request }) => {
            const loadedUrl = page.url();
            console.log(`Start analysis url: ${request.url}, loadedUrl: ${loadedUrl}`);
            const { gotoPageResponse } = request.userData;
            const homePageTitle = await page.title();
            const homePageUrl = new URL(loadedUrl);

            console.time(`${request.url} homePageLinks`);
            // Finds links with on home page
            const homePageLinks = await findLinksOnPage(page);
            // Finds new SLD on page and add them to queue
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
                        if (spitedHostname.slice(-1)[0] === tld) {
                            const domain = spitedHostname.join('.');
                            if (!addedDomains[domain]) domains[domain] = 'toAdd'
                        }
                    }
                } catch (err) {
                    // maybe bad href
                    console.log(`Error: Bad links ${link}, ${err.message}`);
                }
            });
            console.timeEnd(`${request.url} homePageLinks`);
            console.time(`${request.url} Add domains to queue`);
            // Add domains to queue
            const foundDomains = [];
            for (const domain of Object.keys(domains)) {
                const addToQueue = await requestQueue.addRequest(new Apify.Request({ url: `http://${domain}` }));
                if (!addToQueue.wasAlreadyPresent && !addToQueue.wasAlreadyHandled) foundDomains.push(domain);
                addedDomains[domain] = 'added';
            }
            console.timeEnd(`${request.url} Add domains to queue`);
            console.log(`${request.url} - Found domains ${foundDomains.length}`);

            const foundNextLinks = Object.keys(nextLinks);
            console.log(`${request.url} - Found next links ${foundNextLinks.length}`);

            console.time(`${request.url} Dns lookup`);
            // Dns lookup for server IP and maybe IPv6 support
            let serverIPv4address;
            try {
                const lookup = await dnsLookup(homePageUrl.hostname, { family: 4 });
                serverIPv4address = lookup.address;
            } catch (e) {
                // Show must go on
            }
            let isIPv6Support = false;
            try {
                await dnsResolve6(homePageUrl.hostname);
                isIPv6Support = true;
            } catch (e) {
                // No data for IPv6 lookup
            }
            console.timeEnd(`${request.url} Dns lookup`);

            const promises = [];

            // Basic SEO analysis
            promises.push(basicSEOAnalysis(page));

            // JSON-LD and Microdata lookup
            promises.push(jsonLdLookup(page));
            promises.push(microdataLookup(page));

            // Page technologies analysis
            const headers = await gotoPageResponse.headers();
            const technologyAnalyser = new PuppeteerWappalyzer();
            promises.push(technologyAnalyser.analyze(headers, page));

            const [basicSEO, { isJsonLd, jsonLdData }, { isMicrodata, microdata }, technologyLookupResults] = await Promise.all(promises);

            console.time(`${request.url} pushData`);
            await Apify.pushData({
                url: request.url,
                isOpen: true,
                loadedUrl,
                statusCode: await gotoPageResponse.status(),
                domain: homePageUrl.hostname.split('.').slice(-2).join('.'),
                protocol: homePageUrl.protocol,
                title: homePageTitle,
                foundDomains,
                foundNextLinks,
                technologies: technologyLookupResults,
                serverIPv4address,
                isIPv6Support,
                isSSLRedirect: (homePageUrl.protocol === 'https:'),
                basicSEO,
                isJsonLd,
                jsonLdData,
                isMicrodata,
                microdata,
            });
            console.timeEnd(`${request.url} pushData`);

            console.log(`Finish analysis for ${request.url}`);
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request, error }) => {
            console.log(`Request ${request.url} failed 4 times`);
            await Apify.pushData({
                url: request.url,
                isOpen: false,
                errorMsg: error.message,
            });
        },
    });

    // Run crawler.
    await crawler.run();
});

