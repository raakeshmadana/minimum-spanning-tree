'use strict';
var id;
var neighbors;
var clients = {};
var net = require('net');
var _ = require('lodash');
const chalk = require('chalk');

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
tasks[constants.CHANGE_CORE] = onChangeCore;
tasks[constants.HALT] = onHalt;

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
          console.log(id, 'connected to neighbor', neighborID);
        });
      /*client.on('end', function(){
        console.log('Client is dis-connected!!');
      });*/
      clients[neighborID] = client;
    });
  } else if (msg['message'] === 'Start') {
    if (state === constants.SLEEPING) {
      wakeup();
    }
  }
});

function changeCore() {
  console.log(id, 'called changeCore');
  if (branchEdges.includes(bestEdge)) {
    // Send CHANGE_CORE on bestEdge
    // This propagates the CHANGE_CORE message to the node that found the MWOE
    let message = {
      source: id,
      type: constants.CHANGE_CORE,
    };
    sendMessage(clients[bestEdge], message);
  } else {
    // This is the node that found the MWOE
    // Send CONNECT message on bestEdge
    let message = {
      source: id,
      type: constants.CONNECT,
      payload: {
        level
      }
    };
    sendMessage(clients[bestEdge], message);

    // Move the bestEdge from basicEdges to branchEdges
    let index = basicEdges.indexOf(bestEdge);
    basicEdges.splice(index, 1);
    branchEdges.push(bestEdge);
  }
}

// Random delay for each message to simulate async network
function sleep(milliseconds) {
  let start = new Date().getTime();
  for (let i = 0; i < 1e7; i++) {
   if((new Date().getTime() - start) > milliseconds) {
     break;
   }
  }
}

function sendDelayedMessage(client, message) {
  let random = _.sample(allowedWait);
  setTimeout(() => {
      client.write(JSON.stringify(message));
      console.log('Node ID : ' , id, 'Current Branch Edges : ', branchEdges);
      console.log('Node ID : ' , id, 'Current Level : ', level);
      console.log('Node ID : ' , id, 'Fragment ID: ', fragmentId);
  }, random * 100);
}

function sendMessage(client, message) {
  let random = _.sample(allowedWait);
  sleep(random * 2000);
  client.write(JSON.stringify(message));
  console.log('Node ID : ' , id, 'Current Branch Edges : ', branchEdges);
  console.log('Node ID : ' , id, 'Current Level : ', level);
  console.log('Node ID : ' , id, 'Fragment ID: ', fragmentId);
}

function onAccept(source, payload) {
  console.log(chalk.green(id + 'received ACCEPT from' + source));
  testEdge = null;
  if (neighbors[source] < bestWeight) {
    bestEdge = parseInt(source);
    bestWeight = neighbors[source];
  }

  report();
}

function onChangeCore(source, payload) {
  console.log(chalk.magenta(id, ' received CHANGE_CORE from ' + source));
  changeCore();
}

function onConnect(source, {level: l}) {
  console.log(chalk.white.bold(id + ' received CONNECT from ' + source));
  if (state === constants.SLEEPING) {
    wakeup();
  }

  if (l < level) { // Absorb
    console.log(chalk.bgGreen.black.bold(id + ' ABSORBS ' + source));
    // Make the source edge a branch edge
    let index = basicEdges.indexOf(parseInt(source));
    basicEdges.splice(index, 1);
    branchEdges.push(parseInt(source));

    // Send INITIATE message on the source edge
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
      // The fragment to be absorbed gets added to the search of the MWOE
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
    console.log(chalk.bgGreen.black.bold(id + ' MERGES with ' + source));
    // Send INITIATE message on the source edge
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

function onHalt(source, payload) {
  console.log(chalk.red(id + ' received HALT from ' + source));

  // Send HALT message on all branchEdges except source
  branchEdges.filter(edge => edge !== source).forEach(edge => {
    let message = {
      source: id,
      type: constants.HALT,
    };
    sendMessage(clients[edge], message);
  });

  console.log(chalk.bgRed.black.bold('Node ' + id + ' HALTED'));
  console.log(chalk.bgYellow.black.bold('Node ' + id + '\'s FINAL BRANCH EDGES'),
    branchEdges);

  process.exit();
}

function onInitiate(source, {level: l, fragmentId: f, state: s}) {
  console.log(chalk.green(id + ' received INITIATE from ' + source));
  // Update state
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
  console.log(chalk.red(id + ' received REJECT from ' + source));
  // Move the edge from basicEdges to rejectedEdges
  if (basicEdges.includes(parseInt(source))) {
    let index = basicEdges.indexOf(parseInt(source));
    basicEdges.splice(index, 1);
    rejectedEdges.push(parseInt(source));
  }

  test();
}

function onReport(source, {bestWeight : w}) {
  console.log(chalk.yellow(id + ' received REPORT from ' + source));
  w = (w === 'infinity') ? Number.POSITIVE_INFINITY : w;

  if (parseInt(source) !== inBranch) {
    findCount--;

    if (w < bestWeight) {
      bestWeight = w;
      bestEdge = parseInt(source);
    }

    report();
  } else if (state === constants.FIND) {
    console.log(id, 'Delays REPORT from', source);
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
        // Send HALT message on all branchEdges except inBranch
        branchEdges.filter(edge => edge !== inBranch).forEach(edge => {
          let message = {
            source: id,
            type: constants.HALT,
          };
          sendMessage(clients[edge], message);
        });

        // Output branch edges
        console.log(chalk.bgRed.black.bold('CORE Node ' + id + ' HALTED'));
        console.log(
          chalk.bgYellow.black.bold('Node ' + id + '\'s FINAL BRANCH EDGES'),
          branchEdges);
        process.exit();
  }
}

function onTest(source, {level: l, fragmentId: f}) {
  console.log(chalk.white(id + ' received TEST from ' + source));
  if (state === constants.SLEEPING) {
    wakeup();
  }

  if (l > level) {
    console.log(id, 'delays TEST from', source);
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
    // Send ACCEPT message on the source edge
    let message = {
      source: id,
      type: constants.ACCEPT,
    };
    sendMessage(clients[source], message);
  } else {
    if (basicEdges.includes(parseInt(source))) {
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
}

function report() {
  console.log(id, 'called REPORT');
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
    sendMessage(clients[inBranch], message);
  }
}

function test() {
  console.log(id, 'called TEST');
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
