/**********************************/
/* Bonfires Javascript Library     */
/* Version: 0.0.1                 */
/*                                */
/* Copyright 2013 Travis Wimer    */
/* http://traviswimer.com         */
/*                                */
/* Released under the MIT license */
/**********************************/


(function(){
"use strict";

var bonfire = function(initiatorDataChannel, options){
	/*
		--OPTIONS--
		"onSignalingRequest" - Function to be called when a peer requests signaling
								for a peer new connection

		"respondingConnector" - Function to be called when a signaler request a 
								connection offer

		"initiatingConnector" - Function that will be called each time requestPeer() 
								is called
	*/

	////////////////////
	// Initialization //
	/*****************************************************************************/

		// verify required arguments
		function verifyArguments(initiatorDataChannel, options){
			if(!initiatorDataChannel){
				throw new Error('Bonfire Err: You must specify a DataChannel');
			}

			if(typeof initiatorDataChannel != 'object'){
				throw new Error('Bonfire Err: Invalid DataChannel');
			}

			if(!options){
				throw new Error('Bonfire Err: You must include an options object');
			}

			if(typeof options != 'object'){
				throw new Error('Bonfire Err: Invalid options');
			}
		}

		try{
			verifyArguments(initiatorDataChannel, options);
		}catch(e){
			throwError(e);
			return false;
		}


		// Initialize options
		var onSignalingRequest = options.onSignalingRequest || function(){throwError(new Error("Bonfire Err: onSignalingRequest was never defined"));};
		var respondingConnector = options.respondingConnector || function(){throwError(new Error("Bonfire Err: respondingConnector was never defined"));};
		var initiatingConnector = options.initiatingConnector || function(){throwError(new Error("Bonfire Err: initiatingConnector was never defined"));};

		// object used for sending reliable messages across datachannels
		var initiatorReliableChannel = createReliableChannel(
			initiatorDataChannel,
			handleIncomingMessage,
			"initiator"
		);

		var connectingToPeers = {};
		var signalingForPeers = {};

	/*____________________________________________________________________________*/





	///////////////////////////
	// Datachannel Messaging //
	/*****************************************************************************/

		// Handles messages received. These can be messages intended for 
		// server, intiating peer, or responding peer
		function handleIncomingMessage(data, messageSource){

			var parsedData;

			// make sure the message isn't empty
			// For some reason, it sometimes contains the string 'undefined'
			if(!data || data === 'undefined'){
				return;
			}

			try{
				parsedData = JSON.parse(data);
			}catch(e){
				throwError(e);
				return;
			}


			// Determine with the message based on it's type
			switch(parsedData.type){
				case "serverRequestingOffer":
					// Signaler is requesting a connection offer to send to another peer
					console.log("Signaler is requesting a connection offer to send to another peer");
					sendOffer(parsedData.peerId, parsedData.data);
					break;

				case "peerRequest":
					// Signaler received peer request from initiator
					console.log("Signaler received peer request from initiator");

					var newPeerId = parsedData.peerId;

					// Should retrieve a datachannel to communicate through
					var newPeersDatachannel = onSignalingRequest(parsedData.data);
					var newPeersReliableDataChannel = signalingForPeers[newPeerId] = createReliableChannel(
						newPeersDatachannel,
						handleIncomingMessage,
						"responder"
					);
					

					// Send new peer an offer request
					var offerRequest = {
						peerId: newPeerId,
						type: "serverRequestingOffer"
					};

					newPeersReliableDataChannel.send( JSON.stringify(offerRequest) );
					break;

				case "clientSendingOffer":
					// Signaler received a connection offer from the responding peer
					console.log("Signaler received a connection offer from the responding peer");

					if(parsedData.peerId){
						var theOffer = {
							peerId: parsedData.peerId,
							type: "serverSendingOffer",
							offer: parsedData.offer
						};
						initiatorReliableChannel.send( JSON.stringify(theOffer) );
					}
					break;

				case "clientSendingAnswer":
					// Signaler received a connection answer from the initiating peer 
					console.log("Signaler received a connection answer from the initiating peer");

					if(parsedData.peerId){
						var theAnswer = {
							peerId: parsedData.peerId,
							type: "serverSendingAnswer",
							answer: parsedData.answer
						};
						signalingForPeers[parsedData.peerId].send( JSON.stringify(theAnswer) );
					}
					break;

				case "clientSendingIce":
					// Signaler received an ICE candidate from one of the peers
					console.log("Signaler received an ICE candidate from one of the peers");
					
					// Determine which peer sent the candidate
					if(messageSource === "initiator"){
						sendIceCandidate(
							signalingForPeers[parsedData.peerId],
							parsedData
						);
					}else{
						sendIceCandidate(
							initiatorReliableChannel,
							parsedData
						);
					}
					break;

				default:
					// at this point message is known to not be intended for the
					// signaler, so check if there is a listener for the specified
					// peer connection

					// Make sure there is a peer ID and a corresponding connection
					if(parsedData.peerId && connectingToPeers[parsedData.peerId]){
						var thePeer = connectingToPeers[parsedData.peerId];

						thePeer.receive(parsedData);
					}
					break;
			}

		}


		// handles responding to an offer request
		function sendOffer(peerId, configData){
			var newPeerConnection = createPeerConnector(peerId);

			respondingConnector(newPeerConnection, configData, function(){
				var offerObject = {
					peerId: peerId,
					type: 'serverRequestingOffer'
				};
				newPeerConnection.receive(offerObject);
			});
			newPeerConnection.receive({
				type: 'connect'
			});

		}

		function sendIceCandidate(datachannel, parsedData){
			try{
				var iceObject = {
					peerId: parsedData.peerId,
					type: "serverSendingIce",
					candidate: parsedData.candidate
				};

				datachannel.send( JSON.stringify(iceObject) );
			}catch(e){
				throwError(e);
			}
		}

	/*____________________________________________________________________________*/





	////////////////////////////////////
	// Peer Connector Socket Imitator //
	/*****************************************************************************/


		// creates a new 'socket' imitator for connecting to a peer
		function createPeerConnector(peerId){
			peerId = peerId || makePeerId();

			var listenFor = {};

			// Sends a message to the signaling peer
			function emit(messageName, messageObject){
				messageObject.type = messageName;

				var objToSend = JSON.stringify(messageObject);

				try{
					initiatorReliableChannel.send(objToSend);
				}catch(e){
					setTimeout(initiatorReliableChannel.send, 500, objToSend);
				}
			}

			// Creates a message event listener
			function on(messageName, action){
				if(listenFor[messageName]){
					listenFor[messageName].push(action);
				}else{
					listenFor[messageName] = [action];
				}
			}

			// passes a message to the peer to receive
			function receive(parsedData){

				// runs the actions set for message type
				var messageActions = listenFor[parsedData.type];

				if(messageActions && messageActions.length){
					for(var i=0; i<messageActions.length; i++){
						messageActions[i](parsedData);
					}
				}
			}

			function getPeerId(){
				return peerId;
			}

			// add peer Connector to array of peers
			connectingToPeers[peerId] = {
				emit: emit,
				on: on,
				receive: receive,
				getPeerId: getPeerId
			};

			return connectingToPeers[peerId];
		}

		// create a unique identifier string
		function makePeerId(){
			var peerId = "";
			var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
			for(var i=0; i < 20; i++){
				peerId += chars.charAt( Math.floor(Math.random() * chars.length) );
			}
			return peerId;
		}

	/*____________________________________________________________________________*/



	/////////////////////////////
	// Module's Public Methods //
	/*****************************************************************************/

		// asks a peer for to perform signaling for a new peer
		function requestPeer(configData){
			var newPeerConnection = createPeerConnector();

			initiatingConnector(newPeerConnection, configData, function(){
				var peerRequestObject = {
					peerId: newPeerConnection.getPeerId(),
					type: 'peerRequest',
					data: configData
				};
				initiatorReliableChannel.send( JSON.stringify(peerRequestObject) );
			});
			newPeerConnection.receive({
				type: 'connect'
			});
		}

	/*____________________________________________________________________________*/



	///////////////////////
	// Utility Functions //
	/*****************************************************************************/

		function throwError(error){
			setTimeout(function(){
				throw error;
			}, 0);
		}

	/*____________________________________________________________________________*/


	return {
		requestPeer: requestPeer
	};

};

// set the signalfire global variable
window.bonfire = bonfire;















////////////////////////////////
// Reliable Datachannel ACKer //
////////////////////////////////
// Although reliable datachannels (SCTP) ensure that messages are both 
// delivered and in order, there is still a size limitation. This ACKer
// is used to split up messages as neccesary.
/*****************************************************************************/

	var createReliableChannel = function(dataChannel, onMessage, peerType){
	//////////////////////////////////////////////
	// Data is sent using the following format	//
	// Message: 1-17:MyMessageHere				//
	// ACK: 1-17a								//
	// ACKback: 1-17b							//
	//////////////////////////////////////////////

		var datachannelACKer = {
			getState: function(){
				return state;
			},
			send: send
		};


	///////////////////////////////
	// ACKer's private variables //
	//////////////////////////////////////////////////
	//                                              //

		// Holds the message
		var messageNumber = 0;

		// Max number of bytes that can be sent in a message
		var maxMessageBytes = 10;

		// Holds the current connection state
		var state = "waiting";

		// Holds a list of sent messages that have not been ACKed yet
		var sentMessages = {};

		// Holds a list of received messages that have not been ACK backed yet
		var receivedMessages = {};

		// Sends message every 0.5 seconds to check for ACKer connection on peer
		var connectionCheckInterval = setInterval(sendConnectionChecks, 500);

	//                                              //
	//////////////////////////////////////////////////


	/////////////////////////////
	// ACKer's private methods //
	//////////////////////////////////////////////////
	//                                              //

		// Is called when new data is received
		function receiveData(event){
			var data = event.data;

			// Determines the type of message and retrieves info
			var parsedData = parseMessage(data);
			var msgType = parsedData.type;

			var msg = "";

			// end connection check when message received
			if(state === "waiting"){
				clearInterval(connectionCheckInterval);
				state = "setup";

				// initialize by finding the max bytes channel can send
				findMaxBytes();
			}

			switch(msgType){
				case "message":
					// Initial chunk that actually contains the message
					msg = parsedData.message;

					// Store info to use later
					if(!receivedMessages[parsedData.messageId]){
						receivedMessages[parsedData.messageId] = {};
					}

					// Process message if not already received
					if(!receivedMessages[parsedData.messageId][parsedData.chunkId]){

						// Will timeout and resend ACK every 2 seconds, until
						// an ACK-back is received
						var sendingInterval = setInterval(function(messageNumber, chunkNumber){
							formatAndRespond(messageNumber, chunkNumber);
						}, 2000, parsedData.messageId, parsedData.chunkId);


						receivedMessages[parsedData.messageId][parsedData.chunkId] = {
							data: parsedData.message,
							interval: sendingInterval,
							state: "sending"
						};

						// Start checking for fully received message
						if(parsedData.isEnd){
							// Received final message chunk
							// Isn't necessarily in order though
							returnMessage(parsedData.messageId, parsedData.chunkId);
						}


						formatAndRespond(parsedData.messageId, parsedData.chunkId);
					}

					break;

				case "ack":
					// Acknowledgment of message received

					// Process ACK if not already received
					if(sentMessages[parsedData.messageId][parsedData.chunkId].state === "message"){
						sentMessages[parsedData.messageId][parsedData.chunkId].state = "received";

						clearInterval(sentMessages[parsedData.messageId][parsedData.chunkId].interval);

					}

					formatAndSendMessage(parsedData.messageId, parsedData.chunkId);
					break;

				case "back":
					// Acknowledgment back for acknowledgment

					// Process ACK-Back if not already received
					if(receivedMessages[parsedData.messageId][parsedData.chunkId].state === "sending"){
						receivedMessages[parsedData.messageId][parsedData.chunkId].state = "acknowledged";

						clearInterval(receivedMessages[parsedData.messageId][parsedData.chunkId].interval);
					}

					break;
			}
		}



		// parses the message to determine message type and ID info.
		function parseMessage(data){
			// All regexs check if the string starts with a message number,
			// then a "-" followed by a chunk number, followed by a type
			// specifier (":", "a", "b", "!")


			// If initial message
			var initMsgRegex = /^([0-9]+)-([0-9]+):(.+)/;
			var initMsgMatch = initMsgRegex.exec(data);
			if(initMsgMatch){

				return {
					type: "message",
					messageId: initMsgMatch[1],
					chunkId: initMsgMatch[2],
					message: initMsgMatch[3]
				};
			}

			// If ACK message
			var ackMsgRegex = /^([0-9]+)-([0-9]+)a/;
			var ackMsgMatch = ackMsgRegex.exec(data);
			if(ackMsgMatch){

				// If more bytes received than current max, update the max
				var msgBytes = byteCount(data);
				if(msgBytes > maxMessageBytes){
					maxMessageBytes = msgBytes;
				}

				return {
					type: "ack",
					messageId: ackMsgMatch[1],
					chunkId: ackMsgMatch[2]
				};
			}

			// If ACK Back message
			var ackBackMsgRegex = /^([0-9]+)-([0-9]+)b/;
			var ackBackMsgMatch = ackBackMsgRegex.exec(data);
			if(ackBackMsgMatch){
				return {
					type: "back",
					messageId: ackBackMsgMatch[1],
					chunkId: ackBackMsgMatch[2]
				};
			}

			// Marks the end of a message with a "!"
			var endMsgRegex = /^([0-9]+)-([0-9]+)!/;
			var endMsgMatch = endMsgRegex.exec(data);
			if(endMsgMatch){
				return {
					type: "message",
					messageId: endMsgMatch[1],
					chunkId: endMsgMatch[2],
					isEnd: true
				};
			}


			// If not matched, set type to null so the switch will call default
			return {
				type: null
			};

		}



		// formats message and sends
		function formatAndSendMessage(messageNumber, chunkNumber){

			var chunkInfo = sentMessages[messageNumber][chunkNumber];

			var formattedMessage = "";

			switch(chunkInfo.state){
				case "message":
					formattedMessage = messageNumber + "-" + chunkNumber + ":" + chunkInfo.data;
					break;
				case "received":
					formattedMessage = messageNumber + "-" + chunkNumber + "b";
					break;
			}

			sendDatachannelMessage(formattedMessage);

		}

		// formats message end chunk and sends
		function formatAndSendEnd(messageNumber, chunkNumber){

			var chunkInfo = sentMessages[messageNumber][chunkNumber];

			var formattedMessage = messageNumber + "-" + chunkNumber + "!";

			sendDatachannelMessage(formattedMessage);

		}


		// formats response and sends
		function formatAndRespond(messageNumber, chunkNumber){

			var chunkInfo = receivedMessages[messageNumber][chunkNumber];

			var formattedMessage = messageNumber + "-" + chunkNumber + "a";
			

			try{
				sendDatachannelMessage(formattedMessage);
			}catch(e){
				// error sending string
			}
		}



		// Takes a string and splits into chunks of the specified bytes
		function splitIntoByteSizeChunks(string, bytes, msgNum){
			var chunkArray = [];
			var nextChunk = "";
			var nextChar = "";

			while(string.length > 0){
				nextChar = string.substr(0,1);
				string = string.slice(1);

				var sizeTestString = msgNum + "-" + chunkArray.length + ":" + nextChunk + nextChar;

				if(byteCount(sizeTestString) <= bytes){
					nextChunk += nextChar;
				}else{
					chunkArray.push(nextChunk);
					nextChunk = nextChar;
				}
			}

			if(nextChunk && nextChunk.length > 0){
				chunkArray.push(nextChunk);
			}

			return chunkArray;
		}


		// Sends out 1 byte messages until message received from peer
		function sendConnectionChecks(){
			if(dataChannel.readyState === "open"){
				clearInterval(connectionCheckInterval);
				state = "setup";

				// initialize by finding the max bytes channel can send
				findMaxBytes();
			}
			return;
			sendDatachannelMessage('a');
		}


		// Find the max number of bytes that can be sent across the channel
		function findMaxBytes(){
			maxMessageBytes = 1000;
			// This is basically just laziness. It should check to find the actual max bytes,
			// but 1000 is the general area of the max that browsers allow at the moment.
		}



		// Counts the bytes in a string
		function byteCount(s){
			return encodeURI(s).split(/%..|./).length - 1;
		}


		function returnMessage(messageId, endId){
			var numChunks = Object.keys(receivedMessages[messageId]).length-1;

			endId = endId*1;


			if(numChunks !== endId){
				setTimeout(returnMessage, 1000, messageId, endId);
			}else{
				var fullMessage = "";
				for(var i=0; i<numChunks; i++){
					fullMessage += receivedMessages[messageId][i].data;
				}

				onMessage(fullMessage, peerType);
			}
		}


		// sends a message across the datachannel
		function sendDatachannelMessage(message){
			try{
				dataChannel.send(message);
			}catch(e){
				//Error sending
			}
		}

	//                                              //
	//////////////////////////////////////////////////


	////////////////////////////
	// ACKer's public methods //
	//////////////////////////////////////////////////
	//                                              //

		// Creates, processes, and sends a new message
		function send(message){

			var curMessageNum = messageNumber++;

			var chunks = splitIntoByteSizeChunks(message, maxMessageBytes, curMessageNum);

			sentMessages[curMessageNum] = {};


			// Add all chunks to sentMessages object
			for(var i=0; i<chunks.length; i++){
				(function(curMessageNum, i, chunks){
					// Will timeout and resend message every 2 seconds, until
					// an ACK is received
					var sendingInterval = setInterval(function(curMessageNum, chunkNumber){
						formatAndSendMessage(curMessageNum, chunkNumber);
					}, 2000, curMessageNum, i);

					// Store info to use later
					sentMessages[curMessageNum][i] = {
						state: "message",
						data: chunks[i],
						interval: sendingInterval
					};


					formatAndSendMessage(curMessageNum, i);
				}(curMessageNum, i, chunks) );
			}


			// Create the "END" message
			var endChunkNumber = chunks.length;
			var sendingInterval = setInterval(function(curMessageNum, chunkNumber){
				formatAndSendEnd(curMessageNum, chunkNumber);
			}, 2000, curMessageNum, endChunkNumber);
			// Store info to use later
			sentMessages[curMessageNum][endChunkNumber] = {
				state: "message",
				interval: sendingInterval
			};
			formatAndSendEnd(curMessageNum, endChunkNumber);

		}

	//                                              //
	//////////////////////////////////////////////////


	//////////////////////////
	// Initialize the ACKer //
	//////////////////////////////////////////////////
	//                                              //

		// Make the ACKer take over receiving datachannel messages
		dataChannel.onmessage = receiveData;

		return datachannelACKer;

	//                                              //
	//////////////////////////////////////////////////

	};

/*____________________________________________________________________________*/



})();