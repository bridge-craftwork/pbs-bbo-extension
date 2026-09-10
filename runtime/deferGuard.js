//Script,onDataLoad
// --- Host-extension conflict resolution: prefer PBS over BBOalert ---
// When both extensions are installed they each load this same file into their own
// iframe, so every Script block here runs TWICE: two panel builds, two layout
// fetches, two onAnyMutation handlers on every DOM change, and two copies fighting
// over BBO's divider via setOptions/triggerDragAndDrop. Wasteful at best, and a
// likely source of UI thrash.
//
// Same detection BBAcompare.js already uses: the iframe's title says which host we
// are under, and #pbs-iframe in the top document says the PBS extension is present.
// Only the redundant BBOalert-hosted copy defers - a BBOalert user WITHOUT the PBS
// extension is unaffected, because the guard needs #pbs-iframe to be there.
window.pbsShouldDefer = function () {
    try {
        var title = document.title || '';
        var amBBOalert = title.indexOf('BBOalert') >= 0 && title.indexOf('PBS') < 0;
        if (!amBBOalert) return false;
        return !!window.top.document.getElementById('pbs-iframe');
    } catch (e) {
        // Cross-origin or iframe in transition: do nothing clever, just run.
        return false;
    }
};
//Script
