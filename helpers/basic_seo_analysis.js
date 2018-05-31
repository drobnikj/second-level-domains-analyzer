const Apify = require('apify');

/**
 * This is just simple SEO analysis based on
 * https://www.apify.com/drobnikj/FvAnn-api-generic
 * @param page
 * @return {Promise<void>}
 */
module.exports = async (page) => {
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
            if ($(this).attr("src")) result.notOptimizedImgs.push($(this).attr("src"));
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
