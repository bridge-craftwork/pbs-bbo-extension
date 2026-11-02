//Script,onDataLoad
// --- Silent startup on by default -------------------------------------------
// The extension shows its panel while it loads unless "Silent startup" is ticked,
// which flashes the PBS tab's contents for about a second at every BBO load. The
// panel does not need to be visible for anything to load, so tick the setting for
// everyone. It takes effect from the next load: the first setOptions() in
// onNavDivDisplayed runs before any data arrives, so stopping that one needs a
// store release.
//
// Once only, so unticking it afterwards sticks. restoreSettings() copies the
// stored value into the Settings selector, because saveSettings() writes the
// selector back and would otherwise undo this on the next settings change.
//
// PBS only: BBOalert loads this same file and has its own settings. document.title
// tells us which host we are in.
(function () {
    if ((document.title || '').indexOf('PBS') === -1) return;
    if (localStorage.getItem('pbsSilentStartupDefaulted')) return;
    localStorage.setItem('pbsSilentStartupDefaulted', 'y');
    var s = localStorage.getItem('PBSSettings') || 'NNNN';
    localStorage.setItem('PBSSettings', s.substring(0, 3) + 'Y');
    restoreSettings();
})();
//Script
