//Script,onDataLoad
(function() {
    // Configuration for PBS Dynamic Layout
    var pbsConfig = {
        Enable_Test_Mode: false,
        Use_Beta_Layout: false
    };

    // Register plugin config for test mode toggle
    var savedConfig = addConfigBox('PBS', pbsConfig);
    if (savedConfig) pbsConfig = savedConfig;

    // Store current config state for change detection
    window._pbsDynamicLastConfig = {
        Enable_Test_Mode: pbsConfig.Enable_Test_Mode,
        Use_Beta_Layout: pbsConfig.Use_Beta_Layout
    };

    // Flag to prevent multiple simultaneous rebuilds
    window._pbsDynamicBuilding = false;

    // GitHub URLs. The menu comes from one manifest per tier; a scenario's dealer
    // script comes from its .dlr, fetched on click. Both are generated in the PBS
    // repo, and a push to its main branch is the publish.
    var PBS_RAW_BASE = 'https://raw.githubusercontent.com/bridge-craftwork/Practice-Bidding-Scenarios/main';
    var MANIFEST_BASE = PBS_RAW_BASE + '/manifest';

    // Cache-buster: append a unique param to GitHub fetches so the browser/CDN
    // never serve a stale copy after a push (fixes the "refresh doesn't update
    // the menu" lag). Scoped to this IIFE only; the global fetch is untouched.
    var _pbsOrigFetch = window.fetch.bind(window);
    function fetch(u, opts) {
        if (typeof u === 'string' && u.indexOf('githubusercontent.com') !== -1) {
            u += (u.indexOf('?') === -1 ? '?' : '&') + '_cb=' + Date.now();
        }
        return _pbsOrigFetch(u, opts);
    }

    // The manifest the current menu was built from
    var manifest = null;

    // The two toggles pick one of four manifests
    function manifestTier() {
        if (pbsConfig.Use_Beta_Layout) return pbsConfig.Enable_Test_Mode ? 'test' : 'beta';
        return pbsConfig.Enable_Test_Mode ? 'release-test' : 'release';
    }

    // The test tiers may be retired on the PBS side; if one is gone, fall back to
    // the same layout without the test section rather than showing no menu.
    var TIER_FALLBACK = { 'test': 'beta', 'release-test': 'release' };

    function loadManifest(tier) {
        return fetch(MANIFEST_BASE + '/manifest-' + tier + '.json')
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .catch(function(err) {
                var fallback = TIER_FALLBACK[tier];
                if (!fallback) throw err;
                console.warn('PBS Dynamic: manifest-' + tier + '.json unavailable (' + err.message + '), using ' + fallback);
                return loadManifest(fallback);
            });
    }

    // Menu metadata for a scenario, or null if the manifest has none
    function scenarioInfo(name) {
        if (!manifest) return null;
        if (manifest.scenarios && manifest.scenarios[name]) return manifest.scenarios[name];
        var tests = manifest.testScenarios || [];
        for (var i = 0; i < tests.length; i++) {
            if (tests[i].name === name) return tests[i];
        }
        return null;
    }

    // --- dealerFromDlr: begin (tools/check-dlr-strip.mjs extracts this) ---
    // Turn a .dlr into the arguments for setDealerCode(code, seat, true), exactly
    // as the PBS pipeline did when it wrapped the .dlr in a .pbs: a port of
    // parse_dlr_file and bbo_dealer_code in PBS's
    // build-scripts-mac/operations/pbs_from_dlr.py. Keep the two in step;
    // tools/check-dlr-strip.mjs compares this against the pipeline's output.
    var DLR_META_KEYS = 'alias|button-text|scenario-title|gib-works|bba-works|auction-filter|convention-card-ns|convention-card-ew|quiz-control';
    function dealerFromDlr(text) {
        var meta = {};
        var metaPattern = new RegExp('^#\\s*(' + DLR_META_KEYS + '):\\s*(.*)$', 'gm');
        var m;
        while ((m = metaPattern.exec(text)) !== null) {
            meta[m[1]] = m[2].trim();
        }

        var seatMatch = text.match(/^\s*dealer\s+(south|north|east|west)/m);
        var seat = seatMatch ? { south: 'S', north: 'N', east: 'E', west: 'W' }[seatMatch[1]] : 'S';

        var chatMatch = text.match(/\/\*@chat\s*\n([\s\S]*?)@chat\*\//);
        var chat = chatMatch ? chatMatch[1].replace(/\s+$/, '') : null;

        // Drop the # key: value header, the dealer line and the @chat block
        var headerLine = new RegExp('^#\\s*(' + DLR_META_KEYS + '):');
        var lines = text.split('\n');
        var body = [];
        var inChat = false;
        var pastHeader = false;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('/*@chat') !== -1) { inChat = true; continue; }
            if (line.indexOf('@chat*/') !== -1) { inChat = false; continue; }
            if (inChat) continue;
            if (!pastHeader) {
                if (headerLine.test(line)) continue;
                if (/^dealer\s+(south|north|east|west)/.test(line.trim())) continue;
                if (line.trim() === '') continue;
                pastHeader = true;
            }
            body.push(line);
        }
        var code = body.join('\n').replace(/\n*action\s+printpbn\s*\n*/g, '\n');

        // Convention cards and the auction filter ride along as a comment block
        var out = [];
        if (meta['auction-filter'] || meta['convention-card-ns'] || meta['convention-card-ew']) {
            out.push('', '/*');
            if (meta['convention-card-ns']) out.push('convention-card-ns: ' + meta['convention-card-ns']);
            if (meta['convention-card-ew']) out.push('convention-card-ew: ' + meta['convention-card-ew']);
            if (meta['auction-filter']) out.push('auction-filter: ' + meta['auction-filter']);
            out.push('*/');
        }
        out.push(code.replace(/\s+$/, ''));

        return {
            // The newlines are the ones the .pbs put either side of the backticks
            code: '\n' + out.join('\n') + '\n',
            seat: seat,
            // Chat in the form the manifest carries it: \n tokens, wide commas
            chat: chat === null ? null : '\\n' + chat.replace(/, /g, '，').split('\n').join('\\n') + '\\n',
            conventionCardNS: meta['convention-card-ns'] || null,
            conventionCardEW: meta['convention-card-ew'] || null
        };
    }
    // --- dealerFromDlr: end ---

    // Where a scenario's dealer script lives. The manifest may name the file (e.g.
    // a leveled variant); otherwise it is dlr/<name>.dlr.
    function dlrUrl(name, info) {
        if (info && info.dlr) return PBS_RAW_BASE + '/' + info.dlr;
        return PBS_RAW_BASE + '/dlr/' + name + '.dlr';
    }

    function logScenarioSelect(scenarioName) {
        var _ext = (document.title.indexOf('PBS') >= 0) ? 'PBSforBBO' : 'BBOAlert';
        var _ua = navigator.userAgent;
        var _br = _ua.indexOf('Edg/') > -1 ? 'Edge' : _ua.indexOf('Chrome/') > -1 ? 'Chrome' : _ua.indexOf('Firefox/') > -1 ? 'Firefox' : _ua.indexOf('Safari/') > -1 ? 'Safari' : 'Unknown';
        var _pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
        var _os = /Win/i.test(_pf) ? 'Windows' : /Mac/i.test(_pf) ? 'macOS' : /Linux/i.test(_pf) ? 'Linux' : 'Unknown';
        fetch('https://bba.harmonicsystems.com/api/scenario/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Client-Version': (window.pbsClientVersion || 'unset'), 'X-Client-Info': 'ext=' + _ext + '; browser=' + _br + '; os=' + _os },
            body: JSON.stringify({ scenario: scenarioName, user: whoAmI() || 'anonymous' })
        }).catch(function() {});
    }

    // Load a scenario: send its chat, start a table if at home, then fetch the
    // .dlr and hand the dealer script to setDealerCode.
    function loadScenario(scenarioName) {
        var info = scenarioInfo(scenarioName);
        console.log('PBS Dynamic: Loading scenario', scenarioName);

        // Send chat message to current chat destination (scenario description)
        var chatSent = false;
        if (info && info.chat) {
            setChatMessage(info.chat, true);
            chatSent = true;
        }

        var load = function() {
            return fetch(dlrUrl(scenarioName, info))
                .then(function(response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.text();
                })
                .then(function(text) {
                    var dlr = dealerFromDlr(text);
                    // No manifest entry (e.g. an orphan): the .dlr has the chat
                    if (!chatSent && dlr.chat) setChatMessage(dlr.chat, true);
                    window.currentPBSScenario = scenarioName;
                    window.currentPBSScenarioFilename = scenarioName;
                    window.currentPBSConventionCardNS = (info && info.conventionCardNS) || dlr.conventionCardNS;
                    window.currentPBSConventionCardEW = (info && info.conventionCardEW) || dlr.conventionCardEW;
                    logScenarioSelect(scenarioName);
                    window.pbsShowHCP = true;
                    setDealerCode(dlr.code, dlr.seat, true);
                })
                .catch(function(err) { console.error('PBS Dynamic: Failed to load', scenarioName, err); });
        };

        // Auto-start a table if we're on the BBO home screen (home button disabled = at home)
        var homeButton = $("nav-bar button", BBOcontext()).eq(0);
        var atHome = homeButton.length > 0 && homeButton.prop('disabled');
        console.log('[PBS] click atHome=' + atHome + ' startTable=' + (typeof window.startTable));
        if (atHome && typeof window.startTable === 'function') {
            var preferred = localStorage.getItem('pbsLastTableType') || 'bidding';
            return window.startTable(preferred, { requireHome: false })
                .then(load)
                .catch(function(err) { console.error('PBS auto-start failed', err); });
        }
        return load();
    }

    // Exposed for tests: the same path a button click takes
    window.pbsLoadScenario = loadScenario;

    // Chat as tooltip text: real newlines, no leading "---", suit symbols
    function chatTooltip(chat) {
        return chat.replace(/\\n/g, '\n').replace(/^\n?---\s*/, '').trim()
            .replace(/!S/g, '♠')
            .replace(/!H/g, '♥')
            .replace(/!D/g, '♦')
            .replace(/!C/g, '♣');
    }

    // Create a button element
    function createButton(text, action, style, insertBefore) {
        var adPanel = document.getElementById('adpanel2');
        if (!adPanel) return null;

        var bt = document.createElement('button');
        bt.textContent = text;
        bt.value = action || '';
        bt.style.backgroundColor = style.backgroundColor || 'white';
        bt.style.color = style.color || 'black';
        bt.style.textAlign = 'center';
        bt.style.display = 'inline';
        bt.style.fontSize = '20px';
        bt.style.width = style.width || '50%';

        if (action && action.startsWith('%') && action.endsWith('%')) {
            bt.onclick = function() { execUserScript(action); };
        } else if (action && action.startsWith('http')) {
            bt.onclick = function() { (window.top || window).open(action, '_blank'); };
        }

        if (insertBefore) {
            adPanel.insertBefore(bt, insertBefore);
        } else {
            adPanel.appendChild(bt);
        }
        return bt;
    }

    // Create a scenario button from its manifest entry. style: width, color,
    // fontSize; the background is lightpink when GIB can't bid the scenario.
    function createScenarioButton(name, style, insertBefore) {
        var adPanel = document.getElementById('adpanel2');
        if (!adPanel) return null;

        var info = scenarioInfo(name);
        var bt = document.createElement('button');
        bt.textContent = (info && info.buttonText) || name.replace(/_/g, ' ');
        bt.style.backgroundColor = (info && info.gibWorks === false) ? 'lightpink' : 'white';
        bt.style.color = style.color || 'black';
        bt.style.textAlign = 'center';
        bt.style.display = 'inline';
        bt.style.fontSize = style.fontSize || '20px';
        bt.style.width = style.width || '50%';
        bt.setAttribute('data-scenario', name);

        if (info && info.chat) {
            bt.value = info.chat + '%' + (info.alias || name) + '%';
            // Set title directly for tooltip (PBStooltips.js runs before buttons exist)
            bt.title = chatTooltip(info.chat);
        }

        bt.onclick = function() { loadScenario(name); };

        if (insertBefore) {
            adPanel.insertBefore(bt, insertBefore);
        } else {
            adPanel.appendChild(bt);
        }
        return bt;
    }

    // First section header - diagnostic and test sections go above it
    function firstSectionHeader(adPanel) {
        var allBtns = adPanel.querySelectorAll('button');
        for (var i = 0; i < allBtns.length; i++) {
            if (allBtns[i].style.backgroundColor === 'lightblue' && allBtns[i].style.width === '100%') {
                return allBtns[i];
            }
        }
        return null;
    }

    // A bold, full-width header that shows/hides the buttons carrying attr
    function createToggleHeader(text, backgroundColor, attr, insertBefore) {
        var adPanel = document.getElementById('adpanel2');
        var header = document.createElement('button');
        header.textContent = text;
        header.style.width = '100%';
        header.style.backgroundColor = backgroundColor;
        header.style.color = 'black';
        header.style.fontWeight = 'bold';
        header.style.display = 'inline';
        header.style.fontSize = '18px';
        adPanel.insertBefore(header, insertBefore);
        header.onclick = function() {
            var btns = adPanel.querySelectorAll('[' + attr + ']');
            for (var i = 0; i < btns.length; i++) {
                $(btns[i]).toggle();
            }
        };
        return header;
    }

    // Add test mode buttons - inserts after action buttons, before first section
    function addTestModeButtons() {
        if (!pbsConfig.Enable_Test_Mode || !manifest.testScenarios) return;

        var adPanel = document.getElementById('adpanel2');
        if (!adPanel) return;

        var insertBefore = firstSectionHeader(adPanel);
        // Collapsible test section header (blue like other sections)
        var headerBtn = createToggleHeader('TEST SCENARIOS', 'lightblue', 'data-test-button', insertBefore);
        headerBtn.setAttribute('data-test-header', 'true');

        manifest.testScenarios.forEach(function(entry) {
            var bt = createScenarioButton(entry.name, { width: '50%', fontSize: '18px' }, insertBefore);
            bt.setAttribute('data-test-button', 'true');
        });
        console.log('PBS Dynamic: Found', manifest.testScenarios.length, 'test scenarios');
    }

    // Render the manifest's layout
    function renderLayout(layout) {
        for (var i = 0; i < layout.length; i++) {
            var item = layout[i];

            if (item.type === 'major') {
                createButton(item.title, item.url || '', { width: '100%', backgroundColor: 'LemonChiffon' });
            } else if (item.type === 'section') {
                var btn = createButton(item.title, item.url || '', { width: '100%', backgroundColor: 'lightblue' });
                if (btn) {
                    btn.onclick = function() {
                        var next = $(this).next();
                        while (next.length && (next[0].style.backgroundColor === 'white' || next[0].style.backgroundColor === 'lightpink' || next[0].style.backgroundColor === 'lightyellow')) {
                            $(next).toggle();
                            next = $(next).next();
                        }
                    };
                }
            } else if (item.type === 'action') {
                createButton(item.text, item.script, { width: (item.width || '50') + '%', backgroundColor: 'lightgreen' });
            } else if (item.type === 'separator') {
                createButton('---', '', { width: '100%', backgroundColor: 'white' });
            } else if (item.type === 'row') {
                for (var j = 0; j < item.buttons.length; j++) {
                    var layoutBtn = item.buttons[j];
                    if (layoutBtn.name === '---') {
                        createButton('---', '', { width: layoutBtn.width || '50%', backgroundColor: 'white' });
                    } else {
                        var style = { width: layoutBtn.width || '50%' };
                        if (layoutBtn.color) style.color = layoutBtn.color;
                        var bt = createScenarioButton(layoutBtn.name, style);
                        var info = scenarioInfo(layoutBtn.name);
                        if (bt && (!info || info.missing)) {
                            // Show missing files with red text
                            bt.style.color = 'red';
                            bt.setAttribute('data-missing', 'true');
                        }
                    }
                }
            }
            // 'empty' is a blank line in the layout file: nothing to draw
        }
    }

    // Set up expand/collapse functionality for sections and master header
    function setupExpandCollapse() {
        var adPanel = document.getElementById('adpanel2');
        if (!adPanel) return;

        // Add click handlers to all lightblue section headers
        $("#adpanel2 button").filter(function() {
            return this.style.backgroundColor === 'lightblue';
        }).each(function() {
            var header = this;
            header.onclick = function() {
                var next = $(this).next();
                while (next.length && (next[0].style.backgroundColor === 'white' || next[0].style.backgroundColor === 'lightpink')) {
                    $(next).toggle();
                    next = $(next).next();
                }
            };
        });

        // Set up master expand/collapse on the first LemonChiffon button (yellow header)
        var masterBtn = $("#adpanel2 button").filter(function() {
            return this.style.backgroundColor === 'lemonchiffon' || this.style.backgroundColor === 'LemonChiffon';
        }).first();

        if (masterBtn.length) {
            masterBtn[0].showAll = false; // Start collapsed
            masterBtn[0].onclick = function() {
                this.showAll = !this.showAll;
                var toShow = this.showAll;
                $("#adpanel2 button").filter(function() {
                    return this.style.backgroundColor === 'white' || this.style.backgroundColor === 'lightpink';
                }).each(function() {
                    if (toShow) $(this).show();
                    else $(this).hide();
                });
            };
        }

        // Initially collapse all white/pink buttons (start collapsed)
        $("#adpanel2 button").filter(function() {
            return this.style.backgroundColor === 'white' || this.style.backgroundColor === 'lightpink';
        }).hide();
    }

    // Add diagnostic sections for missing/orphan files (only in test mode)
    function addDiagnosticSections() {
        if (!pbsConfig.Enable_Test_Mode) return;

        var adPanel = document.getElementById('adpanel2');
        if (!adPanel) return;

        var deltas = manifest.deltas || {};
        var missing = deltas.missing || [];
        var orphans = deltas.orphans || [];
        var insertBefore = firstSectionHeader(adPanel);

        // Referenced by the layout, but no scenario file
        if (missing.length > 0) {
            createToggleHeader('MISSING SCENARIO FILES (' + missing.length + ')', 'lightsalmon', 'data-missing-btn', insertBefore);
            missing.forEach(function(name) {
                var bt = document.createElement('button');
                bt.textContent = name;
                bt.style.backgroundColor = 'white';
                bt.style.color = 'red';
                bt.style.textAlign = 'center';
                bt.style.display = 'inline';
                bt.style.fontSize = '18px';
                bt.style.width = '50%';
                bt.setAttribute('data-missing-btn', 'true');
                adPanel.insertBefore(bt, insertBefore);
            });
        }

        // A scenario file that no layout button points at
        if (orphans.length > 0) {
            createToggleHeader('ORPHAN SCENARIOS (' + orphans.length + ')', 'plum', 'data-orphan-btn', insertBefore);
            orphans.forEach(function(name) {
                var bt = createScenarioButton(name, { width: '50%', fontSize: '18px', color: 'purple' }, insertBefore);
                bt.setAttribute('data-orphan-btn', 'true');
            });
            console.log('PBS Dynamic: Found', orphans.length, 'orphan scenarios');
        }
    }

    // Clear all dynamically created content
    function clearDynamicButtons() {
        var adPanel = document.getElementById('adpanel2');
        if (!adPanel) return;

        // The original 3 backspace buttons were removed on data load,
        // so all remaining children are dynamic — remove them all
        while (adPanel.lastChild) {
            adPanel.removeChild(adPanel.lastChild);
        }

        console.log('PBS Dynamic: Cleared all dynamic content');
    }

    // Rebuild buttons (called on config change)
    function rebuildButtons() {
        if (window._pbsDynamicBuilding) {
            console.log('PBS Dynamic: Build already in progress, skipping');
            return;
        }

        window._pbsDynamicBuilding = true;
        console.log('PBS Dynamic: Rebuilding buttons...');

        // Re-read config from localStorage
        var stored = localStorage.getItem('BBOalertPlugin PBS');
        if (stored) {
            var newConfig = JSON.parse(stored);
            pbsConfig.Enable_Test_Mode = newConfig.Enable_Test_Mode;
            pbsConfig.Use_Beta_Layout = newConfig.Use_Beta_Layout;
        }

        // Update stored state
        window._pbsDynamicLastConfig = {
            Enable_Test_Mode: pbsConfig.Enable_Test_Mode,
            Use_Beta_Layout: pbsConfig.Use_Beta_Layout
        };

        // Clear and rebuild
        clearDynamicButtons();
        runInit();
    }

    // Expose rebuild function globally for config change detection
    window._pbsDynamicRebuild = rebuildButtons;

    // Main initialization
    function init() {
        runInit();
    }

    function runInit() {
        if (window.pbsShouldDefer && window.pbsShouldDefer()) {
            console.log('PBS: deferring to the PBS extension instance - skipping layout build under BBOalert.');
            window._pbsDynamicBuilding = false;
            return;
        }
        // Channel and version come from the DATA FILE, which is the only per-channel
        // artefact left: -PBS.txt and -PBS-beta.txt import these same runtime/ files
        // from different branches, so hardcoding a version here would make release
        // users report themselves as beta.
        //
        // The fallback is deliberately NOT a real version. It used to be the beta
        // strings, which meant a data file that forgot to set these would quietly
        // mislabel its users as beta - a wrong answer is worse than an obviously
        // missing one, in a banner and in telemetry alike.
        console.log('PBS ' + (window.pbsVersionLabel || 'version unset') + ': Initializing...');
        console.log('PBS Dynamic: Test mode =', pbsConfig.Enable_Test_Mode);
        console.log('PBS Dynamic: Beta layout =', pbsConfig.Use_Beta_Layout);

        loadManifest(manifestTier())
            .then(function(m) {
                manifest = m;
                console.log('PBS Dynamic: Manifest ' + m.tier + ' loaded (commit ' + String(m.generatedAtCommit).slice(0, 7) + '), ' + Object.keys(m.scenarios || {}).length + ' scenarios');
                renderLayout(m.layout || []);
                // Then insert test buttons after action buttons, before first section
                addTestModeButtons();
                addDiagnosticSections();
                // Set up expand/collapse after all buttons are rendered
                setupExpandCollapse();
                window._pbsDynamicBuilding = false;
                console.log('PBS Dynamic: Initialization complete');
            })
            .catch(function(err) {
                console.error('PBS Dynamic: Initialization failed', err);
                window._pbsDynamicBuilding = false;
            });
    }

    setTimeout(init, 100);
})();
//Script
