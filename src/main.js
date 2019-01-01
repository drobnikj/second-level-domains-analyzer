const Apify = require('apify');
const { URL } = require('url');
const PuppeteerWappalyzer = require('./puppeteer_wappalyzer');
const basicSEOAnalysis = require('./basic_seo_analysis');
const { jsonLdLookup, microdataLookup } = require('./ontology_lookups');
const { dnsLookup, dnsResolve6 } = require('./dns');
const { blockResources } = Apify.utils.puppeteer;

const DEFAULT_PAGE_TIMEOUT_MILLIS = 60000;

/**
 * Main code of process, built with Apify SDK
 * https://sdk.apify.com/
 */
Apify.main(async () => {
    const { proxyConfig, requestListSources } = await Apify.getValue('INPUT');
    if (!requestListSources || !proxyConfig) {
        throw new Error('Invalid input, you have to specified proxyConfig and requestListSources');
    }

    const launchPuppeteerOptions = {};
    if (proxyConfig) Object.assign(launchPuppeteerOptions, proxyConfig);

    const requestQueue = await Apify.openRequestQueue();

    const requestList = new Apify.RequestList({
        sources: requestListSources,
        persistStateKey: 'urls-list',
    });
    await requestList.initialize();

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        pageOpsTimeoutMillis: 3 * DEFAULT_PAGE_TIMEOUT_MILLIS,
        launchPuppeteerOptions,

        gotoFunction: async ({ request, page }) => {
            console.time(`${request.url} goto`);
            await blockResources(page, ['image', 'media', 'font']);
            const gotoPageResponse = await page.goto(request.url, {
                timeout: DEFAULT_PAGE_TIMEOUT_MILLIS,
                waitUntil: 'networkidle0',
            });
            request.userData = {
                statusCode: await gotoPageResponse.status(),
                headers: await gotoPageResponse.headers(),
            };
            console.timeEnd(`${request.url} goto`);
        },

        handlePageFunction: async ({ page, request }) => {
            console.time(`${request.url} analysis`);
            const loadedUrl = page.url();
            console.log(`Start analysis url: ${request.url}, loadedUrl: ${loadedUrl}`);
            const { statusCode, headers } = request.userData;
            const homePageTitle = await page.title();
            const homePageUrl = new URL(loadedUrl);

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
            const promises = [];

            // Basic SEO analysis
            promises.push(basicSEOAnalysis(page));

            // JSON-LD and Microdata lookup
            promises.push(jsonLdLookup(page));
            promises.push(microdataLookup(page));

            // Page technologies analysis
            const technologyAnalyser = new PuppeteerWappalyzer();
            promises.push(technologyAnalyser.analyze(headers, page));

            const [basicSEO, { isJsonLd, jsonLdData }, { isMicrodata, microdata }, technologyLookupResults] = await Promise.all(promises);

            await Apify.pushData({
                url: request.url,
                isOpen: true,
                loadedUrl,
                statusCode,
                domain: homePageUrl.hostname.split('.').slice(-2).join('.'),
                protocol: homePageUrl.protocol,
                title: homePageTitle,
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
            console.timeEnd(`${request.url} analysis`);
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
