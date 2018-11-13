"use strict";

var uuid = require('uuid');
var kurento = require('kurento-client');
var config = require('./config');

class SessionNotFound extends Error {
    constructor(...args) {
        super(...args);
        Error.captureStackTrace(this, SessionNotFound);
    }
}

class InternalError extends Error {
    constructor(...args) {
        super(...args);
        Error.captureStackTrace(this, InternalError);
    }
}

//TODO: Add status info to the sessions
class KurentoProxy {
    constructor() {
        this.kurentoClient = null;
        this.sessions = new Map();
    }

    createWebRTCSession(tenant, deviceId, device) {
        //The current implementation supports only one
        //session for each device (camera), but the final solution
        //should support multile sessions
        let key = `${tenant}:${deviceId}`;
        if (this.sessions.has(key)) {
            try {
                console.warn(`Deleting existing session for device ${tenant}:${deviceId}`);
                this.sessions.get(key).flow.pipeline.release();
                this.sessions.delete(`${tenant}:${deviceId}`);
            }
            catch (error) {
                return Promise.reject(
                    new InternalError(
                        `The existing session for device ${tenant}:${deviceId} couldn\'t be deleted.`));
            }
        }

        return this._createKurentoRTSPToWebRTCFlow(device.url).then(rtspToWebRtcflow => {
            let session = {
                id: uuid.v4(),
                flow: rtspToWebRtcflow
            }
            this.sessions.set(key, session);
            return Promise.resolve(session.id);
        }).catch(error => {
            console.debug(error);
            return Promise.reject(
                new InternalError(
                    `Failed to configure RSTP to WebRTC flow for device ${tenant}:${deviceId}.`));
        });
    }

    //TODO check session status
    addRemoteIceCandidates(tenant, deviceId, sessionId, iceCandidateList) {
        return new Promise ((resolve, reject) => {
            let key = `${tenant}:${deviceId}`;
            if(!this.sessions.has(key) || 
            this.sessions.get(key).id !== sessionId) {
                reject(new SessionNotFound(`Session ${sessionId} doesn\'t exist.`));
            }
          
            for(let _candidate of iceCandidateList) {
                let candidate = kurento.getComplexType('IceCandidate')(_candidate.candidate);
                this.sessions.get(key).flow.webRtcEndpoint.addIceCandidate(candidate, function(error){
                    reject(new InternalError(`Failed to add ice candidate ${_candidate.candidate}`));
                });
                console.debug(`Added ice candidate ${JSON.stringify(_candidate.candidate)}`);
            }
            resolve();
        });
    }

    //TODO check session status
    getLocalIceCandidates(tenant, deviceId, sessionId){
        let key = `${tenant}:${deviceId}`;
        if(!this.sessions.has(key) || 
        this.sessions.get(key).id !== sessionId) {
            throw new SessionNotFound(`Session ${sessionId} doesn't exist.`);
        }
        console.debug(JSON.stringify(this.sessions.get(key).flow));
        return this.sessions.get(key).flow.iceCandidates;  
    }

    //TODO check session status
    startWebRTCSession(tenant, deviceId, sessionId, sdpOffer) {
        return new Promise ((resolve, reject) => {
            let key = `${tenant}:${deviceId}`;
            if(!this.sessions.has(key) || 
            this.sessions.get(key).id !== sessionId) {
                reject(new SessionNotFound(`Session ${sessionId} doesn't exist.`));
            }

            console.debug(`Processing SDP offer for session ${sessionId} ...`);
            this.sessions.get(key).flow.webRtcEndpoint.processOffer(sdpOffer, (error, answer) => {
                if(error) {
                    this.sessions.get(key).flow.pipeline.release();
                    reject(new InternalError('Failed to process SDP offer.'));
                }
                console.debug(`Processed SDP offer (answer = ${JSON.stringify(answer)})!`);

                this.sessions.get(key).flow.rtspEndpoint.play(error => {
                    if(error) {
                        this.sessions.get(key).flow.pipeline.release();
                        reject(new InternalError('Failed to play video.'));
                    }
                    console.debug('Playing video ...');
                });

                console.debug(`Gathering candidates for session ${sessionId} ...`);
                this.sessions.get(key).flow.webRtcEndpoint.gatherCandidates(error => {
                    if(error) {
                        console.log(error);
                        this.sessions.get(key).flow.pipeline.release();
                        reject(new InternalError('Failed to gather candidates'));
                    }
                });

                resolve(answer);
            });
        });
    }

    readWebRTCSession(tenant, deviceId, sessionId) {
        console.debug('Reading Session ...');
        let key = `${tenant}:${deviceId}`;
        if(this.sessions.has(key) && 
        this.sessions.get(key).id === sessionId) {
            return this.sessions[`${tenant}:${deviceId}`];
        }
        throw new SessionNotFound(`Session ${sessionId} doesn't exist.`);
    }

    deleteWebRTCSession(tenant, deviceId, sessionId) {
        console.debug('Deleting Session ...');
        let key = `${tenant}:${deviceId}`;
        if(this.sessions.has(key) && 
        this.sessions.get(key).id === sessionId) {
            this.sessions.get(key).flow.pipeline.release();
            return this.sessions.delete(`${tenant}:${deviceId}`);
        }
        throw new SessionNotFound(`Session ${sessionId} doesn't exist.`);
    }

    // get kurento client
    _getKurentoClient() {
        return new Promise ((resolve, reject) => {
            if(this.kurentoClient) {
                resolve(this.kurentoClient);
            }
            kurento(config.kurento.ws_uri, function(error, client) {
                console.debug("Trying to connect to KMS at address " + config.kurento.ws_uri);
                if (error) {
                    console.err("Could not connect to KMS.");
                    reject("Failed to connect to Kurento Media Server.");
                }
                else {
                    console.info("Connected to KMS at address " + config.kurento.ws_uri);
                    this.kurentoClient = client;
                    resolve(this.kurentoClient);
                }
            });
        });
    }

    // create rtstp to webrtc flow
    _createKurentoRTSPToWebRTCFlow(url) {
         console.debug(`Creating pipeline for RTSP ${url} to WebRTC ...`);

         return new Promise ((resolve, reject) => {
            this._getKurentoClient().then(client => {
                let flow = {};

                client.create("MediaPipeline", function(error, _pipeline){
                    if(error) {
                        console.error('Failed to create pipeline!');
                        reject();
                    }
                    console.debug('Created pipeline!');
                    flow.pipeline = _pipeline;
        
                    console.debug('Creating RTSP endpoint ...');
                    flow.pipeline.create("PlayerEndpoint", {uri: url}, function(error, _player){
                        if(error) {
                            console.error('Failed to create RTSP endpoint!');
                            flow.pipeline.release();
                            reject();
                        }
                        console.debug('Created RTSP endpoint!');
                        flow.rtspEndpoint = _player;
        
                        console.debug('Creating WebRTC endpoint ...')
                        flow.pipeline.create("WebRtcEndpoint", (error, _webRtcEndpoint) => {
                            if(error) {
                                console.error('Failed to create WebRTC endpoint!');
                                flow.pipeline.release();
                                reject();
                            }
                            console.debug('Created WebRTC endpoint!');
                            flow.webRtcEndpoint = _webRtcEndpoint;
        
                            console.debug('Registering callback for handling onIceCandidate events ...');
                            flow.iceCandidates = [];
                            var _handleLocalIceCandidate = function(event) {
                                let _candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                                this.iceCandidates.push({candidate: _candidate});
                                console.debug(`Added local ice candidate ${JSON.stringify(_candidate)}`);
                            }
                            var _handleSessionLocalIceCandidate = _handleLocalIceCandidate.bind(flow);
                            flow.webRtcEndpoint.on('OnIceCandidate', _handleSessionLocalIceCandidate);
        
                            console.log(flow);
                            flow.rtspEndpoint.connect(flow.webRtcEndpoint, function(error) {
                                if(error) {
                                    console.error('Failed to connect RTSP and WebRTC endpoints!');
                                    flow.pipeline.release();
                                    reject();
                                }
                                console.debug('Connected RTSP and WebRTC endpoints!');

                                console.log(flow);
                                resolve(flow);
                            });
                        });
                    });
                });
            });
        });
    }
}

module.exports = {
    SessionNotFound: SessionNotFound,
    InternalError: InternalError,
    KurentoProxy: KurentoProxy   
};

