'use strict';

/* global CallLogDBManager, IACHandler */
/* exported CallLogIACHandler */

var CallLogIACHandler = function() {
  window.addEventListener('iac-call-log-add', function(event) {
    if (!event || !event.detail || !event.detail.recent) {
      console.error('Wrong iac event');
      return;
    }

    CallLogDBManager.add(event.detail.recent, function(result) {
      var port = IACHandler.getPort('call-log-add');
      if (port) {
        port.postMessage(result);
      }
    });
  });
}();
