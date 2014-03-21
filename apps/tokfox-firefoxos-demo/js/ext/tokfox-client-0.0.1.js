/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/* exported TokFoxClient */

var TokFoxClient = (function TokFoxClient() {
  /**
   * Default root URL for TokFox API.
   */
  var DEFAULT_ROOT_URL = 'http://tokfox-staging.herokuapp.com';

  /** Debug flag. */
  var debug = false;

  /** URL for TokFox API. */
  var rootUrl = DEFAULT_ROOT_URL;

  function Alias(type, value) {
    this.type = type;
    this.value = value;
  }

  Alias.prototype.constructor = Alias;

  Alias.prototype.toString = function() {
    return this.type + '/' + this.value;
  };

  function PushEndpoint(invitation, rejection, description) {
    this.invitation = invitation;
    this.rejection = rejection;
    this.description = description;
  }

  PushEndpoint.prototype.constructor = PushEndpoint;

  function createAccount(alias, pushEndpoint, callback) {
    var error;

    if (!alias || !(alias instanceof Alias)) {
      error = {};
      error.message = 'Invalid alias';
    }

    if (!error &&
        (!pushEndpoint || !(pushEndpoint instanceof PushEndpoint))) {
      error = {};
      error.message = 'Invalid PUSH endpoint';
    }

    if (error && callback && (typeof callback === 'function')) {
      callback(error, null);
      return;
    }

    request({
      method: 'POST',
      uri: rootUrl + '/account/',
      body: {
        alias: alias,
        pushEndpoint: pushEndpoint
      }
    }, callback);
  }

  function updateAccount(alias, newAlias, newPushEndpoint, callback) {
    var error;

    if (!alias || !(alias instanceof Alias)) {
      error = {};
      error.message = 'Invalid alias';
    }

    // The user might not want to add a new alias.
    if (!error &&
        newAlias && !(newAlias instanceof Alias)) {
      error = {};
      error.message = 'New alias is invalid';
    }

    // The user might not want to update the existing PUSH endpoint.
    if (!error &&
        newPushEndpoint && !(newPushEndpoint instanceof PushEndpoint)) {
      error = {};
      error.message = 'Invalid PUSH endpoint';
    }

    if (error && callback && (typeof callback === 'function')) {
      callback(error, null);
      return;
    }

    var body = {};
    if (newAlias) {
      body.alias = newAlias;
    }
    if (newPushEndpoint) {
      body.pushEndpoint = newPushEndpoint;
    }

    request({
      method: 'PUT',
      uri: rootUrl + '/account/' + alias.toString(),
      body: body
    }, callback);
  }

  function accountExist(alias, callback) {
    var error;

    if (!alias || !(alias instanceof Alias)) {
      error = {};
      error.message = 'Invalid alias';
    }

    if (error && callback && (typeof callback === 'function')) {
      callback(error, null);
      return;
    }

    request({
      method: 'GET',
      uri: rootUrl + '/account/' + alias.toString()
    }, callback);
  }

  function createSession(role, sessionId, callback) {
    var body = {};
    if (role) {
      body.role = role;
    }
    if (sessionId) {
      body.sessionId = sessionId;
    }

    request({
      method: 'POST',
      uri: rootUrl + '/session/',
      body: body
    }, callback);
  }

  function invite(alias, callerAlias, sessionId, callback) {
    var error;

    if (!alias || !(alias instanceof Alias) ||
        (callerAlias && !(callerAlias instanceof Alias))) {
      error = {};
      error.message = 'Invalid alias';
    }

    if (error && callback && (typeof callback === 'function')) {
      callback(error, null);
      return;
    }

    request({
      method: 'POST',
      uri: rootUrl + '/session/invitation/',
      body: {
        alias: alias,
        callerAlias: callerAlias,
        sessionId: sessionId
      }
    }, callback);
  }

  function getInvitation(invitationId, callback) {
    request({
      uri: rootUrl + '/session/invitation/' + invitationId,
      method: 'GET'
    }, callback);
  }

  function acceptInvitation(invitationId, callback) {
    request({
      method: 'PUT',
      uri: rootUrl + '/session/invitation/' + invitationId
    }, callback);
  }

  function rejectInvitation(invitationId, callback) {
    options.uri = rootUrl + '/session/invitation/' + invitationId;
    options.method = 'DELETE';

    request({
      method: 'DELETE',
      uri: rootUrl + '/session/invitation/' + invitationId
    }, callback);
  }

  var _timeoutError = {
    "code": 600,
    "error": "Timeout error", // string description of the error type
    "message": "Request exceed the timeout",
    "info": "https://docs.endpoint/errors/1234" // link to more info on the error
  };

  function request(options, callback) {
    if (debug) {
      dump('options is ' + JSON.stringify(options));
    }

    var req = new XMLHttpRequest({mozSystem: true});
    req.open(options.method, options.uri, true);
    req.responseType = 'json';
    req.timeout = 15000;

    req.onload = function () {
      if (req.status !== 200) {
        // Response in error case. The error object is defined
        // in the API.
        if (callback && (typeof callback === 'function')) {
          callback(req.response);
        }
        return;
      }
      // If the code is 200, we need to retrieve the response
      if (callback && (typeof callback === 'function')) {
        var result = !req.response ? 'OK' : req.response;
        callback(null, result);
      }
    };

    req.onerror = function (event) {
      if (typeof callback === 'function') {
        callback(event.target.status, null);
      }
    };

    req.ontimeout = function () {
      if (typeof callback === 'function') {
        callback(_timeoutError);
      }
    };

    // Send the request
    if (options.body) {
      req.setRequestHeader('Content-Type', 'application/json');
      req.send(JSON.stringify(options.body));
    } else {
      req.send();
    }
  }

  function dump(msg) {
    if (debug) {
      console.log(msg);
    }
  }

  // Pulic API
  return {
   'Alias': Alias,
   'PushEndpoint': PushEndpoint,
   'debug': debug,
   'rootUrl': rootUrl,
   'createSession': createSession,
   'invite': invite,
   'getInvitation': getInvitation,
   'acceptInvitation': acceptInvitation,
   'rejectInvitation': rejectInvitation,
   'createAccount': createAccount,
   'updateAccount': updateAccount,
   'accountExist': accountExist
  };
})();

if ((typeof module === 'undefined') && window) {
  window.TokFoxClient = TokFoxClient;
} else {
  var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
  module.exports = TokFoxClient;
}
