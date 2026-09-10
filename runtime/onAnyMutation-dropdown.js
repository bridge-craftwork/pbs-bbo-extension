//Script,onAnyMutation
// Let BBO's Phoenix dropdowns paint above our panel.
//
// Clicking the name tag opens `bbo-main-menu-dropdown`, which holds Show
// profile / BBO Store / Help / Sign out. With the PBS tab showing, that menu is
// unusable: the panel covers it, so Sign out cannot be clicked at all.
//
// Measured on a live page, which is the only way the numbers make sense:
//
//   notificationDivClass      100000   BBO
//   menuClass                  10000   BBO, the legacy menu
//   pbs-panel0                  5000   ours, set in src/PBSiframe.js
//   bbo-main-menu-dropdown         10   BBO, Phoenix
//
// The dropdown is `position:absolute; z-index:10`, and NONE of its ancestors
// create a stacking context - they are all `z-index:auto` - so that 10 competes
// in the ROOT stacking context, against our 5000, and loses. A hit test on the
// centre of "Sign out" returned `pbs-iframe`. Phoenix authored the value as if
// the dropdown were isolated in its own subtree; it is not.
//
// So drop the panel underneath the dropdown for exactly as long as it is open.
// The value is read FROM the dropdown rather than hardcoded, so if BBO changes
// its z-index this keeps working. Verified: at any value below 10 the hit test
// on "Sign out" returns the dropdown and it is clickable again.
//
// Two things here are load-bearing:
//
//  - The write is guarded by a comparison. This runs on EVERY mutation, and
//    setting style.zIndex is itself a mutation on the parent document - writing
//    unconditionally would feed straight back into the observer and peg the
//    main thread. That is not hypothetical: the same mistake with
//    updateRotateButton() froze the tab. See runtime/toggleRotate.js.
//  - pbsShouldDefer keeps the second extension instance out of it, so PBS and
//    BBOalert do not fight over the same panel.
(function () {
    if (window.pbsShouldDefer && window.pbsShouldDefer()) return;

    var doc = parent.document;
    var panel = doc.getElementById('pbs-panel0');
    if (!panel) return;

    var dd = doc.querySelector('bbo-main-menu-dropdown');
    var open = !!(dd && dd.offsetParent);

    var want = '5000';
    if (open) {
        var z = parseInt(parent.getComputedStyle(dd).zIndex, 10);
        want = String(isNaN(z) ? 9 : Math.max(0, z - 1));
    }

    // ONLY on change - see above.
    if (panel.style.zIndex !== want) panel.style.zIndex = want;
})();
//Script
