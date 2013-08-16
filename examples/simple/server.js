var signalfire = require('signalfire');

var peerCount = 0;
var lastPeer;

var sf = signalfire.listen(3333,function(peer){

	peer.socket.on('connectMe', function(data){
		if(lastPeer){
			peer.connectToPeer(lastPeer);
		}
		peer.socket.emit("yourIdIs", ++peerCount);
		lastPeer = peer;
	});

},function(error){
	console.log(error);
});

