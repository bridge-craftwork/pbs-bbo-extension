//Script,onAnyMutation
(function() {
    // Check if config has changed
    var stored = localStorage.getItem('BBOalertPlugin PBS');
    if (!stored || !window._pbsDynamicLastConfig) return;

    var currentConfig = JSON.parse(stored);
    var lastConfig = window._pbsDynamicLastConfig;

    // Compare config values
    if (currentConfig.Enable_Test_Mode !== lastConfig.Enable_Test_Mode ||
        currentConfig.Use_Beta_Layout !== lastConfig.Use_Beta_Layout) {
        console.log('PBS Dynamic: Config changed, triggering rebuild');
        if (window._pbsDynamicRebuild) {
            window._pbsDynamicRebuild();
        }
    }
})();
//Script
