'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var authChecker = require('./auth');
var kurento = require('./kurento.js');

//Kurento proxy
var kmsProxy = null; //initialized at init()

//Device cache
var deviceCache = null; //initialized at init()

// Http server
const app = express();
app.use(bodyParser.json());

// all APIs should be invoked with valid dojot-"use strict";issued JWT tokens
app.use(authChecker.authParse);
app.use(authChecker.authEnforce);

//TODO: Make compliance with OMA - RESTful Network API for WebRTC Signaling

//POST: /media-server/v1/device/{deviceID}/webrtc/session
//Creates a new webrtc audio/video session to a device (camera or virtual camera)
app.post('/media-server/v1/device/:deviceId/webrtc/session', (req, res) => {
  let device = deviceCache.get(req.service /*tenant*/, req.params.deviceId);
  if(!device) {
    console.error(`Device ${req.service}:${req.params.deviceId} doesn't exist.`);
    return res.status(404).send({message: `Device doesn't exist.`});
  }

  kmsProxy.createWebRTCSession(req.service, req.params.deviceId, device).then(id => {
    return res.status(201).send({sessionId: id});
  }).catch(error => {
    console.error(error.message);
    return res.status(500).send(
      {message: `Something went wrong in the server. Please try again.`});
  });
});

//DELETE: /media-server/v1/device/{deviceID}/webrtc/session/{sessionID}
//Deletes a webrtc session
app.delete('/media-server/v1/device/:deviceId/webrtc/session/:sessionId', (req, res) => {
  try{
    kmsProxy.deleteWebRTCSession(req.service, req.params.deviceId, req.params.sessionId);
  }
  catch (error) {
    console.error(error.message);
    if(error instanceof kurento.SessionNotFound) {
      return res.status(404).send(
        {message: `Session doesn't exist.`});
    }
    else {
      return res.status(500).send(
        {message: `Something went wrong in the server. Please try again.`});
    }
  }
  return res.status(204).send({message: 'Deleted'});
});

//PUT: /media-server/v1/device/{deviceID}/webrtc/session/{sessionID}/remote/sdp
//Provides an SDP offer
app.put('/media-server/v1/device/:deviceId/webrtc/session/:sessionId/remote/sdp', (req,res) => {
  kmsProxy.startWebRTCSession(req.service, req.params.deviceId, 
    req.params.sessionId, req.body.offer).then(sdpAnswer => {
      return res.status(200).send({answer: sdpAnswer});
    }).catch(error => {
      console.error(error.message);
      if(error instanceof kurento.SessionNotFound) {
        return res.status(404).send(
          {message: `Session doesn't exist.`});
      }
      else {
        return res.status(500).send(
          {message: `Something went wrong in the server. Please try again.`});
      }
    });
});

//POST: /media-server/device/{deviceID}/webrtc/session/{sessionID}/remote/ice
//Note: the body is a list of ice candidates
app.post('/media-server/v1/device/:deviceId/webrtc/session/:sessionId/remote/ice', (req, res) => {
  kmsProxy.addRemoteIceCandidates(req.service, req.params.deviceId, 
    req.params.sessionId, req.body).then(() =>{
    return res.status(204).send({message: 'Ok'});
  }).catch(error => {
    console.error(error.message);
    if(error instanceof kurento.SessionNotFound) {
      return res.status(404).send(
        {message: `Session doesn't exist.`});
    }
    else {
      return res.status(500).send(
        {message: `Something went wrong in the server. Please try again.`});
    }
  }); 
});

//GET: /media-server/device/{deviceID}/webrc/session/{sessionID}/local/ice
app.get('/media-server/v1/device/:deviceId/webrtc/session/:sessionId/local/ice', (req, res) => {
  try{
    let candidates = kmsProxy.getLocalIceCandidates(
      req.service, req.params.deviceId, req.params.sessionId);
    return res.status(200).send(JSON.stringify(candidates));
  }
  catch(error) {
    console.error(error.message);
    if(error instanceof kurento.SessionNotFound) {
      return res.status(404).send(
        {message: `Session doesn't exist.`});
    }
    else {
      return res.status(500).send(
        {message: `Something went wrong in the server. Please try again.`});
    }  
  }
});

module.exports = {
    init: (cache, proxy) => {
      deviceCache = cache;
      kmsProxy = proxy;
        app.listen(80, () => {console.info('[api] Service listening on port 80');});
    }
  };