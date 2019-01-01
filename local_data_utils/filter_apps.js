const appsJson = require('wappalyzer/apps.json');
const fs = require('fs')

const filtredApps = appsJson.apps;

Object.keys(appsJson.apps).forEach((appKey) => {
    if (!filtredApps[appKey].cats.includes(31) // CDNs
        && !filtredApps[appKey].cats.includes(1) // CMSs
        && !filtredApps[appKey].cats.includes(56) // Cryptominers
        && !filtredApps[appKey].cats.includes(3) // Databases managers
        && !filtredApps[appKey].cats.includes(34) // Databases
        && !filtredApps[appKey].cats.includes(6) // Ecommerce frameworks
        && !filtredApps[appKey].cats.includes(12) // JS frameworks
        && !filtredApps[appKey].cats.includes(19) // Misc
        && !filtredApps[appKey].cats.includes(28) // OSs
        && !filtredApps[appKey].cats.includes(27) // Programming languages
        && !filtredApps[appKey].cats.includes(18) // Web frameworks
        && !filtredApps[appKey].cats.includes(33) // Web server extensions
        && !filtredApps[appKey].cats.includes(22) // Web servers
        && appKey !== 'Google Analytics') {
        delete filtredApps[appKey]
    }
});

console.log(Object.keys(filtredApps).length);
console.log(JSON.stringify(filtredApps));

fs.writeFileSync('./helpers/custom_apps.json', JSON.stringify(filtredApps));
