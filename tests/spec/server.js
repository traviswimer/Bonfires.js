var signalfire = require('signalfire');

var middleman;

var sf=signalfire.listen(3333,function(peer){
	peer.socket.on('connectMe', function(data){
		if(middleman){
			peer.connectToPeer(middleman);
		}else{
			middleman = peer;
		}
	});


	peer.socket.on('disconnect', function(data){
		peer.socket.disconnect();
	});

},function(error){
	console.log(error);
});

