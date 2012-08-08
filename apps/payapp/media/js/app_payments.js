$(function() {
    'use strict';
    var localTransID, lastTransState;

    function consoleLog() {
        if (typeof console.log !== 'undefined') {
            console.log.apply(this, arguments);
        }
    }

    function log(msg) {
        // consoleLog(msg);
        var $log = $("#log pre");
        $log.show().html($log.html() + msg.toString() + "<br>");
    }

    function onBuySuccess() {
        log('navigator.pay() success!');
        log('watching for a postback/chargeback...');
        waitForTransChange();
    }

    function onBuyError() {
        log('navigator.pay() error!');
        $('#call-pay').removeClass('ajax-loading');
    }

    function waitForTransChange() {
        var state;
        log('received postback');
        state = 'paid';
        log('new transaction state: ' + state);
        return;
	var xhr = new XMLHttpRequest({mozSystem: true});
        var url = 'http://payapp.owd.tid.es/en-US/check-trans';
	xhr.open('GET', url, true);
        var send_data = {tx: localTransID};
	xhr.onload = function() {
          if (xhr.status === 200 || xhr.status === 0) {
	    var data = JSON.parse(xhr.response);
            if (data.mozTransactionID && data.transState != lastTransState) {
              lastTransState = data.transState;
              switch (data.transState) {
                case 1:
                  state = 'pending';
                  break;
                case 2:
                  log('received postback');
                  state = 'paid';
                  break;
                case 3:
                  log('received chargeback');
                  state = 'reversed';
                  break;
                default:
                  state = 'UNKNOWN';
                  break;
              }
              log('new transaction state: ' + state);
            }
            setTimeout(waitForTransChange, 5000);
            // $('#call-pay').removeClass('ajax-loading');
          }
        }; 
	xhr.onerror = function(evt) {
        }; 
	xhr.send(send_data);
    }

    $('#call-pay button').click(function(e) {
        e.preventDefault();
        $('#call-pay').addClass('ajax-loading');
        $('#pay-request').hide();
        $('#start-over').show();
        log("generating a signed JWT request...");
	var xhr = new XMLHttpRequest({mozSystem: true});
        var url = 'http://payapp.owd.tid.es/en-US/sign-request';
	xhr.open('POST', url, true);
        var send_string = $('#generator form').serialize();
        consoleLog("send_string: " + send_string);
	xhr.onload = function() {
          if (xhr.status === 200 || xhr.status === 0) {
            consoleLog(JSON.stringify(xhr.response));
            consoleLog(JSON.parse(xhr.response).signedRequest);
            log("Get it. Calling navigator.pay()...");
            var req = navigator.pay(JSON.parse(xhr.response).signedRequest);
            req.onsuccess = onBuySuccess;
            req.onerror = onBuyError;
          }
        }; 
	xhr.onerror = function(evt) {
	  onBuyError();
        }; 
	xhr.send(send_string);

    });

    $('#start-over').hide().click(function(e) {
        e.preventDefault();
        $('#pay-request').show();
        $('#start-over').hide();
        $("#log pre").text('').hide();
        $('#call-pay').removeClass('ajax-loading');
    });

});
