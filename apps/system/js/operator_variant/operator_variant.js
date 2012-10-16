/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function OperatorVariant() {
  var gNetwork = null;
  var cset = null;

  // Ensure Home Network Identity data.
  function ensureHNI() {
    var iccInfo = mobileConnection.iccInfo;
    if (!iccInfo) {
      return;
    }

    if (gNetwork &&
        gNetwork.mcc == iccInfo.mcc &&
        gNetwork.mnc == iccInfo.mnc) {
      return;
    }

    gNetwork = {};
    gNetwork.mcc = iccInfo.mcc;
    gNetwork.mnc = iccInfo.mnc;
    applyOperatorVariantSettings();
  };

  function handleSettingsReady(key, value) {
    cset[key] = value;
    ensureHNI();
    applyOperatorVariantSettings();
  };

  function applyOperatorVariantSettings() {
    if (!cset['ro.moz.iccInfo.mcc'] ||
        !cset['ro.moz.iccInfo.mnc']) {
      return;
    }
    if (gNetwork.mcc == 0 && gNetwork.mnc == 0) {
      return;
    }
    if ((gNetwork.mcc == cset['ro.moz.iccInfo.mcc']) &&
        (gNetwork.mnc == cset['ro.moz.iccInfo.mnc'])) {
      return;
    }

    cset['ro.moz.iccInfo.mcc'] = gNetwork.mcc;
    cset['ro.moz.iccInfo.mnc'] = gNetwork.mnc;
    loadOperatorVariantSettings();
  };

  function loadOperatorVariantSettings() {
    var OPERATOR_VARIANT_FILE = 'operator-variant.xml';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', OPERATOR_VARIANT_FILE, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4 && (xhr.status == 200 || xhr.status === 0)) {
        // Load specific operator settings. Add them here.

        var result = querySettings(xhr.responseXML,
                                   cset['ro.moz.iccInfo.mcc'],
                                   cset['ro.moz.iccInfo.mnc']);
        if (!result.length) {
          return;
        }

        // Load voicemail number to be used for the dialer app
        // if it's not in the ICC card.
        var voicemail = result[0].getAttribute('voicemail');
        cset['ro.moz.iccInfo.mbdn'] = "";
        if (voicemail) {
          cset['ro.moz.iccInfo.mbdn'] = voicemail;
        }

        // Load cell broadcast channels requested as mandatory by the operator.
        var cellbroadcast = result[0].getAttribute('cellbroadcast');
        cset['ro.moz.cellbroadcast.searchlist'] = "";
        if (cellbroadcast) {
          cset['ro.moz.cellbroadcast.searchlist'] = cellbroadcast;
          // 0x1100-0x1103,0xA000-0xA3FF
        }

        var transaction = settings.createLock();
        transaction.set(cset);

        console.log('cset[\'ro.moz.iccInfo.mbdn\']: ' + cset['ro.moz.iccInfo.mbdn']);
        console.log('cset[\'ro.moz.cellbroadcast.searchlist\']: ' +
                    cset['ro.moz.cellbroadcast.searchlist']);
      }
    };
    xhr.send(null);
  };

  function querySettings(document, mcc, mnc) {
    var query = '//operator' + '[@mcc=' + mcc + '][@mnc=' + mnc + ']';
    var xpe = new XPathEvaluator();
    var nsResolver = xpe.createNSResolver(document);
    var result = xpe.evaluate(query, document, nsResolver, 0, null);
    var r, found = [];
    while (r = result.iterateNext()) {
      found.push(r);
    }
    return found;
  };

  function onerrorRequest() {
  };

  var settings = window.navigator.mozSettings;
  if (!settings) {
    return;
  }
  var mobileConnection = window.navigator.mozMobileConnection;
  if (!mobileConnection) {
    return;
  }

  cset = {};
  var transaction = settings.createLock();

  var mcc_request = transaction.get('ro.moz.iccInfo.mcc');
  mcc_request.onsuccess = function() {
    var value = -1;
    if (mcc_request.result['ro.moz.iccInfo.mcc']) {
      value = mcc_request.result['ro.moz.iccInfo.mcc'];
    }
    handleSettingsReady('ro.moz.iccInfo.mcc', value);
  };
  mcc_request.onerror = onerrorRequest;

  var mnc_request = transaction.get('ro.moz.iccInfo.mnc');
  mnc_request.onsuccess = function() {
    var value = -1;
    if (mnc_request.result['ro.moz.iccInfo.mnc']) {
      value = mnc_request.result['ro.moz.iccInfo.mnc'];
    }
    handleSettingsReady('ro.moz.iccInfo.mnc', value);
  };
  mnc_request.onerror = onerrorRequest;

  mobileConnection.addEventListener('iccinfochange', ensureHNI);
})();
