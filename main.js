const Apify = require('apify');
const { URL } = require('url');

Apify.main(async () => {
    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    const requestList = new Apify.RequestList({
        sources: [
            { requestsFromUrl: 'https://api.apify.com/v2/key-value-stores/MgbE5ENuLSY5HMAYv/records/OUTPUT?disableRedirect=true' },
            { requestsFromUrl: 'https://api.apify.com/v2/key-value-stores/X4utrEmBj74eJHDQZ/records/OUTPUT?disableRedirect=true' },
        ],
        persistStateKey: 'url-list',
    });

    await requestList.initialize();

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        launchPuppeteerOptions: {apifyProxyGroups: ['SHADER']},


        handlePageFunction: async ({ page, request }) => {
            const title = await page.title();
            const url = new URL(page.url());
            const foundPages = [];

            const hrefs = await page.$$eval('a[href]', els => els.map(el => el.href));

            for (const href of hrefs) {
                try {
                    const url = new URL(href);
                    if (url.hostname.match(/\.cz$/) && url.hostname.split('.').length === 2) {
                        const addToQueue = await requestQueue.addRequest(new Apify.Request({ url: `http://${url.hostname}`}));
                        if (!addToQueue.wasAlreadyPresent && !addToQueue.wasAlreadyHandled) foundPages.push(url.hostname);
                    }
                } catch(err) {
                    // Show must go on
                }
            }

            await Apify.pushData({
                url: page.url(),
                hostname: url.hostname,
                protocol: url.protocol,
                title,
                foundPages,
            });
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
