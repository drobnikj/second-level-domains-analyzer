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

    const addedDomains = {};

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        launchPuppeteerOptions: { apifyProxyGroups: ['SHADER'] },


        handlePageFunction: async ({ page, request }) => {
            console.log(`Open ${request.url}`);
            const title = await page.title();
            const url = new URL(page.url());
            const foundDomains = [];
            const domains = {};

            const hrefs = await page.$$eval('a[href]', els => els.map(el => el.href));

            // deduplicate hosts
            hrefs.map(href => {
                try {
                    const url = new URL(href);
                    let spitedHostname = url.hostname.split('.');
                    if (spitedHostname.length >= 3) spitedHostname = spitedHostname.slice(-2); // omit 3rd and more domain
                    if (spitedHostname.slice(-1)[0] === 'cz') {
                        const domain = spitedHostname.join('.');
                        if (!addedDomains[domain]) domains[domain] = 'toAdd'
                    }
                } catch (err) {
                    // maybe bad href
                }
            });

            for (const domain of Object.keys(domains)) {
                const addToQueue = await requestQueue.addRequest(new Apify.Request({ url: `http://${domain}` }));
                if (!addToQueue.wasAlreadyPresent && !addToQueue.wasAlreadyHandled) foundDomains.push(domain);
                addedDomains[domain] = 'added';
            }
            if (foundDomains.length) console.log(`On ${request.url} added ${foundDomains.join(', ')}`);

            await Apify.pushData({
                url: page.url(),
                domain: url.hostname.split('.').slice(-2).join('.'),
                protocol: url.protocol,
                title,
                foundDomains,
            });

            console.log(`Finish ${request.url}`);
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
