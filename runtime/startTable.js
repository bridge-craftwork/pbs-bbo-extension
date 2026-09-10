//Script,onLogin
window.startTable = function(type, opts) {
    opts = opts || {};
    var requireHome = opts.requireHome !== false;
    var delayValue = 500;
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
        .then(() => $("button.bbo-phx-navigation:contains('Practice')", BBOcontext()).first().click())
        .then(() => delay(delayValue))
        .then(() => $("button.bbo-phx-navigation:contains('" + startBtnText + "')", BBOcontext()).first().click())
        .then(() => delay(delayValue))
        .then(() => $("table-options-panel .toggleDivClass ion-toggle", BBOcontext()).eq(0).click())
        .then(() => delay(delayValue))
        .then(() => $("table-options-panel .toggleDivClass ion-toggle", BBOcontext()).eq(1).click())
        .then(() => delay(delayValue))
        .then(() => $("table-options-panel .toggleDivClass ion-toggle", BBOcontext()).eq(2).click())
        .then(() => delay(delayValue))
        .then(() => $("table-options-panel .toggleDivClass ion-toggle", BBOcontext()).eq(3).click())
        .then(() => delay(delayValue))
        .then(() => $("table-options-panel .toggleDivClass ion-toggle", BBOcontext()).eq(4).click())
        .then(() => delay(delayValue))
        .then(() => $("start-table-screen .buttonRowClass button", BBOcontext()).eq(2).click())
        .then(() => waitFor(() => $("bridge-screen .nameDisplayClass", BBOcontext()).length > 0))
        .then(() => delay(3000))
        .then(() => $("bridge-screen .nameDisplayClass", BBOcontext()).eq(0).click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen menu-item", BBOcontext()).eq(0).children().click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen .nameDisplayClass", BBOcontext()).eq(1).click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen menu-item", BBOcontext()).eq(0).children().click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen .nameDisplayClass", BBOcontext()).eq(2).click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen menu-item", BBOcontext()).eq(0).children().click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen .nameDisplayClass", BBOcontext()).eq(3).click())
        .then(() => delay(delayValue))
        .then(() => $("bridge-screen menu-item", BBOcontext()).eq(0).children().click())
        .then(() => console.log("[PBS] startTable(" + type + ") DONE in " + (Date.now() - t0) + "ms"));
};
//Script
