const Apify = require('apify');

/**
 * This is just simple SEO analysis based on
 * https://www.apify.com/drobnikj/FvAnn-api-generic
 * @param page
 * @return {Promise<void>}
 */
module.exports = async (page) => {
    const url = page.url();
    console.time(`${url} basicSEO`);
    await Apify.utils.puppeteer.injectJQuery(page);
    const analysis = await page.evaluate(() => {
        const result = {};
        // -- Meta charset
        result.isCharacterEncode = ($("meta[charset]")) ? true : false;
        // -- Meta description
        result.isMetaDescription = ($('meta[name=description]')) ? true : false;
        if (result.isMetaDescription) {
            result.metaDescription = $('meta[name=description]').attr("content");
            result.metaDescriptionLength = (result.metaDescription) ? result.metaDescription.length : 0;
        }
        // --  Doctype
        result.isDoctype = (document.doctype) ? true : false;
        // -- Title
        if ($("title") && $("title").length) {
            result.isTitle = true;
            result.title = $("title").text();
            result.titleLength = result.title.length;
        } else result.isTitle = false;
        // -- h1
        result.h1Count = $("h1").length;
        result.isH1 = !!result.h1Count;
        if (result.isH1) result.h1 = $("h1").text();
        // -- h2
        result.isH2 = !!$("h2").length;
        result.h2Count = $("h2").length;
        // -- Links
        result.linksCount = $("a").length;
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
        result.wordsCount = ($("body").text().match(/\S+/g)) ? $("body").text().match(/\S+/g).length : 0;
        // -- viewport
        result.isViewport = ($('meta[name=viewport]')) ? true : false;
        // -- amp version if page
        result.isAmp = ($('html[⚡]') || $('html[amp]')) ? true : false;
        // -- iframe check
        result.isIframe = ($('iframe').length) ? true : false;
        return result;
    });
    console.timeEnd(`${url} basicSEO`);
    return analysis;
};
