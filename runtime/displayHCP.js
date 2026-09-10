//Script,onDataLoad
displayHCP = function () {
    if (!window.pbsShowHCP) return;
    var HCP = [0,0,0,0];
    var cardCount = [0,0,0,0];
    var player = ["S", "W", "N", "E"];
    var suitCount = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    var suitHonor = [[false,false,false,false],[false,false,false,false],[false,false,false,false],[false,false,false,false]];
    var fs = function(t) {
        if (t.indexOf('♠')>=0||t.indexOf('♤')>=0) return 0;
        if (t.indexOf('♥')>=0||t.indexOf('♡')>=0) return 1;
        if (t.indexOf('♦')>=0||t.indexOf('♢')>=0) return 2;
        if (t.indexOf('♣')>=0||t.indexOf('♧')>=0) return 3;
        return -1;
    };
    $("bridge-screen deal-viewer .coverClass .cardSurfaceClass .topLeft", parent.window.document).each(function() {
        if (!isVisible(this)) return;
        var z = Math.trunc($(this).parent().parent().parent().css("zIndex") / 100) - 1;
        var v = "JQKA".indexOf($(this).text().charAt(0)) + 1;
        HCP[z]+=v;
        cardCount[z]++;
        var suit = fs($(this).text());
        if (suit < 0) suit = fs($(this).next().text());
        if (suit < 0) {
            $(this).prevAll().each(function() {
                suit = fs($(this).text());
                if (suit >= 0) return false;
            });
        }
        if (suit >= 0) {
            suitCount[z][suit]++;
            if (v > 0) suitHonor[z][suit] = true;
        }
    });
    var txt = "";
    HCP.forEach(function(hcp, idx) {
        if (HCP[idx] > 0) {
            var sp = 0;
            if (cardCount[idx] == 13) {
                var detected = suitCount[idx][0]+suitCount[idx][1]+suitCount[idx][2]+suitCount[idx][3];
                if (detected == 13) {
                    for (var si = 0; si < 4; si++) {
                        var pts = 3 - Math.min(3, suitCount[idx][si]);
                        if (pts > 0 && suitHonor[idx][si]) pts--;
                        sp += pts;
                    }
                }
            }
            if (idx > 0) txt = txt + "    ";
            txt = txt + player[idx] + ":" + HCP[idx];
            if (sp > 0) txt = txt + "+" + sp;
            txt = txt + " ";
        }
    });
    var el = $(".navBarClass .titleClass", window.parent.document);
    el.css("white-space", "pre");
    el.text(txt);
};
//Script
