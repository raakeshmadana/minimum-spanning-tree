# asyncGHS
## Minimum-Weight Spanning Tree in Asynchronous Distibuted Networks
- Followed the [paper](https://www.cs.tau.ac.il/~afek/p66-gallager.pdf) by
  Gallagher, Humblet, and Spira.
- An enhanced version of the paper, prepared by Guy Flysher and Amir Rubenstein,
  was also used for better understanding. It can be found
[here](https://webcourse.cs.technion.ac.il/236357/Spring2005/ho/WCFiles/MST.pdf)

### Input to the master
- Number of processes
- A Unique ID (UID) for each process
- Weights of the edges as an adjacency matrix

The master on receiving this input spawns the worker processes. Each worker
process knows only about its neighbors. (All links are __bidirectional__)

### Output
- Core nodes' UIDs
- Each node's neighbors in the MST

### Run
- Install [Node.js](https://nodejs.org/en/download/)
- `npm install`
- `sudo node main.js connectivity.txt`
