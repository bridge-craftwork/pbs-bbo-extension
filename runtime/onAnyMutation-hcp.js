//Script,onAnyMutation
if (!$("bridge-screen deal-viewer", parent.window.document).length) {
    if (window.pbsShowHCP) {
        window.pbsShowHCP = false;
        var el = $(".navBarClass .titleClass", window.parent.document);
        el.css("white-space", "");
        el.text("Main Bridge Club");
    }
}
var titleEl = $(".navBarClass .titleClass", window.parent.document);
var titleText = titleEl.text();
if (titleText && titleText.indexOf("(Host:") >= 0) titleEl.text(titleText.replace(/\s*\(Host:.*?\)/, ""));
var l = $("bridge-screen deal-viewer .coverClass .cardSurfaceClass .topLeft", parent.window.document).length;
if((l%13) == 0) displayHCP();
if (window.syncRotateFromDialog) window.syncRotateFromDialog();
//Script
