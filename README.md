# dbtestutil

Creates a self-destructing test database for use in test suites from one or more SQL files (e.g. schema + test corpus).
Includes several safety checks to prevent polluting production databases.

## Installation

    npm install --save-dev dbtestutil

## Requirements

The MySQL client binary `mysql` must be available.

## Rules of the Road

To use this module, your project must conform to the following standards in order to be a good citizen and minimize the chance of wrecking a production database:

* All databases must be fully described in schema files. They should go in the project's `db` directory.
 * the schema file MUST NOT include DROP IF nor REPLACE IF clauses. This prevents damage to existing databases if something goes wrong.
 * the schema file MUST NOT identify the database (no `CREATE DATABASE foo`, no `USE foo`, no `GRANT ALL ON foo TO ...`, etc).
 * a separate file can be created for creating the database and users, but it must not be processed by `dbtestutil`.
* All test suites SHOULD provide a `hostBlacklist` containing production hostnames and IPs.
* All test suites MUST provide a test database name. It SHOULD be unique (or have a high probability of being unique) and easily identifiable as a test database. Use `DbTestUtil.makeDatabaseName(projectName)` if you are unsure.
* All projects SHOULD default to test parameters and server configs.

The above conventions should keep you safe. This module tries to prevent database catastrophes in the following ways:

* The module will refuse to perform if the database name does not end in the magic suffix (which defaults to `_test`) to avoid clobbering active databases.
* The module will refuse to perform if the database host appears in the `hostBlacklist` to avoid running tests on production database servers. As mentioned above, it is highly recommended that a `hostBlacklist` be provided.
* The module will refuse to perform if the named database already exists to avoid clobbering an existing database.

## API

### new DbTestUtil(options)

Instantiates a new DbTestUtil instance.

The `options` parameter can contain any of the following (defaults listed below):

* `mysql`: name of `mysql` binary or path to `mysql` binary
* `databaseMustEndWith`: a suffix to look for so that we know for sure we didn't accidentally pass a production database name to this module.
* `hostBlacklist`: a list of hosts which are disallowed. Include all production database hostnames and IPs in here so that we don't accidentally point this module at the production database server.

Here are the default values:

    {
        "mysql": "mysql",
        "databaseMustEndWith": "_test",
        "hostBlacklist": [],
    }

### createTestDb(connectionConfig, sqlFiles, callback)

The `connectionConfig` parameter can contain any of the following (defaults listed below):

* `user`: a database username which corresponds to a user with database create and event create permissions.
* `password`: the `user`'s password.
* `socketPath`: socket file to use for connection. If set, the connection will happen via the socket and the `host` and `port` are ignored.
* `host`: hostname of the database server. Must not appear in `hostBlacklist`.
* `port`: TCP port for the database server.
* `database`: name of the database to create. Must not already exist. Must have expected suffix (`databaseMustEndWith`).
* `selfDestruct`: an ISO8601 duration indicating when the database should be automatically removed via the event scheduler. Set to `false` to preserve the database indefinitely.

Here are the default values:

    {
        "user": "root",
        "password": "",
        "host": "localhost",
        "port": 3306,
        "database": "", // no default, must be supplied by caller
        "selfDestruct": "P1W"
    }

The `sqlFiles` parameter is an array of 0 or more SQL files to load into the database. Usually this will include a schema file and a test corpus.

The `callback` function accepts `(err)` which is either `null`/`undefined` OR an instance of `Error`. Here are some of the errors that one might see...

* `DBTESTUTIL_DATABASE_MISSING_SUFFIX` - the name of the database does not end with the `databaseMustEndWith` option passed to the constructor.
* `DBTESTUTIL_HOST_BLACKLISTED` - if `host` is present in the `hostBlacklist` option passed to the constructor.
* `DBTESTUTIL_DB_CREATE` - if there is a problem creating the database (auth/autz error, duplicate, etc).
* `DBTESTUTIL_EVENT_CREATE` - if there is a problem creating the self-destruct event.
* `DBTESTUTIL_MYSQL_CMD` - if there is a problem loading the SQL file(s).

### static makeDatabaseName(stem, suffix = "test", separator = "_")

Generates a database name like `foobar_3813f39a_test`.

## Example

```
const dbTestUtil = new DbTestUtil();
const connectionConfig = {
    database: DbTestUtil.makeDatabaseName('dbtestutil'),
};

dbTestUtil.createTestDb(connectionConfig, [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, 'corpus.sql'),
], (err) => {
    if (err) {
        ...
    }
    const conn = mysql.createConnection(connectionConfig);

    ... use conn in test suite ...
});
```

## Testing

There is an automated test suite:

    npm test

Depending on your setup, you may need to create `test/db.conf`. This is a JSON file
which will contain the `connectionConfig` object (documented above) which is passed
to `createTestDb()`.

## License

See [LICENSE.md](https://github.com/ssimicro/dbtestutil/blob/master/LICENSE.md)
