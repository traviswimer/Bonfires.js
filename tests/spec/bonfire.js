var thePeers = [];
var dataChannelCounter = 0;

var completeCount = 0;
function upCompleteCount(endNumber, done){
	completeCount++;
	if(completeCount === endNumber){
		done();
	}
}

var allPeers = [];

/////////////////////////////////
// Creates a Signalfire object //
///////////////////////////////////////////////////////////////////
function createSignalfireConnection(server, startedCallback, completedCallback, onMessageAction){
	onMessageAction = onMessageAction || function(){};

	var theSocket;
	var theConnection;
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
			allPeers.push(newConnection);

			if(webrtcDetectedBrowser && webrtcDetectedBrowser === "firefox"){
				// Use fake audio stream to make webRTC work in firefox
				getUserMedia(
					{
						audio: true,
						fake: true
					},
					function(stream) {
						newConnection.addStream(stream);
						setupConnection();
					},
					function(err){
						console.log("Fake getUserMedia audio failure:");
						console.log(err);
					}
				);
			}else{
				setupConnection();
			}

			function setupConnection(){
				if(!isAnswer){
					var channelOptions = {reliable: true};
					newConnection.channel = newConnection.createDataChannel("bonfire"+dataChannelCounter, channelOptions);
					newConnection.channel.onmessage = onMessageAction;

					dataChannelCounter++;
				}


				newConnection.ondatachannel = function(event){
					newConnection.channel = event.channel;
					event.channel.onmessage = onMessageAction;
				};

				newConnection.socket = theSocket;

				theConnection = newConnection;

				startSignaling(newConnection);
			}
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
///////////////////////////////////////////////////////////////////



//////////////////////////////
// Creates a Bonfire object //
///////////////////////////////////////////////////////////////////
function createBonfire(peerConnection, connectionArray, successCallback){
	successCallback = successCallback || function(){};

	//Connect first peer
	var mySignalingOptions = {
		onSignalingRequest: function(){
			var otherChannel = peerConnection === connectionArray[0] ? connectionArray[1] : connectionArray[0];
			return otherChannel.channel;
		},
		respondingConnector: function(newPeerConnection, configData, callback){
			createSignalfireConnection(
				newPeerConnection,
				function(theConnection){
					callback();
				},function(theConnection){
					connectionArray.push(theConnection);

					function trySending(){
						setTimeout(function(){
							try{
								theConnection.channel.send("TEST");
							}catch(e){
								trySending();
							}
						}, 500);
					}
				},
				successCallback
			);
		},
		initiatingConnector: function(newPeerConnection, configData, callback){
			createSignalfireConnection(
				newPeerConnection,
				function(theConnection){
					callback();
				},function(theConnection){
					connectionArray.push(theConnection);
					
					theConnection.channel.send("TEST");
				},
				successCallback
			);
		}
	};
	peerConnection.bonfire = bonfire(peerConnection.channel, mySignalingOptions);
	return peerConnection.bonfire;
}
///////////////////////////////////////////////////////////////////





///////////////////
// Begin Testing //
///////////////////////////////////////////////////////////////////
describe("bonfire", function() {
	var async = new AsyncSpec(this);

	it("should exist as function", function() {
		expect(typeof bonfire).toEqual('function');
	});


	// These will throw errors, but that is intentional
	describe("function arguments", function() {
		it("DataChannel should be required", function() {
			expect( bonfire(undefined, {}) ).toEqual(false);
		});
		it("options should be required", function() {
			expect( bonfire({}, undefined) ).toEqual(false);
		});
	});

	describe("Create a signaler and 2 peers", function(){
		async.it("Signaler created", function(done){


			createSignalfireConnection('http://localhost:3333', function(theConnection){
				expect(typeof theConnection).toEqual('object');
			}, function(theConnection){
				if(thePeers[0]){
					console.log("adding second peer");
					thePeers[0].push(theConnection);
				}else{
					console.log("adding first peer");
					thePeers[0] = [theConnection];
				}
				upCompleteCount(4, done);
			});


			createSignalfireConnection('http://localhost:3333', function(theConnection){
				expect(typeof theConnection).toEqual('object');
			}, function(theConnection){
				console.log("first peer adding signaler");
				thePeers[1] = [theConnection];
				upCompleteCount(4, done);
			});


			createSignalfireConnection('http://localhost:3333', function(theConnection){
				expect(typeof theConnection).toEqual('object');
			}, function(theConnection){
				console.log("second peer adding signaler");
				thePeers[2] = [theConnection];
				upCompleteCount(4, done);
			});
		}, 30000);
	});

	describe("Attach Bonfire to each peer", function(){
		it("Signaling peer attached to other peers", function(){

			var bonfireConnection1 = thePeers[0][0].bonfire = createBonfire(thePeers[0][0], thePeers[0]);
			expect(typeof bonfireConnection1).toEqual('object');


			var bonfireConnection2 = thePeers[0][1].bonfire = createBonfire(thePeers[0][1], thePeers[0]);
			expect(typeof bonfireConnection2).toEqual('object');

		});

		async.it("Peer requested signaling", function(done){
			completeCount = 0;

			var theCallback = function(){
				upCompleteCount(2, done);
			};


			var bonfireConnection1 = thePeers[1][0].bonfire = createBonfire(thePeers[1][0], thePeers[1], theCallback);
			expect(typeof bonfireConnection1).toEqual('object');


			var bonfireConnection2 = thePeers[2][0].bonfire = createBonfire(thePeers[2][0], thePeers[2], theCallback);
			expect(typeof bonfireConnection2).toEqual('object');


			bonfireConnection1.requestPeer({});

		}, 60000);
	});

});
///////////////////////////////////////////////////////////////////

