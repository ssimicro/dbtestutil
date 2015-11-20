"use strict";

var expect = require('expect.js');
var fs = require('fs');
var path = require('path');
var mysql = require('mysql');
var nconf = require('nconf');
var log = require('ssi-logger');
var DbTestUtil = require('../');

// uncomment to display debug output
// process.on('log', log.consoleTransport());

// load the database configuration.
var options = nconf.argv().env().file({ file: path.join(__dirname, 'db.conf') }).get();

var dbTestUtil = new DbTestUtil(options.db.test);

before(function (done) {
    this.timeout(60 * 1000); // 60 seconds (max)
    dbTestUtil.startLocalMySql(path.join(__dirname, 'test_load.sql'), done);
});

describe('DbTestUtil', function () {
    it('should have started a local MySQL instance', function (done) {
        var pool = mysql.createPool({
            socketPath: options.db.test.mysql_socket || '/tmp/mysqltest.sock',
            database: 'dbtestutil'
        });

        // test it by running a query
        pool.query('INSERT INTO messages SET ?', [ { message: 'Hello, World!' }, { message: 'This is a test.' }], done);
    });
});

after(function (done) {
    this.timeout(60 * 1000); // 60 seconds (max)
    dbTestUtil.killLocalMySql(path.join(__dirname, 'test_dump.sql'), done);    
});
