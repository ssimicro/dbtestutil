# dbtestutil

Launches an isolated instance of MySQL on a separate TCP port and unix socket file.
It can execute a SQL script on start-up to create and populate a database with test data,
and it can execute a SQL script on shutdown to dump data to a file for further analysis.

## Installation

    npm install --save-dev dbtestutil

## Requirements

Versions of `dbtestutil` from `3.0.0` support MySQL 5.7 and later. Versions of `dbtestutil` below `3.0.0` support MySQL 5.6.

## API

### new DbTestUtil(options)

Instantiates a new DbTestUtil instance.

The `options` parameter can contain any of the following (defaults listed below):

* `mysql_host`: IP address or hostname to listen on
* `mysql_local_port`: TCP port for `mysqld` to listen on
* `mysql_socket`: path to unix socket file
* `mysqld`: path to `mysqld` binary
* `mysql`: path to `mysql` binary
* `mysqladmin`: path to `mysqladmin` binary
* `mysql_tzinfo_to_sql`: path to `mysql_tzinfo_to_sql` binary
* `mysql_base_dir`: MySQL's `basedir`
* `mysql_data_dir`: where to put the databases on the file system
* `zoneinfo_dir`: location of timezone files
* `mysql_settle_delay`: number of milliseconds to wait for `mysqld` to come up before proceeding with executing user supplied SQL
* `mysql_create_grant_tables`: controls whether grant tables should be created
* `mysqld_args`: additional arguments to pass to `mysqld`

Here are the default values:

    {
        "mysql_host": "127.0.0.1",
        "mysql_local_port": 3307,
        "mysql_socket": "/tmp/mysqltest.sock",
        "mysqld": "mysqld",
        "mysqladmin": "mysqladmin",
        "mysql": "mysql",
        "mysql_tzinfo_to_sql": "mysql_tzinfo_to_sql",
        "mysql_base_dir": "/usr/local",
        "mysql_data_dir": "./mysql-local",
        "zoneinfo_dir": "/usr/share/zoneinfo",
        "mysql_settle_delay": 3000,
        "mysql_create_grant_tables": false,
        "mysqld_args": ""
    }

### dbTestUtil.startLocalMySql([sql_file,] callback)

Creates `mysql_data_dir`, launches `mysqld`, loads timezone data, executes the contents of `sql_file` (if supplied), and calls `callback()`.

Parameters:

* `sql_file` - path to a file containing SQL to execute. Usually this file creates a database and schema. Optional.
* `callback` - called when the database is ready to be used or when a command failed.

### dbTestUtil.killLocalMySql([sql_file,] callback)

Executes the contents of `sql_file` (if supplied), sends the `SIGTERM` signal to `mysqld`, and calls `callback()`.

Parameters:

* `sql_file` - path to a file containing SQL to execute. Usually this file includes some SQL SELECT statements to dump the database. View the output in `dbSqlCmd.out` in `mysql_data_dir` (defaults to `./mysql-local`). Optional.
* `callback` - called when the database is ready to be used or when a command failed.

## Example

**test/myapp.test.js**
```
"use strict";

var expect = require('expect.js');
var fs = require('fs');
var path = require('path');
var mysql = require('mysql');
var nconf = require('nconf');
var log = require('ssi-logger');
var DbTestUtil = require('dbtestutil');
var MyApp = require('../');

// uncomment to display debug output from dbtestutil
// process.on('log', log.consoleTransport());

// load the database configuration.
var options = nconf.argv().env().file({ file: path.join(__dirname, 'myapp.conf') }).get();

var dbTestUtil = new DbTestUtil(options.db.test);

before(function (done) {
    this.timeout(30 * 1000); // 30 seconds (max)
    dbTestUtil.startLocalMySql(path.join(__dirname, 'myapp_load.sql'), done);
});

describe('MyApp', function () {
    // Point your application at the test instance and test away...
});

after(function (done) {
    this.timeout(30 * 1000); // 30 seconds (max)
    dbTestUtil.killLocalMySql(path.join(__dirname, 'myapp_dump.sql'), done);
});
```

**test/myapp_load.sql**
```
CREATE DATABASE `myapp`;

USE `myapp`;

CREATE TABLE somedata (
    message TEXT
);
```

**test/myapp_dump.sql**
```
USE `dbtestutil`;

SELECT '==== version info ==== ' AS ' ';
SELECT VERSION();

SELECT '==== somedata dump ==== ' AS ' ';
SELECT * FROM somedata;
```

## Tips

### Logging SQL Statements

Set the `mysqld_args` option to `--general_log=1 --general_log_file=sql.log` to enable logging of all SQL statements.
Logs end up in `${mysql_data_dir}/sql.log`.

### Debugging

Most commands executed by this module send their output to `${mysql_data_dir}/dbSqlCmd.out`. It's a good
first place to look for errors. Also, this module uses [ssi-logger](https://github.com/tcort/ssi-logger). To get
it to print debugging information to the console, install `ssi-logger` and add these two lines:

    var log = require('ssi-logger');
    process.on('log', log.consoleTransport());

## Testing

There is an automated test suite:

    npm test

It's known to pass on Mac OS X, Linux, and FreeBSD. Please report any failures via [issues](https://github.com/tcort/dbtestutil/issues).

## License

```
Copyright (C) 2015, 2016 SSi Micro, Ltd. and other contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
