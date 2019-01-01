const dns = require('dns');
const { promisify } = require('util');

/**
 * Simple promised wrappers for dns lookup
 */
module.exports = {
    dnsLookup: promisify(dns.lookup),
    dnsResolve6: promisify(dns.resolve6),
};
