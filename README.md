# Bonfires.js

WebRTC/RTCPeerConnection signaling library to allow browser-based users to act as signaling servers for other peers.

### Currently, Bonfire only works in Google Chrome.

## Why do I need this? ##

Bonfire allows you to connect peers to other peers using existing peer connections. It won't create a peer network for you. Instead, it gives you the power to easily create your own network without having to worrying about the signaling process.

## What does it do? ##

Bonfire allows you to do 3 things:
1.	Request peer signaling from another peer
2.	Listen for signaling requests from other peers
3.	Listen for connection requests from a signaling peer

## Installation ##

*	If you use NPM, you can download Bonfires with this command:
`npm install bonfires`
*	The main Bonfire file is `bonfire.js`
*	If you are using SignalFire.js, you will also need to include the following scripts that will be downloaded by NPM:
	1.	`SignalFire.js/client/src/signalfire-client.js`
	2.	`SignalFire.js/client/src/adaptor.js`
	3.	`SignalFire.js/client/src/socket.io.js`

_These files can also be found in the SignalFire.js GitHub repo:_ [SignalFire.js](https://github.com/traviswimer/SignalFire.js)

## Example ##

Bonfire is intended to easily integrate with [SignalFire.js](https://github.com/traviswimer/SignalFire.js), which is used in the example below:

```js
var listOfPeerDatachannels = [
	// This should contain datachannel objects
];
var mySignalingOptions = {

	// A function that will be called when another peer calls `requestPeer`
	onSignalingRequest: function(configData){
		// Must return a datachannel. The requesting peer will then be connected to the
		// peer at the other end of the datachannel
		return listOfPeerDatachannels[0];
	},
	respondingConnector: function(newPeerConnection, configData, callback){
		var signalFireOptions = {
			// newPeerConnection must be passed as the SignalFire `server` option.
			// This automates the RTCPeerConnection setup
			server: newPeerConnection,

			// there are more required options for SignalFire.js
			// More info can be found at: https://github.com/traviswimer/SignalFire.js
		};
		theSocket = signalfire.connect(signalFireOptions, function(theConnection){});
	},
	initiatingConnector: function(newPeerConnection, configData, callback){
		var signalFireOptions = {
			// newPeerConnection must be passed as the SignalFire `server` option.
			// This automates the RTCPeerConnection setup
			server: newPeerConnection,
			
			// there are more required options for SignalFire.js
			// More info can be found at: https://github.com/traviswimer/SignalFire.js
		};
		theSocket = signalfire.connect(signalFireOptions, function(theConnection){});
	}
};
var bonfireObject = bonfire(peerConnection.channels.bonfire, mySignalingOptions);
bonfireObject.requestPeer({
	// optional parameters to pass to the signaling server
});
```
To get a better understanding of how to use Bonfire, try out the code in the "examples" directory.