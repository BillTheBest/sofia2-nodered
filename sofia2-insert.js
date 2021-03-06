module.exports = function(RED) {
	var ssapMessageGenerator = require('./lib/SSAPMessageGenerator');
	var kp = require('./lib/kpMQTT');
	var ssapResourceGenerator = require('./lib/SSAPResourceGenerator');
	var http = require('http');
    function Insert(n) {
        RED.nodes.createNode(this,n);
        var node = this;
		this.ontology = n.ontology;
		
		// Retrieve the server (config) node
		 var server = RED.nodes.getNode(n.server);
		
        
		this.on('input', function(msg) {
			var ontologia="";
			var sessionKey='';
			if(this.ontology==""){
				
			   ontologia = msg.ontology;
			}else{
			   ontologia=this.ontology;
			}
			
			if (server) {
				var protocol = server.protocol;
				
				if(protocol.toUpperCase() == "MQTT".toUpperCase()){
					var queryInsert = ssapMessageGenerator.generateInsertMessage(msg.payload, ontologia,server.sessionKey);
					
					var state = server.sendToSib(queryInsert);
					if(typeof(state)=="undefined" || state==""){
						console.log("There are not response for the query send.");
					}else{
						state.then(function(response){
						
							var body = JSON.parse(response.body);
							if(body.ok){
								console.log("The message is send.");
								msg.payload=body;
								node.send(msg);
							}else{
								console.log("Error sendind the insert SSAP message.");
								msg.payload=body.error;
								if(body.errorCode == "AUTENTICATION"){
									console.log("The sessionKey is not valid.");
									server.generateSession();
								}
								node.send(msg);
							}
						});
					}
				}else if(protocol.toUpperCase() == "REST".toUpperCase()){
					var endpoint = server.endpoint;
					var arr = endpoint.toString().split(":");
					
					var host;
					var port = 80;
					
					if(arr[0].toUpperCase()=="HTTP".toUpperCase()||arr[0].toUpperCase()=='HTTPS'.toUpperCase()){
						host=arr[1].substring(2, arr[1].length);
						if(arr.length>2){
							port = parseInt(arr[arr.length-1]);
						}
					}else{
						host = arr[0];	
						if(arr.length>1){
							port = parseInt(arr[arr.length-1]);
						}
					}
					
					var instance = server.kp + ':' + server.instance;
					var queryJoin = ssapResourceGenerator.generateJoinByTokenMessage(server.kp, instance, server.token);
					
					var postheadersJoin = {
						'Content-Type' : 'application/json',
						'Accept' : 'application/json',
						'Content-Length' : Buffer.byteLength(queryJoin, 'utf8')
					};
					
					var optionsJoin = {
					  host: host,
					  port: port,
					  path: '/sib/services/api_ssap/v01/SSAPResource/',
					  method: 'POST',
					  headers: postheadersJoin
					};
					
					// do the JOIN POST call
					var result='';
					var reqPost = http.request(optionsJoin, function(res) {
						console.log("Status code of the Join call: ", res.statusCode);
						res.on('data', function(d) {
							result +=d;
						});
						res.on('end', function() {
							result = JSON.parse(result);
							server.sessionKey=result.sessionKey;
							console.log("SessionKey obtained: " + server.sessionKey);
							//Se prepara el mensaje insert
							var queryInsert = ssapResourceGenerator.generateInsertMessage(msg.payload, ontologia, server.sessionKey);
							
							var postheadersInsert = {
								'Content-Type' : 'application/json',
								'Accept' : 'application/json',
								'Content-Length' : Buffer.byteLength(queryInsert, 'utf8')
							};
							
							var optionsInsert = {
							  host: host,
							  port: port,
							  path: '/sib/services/api_ssap/v01/SSAPResource/',
							  method: 'POST',
							  headers: postheadersInsert
							};
							// do the INSERT POST call
							var resultInsert='';
							var reqInsert = http.request(optionsInsert, function(res) {
								console.log("Status code of the Insert call: ", res.statusCode);
								res.on('data', function(d) {
									resultInsert +=d;
								});
								res.on('end', function() {
									try{
										resultInsert = JSON.parse(resultInsert);
										msg.payload=resultInsert;
									} catch (err) {
										msg.payload=resultInsert;
									}
									node.send(msg);
								});
								
							});
							reqInsert.write(queryInsert);
							reqInsert.end();
							reqInsert.on('error', function(err) {
								console.log(err);
							});
						});
						
					});
					reqPost.write(queryJoin);
					reqPost.end();
					reqPost.on('error', function(err) {
						console.log("There was an error inserting the data: ", err);
					});
					
				}else if(protocol.toUpperCase() == "WEBSOCKET".toUpperCase()){
						//TODO
				}
				
			} else {
				console.log("Error");
			}
			
        });
		
    }
    RED.nodes.registerType("sofia2-insert",Insert);
}