const ApifyClient = require('apify-client');
const fs = require('fs');


(async () => {
    const liveWebs = [];
    const deadWebs = [];

    const apifyClient = new ApifyClient();
    const datasetId = 'smoYTBkhrrwYHoDFz';
    let limit = 100000;
    let offset = 0;
    let pagination;
    while (true) {
        pagination = await apifyClient.datasets.getItems({
            datasetId,
            limit,
            offset,
        });
        console.log(`Get items from datasetId: ${datasetId}, offset: ${pagination.offset}`);
        for (const item of pagination.items) {
            if (item.errors) {
                deadWebs.push(item);
            } else {
                liveWebs.push(item);
            }
        }
        if (parseInt(pagination.count) === 0) break;
        offset = offset + limit;
        // Sleep - avoid rate limit errors
        await new Promise(resolve => setTimeout(resolve, 100));
    }
            
    fs.writeFileSync('live_webs.txt', liveWebs.map(web => web.domain).join('\n'));
    fs.writeFileSync('dead_webs.txt', deadWebs.map(web => JSON.stringify(web)).join('\n'));

})();
