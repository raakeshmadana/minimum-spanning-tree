'use strict'
var id;
var neighbors;
var clients = []; 
var net = require('net');
var _ = require('lodash');
var allowedWait = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
process.on('message', (message) => {
	let msg = JSON.parse(message);
	if(msg['message'] === 'Initiate') {
		id = parseInt(msg['id']);
		neighbors = msg["neighbor"];
		let server = net.createServer((conn) => {
			conn.on('end', function() {
				console.log('Sever is dis-connected!!');
			})
			conn.on('data', function(msg) {
				console.log('Server Received Msg!!')
				console.log(msg.toString('utf8'));	
			})
		});
		server.listen(id, function(){
			console.log('Process is listening at : ' + id);
		}) 
	}
	else if(msg['message'] === 'Connect') {
		Object.keys(neighbors).forEach((neighborID) => {
			let client = net.createConnection({port: parseInt(neighborID)}, function(){
				console.log('Connected to my neighbor');
			});
			client.on('end', function(){
				console.log('Client is dis-connected!!');
			});
			clients.push(client);
		})
	}
	else if(msg['message'] === 'Start') {
		let random = _.sample(allowedWait);
		setTimeout(() => {
			clients.forEach((client) => {
				client.write(JSON.stringify('Dummy message'));
			})
		}, random*1000);
	}
})

