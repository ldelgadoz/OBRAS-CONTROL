/* OBRA CONTROL · arranque. */
(function () {
  'use strict';
  var ui = OC.ui;
  document.getElementById('nav').innerHTML = ui.NAV.map(function (n) {
    return '<button data-act="go" data-page="' + n[0] + '"' + (n[0] === ui.state.page ? ' class="active"' : '') + '><span class="ico">' + n[1] + '</span> ' + n[2] + '</button>';
  }).join('');
  ui.activeProject();
  ui.render();
})();
