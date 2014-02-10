/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

/**
 * Singleton object that handles some cell and data settings.
 */
var CarrierSettings = (function(window, document, undefined) {
  var APN_FILE = '/shared/resources/apn.json';
  var AUTH_TYPES = ['none', 'pap', 'chap', 'papOrChap'];
  var CP_APN_KEY = 'ril.data.cp.apns';
  var CUSTOM_APN_KEY = 'ril.data.custom.apns';

  var NETWORK_GSM_MAP = {
    'wcdma/gsm': 'operator-networkType-auto',
    'gsm': 'operator-networkType-2G',
    'wcdma': 'operator-networkType-3G',
    'wcdma/gsm-auto': 'operator-networkType-prefer2G'
  };

  var NETWORK_CDMA_MAP = {
    'cdma/evdo': 'operator-networkType-auto',
    'cdma': 'operator-networkType-CDMA',
    'evdo': 'operator-networkType-EVDO'
  };

  var NETWORK_DUALSTACK_MAP = {
    'wcdma/gsm': 'operator-networkType-preferWCDMA',
    'gsm': 'operator-networkType-GSM',
    'wcdma': 'operator-networkType-WCDMA',
    'wcdma/gsm-auto': 'operator-networkType-preferGSM',
    'cdma/evdo': 'operator-networkType-preferEVDO',
    'cdma': 'operator-networkType-CDMA',
    'evdo': 'operator-networkType-EVDO',
    'wcdma/gsm/cdma/evdo': 'operator-networkType-auto'
  };

  /* Keys for the APN properties in the UI elements */
  var UI_KEYS = [
    'carrier',
    'apn',
    'user',
    'passwd',
    'httpProxyHost',
    'httpProxyPort',
    'mmsc',
    'mmsproxy',
    'mmsport',
    'authType'
  ];

  // maps for UI fields(current settings key) to new apn setting keys.
  var KEY_MAPPINGS = {
    'passwd': 'password',
    'httpProxyHost': 'proxy',
    'httpProxyPort': 'port',
    'authType': 'authtype'
  };

  var _ = window.navigator.mozL10n.get;
  var _settings = window.navigator.mozSettings;
  var _mobileConnections = window.navigator.mozMobileConnections;
  var _iccManager = window.navigator.mozIccManager;

  /** mozMobileConnection instance the panel settings rely on */
  var _mobileConnection = null;
  /** Flags */
  var _onSubmitEventListenerAdded = {
    'data': false,
    'mms': false,
    'supl': false
  };
  /** Flag */
  var _restartingDataConnection = false;
  /**
   * allApnSettings is a list of all possible prefered APNs based on the SIM
   * operator numeric (MCC MNC codes in the ICC card)
   */
  var _allApnList = null;
  /** MCC and MNC codes the APNs rely on */
  var _mccMncCodes = { mcc: '000', mnc: '00' };

  /* Store the states of automatic operator selection */
  var _opAutoSelectStates = null;

  /**
   * Init function.
   */
  function cs_init() {
    // Get the mozMobileConnection instace for this ICC card.
    _mobileConnection = _mobileConnections[
      DsdsSettings.getIccCardIndexForCellAndDataSettings()
    ];
    if (!_mobileConnection) {
      return;
    }

    // Show carrier name.
    cs_showCarrierName();

    var addNewApnButton = document.getElementById('addNewApnButton');
    if (addNewApnButton) {
      addNewApnButton.onclick = cs_addNewApn;
    }

    // Init network type selector.
    cs_initNetworkTypeSelector();

    // Set the navigation correctly when on a multi ICC card device.
    if (DsdsSettings.getNumberOfIccSlots() > 1) {
      var carrierSimPanel = document.getElementById('carrier');
      var backButton = carrierSimPanel.querySelector('a');
      backButton.setAttribute('href', '#carrier-iccs');
    }

    /*
     * Displaying all GSM and CDMA options by default for CDMA development.
     * We should remove CDMA options after the development finished.
     * Bug 881862 is filed for tracking this.
     */
    // get network type
    getSupportedNetworkInfo(_mobileConnection, function(result) {
      var content =
        document.getElementById('carrier-operatorSettings-content');

      if (result.gsm) {
        cs_initOperatorSelector();
        content.classList.add('gsm');
      }
      if (result.cdma) {
        cs_initRoamingPreferenceSelector();
        content.classList.add('cdma');
      }

      // Init warnings the user sees before enabling data calls and roaming.
      cs_initWarnings();

      // Update the list of APNs in the APN panels.
      window.addEventListener('panelready', function(e) {
        // Get the mozMobileConnection instace for this ICC card.
        _mobileConnection = _mobileConnections[
          DsdsSettings.getIccCardIndexForCellAndDataSettings()
        ];
        if (!_mobileConnection) {
          return;
        }

        var currentHash = e.detail.current;
        if (currentHash === '#carrier') {
          // Show carrier name.
          cs_showCarrierName();
          cs_disabeEnableDataCallCheckbox();
          return;
        }

        if (!currentHash.startsWith('#carrier-') ||
            (currentHash === '#carrier-iccs') ||
            (currentHash === '#carrier-dc-warning') ||
            (currentHash === '#carrier-dr-warning') ||
            (currentHash === '#carrier-apnEditorSettings')) {
          return;
        }

        if (currentHash === '#carrier-operatorSettings') {
          if (result.networkTypes) {
            cs_updateNetworkTypeSelector(result.networkTypes,
                                         result.gsm,
                                         result.cdma);
          }
          cs_updateAutomaticOperatorSelectionCheckbox();
          return;
        }

        if (currentHash === '#carrier-apnSettings') {
          // Get MCC and MNC codes the APNs will rely on and populate APN list.
          cs_getMccMncCodes(function getMccMncCodesCb() {
            cs_queryApns(cs_updateApnList);
          });
        }
      });
    });
  }

  /**
   * Get the mcc/mnc codes from the setting database.
   *
   * @param {Function} callback Callback function to be called once the work is
   *                            done.
   */
  function cs_getMccMncCodes(callback) {
    var iccCardIndex = DsdsSettings.getIccCardIndexForCellAndDataSettings();
    var transaction = _settings.createLock();
    var mccKey = 'operatorvariant.mcc';
    var mncKey = 'operatorvariant.mnc';

    var mccRequest = transaction.get(mccKey);
    mccRequest.onsuccess = function() {
      var mccs = mccRequest.result[mccKey];
      if (!mccs || !Array.isArray(mccs) || !mccs[iccCardIndex]) {
        _mccMncCodes.mcc = '000';
      } else {
        _mccMncCodes.mcc = mccs[iccCardIndex];
      }
      var mncRequest = transaction.get(mncKey);
      mncRequest.onsuccess = function() {
        var mncs = mncRequest.result[mncKey];
        if (!mncs || !Array.isArray(mncs) || !mncs[iccCardIndex]) {
          _mccMncCodes.mnc = '00';
        } else {
          _mccMncCodes.mnc = mncs[iccCardIndex];
        }
        if (callback) {
          callback();
        }
      };
    };
  }

  /**
   * Show the carrier name in the ICC card.
   */
  function cs_showCarrierName() {
    var desc = document.getElementById('dataNetwork-desc');
    var iccCard = _iccManager.getIccById(_mobileConnection.iccId);
    var network = _mobileConnection.voice.network;
    var iccInfo = iccCard.iccInfo;
    var carrier = network ? (network.shortName || network.longName) : null;

    if (carrier && iccInfo && iccInfo.isDisplaySpnRequired && iccInfo.spn) {
      if (iccInfo.isDisplayNetworkNameRequired && carrier !== iccInfo.spn) {
        carrier = carrier + ' ' + iccInfo.spn;
      } else {
        carrier = iccInfo.spn;
      }
    }
    desc.textContent = carrier;
  }

  /**
   * Helper function. Get the value for the ril.data.defaultServiceId setting
   * from the setting database.
   *
   * @param {Function} callback Callback function to be called once the work is
   *                            done.
   */
  function cs_getDefaultServiceIdForData(callback) {
    var request = _settings.createLock().get('ril.data.defaultServiceId');
    request.onsuccess = function onSuccessHandler() {
      var defaultServiceId =
        parseInt(request.result['ril.data.defaultServiceId'], 10);
      if (callback) {
        callback(defaultServiceId);
      }
    };
  }

  /**
   * Disable the checkbox for enabling data calls in case the user has opened
   * the panel for the settings for the ICC card which is not the active one
   * for data calls.
   */
  function cs_disabeEnableDataCallCheckbox() {
    var menuItem = document.getElementById('menuItem-enableDataCall');
    var input = menuItem.querySelector('input');

    cs_getDefaultServiceIdForData(
      function getDefaultServiceIdForDataCb(defaultServiceId) {
        var currentServiceId =
          DsdsSettings.getIccCardIndexForCellAndDataSettings();

        var disable = (defaultServiceId !== currentServiceId);
        if (disable) {
          menuItem.setAttribute('aria-disabled', true);
        } else {
          menuItem.removeAttribute('aria-disabled');
        }
        input.disabled = disable;
    });
  }

  /**
   * Init network type selector. Add the event listener that handles the changes
   * for the network type.
   */
  function cs_initNetworkTypeSelector() {
    if (!_mobileConnection.setPreferredNetworkType)
      return;

    var alertDialog = document.getElementById('preferredNetworkTypeAlert');
    var continueButton = alertDialog.querySelector('button');
    continueButton.addEventListener('click', function onClickHandler() {
      alertDialog.hidden = true;
      getSupportedNetworkInfo(_mobileConnection,
        function getSupportedNetworkInfoCb(result) {
        if (result.networkTypes) {
          cs_updateNetworkTypeSelector(result.networkTypes,
                                       result.gsm,
                                       result.cdma);
        }
      });
    });

    var selector = document.getElementById('preferredNetworkType');
    selector.addEventListener('change', function evenHandler() {
      var type = selector.value;
      var request = _mobileConnection.setPreferredNetworkType(type);
      var message = document.getElementById('preferredNetworkTypeAlertMessage');
      request.onerror = function onErrorHandler() {
        message.textContent = _('preferredNetworkTypeAlertErrorMessage');
        alertDialog.hidden = false;
      };
    });
  }

  /**
   * Update network type selector.
   */
  function cs_updateNetworkTypeSelector(networkTypes, gsm, cdma) {
    if (!_mobileConnection.getPreferredNetworkType)
      return;

    var request = _mobileConnection.getPreferredNetworkType();
    request.onsuccess = function onSuccessHandler() {
      var networkType = request.result;
      if (networkType) {
        var selector = document.getElementById('preferredNetworkType');
        // Clean up all option before updating again.
        while (selector.hasChildNodes()) {
          selector.removeChild(selector.lastChild);
        }
        networkTypes.forEach(function(type) {
          var option = document.createElement('option');
          option.value = type;
          option.selected = (networkType === type);
          // show user friendly network mode names
          if (gsm && cdma) {
            if (type in NETWORK_DUALSTACK_MAP) {
              localize(option, NETWORK_DUALSTACK_MAP[type]);
            }
          } else if (gsm) {
            if (type in NETWORK_GSM_MAP) {
              localize(option, NETWORK_GSM_MAP[type]);
            }
          } else if (cdma) {
            if (type in NETWORK_CDMA_MAP) {
              localize(option, NETWORK_CDMA_MAP[type]);
            }
          } else { //failback only
            option.textContent = type;
          }
          selector.appendChild(option);
        });

      } else {
        console.warn('carrier: could not retrieve network type');
      }
    };
    request.onerror = function onErrorHandler() {
      console.warn('carrier: could not retrieve network type');
    };
  }

  /**
   * Network operator selection: auto/manual.
   */
  function cs_initOperatorSelector() {
    var opAutoSelect = document.getElementById('operator-autoSelect');
    var opAutoSelectInput = opAutoSelect.querySelector('input');
    var opAutoSelectState = opAutoSelect.querySelector('small');

    _opAutoSelectStates =
      Array.prototype.map.call(_mobileConnections, function() { return true; });

    /**
     * Update selection mode.
     */
    function updateSelectionMode(scan) {
      var mode = _mobileConnection.networkSelectionMode;
      // we're assuming the auto-selection is ON by default.
      var auto = !mode || (mode === 'automatic');
      opAutoSelectInput.checked = auto;
      if (auto) {
        localize(opAutoSelectState, 'operator-networkSelect-auto');
      } else {
        localize(opAutoSelectState, 'operator-networkSelect-manual');
        if (scan) {
          gOperatorNetworkList.scan();
        }
      }
    }

    /**
     * Toggle autoselection.
     */
    opAutoSelectInput.onchange = function() {
      var targetIndex = DsdsSettings.getIccCardIndexForCellAndDataSettings();
      _opAutoSelectStates[targetIndex] = opAutoSelectInput.checked;

      if (opAutoSelectInput.checked) {
        gOperatorNetworkList.stop();
        var req = _mobileConnection.selectNetworkAutomatically();
        req.onsuccess = function() {
          updateSelectionMode(false);
        };
      } else {
        gOperatorNetworkList.scan();
      }
    };

    /**
     * Create a network operator list item.
     */
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
    var gOperatorNetworkList = (function operatorNetworkList(list) {
      // get the "Searching..." and "Search Again" items, respectively
      var infoItem = list.querySelector('li[data-state="on"]');
      var scanItem = list.querySelector('li[data-state="ready"]');
      scanItem.onclick = scan;

      var currentConnectedNetwork = null;
      var connecting = false;
      var operatorItemMap = {};

      var scanRequest = null;

      /**
       * Clear the list.
       */
      function clear() {
        operatorItemMap = {};
        var operatorItems = list.querySelectorAll('li:not([data-state])');
        var len = operatorItems.length;
        for (var i = len - 1; i >= 0; i--) {
          list.removeChild(operatorItems[i]);
        }
      }

      /**
       * Reset operator item state.
       */
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

      /**
       * Select operator.
       */
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

        var req = _mobileConnection.selectNetwork(network);
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

      /**
       * Recover available operators.
       */
      function recoverAvailableOperator() {
        if (currentConnectedNetwork) {
          selectOperator(currentConnectedNetwork, false);
        }
      }

      /**
       * Scan available operators.
       */
      function scan() {
        clear();
        list.dataset.state = 'on'; // "Searching..."

        // invalidate the original request if it exists
        invalidateRequest(scanRequest);
        scanRequest = _mobileConnection.getNetworks();
        scanRequest.onsuccess = function onsuccess() {
          var networks = scanRequest.result;
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

          scanRequest = null;
        };

        scanRequest.onerror = function onScanError(error) {
          console.warn('carrier: could not retrieve any network operator. ');
          list.dataset.state = 'ready'; // "Search Again" button

          scanRequest = null;
        };
      }

      function invalidateRequest(request) {
        if (request) {
          request.onsuccess = request.onerror = function() {};
        }
      }

      function stop() {
        list.dataset.state = 'off';
        clear();
        invalidateRequest(scanRequest);
        scanRequest = null;
      }

      // API
      return {
        stop: stop,
        scan: scan
      };
    })(document.getElementById('availableOperators'));

    updateSelectionMode(true);
  }

  /**
   * Update the checkbox of the automatic operator selection.
   */
  function cs_updateAutomaticOperatorSelectionCheckbox() {
    var opAutoSelectInput =
      document.querySelector('#operator-autoSelect input');
    var targetIndex = DsdsSettings.getIccCardIndexForCellAndDataSettings();
    opAutoSelectInput.checked = _opAutoSelectStates[targetIndex];
    opAutoSelectInput.dispatchEvent(new Event('change'));
  }

  /**
   * Init roaming preference selector.
   */
  function cs_initRoamingPreferenceSelector() {
    if (!_mobileConnection.getRoamingPreference) {
      document.getElementById('operator-roaming-preference').hidden = true;
      return;
    }

    var defaultRoamingPreferences =
      Array.prototype.map.call(_mobileConnections,
        function() { return 'any'; });
    var roamingPreferenceHelper =
      SettingsHelper('ril.roaming.preference', defaultRoamingPreferences);

    var selector =
      document.getElementById('operator-roaming-preference-selector');
    var req = _mobileConnection.getRoamingPreference();
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
        roamingPreferenceHelper.get(function gotRP(values) {
          var targetIndex =
            DsdsSettings.getIccCardIndexForCellAndDataSettings();
          var setReq = _mobileConnection.setRoamingPreference(selection.value);
          setReq.onsuccess = function set_rp_success() {
            values[targetIndex] = selection.value;
            roamingPreferenceHelper.set(values);
          };
          setReq.onerror = function set_rp_error() {
            selector.value = values[targetIndex];
          };
        });
      }
    });
  }

  /**
   * Init some cell and data warning dialogs such as the one related to
   * enable data calls and the related to enable data calls in roaming.
   */
  function cs_initWarnings() {
    /**
     * Init a warning dialog.
     *
     * @param {String} settingKey The key of the setting.
     * @param {String} dialogId The id of the warning dialog.
     * @param {String} explanationItemId The id of the explanation item.
     * @param {Function} warningDisabledCallback Callback function to be
     *                                           called once the warning is
     *                                           disabled.
     */
    function initWarning(settingKey,
                         dialogId,
                         explanationItemId,
                         warningDisabledCallback) {

      var warningDialogEnabledKey = settingKey + '.warningDialog.enabled';
      var explanationItem = document.getElementById(explanationItemId);

      /**
       * Figure out whether the warning is enabled or not.
       *
       * @param {Function} callback Callback function to be called once the
       *                            work is done.
       */
      function getWarningEnabled(callback) {
        window.asyncStorage.getItem(warningDialogEnabledKey,
                                    function getItemCb(warningEnabled) {
          if (warningEnabled === null) {
            warningEnabled = true;
          }
          if (callback) {
            callback(warningEnabled);
          }
        });
      }

      /**
       * Set the value of the setting into the settings database.
       *
       * @param {Boolean} state State to be stored.
       */
      function setState(state) {
        var cset = {};
        cset[settingKey] = !!state;
        _settings.createLock().set(cset);
      }

      /**
       * Helper function. Handler to be called once the user click on the
       * accept button form the warning dialog.
       */
      function onSubmit() {
        window.asyncStorage.setItem(warningDialogEnabledKey, false);
        explanationItem.hidden = false;
        setState(true);
        if (warningDisabledCallback) {
          warningDisabledCallback();
        }
      }

      /**
       * Helper function. Handler to be called once the user click on the
       * cancel button form the warning dialog.
       */
      function onReset() {
        window.asyncStorage.setItem(warningDialogEnabledKey, true);
      }

      // Register an observer to monitor setting changes.
      _settings.addObserver(settingKey, function observerCb(event) {
        getWarningEnabled(function getWarningEnabledCb(warningEnabled) {
          var enabled = event.settingValue;
          if (warningEnabled) {
            if (enabled) {
              setState(false);
              openDialog(dialogId, onSubmit, onReset);
            }
          } else {
            explanationItem.hidden = false;
          }
        });
      });

      // Initialize the visibility of the warning message.
      getWarningEnabled(function getWarningEnabledCb(warningEnabled) {
        if (warningEnabled) {
          var request = _settings.createLock().get(settingKey);
          request.onsuccess = function onSuccessCb() {
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
          if (warningDisabledCallback) {
            warningDisabledCallback();
          }
        }
      });
    }

    /**
     * Turn off data roaming automatically when users turn off data calls.
     */
    function warningDataEnabledCb() {
       _settings.addObserver('ril.data.enabled', function observerCb(event) {
         if (!event.settingValue && _restartingDataConnection) {
           var cset = {};
           cset['ril.data.roaming_enabled'] = false;
           _settings.createLock().set(cset);
         }
      });
    }

    initWarning('ril.data.enabled',
                'carrier-dc-warning',
                'dataConnection-expl',
                warningDataEnabledCb);
    initWarning('ril.data.roaming_enabled',
                'carrier-dr-warning',
                'dataRoaming-expl');
  }

  /**
   * Query <apn> elements matching the mcc/mnc arguments, both the ones in the
   * apn.json database and the one received through client provisioning
   * messages.
   *
   * @param {Function} callback Function to be called once the work is done.
   */
  function cs_queryApns(callback) {
    // load and query both apn.json database and 'ril.data.cp.apns' setting,
    // then trigger callback on results
    loadJSON(APN_FILE, function loadJsonCb(apn) {
      var mcc = _mccMncCodes.mcc;
      var mnc = _mccMncCodes.mnc;

      _allApnList = apn[mcc] ? (apn[mcc][mnc] || []) : [];

      if (!_settings) {
        if (callback) {
          callback(_allApnList);
        }
        return;
      }
      var transaction = _settings.createLock();
      var load = transaction.get(CP_APN_KEY);
      load.onsuccess = function loadApnsSuccess() {
        var preferedApnList = _allApnList.concat([]);
        var clientProvisioingApns = load.result[CP_APN_KEY] || {};
        preferedApnList = preferedApnList.concat(
          clientProvisioingApns[mcc] ?
            (clientProvisioingApns[mcc][mnc] || []) :
            []
        );

        var load2 = _settings.createLock().get(CUSTOM_APN_KEY);
        load2.onsuccess = function onSuccessHandler() {
          var allCustomApns = load2.result[CUSTOM_APN_KEY] || [{}, {}];
          var iccCardCustomApns =
            allCustomApns[DsdsSettings.getIccCardIndexForCellAndDataSettings()];

          preferedApnList = preferedApnList.concat(
            iccCardCustomApns[mcc] ?
              (iccCardCustomApns[mcc][mnc] || []) :
              []
          );

          if (callback) {
            callback(preferedApnList);
          }
        };

        load2.onerror = function onErrorHandler() {
          if (callback) {
            callback(preferedApnList);
          }
        };
      };
      load.onerror = function loadApnsError() {
        if (callback) {
          callback(_allApnList);
        }
      };
    });
  }

  /**
   * Update APN list.
   *
   * @param {Array} apnItems Array of APNs.
   */
  function cs_updateApnList(apnItems) {
    var apnList = document.getElementById('apnSettings-list');
    var lastItem = document.getElementById('apnSettings-list-last-element');

    // empty the APN list
    while (lastItem.previousElementSibling) {
      apnList.removeChild(apnList.firstElementChild);
    }

    // fill the APN list
    for (var i = 0; i < apnItems.length; i++) {
      if (!apnItems[i].carrier) {
        continue;
      }
      apnList.insertBefore(cs_createApnItem(apnItems[i]), lastItem);
    }

    // Select the APN based on the one stored in 'ril.data.apnSettings' setting.
    cs_selectApn();
  }

  /**
   * Helper function.
   */
  function cs_createApnItem(item) {
    var aside = document.createElement('aside');
    aside.classList.add('pack-end');

    var label = document.createElement('label');
    label.classList.add('pack-radio');

    var radio = document.createElement('input');
    radio.setAttribute('type', 'radio');
    radio.value = item.carrier;
    radio.name = 'radio';
    radio.onclick = function onClickRadioHandler() {
      var apnList = document.getElementById('apnSettings-list');
      var selector = 'input[type="radio"][value="' + item.carrier + '"]';
      apnList.querySelector(selector).checked = true;

      // Store the selected APN into the setting database.
      cs_storeApnSettings(item)
    };

    var span = document.createElement('span');

    label.appendChild(radio);
    label.appendChild(span);

    aside.appendChild(label);

    var details = document.createElement('a');

    var name = document.createElement('p');
    name.textContent = item.carrier;

    details.appendChild(name);

    var li = document.createElement('li');
    li.appendChild(aside);
    li.appendChild(details);

    details.onclick = function onClickDetailsHandler() {
      cs_fillApnForm(item);
      openDialog(
        'carrier-apnEditorSettings',
        function onApnFormSubmit() {
        },
        function onApnFormReset() {
        });
    };

    return li;
  }

  /**
   * Select the APN in the list relying on the one stored in
   * 'ril.data.apnSettings' setting.
   */
  function cs_selectApn() {
    var request = _settings.createLock().get('ril.data.apnSettings');
    request.onsuccess = function onSuccessHandler() {
      var apn = null;
      var iccCardIndex = DsdsSettings.getIccCardIndexForCellAndDataSettings();
      // The 'ril.data.apnSettings' setting must be an array of two elements
      // even for single ICC card devices. We add [[],[]] as default value.
      var apnSettingsList =
        request.result['ril.data.apnSettings'] || [[], []];
    };
  }

  /**
   * Add a new APN to the APN list.
   */
  function cs_addNewApn() {
    var item = {
      'apnHeader': _('addNewApn')
    };
    cs_fillApnForm(item);
    openDialog(
      'carrier-apnEditorSettings',
      function onNewApnFormSubmit() {
        cs_storeNewApn();
      },
      function onNewApnFormReset() {
      });
  }

  /**
   * Store a new APN into the setting database.
   */
  function cs_storeNewApn() {
    function isValidApn(newApn) {
      return true;
    }

    var apn = {};
    var keys = UI_KEYS.slice(0);
    keys.forEach(function(key) {
      apn[(KEY_MAPPINGS[key] || key)] = cs_rilData(key).value;
    });

    if (!isValidApn(apn)) {
      // Show dialog.
      return;
    }

    var load = _settings.createLock().get(CUSTOM_APN_KEY);
    load.onsuccess = function onSuccessHandler() {
      var mcc = _mccMncCodes.mcc, mnc = _mccMncCodes.mnc, data = {};
      var allCustomApns = load.result[CUSTOM_APN_KEY] || [{}, {}];
      var iccCardCustomApns =
        allCustomApns[DsdsSettings.getIccCardIndexForCellAndDataSettings()];

      if (!iccCardCustomApns[mcc]) {
        iccCardCustomApns[mcc] = {};
      }
      if (!iccCardCustomApns[mcc][mnc]) {
        iccCardCustomApns[mcc][mnc] = [];
      }
      iccCardCustomApns[mcc][mnc].push(apn);

      allCustomApns[DsdsSettings.getIccCardIndexForCellAndDataSettings()] =
        iccCardCustomApns;
      data[CUSTOM_APN_KEY] = allCustomApns;
      _settings.createLock().set(data);
    };
  }

  /**
   * Build and store the new value for the setting storing the APN settings.
   */
  function cs_storeApnSettings() {
    var request = _settings.createLock().get('ril.data.apnSettings');
    request.onsuccess = function onSuccessHandler() {
      var currentApnSettings = request.result['ril.data.apnSettings'];
      var iccCardIndex = DsdsSettings.getIccCardIndexForCellAndDataSettings();
      cs_buildAndStoreApnSettings(currentApnSettings,
                                  iccCardIndex);
    };
  }

  /**
   * Helper function. Build the 'ril.data.apnSettings' to be passed to the
   * RIL plumbing for setting up the data call. It also stores the setting
   * into the settings database.
   *
   * @param {String} type APN type affected.
   * @param {Array} apns Array containing the APN for the ICC cards.
   * @param {Numeric} iccCardAffected Index of the ICC card affected. The one
   *                                  we are building the new APNs for.
   */
  function cs_buildAndStoreApnSettings(apns, iccCardAffected) {
    var apnToBeMerged = {};
    var keys = UI_KEYS.slice(0);

    // Load the fields from the form into the apn to be merged.
    if (type === 'mms') {
      keys.push('mmsc', 'mmsproxy', 'mmsport');
    }
    keys.forEach(function(key) {
      apnToBeMerged[(KEY_MAPPINGS[key] || key)] = cs_rilData(key).value;
    });

    var newApnsForIccCards = [[], []];
    for (var iccCardIndex = 0;
         iccCardIndex < apns.length;
         iccCardIndex++) {

      // We only update the APNs for the ICC card we are handling.
      if (iccCardIndex !== iccCardAffected) {
        newApnsForIccCards[iccCardIndex] = apns[iccCardIndex];
        continue;
      }

      // This is the APN element for the current ICC card, handle it.
      var apnTypeNotPresent = true;
      var newApnsForIccCard = [];
      var apnsForIccCard = apns[iccCardIndex];
      var apn = null;
      for (var j = 0; j < apnsForIccCard.length; j++) {
        apn = apnsForIccCard[j];
        if (apn.types.indexOf(type) !== -1) {
          apnTypeNotPresent = false;
          break;
        }
      }
      if (apnTypeNotPresent) {
        apnToBeMerged.types = [type];
        newApnsForIccCard.push(apnToBeMerged);
      }

      for (var apnIndex = 0; apnIndex < apnsForIccCard.length; apnIndex++) {
        apn = apnsForIccCard[apnIndex];
        // Search the existing APN for the type being modified.
        if (apn.types.indexOf(type) !== -1) {
          if (apn.types.length > 1) {
            // The existing APN being modified is also used for other types
            // of APNs. We need to keep the existing APN for those types.
            // Delete the type of APN that we are modifying from the
            // existing APN and create a new APN for the type we need to
            // modify and add it to the set of APNs for the ICC card.
            var tmpApn = JSON.parse(JSON.stringify(apn));
            tmpApn.types.splice(apn.types.indexOf(type), 1);
            newApnsForIccCard.push(tmpApn);
          }
          apnToBeMerged.types = [type];
          newApnsForIccCard.push(apnToBeMerged);
        } else {
          // The APN here is valid for other types, keep it.
          newApnsForIccCard.push(apn);
        }
      }

      newApnsForIccCards[iccCardIndex] = newApnsForIccCard;
    }

    _settings.createLock().set({'ril.data.apnSettings': newApnsForIccCards});
  }

  /**
   * Helper function.
   */
  function cs_rilData(name) {
    return document.getElementById('ril.data.' + name);
  }

  /**
   * Helper function. Fill up APN form fields.
   *
   * @param {Object} item Object containing APN properties.
   */
  function cs_fillApnForm(item) {
    var header  = document.getElementById('apnHeader');
    header.textContent = item.carrier || item.apnHeader || '';

    cs_rilData('carrier').value = item.carrier || '';
    cs_rilData('apn').value = item.apn || '';
    cs_rilData('user').value = item.user || '';
    cs_rilData('passwd').value = item.password || '';
    cs_rilData('httpProxyHost').value = item.proxy || '';
    cs_rilData('httpProxyPort').value = item.port || '';
    cs_rilData('mmsc').value = item.mmsc || '';
    cs_rilData('mmsproxy').value = item.mmsproxy || '';
    cs_rilData('mmsport').value = item.mmsport || '';
    cs_rilData('authType').value = AUTH_TYPES[item.authtype] || 'notDefined';
  }

  return {
    init: cs_init
  };
})(this, document);

/**
 * Startup.
 */
navigator.mozL10n.ready(function loadWhenIdle() {
  var idleObserver = {
    time: 3,
    onidle: function() {
      CarrierSettings.init();
      navigator.removeIdleObserver(idleObserver);
    }
  };
  navigator.addIdleObserver(idleObserver);
});
