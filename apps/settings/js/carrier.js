/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Carrier = {
  init: function cr_init() {
    this.carrierSettings();
    this.messageSettings();
  },

  // handle carrier settings
  carrierSettings: function cr_carrierSettings() {
    const APN_FILE = '/shared/resources/apn.json';
    const APN_TYPES = ['data', 'mms', 'supl'];
    const TYPE_MAPPING = {'data': 'default',
                          'mms': 'mms',
                          'supl': 'supl'};
    const KEY_MAPPING = {'passwd': 'password',
                         'httpProxyHost': 'proxy',
                         'httpProxyPort': 'port'};
    const AUTH_TYPES = ['none', 'pap', 'chap', 'papOrChap'];

    var _ = window.navigator.mozL10n.get;
    var restartingDataConnection = false;
    var mobileConnection = getMobileConnection();

    // allApnSettings is a list of all possible prefered APNs based on the SIM
    // operator numeric (MCC MNC codes in the ICC card)
    var allApnList = null;
    var usePreferred = {'default': false,
                        'mms': false,
                        'supl': false};

    var mccMncCodes = { mcc: '-1', mnc: '-1' };

    // Read the mcc/mnc codes from the setting database, then trigger callback.
    function getMccMncCodes(callback) {
      var settings = Settings.mozSettings;
      if (!settings) {
        callback();
      }
      var transaction = settings.createLock();
      var mccKey = 'operatorvariant.mcc';
      var mncKey = 'operatorvariant.mnc';

      var mccRequest = transaction.get(mccKey);
      mccRequest.onsuccess = function() {
        mccMncCodes.mcc = mccRequest.result[mccKey] || '0';
        var mncRequest = transaction.get(mncKey);
        mncRequest.onsuccess = function() {
          mccMncCodes.mnc = mncRequest.result[mncKey] || '0';
          callback();
        };
      };
    }

    // helper
    function getPreferredApnName(type) {
      var preferredApnName = null;

      var panel = document.getElementById('carrier-' + type + 'Settings');
      var list = panel.querySelector('.apnSettings-list');
      var radioButtons = list.querySelectorAll('input[type="radio"]');

      for (var i = 0; i < radioButtons.length; i++) {
        if (radioButtons[i].checked) {
          preferredApnName = radioButtons[i].dataset.apn ||
                             radioButtons[i].value;
          break;
        }
      }

      return preferredApnName;
    }

    // helper
    function getPreferredApn(type) {
      var preferredApnName = getPreferredApnName(type);
      if (!preferredApnName) {
        return null;
      }
      for (var i = 0; i < allApnList.length; i++) {
        if (allApnList[i].apn && (allApnList[i].apn === preferredApnName)) {
          return allApnList[i];
        }
      }
      return null;
    }

    // helper
    function canHandleType(apn, type) {
     var apnType = apn.type || apn.types;
     return (apnType.type && (apnType.type.indexOf(TYPE_MAPPING[type]) != -1));
    }

    // build the list of APNs to be used to set up data calls.
    function buildAndStoreApnSettings() {
      var apnSettings = [];
      var validApnFound = false;

      for (var i = 0; i < APN_TYPES.length; i++) {
        var type = APN_TYPES[i];
        console.log('Going for ' + type);
        // user might not select the preferred APN yet
        if (!usePreferred[TYPE_MAPPING[type]]) {
          // let's find out in the list an APN being capable of handling this
          // type
          validApnFound = false;
          // a valid APN might be already included, let's search it
          for (var j = 0; j < apnSettings.length; j++) {
            if (canHandleType(apnSettings[j], type)) {
              validApnFound = true;
              break;
            }
          }
          if (validApnFound) {
            // already have a valid APN, lets go for the next APN type
            console.log('Already have APN for ' + type);
            continue;
          }
          // there is no valid APN for the type, use the first APN in the list
          for (var k = 0; k < allApnList.length; k++) {
            if (canHandleType(allApnList[k], type)) {
              apnSettings.push(allApnList[k]);
              break;
            }
          }
          continue;
        }
        // user has already selected an APN, let's include it
        var preferredApn = getPreferredApn(type);
        if (preferredApn) {
          validApnFound = false;
          // the same APN might be already included
          for (var l = 0; j < apnSettings.length; l++) {
            if (apnSettings[l].apn === preferredApn.apn) {
              validApnFound = true;
              break;
            }
          }
          if (validApnFound) {
            // already have this one, continue
            console.log('Already have APN for ' + type);
            continue;
          }
          // not included yet, let's include it
          apnSettings.push(preferredApn);
        }
      }

      // change property name 'type' by 'types'
      for (var n = 0; n < apnSettings.length; n++) {
        var apn = apnSettings[n];
        if (apn.types) {
          continue;
        }
        apn.types = [];
        apn.type.forEach(function forEachApnType(type) {
          apn.types.push(type);
        });
        delete apn.type;
      }

      // store settings into the database
      Settings.mozSettings.createLock().set({'ril.data.apnSettings':
                                             [apnSettings]});
    }

    // query <apn> elements matching the mcc/mnc arguments
    function queryApn(callback, usage) {
      if (!callback) {
        return;
      }

      var usageFilter = 'default';
      if (usage) {
        usageFilter = TYPE_MAPPING[usage];
      }

      // filter APNs by usage
      var filter = function(apnList) {
        var found = [];
        for (var i = 0; i < apnList.length; i++) {
          if (apnList[i].type.indexOf(usageFilter) != -1) {
            found.push(apnList[i]);
          }
        }
        return found;
      };

      // early way out if the query has already been performed
      if (allApnList) {
        callback(filter(allApnList), usage);
        return;
      }

      // load and query APN database, then trigger callback on results
      loadJSON(APN_FILE, function loadAPN(apn) {
        var mcc = mccMncCodes.mcc;
        var mnc = mccMncCodes.mnc;
        // get a list of matching APNs
        allApnList = apn[mcc] ? (apn[mcc][mnc] || []) : [];
        callback(filter(allApnList), usage);
      });
    }

    // helper
    function getFormField(usage, name) {
      var selector = 'input[data-setting="ril.' + usage + '.' + name + '"]';
      return document.querySelector(selector);
    }

    // update APN fields
    function buildApnList(apnItems, usage) {
      var apnPanel = document.getElementById('carrier-' + usage + 'Settings');
      if (!apnPanel) // unsupported APN type
        return;

      var apnList = apnPanel.querySelector('.apnSettings-list');
      var advForm = apnPanel.querySelector('.apnSettings-advanced');
      var lastItem = apnList.querySelector('.apnSettings-custom');

      // create a button to apply <apn> data to the current fields
      function createApnItem(item) {
        // create an <input type="radio"> element
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = usage + 'ApnSettingsCarrier';
        input.dataset.setting = 'ril.' + usage + '.carrier';
        input.dataset.apn = item.apn;
        input.value = item.apn;
        input.onclick = function fillApnFrom() {
          usePreferred[TYPE_MAPPING[usage]] = true;
          getFormField(usage, 'apn').value = item.apn || '';
          getFormField(usage, 'user').value = item.user || '';
          getFormField(usage, 'passwd').value = item.password || '';
          getFormField(usage, 'httpProxyHost').value = item.proxy || '';
          getFormField(usage, 'httpProxyPort').value = item.port || '';
          if (usage == 'mms') {
            getFormField(usage, 'mmsc').value = item.mmsc || '';
            getFormField(usage, 'mmsproxy').value = item.mmsproxy || '';
            getFormField(usage, 'mmsport').value = item.mmsport || '';
          }
          var input = document.getElementById('ril-' + usage + '-authType');
          input.value = AUTH_TYPES[item.authtype] || 'notDefined';
          var parent = input.parentElement;
          var button = input.previousElementSibling;
          var index = input.selectedIndex;
          if (index >= 0) {
            var selection = input.options[index];
            button.textContent = selection.textContent;
            button.dataset.l10nId = selection.dataset.l10nId;
          }
        };

        // include the radio button element in a list item
        var span = document.createElement('span');
        var label = document.createElement('label');
        label.classList.add('pack-radio');
        label.appendChild(input);
        label.appendChild(span);
        var a = document.createElement('a');
        a.textContent = item.carrier || item.apn;
        var li = document.createElement('li');
        li.appendChild(label);
        li.appendChild(a);

        return li;
      }

      // empty the APN list
      while (lastItem.previousElementSibling) {
        apnList.removeChild(apnList.firstElementChild);
      }

      // fill the APN list
      for (var i = 0; i < apnItems.length; i++) {
        apnList.insertBefore(createApnItem(apnItems[i]), lastItem);
      }

      var settings = Settings.mozSettings;

      // helper
      function fillCustomApnSettingFields() {
        var keys = ['apn', 'user', 'passwd', 'httpProxyHost', 'httpProxyPort'];
        if (usage === 'mms') {
          keys.push('mmsc', 'mmsproxy', 'mmsport');
        }

        keys.forEach(function(key) {
          asyncStorage.getItem(
            'ril.' + usage + '.custom.' + key, function(value) {
              getFormField(usage, key).value = value || '';
          });
        });

        asyncStorage.getItem(
          'ril.' + usage + '.custom.authtype', function(value) {
            var input = document.getElementById('ril-' + usage + '-authType');
            input.value = value || 'notDefined';
            var parent = input.parentElement;
            var button = input.previousElementSibling;
            var index = input.selectedIndex;
            if (index >= 0) {
              var selection = input.options[index];
              button.textContent = selection.textContent;
              button.dataset.l10nId = selection.dataset.l10nId;
            }
        });
      }

      //helper
      function storeCustomApnSettingFields() {
        var keys = ['apn', 'user', 'passwd', 'httpProxyHost', 'httpProxyPort'];
        if (usage === 'mms') {
          keys.push('mmsc', 'mmsproxy', 'mmsport');
        }

        keys.forEach(function(key) {
          asyncStorage.setItem('ril.' + usage + '.custom.' + key,
                               getFormField(usage, key).value);
        });
        var authType = document.getElementById('ril-' + usage + '-authType');
        asyncStorage.setItem('ril.' + usage +
          '.custom.authtype', authType.value);
      }

      // load custom APN settings when the user clicks on the input
      lastItem.querySelector('input').addEventListener('click',
        function() {
          usePreferred[TYPE_MAPPING[usage]] = true;
          fillCustomApnSettingFields();
      });

      // set current APN to 'custom' on user modification
      // and sanitize addresses
      advForm.onchange = function onCustomInput(event) {
        lastItem.querySelector('input').checked = true;

        var addresskeys = ['mmsproxy', 'httpProxyHost'];
        addresskeys.forEach(function(addresskey) {
          if (event.target.dataset.setting ==
              'ril.' + usage + '.' + addresskey) {
            event.target.value = sanitizeAddress(event.target.value);
          }
        });

        storeCustomApnSettingFields();
      };

      /* XXX: This is a minimal and quick fix of bug 882059 for v1-train.
       *      We should modify it after bug 842252 landed.
       */
      var apnSettingsChanged = false;
      var apnRelatedInputs = Array.prototype.slice.call(
        apnPanel.querySelectorAll('.apnSettings-list input[data-setting],' +
                                  '.apnSettings-advanced input[data-setting]'));
      var onApnSettingsChanged = function() {
        apnSettingsChanged = true;
      };
      apnRelatedInputs.forEach(function(input) {
        var settingName = input.dataset.setting;
        if (input.type === 'radio') {
          input.addEventListener('change', onApnSettingsChanged);
        } else {
          input.addEventListener('input', onApnSettingsChanged);
        }
      });

      function onSubmit() {
        buildAndStoreApnSettings();
        setTimeout(function() {
          if (apnSettingsChanged) {
            apnSettingsChanged = false;
            restartDataConnection();
          }
        });
      }

      function onReset() {
        apnSettingsChanged = false;
      }

      // force data connection to restart if changes are validated
      var submitButton = apnPanel.querySelector('button[type=submit]');
      var resetButton = apnPanel.querySelector('button[type=reset]');
      submitButton.addEventListener('click', onSubmit);
      resetButton.addEventListener('click', onReset);
    }

    // restart data connection by toggling it off and on again
    function restartDataConnection() {
      var settings = Settings.mozSettings;
      if (!settings)
        return;

      restartingDataConnection = true;
      var key = 'ril.data.enabled';
      function setDataState(state) {
        var cset = {};
        cset[key] = state;
        settings.createLock().set(cset);
      }

      var request = settings.createLock().get(key);
      request.onsuccess = function() {
        if (request.result[key]) {
          setDataState(false);    // turn data off
          setTimeout(function() { // turn data back on
            restartingDataConnection = false;
            setDataState(true);
          }, 2500); // restart data connection in 2.5s
        }
      };
    }

    function initDataConnectionAndRoamingWarnings() {
      var settings = Settings.mozSettings;

      /*
       * settingKey              : The key of the setting
       * dialogID                : The ID of the warning dialog
       * explanationItemID       : The ID of the explanation item
       * warningDisabledCallback : Callback when the warning is disabled
       */
      var initWarnings =
        function initWarnings(settingKey, dialogID, explanationItemID,
          warningDisabledCallback) {
          if (settings) {
            var warningDialogEnabledKey = settingKey + '.warningDialog.enabled';
            var explanationItem = document.getElementById(explanationItemID);

            var getWarningEnabled = function(callback) {
              window.asyncStorage.getItem(warningDialogEnabledKey,
                function(warningEnabled) {
                  if (warningEnabled == null) {
                    warningEnabled = true;
                  }
                  callback(warningEnabled);
              });
            };

            var setState = function(state) {
              var cset = {};
              cset[settingKey] = !!state;
              settings.createLock().set(cset);
            };

            var onSubmit = function() {
              window.asyncStorage.setItem(warningDialogEnabledKey, false);
              explanationItem.hidden = false;
              setState(true);
              if (warningDisabledCallback)
                warningDisabledCallback();
            };

            var onReset = function() {
              window.asyncStorage.setItem(warningDialogEnabledKey, true);
            };

            // register an observer to monitor setting changes
            settings.addObserver(settingKey, function(event) {
              getWarningEnabled(function gotWarningEnabled(warningEnabled) {
                var enabled = event.settingValue;
                if (warningEnabled) {
                  if (enabled) {
                    setState(false);
                    openDialog(dialogID, onSubmit, onReset);
                  }
                } else {
                  explanationItem.hidden = false;
                }
              });
            });

            // initialize the visibility of the warning message
            getWarningEnabled(function gotWarningEnabled(warningEnabled) {
              if (warningEnabled) {
                var request = settings.createLock().get(settingKey);
                request.onsuccess = function() {
                  var enabled = false;
                  if (request.result[settingKey] !== undefined) {
                    enabled = request.result[settingKey];
                  }

                  if (enabled) {
                    window.asyncStorage.setItem(warningDialogEnabledKey, false);
                    explanationItem.hidden = false;
                  }
                };
              } else {
                explanationItem.hidden = false;
                if (warningDisabledCallback)
                  warningDisabledCallback();
              }
            });
          } else {
            explanationItem.hidden = true;
          }
        };

      var onDCWarningDisabled = function() {
        // Turn off data roaming automatically when users turn off data
        // connection
        if (settings) {
          settings.addObserver('ril.data.enabled', function(event) {
            if (!event.settingValue && !restartingDataConnection) {
              var cset = {};
              cset['ril.data.roaming_enabled'] = false;
              settings.createLock().set(cset);
            }
          });
        }
      };

      initWarnings('ril.data.enabled', 'carrier-dc-warning',
        'dataConnection-expl', onDCWarningDisabled);
      initWarnings('ril.data.roaming_enabled', 'carrier-dr-warning',
        'dataRoaming-expl');
    }

    // network operator selection: auto/manual
    function initOperatorSelector() {
      if (!mobileConnection) {
        return;
      }

      var opAutoSelect = document.getElementById('operator-autoSelect');
      var opAutoSelectInput = opAutoSelect.querySelector('input');
      var opAutoSelectState = opAutoSelect.querySelector('small');

      function updateSelectionMode(scan) {
        var mode = mobileConnection.networkSelectionMode;
        // we're assuming the auto-selection is ON by default.
        var auto = !mode || (mode === 'automatic');
        opAutoSelectInput.checked = auto;
        if (auto) {
          localize(opAutoSelectState, 'operator-networkSelect-auto');
        } else {
          opAutoSelectState.dataset.l10nId = '';
          opAutoSelectState.textContent = mode;
          if (scan) {
            gOperatorNetworkList.scan();
          }
        }
      }

      // toggle autoselection
      opAutoSelectInput.onchange = function() {
        if (opAutoSelectInput.checked) {
          gOperatorNetworkList.state = 'off';
          gOperatorNetworkList.clear();
          var req = mobileConnection.selectNetworkAutomatically();
          req.onsuccess = function() {
            updateSelectionMode(false);
          };
        } else {
          gOperatorNetworkList.scan();
        }
      };

      // create a network operator list item
      function newListItem(network, callback) {
        /**
         * A network list item has the following HTML structure:
         *   <li>
         *     <small> Network State </small>
         *     <a> Network Name </a>
         *   </li>
         */

        // name
        var name = document.createElement('a');
        name.textContent = network.shortName || network.longName;

        // state
        var state = document.createElement('small');
        localize(state,
          network.state ? ('state-' + network.state) : 'state-unknown');

        // create list item
        var li = document.createElement('li');
        li.appendChild(state);
        li.appendChild(name);

        li.dataset.cachedState = network.state || 'unknown';
        li.classList.add('operatorItem');

        // bind connection callback
        li.onclick = function() {
          callback(network, true);
        };
        return li;
      }

      // operator network list
      // XXX : scanning takes a while, and most of the time it never succeeds
      // (doesn't raise any error either) but I swear I've seen it working.
      var gOperatorNetworkList = (function operatorNetworkList(list) {
        // get the "Searching..." and "Search Again" items, respectively
        var infoItem = list.querySelector('li[data-state="on"]');
        var scanItem = list.querySelector('li[data-state="ready"]');
        scanItem.onclick = scan;

        var currentConnectedNetwork = null;
        var connecting = false;
        var operatorItemMap = {};

        // clear the list
        function clear() {
          operatorItemMap = {};
          var operatorItems = list.querySelectorAll('li:not([data-state])');
          var len = operatorItems.length;
          for (var i = len - 1; i >= 0; i--) {
            list.removeChild(operatorItems[i]);
          }
        }

        function resetOperatorItemState() {
          var operatorItems =
            Array.prototype.slice.call(list.querySelectorAll('.operatorItem'));
          operatorItems.forEach(function(operatorItem) {
            var state = operatorItem.dataset.cachedState;
            var messageElement = operatorItem.querySelector('small');

            if (!state) {
              state = 'unknown';
            } else if (state === 'current') {
              state = 'available';
            }

            localize(messageElement, 'state-' + state);
          });
        }

        // select operator
        function selectOperator(network, manuallySelect) {
          if (connecting) {
            return;
          }

          var listItem = operatorItemMap[network.mcc + '.' + network.mnc];
          if (!listItem) {
            return;
          }

          var messageElement = listItem.querySelector('small');

          connecting = true;
          // update current network state as 'available' (the string display
          // on the network to connect)
          if (manuallySelect) {
            resetOperatorItemState();
          }

          var req = mobileConnection.selectNetwork(network);
          localize(messageElement, 'operator-status-connecting');
          req.onsuccess = function onsuccess() {
            currentConnectedNetwork = network;
            localize(messageElement, 'operator-status-connected');
            updateSelectionMode(false);
            connecting = false;
          };
          req.onerror = function onerror() {
            connecting = false;
            localize(messageElement, 'operator-status-connectingfailed');
            if (currentConnectedNetwork) {
              recoverAvailableOperator();
            } else {
              updateSelectionMode(false);
            }
          };
        }

        function recoverAvailableOperator() {
          if (currentConnectedNetwork) {
            selectOperator(currentConnectedNetwork, false);
          }
        }

        // scan available operators
        function scan() {
          clear();
          list.dataset.state = 'on'; // "Searching..."
          var req = mobileConnection.getNetworks();
          req.onsuccess = function onsuccess() {
            var networks = req.result;
            for (var i = 0; i < networks.length; i++) {
              var network = networks[i];
              var listItem = newListItem(network, selectOperator);
              list.insertBefore(listItem, scanItem);

              operatorItemMap[network.mcc + '.' + network.mnc] = listItem;
              if (network.state === 'current') {
                currentConnectedNetwork = network;
              }
            }
            list.dataset.state = 'ready'; // "Search Again" button
          };

          req.onerror = function onScanError(error) {
            console.warn('carrier: could not retrieve any network operator. ');
            list.dataset.state = 'ready'; // "Search Again" button
          };
        }

        // API
        return {
          get state() { return list.dataset.state; },
          set state(value) { list.dataset.state = value; },
          clear: clear,
          scan: scan
        };
      })(document.getElementById('availableOperators'));

      updateSelectionMode(true);
    }

    function initRoamingPreferenceSelector() {
      if (!mobileConnection) {
        return;
      }

      if (!mobileConnection.getRoamingPreference) {
        document.getElementById('operator-roaming-preference').hidden = true;
        return;
      }

      var selector =
        document.getElementById('operator-roaming-preference-selector');
      var req = mobileConnection.getRoamingPreference();
      req.onsuccess = function() {
        for (var i = 0; i < selector.options.length; i++) {
          var selection = selector.options[i];
          if (selection.value === req.result) {
            selection.selected = true;

            var evt = document.createEvent('Event');
            evt.initEvent('change', true, true);
            selector.dispatchEvent(evt);
            break;
          }
        }
      };

      req.onerror = function() {
        console.warn('carrier: ' + req.error.name);
        if (req.error.name === 'RequestNotSupported' ||
            req.error.name === 'GenericFailure') {
          document.getElementById('operator-roaming-preference').hidden = true;
        }
      };

      selector.addEventListener('blur', function() {
        var index = this.selectedIndex;
        if (index >= 0) {
          var selection = this.options[index];
          mobileConnection.setRoamingPreference(selection.value);
        }
      });
    }

    function initNetworkTypeSelector(types) {
      Settings.getSettings(function(result) {
        var setting = result['ril.radio.preferredNetworkType'];
        if (setting) {
          var selector = document.getElementById('preferredNetworkType');
          types.forEach(function(type) {
            var option = document.createElement('option');
            option.value = type;
            option.selected = (setting === type);
            option.textContent = type;
            selector.appendChild(option);
          });

          var evt = document.createEvent('Event');
          evt.initEvent('change', true, true);
          selector.dispatchEvent(evt);
        } else {
          console.warn('carrier: could not retrieve network type');
        }
      });
    }

    function init(callback) {
      /*
       * Displaying all GSM and CDMA options by default for CDMA development.
       * We should remove CDMA options after the development finished.
       * Bug 881862 is filed for tracking this.
       */

      // get network type
      getSupportedNetworkCategories(function(result) {
        var content =
          document.getElementById('carrier-operatorSettings-content');

        // init different selectors based on the network type.
        if (result.gsm) {
          initOperatorSelector();
          content.classList.add('gsm');
        }
        if (result.cdma) {
          initRoamingPreferenceSelector();
          content.classList.add('cdma');
        }

        if (callback) {
          callback();
        }
      });
    }

    // startup
    init(function() {
      Connectivity.updateCarrier(); // see connectivity.js
      initDataConnectionAndRoamingWarnings();

      // XXX this should be done later
      getMccMncCodes(function() {
        queryApn(buildApnList, 'data');
        queryApn(buildApnList, 'mms');
        queryApn(buildApnList, 'supl');
      });
    });
  },

  // Basically we only need to handle ignored items manually here. Other options
  // should be controlled in settings.js by default.
  messageSettings: function cr_messageSettings() {
    var settings = window.navigator.mozSettings;
    if (!settings) {
      return;
    }

    // Handle delivery report manually here because delivery report key is
    // separated in database(sms/mms) but panel only have 1 option to control.
    var lock = settings.createLock();
    var SMSDR = 'ril.sms.requestStatusReport.enabled';
    var MMSDR = 'ril.mms.requestStatusReport.enabled';
    // Since delivery report for sms/mms should be the same,
    // sync the value while init.
    var request = lock.get(SMSDR);
    var mmsSet = {};

    function setMmsDeliveryReport(value) {
      var lock = settings.createLock();
      mmsSet[MMSDR] = value;
      lock.set(mmsSet);
    }
    request.onsuccess = function() {
      setMmsDeliveryReport(request.result[SMSDR]);
    };
    settings.addObserver(SMSDR, function(event) {
      setMmsDeliveryReport(event.settingValue);
    });
  }
};

navigator.mozL10n.ready(Carrier.init.bind(Carrier));
