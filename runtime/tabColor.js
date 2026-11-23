//Script,onDataLoad
// Give the PBS tab's text, when unselected, the grey BBO uses for its own
// unselected tabs (Messages, People, ...) instead of solid black.
//
// The packaged setOptions() in src/iframe/BBO_DOM.js hard-coded "black" until
// the store release that added inactiveTabColor(). This patches the extensions
// already installed: it wraps setOptions() - a global in this iframe, which
// this block shares because it is eval'd here - and re-colours the tab after
// every call that leaves the panel closed. Harmless on a fixed extension, which
// has already set the same grey. Remove once every store build carries the fix.
(function () {
    if (typeof setOptions !== 'function' || setOptions._pbsTabColor) return;

    function greyTab() {
        try {
            var doc = parent.document;
            var panel = doc.getElementById('pbs-panel0');
            if (panel && panel.style.display !== 'none') return;   // selected: leave blue/white
            var color = null;
            $("#rightDiv .verticalTabBarClass tab-bar-button", doc).not("#pbs-tab").find(".verticalClass").each(function () {
                var cs = doc.defaultView.getComputedStyle(this);
                if (cs.backgroundColor === 'rgb(49, 96, 191)') return;   // BBO's selected tab
                color = cs.color;
                return false;
            });
            if (color) $("#pbs-tab .verticalClass", doc).css("color", color);
        } catch (e) { }
    }

    var original = setOptions;
    var wrapped = function (on) {
        var r = original.apply(this, arguments);
        if (!on) greyTab();
        return r;
    };
    wrapped._pbsTabColor = true;
    window.setOptions = wrapped;

    // The tab may be added, or first set black, after this block runs. A fixed,
    // terminating schedule - not an observer, which would react to its own
    // style write (see toggleRotate.js).
    [0, 1000, 3000, 8000].forEach(function (ms) { setTimeout(greyTab, ms); });
})();
//Script
