const microdataParser = require('microdata-node');

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

module.exports = {
    microdataLookup,
    jsonLdLookup
};
