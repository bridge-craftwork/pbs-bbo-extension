//Script,onLogin
window.startTable = function(type, opts) {
    opts = opts || {};
    var requireHome = opts.requireHome !== false;
    var t0 = Date.now();
    var startBtnText = (type === 'teaching') ? 'Start a teaching table' : 'Start a bidding table';
    function delay(duration) {
        return new Promise((resolve) => { setTimeout(resolve, duration); });
    }
    function waitFor(test, interval, timeout) {
        interval = interval || 50;
        timeout = timeout || 10000;
        return new Promise((resolve, reject) => {
            var t0 = Date.now();
            var intrv = setInterval(() => {
                if (test()) { clearInterval(intrv); resolve(); }
                else if (Date.now() - t0 > timeout) { clearInterval(intrv); reject(new Error("waitFor timeout")); }
            }, interval);
        });
    }
    // BBO's create-table UI ("Phoenix") replaced the old start-table-screen. The
    // Start button now lives in bbo-sticky-bottom-create, a SIBLING of
    // bbo-create-table-modal rather than a descendant - do not scope it under the
    // modal. Matches exactly one element and needs no translation table, unlike
    // the positional .eq(2) it replaces.
    var START_TABLE_BUTTON = "bbo-sticky-bottom-create button.primary";

    // Table options PBS wants, recovered from the pre-Phoenix comments in
    // 2f76b1a1 (2024-03-09): a private, invisible table nobody can join or
    // kibitz uninvited. Keyed by BBO's stable input ids, which are language- and
    // order-independent; the old positional .eq(0..4) silently set the wrong
    // options once BBO inserted "Video chat" at index 0. "video-chat" is
    // deliberately absent - it postdates PBS's intent, so BBO's default stands.
    //
    // Note: BBO does not persist permission-required-to-kibitz while
    // allow-kibitzers is false - it reads back false on the created table,
    // apparently normalised away as moot. Net effect matches the intent.
    var TABLE_OPTIONS = {
        "allow-kibitzers": false,
        "allow-kibitzers-chat": false,
        "permission-required-to-kibitz": true,
        "permission-required-to-play": true,
        "invisible-table": true
    };

    // Set each toggle TO a state rather than blind-toggling, so re-running is
    // idempotent and a changed BBO default cannot invert the intent. Clicking the
    // real <input> is what propagates into Angular's reactive form.
    function setTableOptions() {
        var missing = [];
        Object.keys(TABLE_OPTIONS).forEach(function (id) {
            var el = BBOcontext().getElementById(id);
            if (!el) { missing.push(id); return; }
            if (el.checked !== TABLE_OPTIONS[id]) el.click();
        });
        if (missing.length) {
            console.warn("[PBS] table option toggles not found (BBO UI change?): " + missing.join(", "));
        }
    }

    // --- Seating -------------------------------------------------------------
    // The old code did $("bridge-screen menu-item").eq(0).children().click() for
    // each seat: an index across EVERY menu-item in the DOM, hidden ones included.
    // The seat menu is state-dependent, so that index means different things at
    // different times. Measured on a live table:
    //
    //   unseated, own seat : 6 menu-items,  visible [Sit, Robot, Reserve]
    //   after you sit, N   : 4 menu-items,  visible [Robot, Reserve]
    //   after you sit, E   : 4 menu-items,  visible [Robot]
    //
    // Click the next seat before the previous menu has torn down and .eq(0)
    // lands in a stale menu - which is how a seat ended up "Reserve"d, showing a
    // padlock and an empty seat that never bids, stalling the auction.
    //
    // So: only ever choose from the VISIBLE items, by intent, and confirm the
    // seat actually filled before touching the next one. Seats fill in ~100ms,
    // so waiting on the real signal is also far faster than delay(500) twice
    // per seat.
    function visibleMenuItems() {
        return $("bridge-screen menu-item", BBOcontext()).filter(function () {
            return !!this.offsetParent;
        });
    }

    function seatLabels() {
        return $("bridge-screen .nameDisplayClass", BBOcontext());
    }

    // An unoccupied seat still shows its direction ("West", "North - Sit!").
    // Once filled it shows a player or robot name instead.
    function seatIsEmpty(idx) {
        var txt = $(seatLabels()[idx]).text().trim();
        return /^(North|South|East|West)( - .*)?$/.test(txt);
    }

    // No stable ids exist on these items (only ng-star-inserted), so match the
    // label, then fall back to structure: a lone visible item is the robot
    // option, and a three-item menu is [Sit, Robot, Reserve].
    function pickMenuItem(want) {
        var items = visibleMenuItems();
        var byText = items.filter(function () {
            return $(this).text().trim() === want;
        });
        if (byText.length) return byText.first();
        if (want === "Robot") {
            if (items.length === 1) return items.first();
            if (items.length === 3) return items.eq(1);
        }
        if (want === "Sit" && items.length === 3) return items.eq(0);
        console.warn("[PBS] seat menu: no '" + want + "' among [" +
            items.map(function () { return $(this).text().trim(); }).get().join(", ") + "]");
        return null;
    }

    function seatOne(idx, want) {
        if (!seatIsEmpty(idx)) return Promise.resolve();
        // Never open a menu while another is still up, or the next lookup races it.
        return waitFor(() => visibleMenuItems().length === 0, 50, 3000)
            .then(() => { seatLabels().eq(idx).click(); })
            .then(() => waitFor(() => visibleMenuItems().length > 0, 25, 3000))
            .then(() => {
                var item = pickMenuItem(want);
                if (item == null) throw new Error("seatOne: no '" + want + "' option for seat " + idx);
                item.children().click();
            })
            // The seat filling is a server round trip; wait for it, do not guess.
            .then(() => waitFor(() => !seatIsEmpty(idx), 50, 8000))
            .then(() => waitFor(() => visibleMenuItems().length === 0, 50, 2000))
            .catch((e) => {
                console.warn("[PBS] seating seat " + idx + " failed: " + ((e && e.message) || e));
            });
    }

    // Seat order is [South, West, North, East]; the host sits South, robots fill
    // the rest. Sequential on purpose - the seats interact, and BBO's menu for a
    // later seat depends on whether earlier ones are filled.
    function seatAll() {
        return seatOne(0, "Sit")
            .then(() => seatOne(1, "Robot"))
            .then(() => seatOne(2, "Robot"))
            .then(() => seatOne(3, "Robot"));
    }

    function clickNative(selector) {
        var el = $(selector, BBOcontext())[0];
        if (!el) throw new Error("clickNative: no element for " + selector);
        el.click();
    }

    console.log("[PBS] startTable(" + type + ") START");
    return Promise.resolve()
        .then(() => {
             const homeButton = $("nav-bar button", BBOcontext()).eq(0);
             const isDisabled = homeButton.prop('disabled');
             if (isDisabled) return;
             if (!requireHome) return;
             alert("You must be at the BBO Home page to start a table.");
             throw new Error("Go Home.");
        })
        // Each step waits for what it needs rather than guessing a fixed delay.
        // Measured against a live session: the practice nav renders in ~59ms, the
        // modal in ~25ms, its Start button ~1ms later - so the old delay(500) per
        // step was 8-20x longer than required and still not a guarantee.
        // :visible is load-bearing. BBO now renders these same labels on TWO
        // surfaces - the main navigation and a right-hand Practice drawer - with
        // identical classes ("bbo-phx-navigation large"), and on /practice the
        // hidden main-nav copy comes FIRST in DOM order. Without :visible,
        // .first() resolves to a button that is not on screen and the click does
        // nothing. Measured live: 2 matches for the table labels, 5 for Practice.
        .then(() => $("button.bbo-phx-navigation:contains('Practice'):visible", BBOcontext()).first().click())
        .then(() => waitFor(() => $("button.bbo-phx-navigation:contains('" + startBtnText + "'):visible", BBOcontext()).length > 0))
        .then(() => $("button.bbo-phx-navigation:contains('" + startBtnText + "'):visible", BBOcontext()).first().click())
        .then(() => waitFor(() => $("bbo-create-table-modal", BBOcontext()).length > 0))
        .then(() => setTableOptions())
        .then(() => waitFor(() => $(START_TABLE_BUTTON, BBOcontext()).length > 0))
        .then(() => clickNative(START_TABLE_BUTTON))
        .then(() => waitFor(() => $("bridge-screen .nameDisplayClass", BBOcontext()).length > 0))
        // Deliberately still a fixed settle. c1602818 replaced this with polling
        // and 04d7c81f reverted it ("Angular needs full 3s"), so a readiness
        // signal for "table is actually interactive" has yet to be identified.
        // Do not swap this for polling without testing that history again.
        // It may now be reducible: seatAll() below waits on real signals (menu
        // rendered, seat filled) rather than assuming the table is ready, so it
        // no longer depends on this settle having been long enough. Worth
        // measuring before touching - the revert above is a warning, not noise.
        .then(() => delay(3000))
        .then(() => seatAll())
        .then(() => console.log("[PBS] startTable(" + type + ") DONE in " + (Date.now() - t0) + "ms"))
        .catch((e) => console.error("[PBS] startTable(" + type + ") FAILED after " + (Date.now() - t0) + "ms: " + ((e && e.message) || e)));
};
//Script
