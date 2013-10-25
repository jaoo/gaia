'use strict';

let DEBUG = false;

let utils = require('./utils');
let config;
const { Cc, Ci, Cr, Cu, CC} = require('chrome');
Cu.import('resource://gre/modules/Services.jsm');
let carrierConf;

function debug(msg) {
  if(DEBUG) {
    dump('-*- carrier-conf.js ' + msg + '\n');
  }
}

/**
 * Write the carrier configutation file.
 */
function writeCarrierConf() {
  let file = utils.getFile(config.PROFILE_DIR, 'carrier_conf.json');
  let content = JSON.stringify(carrierConf);
  utils.writeContent(file, content + '\n');
}

/**
 * Execute function.
 *
 * @param {Object} option Non-typed object with useful information.
 */
function execute(options) {
  config = options;
  carrierConf = {};
  writeCarrierConf();
}
exports.execute = execute;
