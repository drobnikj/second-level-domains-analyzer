const Apify = require('apify');
const { URL } = require('url');
const PuppeteerWappalyzer = require('./helpers/puppeteer_wappalyzer');
const basicSEOAnalysis = require('./helpers/basic_seo_analysis');
const { jsonLdLookup, microdataLookup } = require('./helpers/ontology_lookups');
const { dnsLookup, dnsResolve6 } = require('./helpers/dns');
const { findLinksOnPage } = require('./helpers/misc');
// require('./helpers/cpuprofiler').init('./profiles_data');

const urls = [
    "http://charlesworth.com.au/"
];

(async () => {
    try {
        const browser = await Apify.launchPuppeteer({
            useApifyProxy: true,
            apifyProxyGroups: ["BUYPROXIES68277"],
        });
        // const browser = await Apify.launchPuppeteer();
        const promises = [];
        for (const url of urls) {
            try {
                console.time('goto');
                const promise = new Promise(async resolve => {
                    const page = await browser.newPage();
                    const gotoPageResponse = await page.goto(url);
                    console.timeEnd('goto');

                    await page.waitFor(10000);

                    // Page technologies analysis
                    const headers = await gotoPageResponse.headers();
                    const technologyAnalyser = new PuppeteerWappalyzer();
                    await technologyAnalyser.analyze(headers, page);
                    resolve(technologyAnalyser)
                });

                promises.push(promise);
            } catch (err) {
                console.error(err)
            }

        }
        await Promise.all(promises);
    } catch (e) {
        console.error(e)
        // process.exit(1)
    }
    process.exit(0)
})()

