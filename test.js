const Apify = require('apify');
const PuppeteerWappalyzer = require('./helpers/puppeteer_wappalyzer');
// require('./helpers/cpuprofiler').init('./profiles_data');


(async () => {
    try {
        const browser = await Apify.launchPuppeteer();
        while(true) {
            console.time('goto');
            const page = await browser.newPage();
            const gotoPageResponse = await page.goto("https://my.apify.com");
            console.timeEnd('goto');


            console.time('technologyAnalyser');
            // Page technologies analysis
            const technologyAnalyser = new PuppeteerWappalyzer();
            const technologyLookupResults = await technologyAnalyser.analyze(gotoPageResponse, page);
            console.timeEnd('technologyAnalyser');
        }
    } catch (e) {
        console.error(e)
        // process.exit(1)
    }
    process.exit(0)
})()

