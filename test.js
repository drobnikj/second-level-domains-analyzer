const Apify = require('apify');
const { URL } = require('url');
const PuppeteerWappalyzer = require('./helpers/puppeteer_wappalyzer');
const basicSEOAnalysis = require('./helpers/basic_seo_analysis');
const { jsonLdLookup, microdataLookup } = require('./helpers/ontology_lookups');
const { dnsLookup, dnsResolve6 } = require('./helpers/dns');
const { findLinksOnPage } = require('./helpers/misc');
// require('./helpers/cpuprofiler').init('./profiles_data');


(async () => {
    try {
        const browser = await Apify.launchPuppeteer();
        while(true) {
            console.time('goto');
            const page = await browser.newPage();
            const gotoPageResponse = await page.goto("https://my.apify.com");
            console.timeEnd('goto');

            const loadedUrl = page.url();
            const request = {
                url: loadedUrl
            }
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

            console.time(`${request.url} basicSEO`);
            // Basic SEO analysis
            promises.push(basicSEOAnalysis(page));
            console.timeEnd(`${request.url} basicSEO`);

            console.time(`${request.url} ontologies`);
            // JSON-LD and Microdata lookup
            promises.push(jsonLdLookup(page));
            promises.push(microdataLookup(page));
            console.timeEnd(`${request.url} ontologies`);

            console.time(`${request.url} technologyAnalyser`);
            // Page technologies analysis
            const headers = await gotoPageResponse.headers();
            const technologyAnalyser = new PuppeteerWappalyzer();
            promises.push(technologyAnalyser.analyze(headers, page));
            console.timeEnd(`${request.url} technologyAnalyser`);

            console.time(`${request.url} promises all`);
            const [basicSEO, { isJsonLd, jsonLdData }, { isMicrodata, microdata }, technologyAnalyser] = await Promise.all(promises);
            console.timeEnd(`${request.url} promises all`);

        }
    } catch (e) {
        console.error(e)
        // process.exit(1)
    }
    process.exit(0)
})()

