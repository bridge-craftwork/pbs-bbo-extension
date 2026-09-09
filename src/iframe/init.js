
initGlobals();

// Set default PBS data URL if not cached
if (localStorage.getItem('PBSCache') == null) {
    localStorage.setItem('PBSCache',
        'BBOalert\nImport,https://github.com/bridge-craftwork/Practice-Bidding-Scenarios/blob/main/-PBS.txt');
}

// Normalize BBOalertPlugin PBS config to include all expected fields.
// -PBS.txt's config change detection compares stored JSON against in-memory defaults;
// if the stored JSON is missing fields (e.g. Use_Beta_Layout added later),
// undefined !== false triggers spurious rebuilds on every mutation.
(function() {
    var key = 'BBOalertPlugin PBS';
    var stored = localStorage.getItem(key);
    if (stored) {
        try {
            var cfg = JSON.parse(stored);
            var changed = false;
            if (!cfg.hasOwnProperty('Enable_Test_Mode')) { cfg.Enable_Test_Mode = false; changed = true; }
            if (!cfg.hasOwnProperty('Use_Beta_Layout')) { cfg.Use_Beta_Layout = false; changed = true; }
            if (changed) localStorage.setItem(key, JSON.stringify(cfg));
        } catch (e) {}
    }
})();
