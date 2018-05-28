const Apify = require('apify');
const { URL } = require('url');
const Wappalyzer = require('wappalyzer/wappalyzer');
const appsJson = require('wappalyzer/apps.json');
const dns = require('dns');
const microdataParser = require('microdata-node');
const { promisify } = require('util');

// const MAX_PAGE_PER_DOMAIN = 3;

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

const basicSEOAnalysis = async (page) => {
    await Apify.utils.puppeteer.injectJQuery(page);
    const analysis = await page.evaluate(() => {
        const result = {};
        const PARAMS = {
            maxTitleLength: 70,
            minTitleLength: 10,
            maxMetaDescriptionLength: 140,
            maxLinksCount: 3000,
            maxWordsCount: 350,
        };
        // -- Meta charset
        result.isCharacterEncode = ($("meta[charset]")) ? true : false;
        // -- Meta description
        result.isMetaDescription = ($('meta[name=description]').length || $('meta[name=description]').length) ? true : false;
        if (result.isMetaDescription) {
            result.metaDescription = $('meta[name=description]').attr("content") || $('meta[name=description]').attr("content");
            result.isMetaDescriptionLong = (result.metaDescription.length > PARAMS.maxMetaDescriptionLength) ? true : false;
        }
        // --  Doctype
        result.isDoctype = (document.doctype) ? true : false;
        // -- Title
        if ($("title").length) {
            result.isTitle = true;
            result.title = $("title").text();
            const titleLength = result.title.length;
            result.isTitleLong = (titleLength > PARAMS.maxTitleLength) ? true : false;
            result.isTitleShort = (titleLength < PARAMS.minTitleLength) ? true : false;
        } else result.isTitle = false;
        // -- h1
        const h1Count = $("h1").length;
        result.isH1 = (h1Count > 0) ? true : false;
        if (result.isH1) result.h1 = $("h1").text();
        result.isH1Multiple = (h1Count > 1) ? true : false;
        // -- h2
        result.isH2 = ($("h2").length) ? true : false;
        // -- Links
        result.linksCount = $("a").length;
        result.isTooMuchlinks = (result.linksCount > PARAMS.maxLinksCount) ? true : false;
        result.internalNoFollowLinks = [];
        $("a").each(function() {
            if ($(this).attr("rel") == "nofollow" && this.href.indexOf(window.location.hostname) > -1) result.internalNoFollowLinks.push(this.href);
        });
        result.internalNoFollowLinksCount = result.internalNoFollowLinks.length;
        // -- images
        result.notOptimizedImgs = [];
        $("img:not([alt])").each(function() {
            result.notOptimizedImgs.push($(this).attr("src"));
        });
        result.notOptimizedImgsCount = result.notOptimizedImgs.length;
        // -- words count
        result.wordsCount = $("body").text().match(/\S+/g).length;
        result.isContentTooLong = (result.wordsCount > PARAMS.maxWordsCount) ? true : false;
        // -- viewport
        result.isViewport = ($('meta[name=viewport]')) ? true : false;
        // -- amp version if page
        result.isAmp = ($('html[⚡]') || $('html[amp]')) ? true : false;
        // -- iframe check
        result.isIframe = ($('iframe').length) ? true : false;
        return result;
    });
    return analysis;
};

const jsonLdLookup = async (page) => {
    let isJsonLd = false;
    let jsonLdData = {};
    if (await page.$('script[type="application/ld+json"]')) {
        isJsonLd = true;
        jsonLdData = await page.$eval('script[type="application/ld+json"]', (el) => JSON.parse(el.innerText));
    }
    return { isJsonLd, jsonLdData }
};

const microdataLookup = async (page) => {
    let isMicrodata = false;
    const pageHtml = await page.evaluate(() => document.documentElement.outerHTML);
    const microdata = microdataParser.toJsonld(pageHtml);
    if (microdata.length) isMicrodata = true;

    return { isMicrodata, microdata };
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
            { url: 'http://www.bandivamos.cz/panska-kravata-bandi-model-lux-337' },
            { url: 'https://www.alza.cz' },
            { url: 'https://www.massimodutti.com/cz/boty-%26-dopl%C5%88ky/obuv/prohl%C3%A9dnout-v%C5%A1e---od-%C5%99ezb%C3%A1%C5%99stv%C3%AD-35/ko%C5%BEen%C3%A9-sand%C3%A1ly-zelen%C3%A9-c1475029p8194024.html' },
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
        launchPuppeteerOptions: { apifyProxyGroups: ['CZECH_LUMINATI'] },


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
            // if (foundDomains.length) console.log(`${request.url} - Found domains ${foundDomains.join(', ')}`);

            const foundNextLinks = Object.keys(nextLinks);
            // if(foundNextLinks.length) console.log(`${request.url} - Found next links ${foundNextLinks.join(', ')}`);

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

            // Basic SEO analysis
            const basicSEO = await basicSEOAnalysis(page);

            // JSON-LD and Microdata lookup
            const { isJsonLd, jsonLdData } = await jsonLdLookup(page);
            const { isMicrodata, microdata } = await microdataLookup(page);

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
