//Script,onDataLoad
// --- One active table-watcher at a time ------------------------------------
//
// PBS and BBOalert each build their own iframe, fetch this data chain
// separately, and run their own MutationObserver (BBOobserver) over BBO's page.
// Measured: they are genuinely independent - separate windows, separate function
// objects, neither can see the other's globals - but both have parent === the
// BBO page, so both watch and react to the SAME table.
//
// That concurrency wedges the tab. With both extensions installed, clicking a
// scenario reliably froze the page: setDealerCode opened BBO's Deal Source
// dialog, and the two observers interleaved - each running its 24 check
// functions and its own disconnect/re-observe cycle against the same node -
// until the renderer stopped responding. It reproduced on demand.
//
// Proven by experiment, one variable changed:
//   both observers connected            -> hang (watchdog fired, twice)
//   BBOalert's observer disconnected    -> setDealerCode DONE in 552ms, survived
//
// The button handlers were never the problem: a user clicks one panel's button,
// not both. So this does not disable either extension. Both panels stay live,
// both sets of buttons work, and each keeps running its OWN version of the code
// - which is the point when both are installed to test them side by side.
// Only the WATCHING is serialised, and it follows the last panel you used.
//
// Note BBOobserver is a `const` at script top level: a lexical binding, not a
// window property, so it is unreachable from outside this iframe. It is in scope
// here because this block is eval'd inside the iframe - which is also why this
// lives in the data file and needs no extension change or store release.
(function () {
    var KEY = '__pbsActiveWatcher';
    var myHost = (document.title || '').indexOf('PBS') !== -1 ? 'PBS' : 'BBOalert';

    function shared() {
        try { return parent.window; } catch (e) { return null; }
    }

    function currentOwner() {
        var s = shared();
        if (!s) return null;
        var c = s[KEY];
        if (!c) return null;
        // A holder can die mid-hold: PBS's iframe is destroyed and recreated on
        // navDiv flicker. Without an expiry that would park the watch on a window
        // that no longer exists and leave nobody watching.
        if (Date.now() - c.t > 30000) return null;
        return c.host;
    }

    function claim(why) {
        var s = shared();
        if (!s) return;
        s[KEY] = { host: myHost, t: Date.now() };
        apply(why);
    }

    // Re-assert periodically so the claim does not expire while still in use.
    function touch() {
        var s = shared();
        if (s && s[KEY] && s[KEY].host === myHost) s[KEY].t = Date.now();
    }

    function amActive() {
        var owner = currentOwner();
        return owner === null || owner === myHost;
    }

    function apply(why) {
        var active = amActive();
        try {
            if (typeof BBOobserver === 'undefined') return;
            if (active) {
                // observe() on an already-observing instance is a no-op, so this is
                // safe to call repeatedly.
                BBOobserver.observe(targetNode, config);
            } else {
                BBOobserver.disconnect();
            }
            console.log('[PBS watcher] ' + myHost + ' -> ' + (active ? 'ACTIVE' : 'standby') +
                        (why ? ' (' + why + ')' : ''));
        } catch (e) {
            console.warn('[PBS watcher] could not switch observer: ' + ((e && e.message) || e));
        }
    }

    // Any click in THIS panel means the user is working here, so take the watch.
    document.addEventListener('mousedown', function () { claim('panel click'); }, true);

    // First loader in wins until someone clicks; PBS is preferred when both are
    // present, since it is the dedicated tool.
    if (currentOwner() === null || myHost === 'PBS') claim('startup');
    else apply('startup');

    // Keep our own claim fresh, and notice when the other side takes over.
    setInterval(function () {
        touch();
        var want = amActive();
        try {
            if (typeof BBOobserver === 'undefined') return;
            if (!want) BBOobserver.disconnect();
        } catch (e) { /* iframe going away */ }
        void want;
    }, 2000);

    window.pbsWatcherStatus = function () {
        return { me: myHost, owner: currentOwner(), active: amActive() };
    };
})();
//Script
