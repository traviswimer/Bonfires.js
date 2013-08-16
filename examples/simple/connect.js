(function(){
"use strict";

//////////////////////////
// Global-ish Variables //
///////////////////////////////////////////////////////////
//                                                       //

	var myPeerId;
	var peerConnections = {};

//                                                       //
///////////////////////////////////////////////////////////





///////////////////////////////////
// Initial peer connection setup //
///////////////////////////////////////////////////////////
//                                                       //

	// Connects to the most recent peer using SignalFire.js
	createSignalfireConnection('http://localhost:3333', function(theConnection){
		console.log("Creating initial peer connection using SignalFire.js");
		theConnection.socket.on('yourIdIs', function(data){
			console.log("Your name is: Peer"+data);
			myPeerId = data;
			document.getElementById('peer-name').innerHTML = "You are Peer" + myPeerId;
		});

	}, function(theConnection){
		setupDatachannelCommunication(theConnection);
	});

//                                                       //
///////////////////////////////////////////////////////////





///////////////////////
// Datachannel setup //
///////////////////////////////////////////////////////////
//                                                       //

	// This function is called for each connecting peer to allow datachannel "conversations"
	function setupDatachannelCommunication(theConnection){

		// Listen for messages to get the Peer's ID and get current list of their peers
		theConnection.channels.general.onmessage = function(data){
			var info = JSON.parse(data.data);
			if(info && info.type){
				switch(info.type){
					case "myName":
						if(info.value){
							console.log("Connected to new peer named Peer" + info.value);
							theConnection.bonfire = createBonfire(theConnection);
							peerConnections[info.value] = theConnection;
							addToPeersList(info.value);
						}
						break;
					case "myPeers":
						peerConnections[info.peerId].peers = info.connectedPeers;
						break;
				}
			}
		};
		


		// Send the peer your ID
		// Uses timeout to make sure peer has onmessage set
		setTimeout(function(){
			var theInfo = JSON.stringify({
				type: "myName",
				value: myPeerId
			});
			theConnection.channels.general.send(theInfo);

			sendPeerConnections(theConnection);
		}, 1000);


		// send the peer your list of connected peers every 5 seconds
		setInterval(sendPeerConnections, 5000, theConnection);
	}



	// sends current peer connections across a datachannel
	function sendPeerConnections(theConnection){
		var peerInfo = JSON.stringify({
			type: "myPeers",
			peerId: myPeerId,
			connectedPeers: Object.keys(peerConnections)
		});
		theConnection.channels.general.send(peerInfo);
	}

//                                                       //
///////////////////////////////////////////////////////////





////////////////////////////////////
// Creates a bonfire.js conection //
///////////////////////////////////////////////////////////
//                                                       //

	// Creates the bonfire object to allow peer signaling
	function createBonfire(peerConnection){

		var mySignalingOptions = {
			onSignalingRequest: function(configData){
				if(configData.peerId && peerConnections[configData.peerId]){
					var bfChannel = peerConnections[configData.peerId].channels.bonfire;
					if(bfChannel && bfChannel.readyState === "open"){
						return bfChannel;
					}else{
						delete peerConnections[configData.peerId];
					}
				}
			},
			respondingConnector: function(newPeerConnection, configData, callback){
				createSignalfireConnection(newPeerConnection, function(theConnection){
					callback();
				},function(theConnection){
					setupDatachannelCommunication(theConnection);
				});

			},
			initiatingConnector: function(newPeerConnection, configData, callback){
				createSignalfireConnection(newPeerConnection, function(theConnection){
					callback(configData);
				},function(theConnection){
					document.getElementById("available-peer" + configData.peerId).className = "peer-loaded";
					setupDatachannelCommunication(theConnection);
				});
			}
		};
		return bonfire(peerConnection.channels.bonfire, mySignalingOptions);
	}

//                                                       //
///////////////////////////////////////////////////////////





///////////////////////////////////////////////////
// creates a peer connection using signalfire.js //
///////////////////////////////////////////////////////////
//                                                       //

	function createSignalfireConnection(server, startedCallback, completedCallback){


		var theSocket;
		var options = {
			server: server,
			connector: function(startSignaling, isAnswer){
				var connOpts = {
					'optional': [
						{'DtlsSrtpKeyAgreement': true},
						{'RtpDataChannels': true }
					]
				};
				var newConnection = new RTCPeerConnection(
					{
						"iceServers": [{ "url": "stun:173.194.73.127:19302" }]
					},
					connOpts
				);


				if(!isAnswer){
					var channelOptions = {reliable: false};

					newConnection.channels = {};
					newConnection.channels["general"] = newConnection.createDataChannel("general", channelOptions);
					newConnection.channels["bonfire"] = newConnection.createDataChannel("bonfire", channelOptions);
				}


				newConnection.ondatachannel = function(event){
					if(!newConnection.channels){
						newConnection.channels = {};
					}
					newConnection.channels[event.channel.label] = event.channel;
				};

				newConnection.socket = theSocket;

				startSignaling(newConnection);
			},
			onSignalingComplete: function(peerConnection){
				completedCallback(peerConnection);
			}
		};

		theSocket = signalfire.connect(options, function(theConnection){
			startedCallback(theConnection);
			if(typeof server === 'string'){
				theSocket.emit('connectMe',{});
			}
		});
	}

//                                                       //
///////////////////////////////////////////////////////////





/////////////////////
// UI manipulation //
///////////////////////////////////////////////////////////
//                                                       //

	// Add new peer to connected list
	function addToPeersList(peerId){
		var connectedList = document.querySelector("#connected-list .inner-box");

		var newPeer = document.createElement("div");
		newPeer.className = "peer-option";
		newPeer.innerHTML = "Peer"+peerId;

		newPeer.addEventListener("click", function(){
			loadAvailablePeers(peerId);
		});

		connectedList.appendChild(newPeer);
	}

	// Loads a peers available peers
	function loadAvailablePeers(peerId){
		var availableList = document.querySelector("#connect-options .inner-box");
		availableList.innerHTML = "";

		var peerList = peerConnections[peerId].peers;
		var availableFrag = document.createDocumentFragment();

		for(var i=0; i<peerList.length; i++){

			// Skip yourself
			if(+peerList[i] === +myPeerId){
				continue;
			}

			// Create new scope for each peer in list
			(function(i){
				var curId = peerList[i];


				var newPeer = document.createElement("div");
				newPeer.innerHTML = "Peer"+curId;
				newPeer.id = "available-peer"+curId;

				if(!peerConnections[curId]){
					newPeer.className = "peer-option";
					newPeer.addEventListener("click", function(){
						newPeer.removeEventListener("click");
						newPeer.className = "peer-loading";
						peerConnections[peerId].bonfire.requestPeer({
							peerId: curId
						});
					});
				}else{
					newPeer.className = "peer-loaded";
				}

				availableFrag.appendChild(newPeer);
			}(i));
		}

		availableList.appendChild(availableFrag);
	}

//                                                       //
///////////////////////////////////////////////////////////




}());
