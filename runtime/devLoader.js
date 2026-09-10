//Script,onDataLoad
// Development loader - BETA ONLY. Never import this from -PBS.txt.
//
// Testing a change to runtime JavaScript otherwise means: commit, push, point
// PBSCache at the branch, reload, and hope raw.githubusercontent has not served
// you a cached copy. This replaces that loop with: paste, Run.
//
// "Save & Run" also stores the text, and it is re-applied on every page load, so
// you can paste once and then reload freely while iterating on something that
// only reproduces after a full startup.
//
// ESCAPE HATCH: if pasted code breaks startup, clear it from the browser console
//   localStorage.removeItem('pbsDevJS')
// Stored code is also skipped entirely if the URL contains #nodev.
(function () {
    var KEY = 'pbsDevJS';

    function run(src, label) {
        if (!src) return;
        try {
            // Indirect eval so the code runs in this iframe's global scope, the
            // same scope the Import chain evaluates blocks in.
            (0, eval)(src);
            console.log('[PBS dev] ' + label + ' ok (' + src.length + ' chars)');
        } catch (e) {
            console.error('[PBS dev] ' + label + ' failed: ' + ((e && e.message) || e));
        }
    }

    // Re-apply saved code on load, before the UI is built, so it can patch
    // anything later blocks rely on.
    try {
        if (String(location.hash || '').indexOf('nodev') === -1) {
            run(localStorage.getItem(KEY), 'restored');
        }
    } catch (e) { /* storage blocked - nothing to restore */ }

    function build() {
        if (document.getElementById('pbs-dev-loader')) return;
        if (!document.body) return;

        var bar = document.createElement('div');
        bar.id = 'pbs-dev-loader';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
            'background:#222;color:#eee;font:12px/1.4 monospace;padding:4px;';

        var toggle = document.createElement('button');
        toggle.textContent = 'dev JS';
        toggle.title = 'Paste runtime JavaScript to test without pushing';
        toggle.style.cssText = 'font:11px monospace;margin-right:6px;';

        var status = document.createElement('span');
        var saved = '';
        try { saved = localStorage.getItem(KEY) || ''; } catch (e) { }
        status.textContent = saved ? ('saved: ' + saved.length + ' chars (re-applied on load)') : 'no saved code';

        var box = document.createElement('div');
        box.style.display = 'none';

        var ta = document.createElement('textarea');
        ta.placeholder = 'Paste JavaScript here, then Run. Block markers (//Script,...) are stripped automatically.';
        ta.style.cssText = 'width:100%;height:140px;font:11px monospace;';

        function stripMarkers(s) {
            // Accept a whole runtime/*.js file verbatim: drop its block markers so
            // the body can be eval'd directly.
            return s.split('\n').filter(function (l) {
                var t = l.trim();
                return t !== '//Script' && t.indexOf('//Script,') !== 0;
            }).join('\n');
        }

        function mkBtn(label, fn) {
            var b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'font:11px monospace;margin-right:4px;';
            b.onclick = fn;
            return b;
        }

        var row = document.createElement('div');
        row.appendChild(mkBtn('Run', function () {
            run(stripMarkers(ta.value), 'run');
        }));
        row.appendChild(mkBtn('Save & Run', function () {
            var src = stripMarkers(ta.value);
            try { localStorage.setItem(KEY, src); } catch (e) { }
            status.textContent = 'saved: ' + src.length + ' chars (re-applied on load)';
            run(src, 'run');
        }));
        row.appendChild(mkBtn('Clear saved', function () {
            try { localStorage.removeItem(KEY); } catch (e) { }
            status.textContent = 'no saved code';
        }));
        row.appendChild(mkBtn('Load saved into box', function () {
            try { ta.value = localStorage.getItem(KEY) || ''; } catch (e) { }
        }));

        box.appendChild(ta);
        box.appendChild(row);

        toggle.onclick = function () {
            box.style.display = (box.style.display === 'none') ? 'block' : 'none';
        };

        bar.appendChild(toggle);
        bar.appendChild(status);
        bar.appendChild(box);
        document.body.appendChild(bar);
    }

    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
})();
//Script
