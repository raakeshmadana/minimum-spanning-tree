'use strict';
var id;
var neighbors;
var clients = {};
var net = require('net');
var _ = require('lodash');
var allowedWait =
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const constants = require('./constants');
var state = constants.SLEEPING; // Other possible values: FIND and FOUND
var level = 0;
var fragmentId; // Weight of the core edge
var basicEdges = []; // Neighbor uids sorted by edge weight
var branchEdges = []; // Edges part of the MST
var rejectedEdges = []; // Edges not part of the MST
var bestEdge; // The edge with the minimum weight
var bestWeight;
var testEdge; // The edge being tested
var inBranch; // The neighbor that sent the INITIATE message
var findCount; // Number of expected REPORT messages
var delayedMessages = []; // Queue to delay processing certain messages

const tasks = {};
tasks[constants.CONNECT] = onConnect;
tasks[constants.INITIATE] = onInitiate;
tasks[constants.TEST] = onTest;
tasks[constants.ACCEPT] = onAccept;
tasks[constants.REJECT] = onReject;
tasks[constants.REPORT] = onReport;
tasks[constants.CHANGE_CORE] = changeCore;

setInterval(function() {
  if (delayedMessages.length > 0) {
    let delayedMessage = delayedMessages.shift();
    let delayedTask = tasks[delayedMessage.type];
    delayedTask(delayedMessage.source, delayedMessage.payload);
  }
}, 5000);

process.on('message', (message) => {
  let msg = JSON.parse(message);
  if (msg['message'] === 'Initiate') {
    id = parseInt(msg['id']);
    neighbors = msg['neighbor'];
    // Initially, all the edges are classified as basic edges
    basicEdges =
      Object.keys(neighbors).sort((a, b) => neighbors[a] - neighbors[b]);
    basicEdges = basicEdges.map((edge) => parseInt(edge));
    let server = net.createServer((conn) => {
      conn.on('end', function() {
      });
      conn.on('data', function(msg) {
        msg = JSON.parse(msg);
        let task = tasks[msg.type];
        task(msg.source, msg.payload);
      });
    });
    server.listen(id, function() {
      console.log('Process is listening at : ' + id);
    });
  } else if (msg['message'] === 'Connect') {
    Object.keys(neighbors).forEach((neighborID) => {
      let client =
        net.createConnection({port: parseInt(neighborID)}, function(){
          console.log('Connected to my neighbor');
        });
      client.on('end', function(){
        console.log('Client is dis-connected!!');
      });
      clients[neighborID] = client;
    });
  } else if (msg['message'] === 'Start') {
    if (state === constants.SLEEPING) {
      wakeup();
    }
  }
});

function changeCore() {
  console.log('called changecore');
  if (branchEdge.includes(bestEdge)) {
    // Send CHANGE_CORE on bestEdge
    // This propagates the CHANGE_CORE message to the node that found the MWOE
    let message = {
      source: id,
      type: constants.CHANGE_CORE,
    };
    sendMessage(clients[bestEdge], message);
  } else {
    // This is the node that found the MWOE
    // Send CONNECT message
    let message = {
      source: id,
      type: constants.CONNECT,
      payload: {
        level
      }
    };
    // BUG 2
    // The CONNECT message is not being sent
    // FIX
    // Send CONNECT message on bestEdge
    sendMessage(clients[bestEdge], message);

    // Move the bestEdge from basicEdges to branchEdges
    let index = basicEdges.indexOf(bestEdge);
    basicEdges.splice(index, 1);
    branchEdges.push(bestEdge);
  }
}

// Random delay for each message to simulate async network
function sendMessage(client, message) {
  let random = _.sample(allowedWait);
  setTimeout(() => {
      client.write(JSON.stringify(message));
      console.log('Node ID : ' , id, 'Current Branch Edges : ', branchEdges);
      console.log('Node ID : ' , id, 'Current Level : ', level);
      console.log('Node ID : ' , id, 'Fragment ID: ', fragmentId);
  }, random * 1000);
}

function onAccept(source, payload) {
  testEdge = null;
  if (neighbors[source] < bestWeight) {
    bestEdge = parseInt(source);
    bestWeight = neighbors[source];
    // BUG 3
    // Report should be outside the if block
  }
  // FIX
  report();
}

function onConnect(source, {level: l}) {
  if (state === constants.SLEEPING) {
    wakeup();
  }

  if (l < level) { // Absorb
    // BUG 1
    // Source edge becomes a branch edge but it has not been removed from basic
    // edges
    // FIX
    // Remove the source edge from basicEdges
    let index = basicEdges.indexOf(parseInt(source));
    basicEdges.splice(index, 1);
    branchEdges.push(parseInt(source));
    // Send INITIATE
    let message = {
      source: id,
      type: constants.INITIATE,
      payload: {
        level,
        fragmentId,
        state
      }
    };
    sendMessage(clients[source], message);

    if (state === constants.FIND) {
      // The fragment to be absorbed gets added to the search
      findCount++;
    }
  } else if (basicEdges.includes(parseInt(source))) {
    // Delay processing the message by placing it at the end of the queue
    let message = {
      source,
      type: constants.CONNECT,
      payload: {
        level: l
      }
    };
    delayedMessages.push(message);
  } else { // Merge
    // Send INITIATE message
    let message = {
      source: id,
      type: constants.INITIATE,
      payload: {
        level: level + 1,
        fragmentId: neighbors[source],
        state: constants.FIND
      }
    };
    sendMessage(clients[source], message);
  }
}

function onInitiate(source, {level: l, fragmentId: f, state: s}) {
  level = l;
  fragmentId = f;
  state = s;
  inBranch = parseInt(source);
  bestEdge = null;
  bestWeight = Number.POSITIVE_INFINITY;
  // Send INITIATE messages on each branch edge except on inBranch
  branchEdges.filter(edge => edge !== inBranch).forEach(edge => {
    let message = {
      source: id,
      type: constants.INITIATE,
      payload: {
        level,
        fragmentId,
        state
      }
    };
    sendMessage(clients[edge], message);
    if (s === constants.FIND) { // The fragment is getting absorbed otherwise
      findCount++;
    }
  });
  if (s === constants.FIND) {
    test();
  }
}

function onReject(source, payload) {
  // Move the edge from basicEdges to rejectedEdges
  if (basicEdges.includes(parseInt(source))) {
    let index = basicEdges.indexOf(parseInt(source));
    basicEdges.splice(index, 1);
    rejectedEdges.push(parseInt(source));
    test();
  }
}

function onReport(source, {bestWeight : w}) {
  w = (w==='infinity') ? Number.POSITIVE_INFINITY : w;

  if (parseInt(source) !== inBranch) {
    findCount--;
    if (w < bestWeight) {
      bestWeight = w;
      bestEdge = parseInt(source);
      // BUG 4
      // Report should be outside if block
    }
    // FIX
    report();
  } else if (state === constants.FIND) {
    // Delay processing the message
    let message = {
      source,
      type: constants.REPORT,
      payload: {
        bestWeight: w
      }
    };
    delayedMessages.push(message);
  } else if (w > bestWeight) {
    changeCore();
  } else if (w === Number.POSITIVE_INFINITY &&
      bestWeight === Number.POSITIVE_INFINITY) {
  }
}

function onTest(source, {level: l, fragmentId: f}) {
  if (state === constants.SLEEPING) {
    wakeup();
  }

  if (l > level) {
    // Delay processing the message
    let message = {
      source,
      type: constants.TEST,
      payload: {
        level: l,
        fragmentId: f
      }
    };
    delayedMessages.push(message);
  } else if (f !== fragmentId) {
    // Send ACCEPT message on source edge
    let message = {
      source: id,
      type: constants.ACCEPT,
    };
    sendMessage(clients[source], message);
  } else if (basicEdges.includes(parseInt(source))) {
    // Add the edge to rejectedEdges
    let index = basicEdges.indexOf(parseInt(source));
    basicEdges.splice(index, 1);
    rejectedEdges.push(parseInt(source));
  }
    // Send REJECT message on source edge
  if (testEdge !== parseInt(source)) {
    let message = {
      source: id,
      type: constants.REJECT
    };
    sendMessage(clients[source], message);
  } else {
    test();
  }
}

function report() {
  if (findCount === 0 && testEdge === null) {
    // All REPORTS received and no basic edge left to test
    state = constants.FOUND;

    // Send REPORT message on inBranch
    let message = {
      source: id,
      type: constants.REPORT,
      payload: {
        'bestWeight' : isFinite(bestWeight) ? bestWeight : 'infinity'
      }
    };
    // Send a REPORT back to the node that sent the INITIATE
    sendMessage(clients[inBranch], message);
  }
}

function test() {
  if (basicEdges.length > 0) {
    // Send a TEST message on the minimum weight basic edge
    // The testEdge remains a basic edge unless it receives an REJECT message
    // So, it should not be removed from basicEdges
    testEdge = basicEdges[0];
    let message = {
      source: id,
      type: constants.TEST,
      payload: {
        level,
        fragmentId
      }
    };
    sendMessage(clients[testEdge], message);
  } else { // No basic edges left to test
    testEdge = null;
    report();
  }
}

function wakeup() {
  // Zero level fragment wakes up
  // Make the minimum weight adjacent edge a branch edge
  let newBranchEdge = basicEdges.shift();
  branchEdges.push(newBranchEdge);
  level = 0;
  state = constants.FOUND;
  findCount = 0;
  // Send CONNECT message to the minimum weight adjacent edge
  let message = {
    source: id,
    type: constants.CONNECT,
    payload: {
      level
    }
  };
  sendMessage(clients[newBranchEdge], message);
}
