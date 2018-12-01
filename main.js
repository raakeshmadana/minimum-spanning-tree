'use strict';
const readline = require('readline');
const cp = require('child_process');
var numOfProcess; //variable contains the number of child processes
var lineNum; //current line number of the input file we are reading
var processArrConst; //An immutable array containing id's of all processes
var processArrVar; //Mutable array containing id's of all processes
//Dictionary containing info about each process. Keys will be id and neighbor
var processInfo = {};
var children = []; //arr of child processes forked by master

function connectToNeighbor() {
  let promiseArr = [];
  children.forEach((child) => {
    let dict = {};
    dict['message'] = 'Connect';
    /*
      Source: Stack Overflow
      Cause: Once child.send finishes then the callback should be called.
        To ensure serializability in asynch, the callback was introduced.
    */
    /*
      Structure of dictionary:
        {
          'message' : 'Connect'
        }
    */
    child.send(JSON.stringify(dict), () => {
      promiseArr.push(new Promise((resolve, reject) => {
        return resolve();
      }));
    });
  });
  return Promise.all(promiseArr);
}

function initializeChild() {
  let promiseArr = [];
  Object.keys(processInfo).forEach((processID, idx) => {
    let dict = {};
    dict['message'] = 'Initiate';
    dict['id'] = processID;
    dict['neighbor'] = processInfo[processID];
    /*
      Source: Stack Overflow
      Cause: Once child.send finishes then the callback should be called.
        To ensure serializability in asynch, the callback was introduced.
    */
    /*
      Structure of dictionary:
        {
          'message': 'Initiate',
          'id': <id of process>,
          'neighbor': <dictionary containing two keys: neighborID and edge
                        weight, members of dict are all neighbors of process>
    */
    children[idx].send(JSON.stringify(dict), () => {
      promiseArr.push(new Promise((resolve, reject) => {
        return resolve();
      }));
    });
  });
  return Promise.all(promiseArr);
}

function processInput(line, lineNum) {
  switch (lineNum) {
    case 1:
      /*First line to file contains number of processes*/
      numOfProcess = parseInt(line);
      break;
    case 2:
      /*Information about process ID*/
      processArrConst = line.split(' ');
      processArrVar = line.split(' ');
      processArrConst.forEach((ele) => {
        processInfo[ele] = {};
      });
      break;
    default:
      /*Manipulating matrix containing edge weight.*/
      let process = processArrVar.shift();
      line.split(' ').forEach((wt, idx) => {
        if (wt!=='-1.0') {
          processInfo[process][processArrConst[idx]] = parseFloat(wt);
        }
      });
  }
}

function readInput() {
  /*Simple function to read input from connectivity.js*/
  const reader =  readline.createInterface({
    input : require('fs').createReadStream(process.argv[2])
  });
  lineNum = 1;
  reader.on('line', (input) => {
    processInput(input, lineNum++);
  });
  /*As we reach the end of file, resolve promise and return to main function.*/
  return new Promise((resolve, reject) => {
    reader.on('close', () => {
      resolve(processInfo);
    });

  });

}

const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
};

function startAsynchGHS() {
  let promiseArr = [];
  children.forEach((child) => {
    let dict = {};
    dict['message'] = 'Start';
    /*
      Source: Stack Overflow
      Cause: Once child.send finishes then the callback should be called.
        To ensure serializability in asynch, the callback was introduced.
    */
    /*
      Structure of dictionary:
        {
          'message' : 'Start'
        }
    */
    child.send(JSON.stringify(dict), () => {
      promiseArr.push(new Promise((resolve, reject) => {
        return resolve();
      }));
    });
  });
  return Promise.all(promiseArr);
}

async function main() {
  /*
    Steps:
      * Read input file.
      * Fork Processes.
      * Start server on each process (port being its id).
      * Initial client on all neighbot ID's.
      * Start AsynchGHS.
  */
  //* Read input file.
  await readInput();
  console.log('Process Information has been read from file!!');
  let processCount = numOfProcess;
  //* Fork Processes.
  while (processCount!==0){
    children.push(cp.fork('./worker'));
    processCount -= 1;
  }
  console.log('Forked children!!');
  //* Start server on each process (port being its id).
  await initializeChild();
  //console.log('Process initialized!!');
  //console.log('Going to sleep!!');
  /*
    Instead of getting acks from clients (thats its done with the current step),
    sending process to sleep.
    Ensures serializability.
    Quick fix - can be improved.
  */
  await sleep(numOfProcess * 250);
  //* Initial client on all neighbot ID's.
  await connectToNeighbor();
  //console.log('Process connected to neighbor');
  //console.log('Going to sleep!!');
  /*
    Instead of getting acks from clients (thats its done with the current step),
    sending process to sleep.
    Ensures serializability.
    Quick fix - can be improved.
  */
  await sleep(numOfProcess * 250);
  console.log('All connections established');
  console.log('Start AsynchGHS');
  //console.log('Going to sleep!!');
  //* Start AsynchGHS.
  await startAsynchGHS();
  return;
}
/*Enter here!!*/
main();
