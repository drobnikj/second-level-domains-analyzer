const Apify = require('apify');
const { URL } = require('url');
const PuppeteerWappalyzer = require('./helpers/puppeteer_wappalyzer');
const basicSEOAnalysis = require('./helpers/basic_seo_analysis');
const { jsonLdLookup, microdataLookup } = require('./helpers/ontology_lookups');
const { dnsLookup, dnsResolve6 } = require('./helpers/dns');
const { findLinksOnPage } = require('./helpers/misc');

const DEFAULT_PAGE_TIMEOUT = 180000;

Apify.main(async () => {
    const { proxyGroups, requestListSources } = await Apify.getValue('INPUT');

    if (!proxyGroups || !requestListSources) {
        throw new Error('Invalid input, you have to specified proxyGroups and requestListSources');
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
        pageOpsTimeoutMillis: DEFAULT_PAGE_TIMEOUT,
        maxConcurrency: (Apify.isAtHome()) ? undefined : 1,
        launchPuppeteerOptions: { apifyProxyGroups: proxyGroups },

        gotoFunction: async ({ request, page }) => {
            const gotoPageResponse = await page.goto(request.url, { timeout: DEFAULT_PAGE_TIMEOUT });
            request.userData = {
                gotoPageResponse
            };
        },

        handlePageFunction: async ({ page, request }) => {
            const loadedUrl = page.url();
            console.log(`Start analysis url: ${request.url}, loadedUrl: ${loadedUrl}`);
            const { gotoPageResponse } = request.userData;
            const homePageTitle = await page.title();
            const homePageUrl = new URL(loadedUrl);

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
            console.log(`${request.url} - Found domains ${foundDomains.length}`);

            const foundNextLinks = Object.keys(nextLinks);
            console.log(`${request.url} - Found next links ${foundNextLinks.length}`);

            // Dns lookup for server IP and maybe IPv6 support
            const { address: serverIPv4address } = await dnsLookup(homePageUrl.hostname, { family: 4 });
            let isIPv6Support = false;
            try {
                await dnsResolve6(homePageUrl.hostname);
                isIPv6Support = true;
            } catch (e) {
                // No data for IPv6 lookup
            }

            // Basic SEO analysis
            const basicSEO = await basicSEOAnalysis(page);

            // JSON-LD and Microdata lookup
            const { isJsonLd, jsonLdData } = await jsonLdLookup(page);
            const { isMicrodata, microdata } = await microdataLookup(page);

            // Page technologies analysis
            const technologyAnalyser = new PuppeteerWappalyzer();
            const technologyLookupResults = await technologyAnalyser.analyze(gotoPageResponse, page);

            await Apify.pushData({
                url: request.url,
                isOpen: true,
                loadedUrl,
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
