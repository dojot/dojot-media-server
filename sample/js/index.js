/*
* (C) Copyright 2014 Kurento (http://kurento.org/)
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the GNU Lesser General Public License
* (LGPL) version 2.1 which accompanies this distribution, and is available at
* http://www.gnu.org/licenses/lgpl-2.1.html
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
*/
function getopts(args, opts)
{
  var result = opts.default || {};
  args.replace(
      new RegExp("([^?=&]+)(=([^&]*))?", "g"),
      function($0, $1, $2, $3) { result[$1] = $3; });

  return result;
};

var args = getopts(location.search,
{
  default:
  {
    //ws_uri: 'ws://' + location.hostname + ':8888/kurento',
    ice_servers: undefined
  }
});

if (args.ice_servers) {
  console.log("Use ICE servers: " + args.ice_servers);
  kurentoUtils.WebRtcPeer.prototype.server.iceServers = JSON.parse(args.ice_servers);
} else {
  console.log("Use freeice")
}


window.addEventListener('load', function(){
  console = new Console('console', console);
	var videoOutput = document.getElementById('videoOutput');
	var device = document.getElementById('address');
	device.value = '';
  var webRtcPeer;
  var sessionId;
  var token;

  startButton = document.getElementById('start');
  startButton.addEventListener('click', start);

  stopButton = document.getElementById('stop');
  stopButton.addEventListener('click', stop);

  function start() {
  	if(!device.value){
  	  window.alert("You must set the device first");
  	  return;
  	}
  	device.disabled = true;
  	showSpinner(videoOutput);
    var options = {
      remoteVideo : videoOutput
    };
    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options,
      function(error){
        if(error){
          return console.error(error);
        }
        webRtcPeer.generateOffer(onOffer);
        webRtcPeer.peerConnection.addEventListener('iceconnectionstatechange', function(event){
          if(webRtcPeer && webRtcPeer.peerConnection){
            console.log("oniceconnectionstatechange -> " + webRtcPeer.peerConnection.iceConnectionState);
            console.log('icegatheringstate -> ' + webRtcPeer.peerConnection.iceGatheringState);
          }
        });
    });
  }

  function onOffer(error, sdpOffer){
    if(error) return onError(error);

    console.log("Requiring JWT token...");
    let jwtReq = {
      method: 'post',
      headers: {
        'Content-Type':'application/json'
      },
      url: 'http://127.0.0.1:8000/auth',
      data: {
        username: 'admin',
        passwd: 'admin'
      }
    };
    axios(jwtReq).then(response => {
      token = response.data.jwt;
      console.log(`JWT Token: ${token}`);
      
      console.log('Requiring webrtc session...');
      let sessionReq = {
        method: 'post',
        headers: {
          'Content-Type':'application/json',
          'Authorization': `Bearer ${token}`
        },
        url: `http://127.0.0.1:8000/media-server/v1/device/${device.value}/webrtc/session`
      };
      axios(sessionReq).then(response => {
        sessionId = response.data.sessionId;
        console.log(`Session: ${sessionId}`);


        console.log('Registering ice candidate callbacks');
        webRtcPeer.on('icecandidate', function(_ice){
          console.log("Local icecandidate " + JSON.stringify(_ice));
      
          ice = kurentoClient.register.complexTypes.IceCandidate(_ice);
          let iceReq = {
            method: 'post',
            headers: {
              'Content-Type':'application/json',
              'Authorization': `Bearer ${token}`
            },
            url: `http://127.0.0.1:8000/media-server/v1/device/${device.value}/webrtc/session/${sessionId}/remote/ice`,
            data: [{candidate: ice}]
          };
          axios(iceReq).then(response => {
            console.log(`Sent ice candidate ${ice}`);
          }).catch(error => {
            console.error(error);
          });     
        });

        console.log('Sending SDP offer...');
        console.log(`SDP offer: ${sdpOffer}`);
        let sdpOfferReq = {
          method: 'put',
          headers: {
            'Content-Type':'application/json',
            'Authorization': `Bearer ${token}`
          },
          url: `http://127.0.0.1:8000/media-server/v1/device/${device.value}/webrtc/session/${sessionId}/remote/sdp`,
          data: {
            offer: sdpOffer
          }
        };
        axios(sdpOfferReq).then(response => {
          let sdpAnswer = response.data.answer;
          console.log(`SDP answer: ${sdpAnswer}`);
          webRtcPeer.processAnswer(sdpAnswer);
        });

        // TODO: polling until establish connection
        let getRemoteIces = function() {
          console.log('Requiring remote ice candidates');
          let iceReq = {
            method: 'get',
            headers: {
              'Content-Type':'application/json',
              'Authorization': `Bearer ${token}`
            },
            url: `http://127.0.0.1:8000/media-server/v1/device/${device.value}/webrtc/session/${sessionId}/local/ice`
          };
          axios(iceReq).then(response => {
            let candidates = response.data;
            for(let ice of candidates) {
              webRtcPeer.addIceCandidate(ice.candidate, onError);
            }
          });
        }
        setTimeout(getRemoteIces, 3000);

      });

    }).catch(error => {
      onError();
    });

/*    kurentoClient(args.ws_uri, function(error, kurentoClient) {
  		if(error) return onError(error);

  		kurentoClient.create("MediaPipeline", function(error, p) {
  			if(error) return onError(error);

  			pipeline = p;

  			pipeline.create("PlayerEndpoint", {uri: address.value}, function(error, player){
  			  if(error) return onError(error);

  			  pipeline.create("WebRtcEndpoint", function(error, webRtcEndpoint){
  				if(error) return onError(error);

          setIceCandidateCallbacks(webRtcEndpoint, webRtcPeer, onError);

  				webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer){
  					if(error) return onError(error);

            webRtcEndpoint.gatherCandidates(onError);

  					webRtcPeer.processAnswer(sdpAnswer);
  				});

  				player.connect(webRtcEndpoint, function(error){
  					if(error) return onError(error);

  					console.log("PlayerEndpoint-->WebRtcEndpoint connection established");

  					player.play(function(error){
  					  if(error) return onError(error);

  					  console.log("Player playing ...");
  					});
  				});
  			});
  			});
  		});
    });*/
  }

  function stop() {
    device.disabled = false;
    if (webRtcPeer) {
      webRtcPeer.dispose();
      webRtcPeer = null;
    }

    if(sessionId) {
      console.log('Deleting session');
      let sessionDelReq = {
          method: 'delete',
          headers: {
            'Content-Type':'application/json',
            'Authorization': `Bearer ${token}`
          },
          url: `http://127.0.0.1:8000/media-server/v1/device/${device.value}/webrtc/session/${sessionId}`
        };
        axios(sessionDelReq).then(response => {
          console.log('Session deleted.');
        }).catch(error => {
          console.log('Failed to delete session');
        });
    }

    hideSpinner(videoOutput);
  }

});

/*function setIceCandidateCallbacks(webRtcEndpoint, webRtcPeer, onError){
  webRtcPeer.on('icecandidate', function(candidate){
    console.log("Local icecandidate " + JSON.stringify(candidate));

    candidate = kurentoClient.register.complexTypes.IceCandidate(candidate);

    webRtcEndpoint.addIceCandidate(candidate, onError);

  });
  webRtcEndpoint.on('OnIceCandidate', function(event){
    var candidate = event.candidate;

    console.log("Remote icecandidate " + JSON.stringify(candidate));

    webRtcPeer.addIceCandidate(candidate, onError);
  });
}*/

function onError(error) {
  if(error)
  {
    console.error(error);
    stop();
  }
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = 'img/transparent-1px.png';
		arguments[i].style.background = "center transparent url('img/spinner.gif') no-repeat";
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = 'img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
