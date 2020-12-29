"use strict";

var config = require('./config');
var kurento = require('./kurento');
var devices = require('./devices');
var api = require('./api');

var kurentoProxy = new kurento.KurentoProxy();
var deviceCache =  new devices.DeviceCache();
api.init(deviceCache, kurentoProxy);