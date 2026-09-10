//Script,onDataLoad
// --- Late-arriving BBO tabs -------------------------------------------------
// The host extension binds an onmousedown handler to each tab present when
// setTabEvents() runs; that handler is what calls setOptionsOff() to hide the
// extension's panel so BBO's own panel can show. BBO adds tabs at runtime - a
// "Tables" tab appears once a table is created - and such a tab gets no handler,
// so clicking it never hides the panel. The panel stays on top of BBO's, the tab
// highlights but shows nothing, and the right-hand side looks frozen while CPU
// sits at 0%. It self-heals confusingly: clicking the PBS tab re-runs
// setTabEvents() and finally binds the new tab, so it comes and goes with click
// order.
//
// Fixed here rather than in the extension so it ships by pushing this file, with
// no store release - and because BBOalert loads this same file, one fix repairs
// both extensions in their own iframes.
//
// addEventListener, not onmousedown: both extensions bind the same element, and
// assigning would clobber whichever bound first. document.title tells us which
// host we are in, so each instance leaves its own tab alone.
(function () {
    if (window.__pbsTabDelegationInstalled) return;
    var doc, vt;
    try {
        doc = parent.document;
        vt = doc.querySelector('#rightDiv .verticalTabBarClass');
    } catch (e) {
        return;
    }
    if (!vt) return;

    var myTab = (document.title || '').indexOf('PBS') !== -1 ? 'PBS' : 'BBOalert';

    vt.addEventListener('mousedown', function (ev) {
        var btn = (ev && ev.target && ev.target.closest) ? ev.target.closest('tab-bar-button') : null;
        if (btn == null) return;
        if (btn.textContent.indexOf(myTab) !== -1) return;
        if (typeof setOptionsOff === 'function') setOptionsOff();
    }, true);

    window.__pbsTabDelegationInstalled = true;
    console.log('[PBS] tab delegation installed for ' + myTab);
})();
//Script
