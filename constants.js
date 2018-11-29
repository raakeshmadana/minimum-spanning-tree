'use strict';
// Possible Node States
const SLEEPING = 'SLEEPING';
const FIND = 'FIND';
const FOUND = 'FOUND';
// Message Types
const INITIATE = 'INITIATE';
const TEST = 'TEST';
const ACCEPT = 'ACCEPT';
const REJECT = 'REJECT';
const REPORT = 'REPORT';
const CHANGE_CORE = 'CHANGE_CORE';
const CONNECT = 'CONNECT';

module.exports = {
  SLEEPING,
  FIND,
  FOUND,
  INITIATE,
  TEST,
  ACCEPT,
  REJECT,
  REPORT,
  CHANGE_CORE,
  CONNECT
};
