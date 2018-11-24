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

const tasks = {};
tasks[constants.CONNECT] = onConnect;
tasks[constants.INITIATE] = onInitiate;
tasks[constants.TEST] = onTest;
tasks[constants.ACCEPT] = onAccept;
tasks[constants.REJECT] = onReject;
tasks[constants.REPORT] = onReport;
tasks[constants.CHANGE_CORE] = changeCore;

process.on('message', (message) => {
  let msg = JSON.parse(message);
  if (msg['message'] === 'Initiate') {
    id = parseInt(msg['id']);
    neighbors = msg['neighbor'];
    // Initially, all the edges are classified as basic edges
    basicEdges =
      Object.keys(neighbors).sort((a, b) => neighbors[a] - neighbors[b]);
    console.log(basicEdges);
    let server = net.createServer((conn) => {
      conn.on('end', function() {
        console.log('Sever is dis-connected!!');
      });
      conn.on('data', function(msg) {
        console.log(id, 'Server Received Msg!!');
        msg = JSON.parse(msg);
        console.log(msg);
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
  }, random * 100);
}

function onAccept(source, payload) {
  testEdge = null;
  if (neighbors[source] < bestWeight) {
    bestEdge = source;
    bestWeight = neighbors[source];
    report();
  }
}

function onConnect(source, {level: l}) {
  if (state === constants.SLEEPING) {
    wakeup();
  }

  if (l < level) { // Absorb
    branchEdges.push(source);
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
  } else if (basicEdges.includes(source)) {
    // Delay processing the message by placing it at the end of the queue
    // Not sure how to do this yet
  } else { // Merge
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
  inBranch = source;
  bestEdge = null;
  bestWeight = Number.MAX_SAFE_INTEGER;
  // Send INITIATE messages on each branch edge
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
  if (basicEdges.includes(source)) {
    let index = basicEdges.indexOf(source);
    basicEdges.splice(index, 1);
    rejectedEdges.push(source);
    test();
  }
}

function onReport(source, {bestWeight: w}) {
  if (source !== inBranch) {
    findCount--;
    if (w < bestWeight) {
      bestWeight = w;
      bestEdge = source;
      report();
    }
  } else if (state === FIND) {
    // Place message at the end of the queue
  } else if (w > bestWeight) {
    changeCore();
  } else if (w = bestWeight = Number.MAX_SAFE_INTEGER) {
    console.log('HALT');
    process.exit();
  }
}

function onTest(source, {level: l, fragmentId: f}) {
  if (state === constants.SLEEPING) {
    wakeup();
  }
  if (l > level) {
    // Place message at the end of the queue
  } else if (f !== fragmentId) {
    let message = {
      source: id,
      type: constants.ACCEPT,
    };
    sendMessage(clients[source], message);
  } else if (basicEdges.includes(source)) {
    let index = basicEdges.indexOf(source);
    basicEdges.splice(index, 1);
    rejectedEdges.push(source);
    if (testEdge !== source) {
      let message = {
        source: id,
        type: constants.REJECT
      };
      sendMessage(clients[source], message);
    } else {
      test();
    }
  }
}

function report() {
  if (findCount === 0 && testEdge === null) {
    // All REPORTS received and no basic edge left to test
    state = FOUND;
    let message = {
      source: id,
      type: REPORT,
      payload: {
        bestWeight
      }
    };
    // Send a REPORT back to the node that sent the INITIATE
    sendMessage(clients[inBranch], message);
  }
}

function test() {
  if (basicEdges.length > 0) {
    // Send a TEST message on the minimum weight basic edge
    testEdge = neighbors[basicEdges[0]];
    let message = {
      source: id,
      type: constants.TEST,
      payload: {
        level,
        fragmentId
      }
    };
    sendMessage(clients[basicEdges[0]], message);
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
