const chalkProxy = new Proxy({}, {
    get: () => (str) => str
});
module.exports = chalkProxy;
