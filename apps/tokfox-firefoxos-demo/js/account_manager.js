/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function(exports) {
  var AccountManager = {
    get account() {
      return localStorage['msisdn'] || null;
    },

    _doServerRequest: function(method, args, phoneNumber, callback) {
      var self = this;
      args.push(function(error) {
        if (!error) {
          self._signIn(phoneNumber, callback);
          return;
        }
        alert('Unable to register the user. ' + error.error);
        window.close();
      });
      TokFoxClient[method].apply(null, args);
    },

    _signIn: function _signIn(phoneNumber, callback) {
      localStorage['msisdn'] = phoneNumber;
      if (callback && typeof callback === 'function') {
        callback();
      }
    },

    signIn: function signIn(phoneNumber, callback) {
      // If the user is already registered in the server, we add the new push
      // endpoints and set the status as signed in.
      var self = this;
      var alias = new TokFoxClient.Alias('msisdn', phoneNumber);
      // TODO: For now we only add the invitation endpoint.
      var rejectionEndpoint = 'http://' + Date.now() + '.com';
      var pushEndpoint;

      function _updateAccount(invitationEndpoint) {
        pushEndpoint = new TokFoxClient.PushEndpoint(invitationEndpoint,
                                                     rejectionEndpoint,
                                                     'DummyDescription');
        self._doServerRequest('updateAccount', [alias, null, pushEndpoint],
                  phoneNumber, callback);

      }

      if (!Notifications.endPoint) {
        Notifications.init(
          function onMessage(invitationID) {
            CallHandler.onCall(invitationID);
          },
          function onRegistered(error, invitationEndpoint) {
            _updateAccount(invitationEndpoint);
         }
        );
      } else {
        _updateAccount(Notifications.endPoint);
      }
    },

    signUp: function signUp(phoneNumber, callback) {
      var self = this;
      var alias = new TokFoxClient.Alias('msisdn', phoneNumber);
      // TODO: For now we only add the invitation endpoint.
      var rejectionEndpoint = 'http://' + Date.now() + '.com';
      var pushEndpoint;

      function _createAccount(invitationEndpoint) {
        pushEndpoint = new TokFoxClient.PushEndpoint(invitationEndpoint,
                                                     rejectionEndpoint,
                                                     'DummyDescription');
        self._doServerRequest('createAccount', [alias, pushEndpoint],
                              phoneNumber, callback);
      }

      if (!Notifications.endPoint) {
        Notifications.init(
          function onMessage(invitationID) {
            CallHandler.onCall(invitationID);
          },
          function onRegistered(error, invitationEndpoint) {
            _createAccount(invitationEndpoint);
          }
        );
      } else {
        _createAccount(Notifications.endPoint);
      }
    },

    login: function(callback) {
      var self = this;
      UIManager.register(function(phoneNumber) {
        var alias = new TokFoxClient.Alias('msisdn', phoneNumber);
        TokFoxClient.accountExist(alias, function(error, result) {
          // Even if we can't get if the account exists or not, we try to
          // register it.
          if (error || !result.accountExists) {
            self.signUp(phoneNumber, callback);
            return;
          }
          self.signIn(phoneNumber, callback);
        });
      });
    },
  };

  exports.AccountManager = AccountManager;
})(this);
