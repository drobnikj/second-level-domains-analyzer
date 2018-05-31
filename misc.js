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

module.exports = {
    findLinksOnPage,
};
