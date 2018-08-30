'use strict';

const _ = require('lodash');
const async = require('async');
const child_process = require('child_process');
const fs = require('fs');
const moment = require('moment');
const mysql = require('mysql');
const path = require('path');
const uuid = require('uuid');

class DbTestUtil {

    constructor(options) {
        this.options = _.defaultsDeep({}, options || {}, {
            mysql: 'mysql',
            databaseMustEndWith: '_test',
            hostBlacklist: [],
            charset: "utf8mb4",
            collate: "utf8mb4_unicode_520_ci",
       });
    }

    createTestDb(connectionConfig, sqlFiles, callback) {

        const readConfig = (filepath) => {
            let json;
            try {
                json = fs.readFileSync(filepath).toString();
            } catch (err) {
                json = '{}'; // ignore file not found
            }
            return JSON.parse(json); // don't catch this error -- let the user see it.
        };

        connectionConfig = _.defaultsDeep(
            connectionConfig,                                                                   // supplied config, modifies connectionConfig
            readConfig(path.join(process.env.HOME || `${path.sep}/root`, '.dbtestutil.conf')),  // /home/jdoe/.dbtestutil.conf
            readConfig(path.join(`${path.sep}usr`, 'local', 'etc', 'dbtestutil.conf')),         // /usr/local/etc/dbtestutil.conf
            readConfig(path.join(`${path.sep}etc`, 'dbtestutil.conf')),                         // /etc/dbtestutil.conf
            {                                                                                   // defaults
                user: 'root',
                password: '',
                host: 'localhost',
                port: 3306,
                database: '',
                multipleStatements: true,
                selfDestruct: 'PT6H',
                charset: this.options.collate, // mysqljs accpets either SQL-level "charset" or "collation" here. Pass collate as it's more specific.
            }
        );

        async.waterfall([

            /*
             * Preflight Checks
             */
            (callback) => {

                // The test suite MUST NOT run if there is no suffix (to avoid clobbering active databases)
                if (!connectionConfig.database.endsWith(this.options.databaseMustEndWith)) {
                    const missingSuffixError = new Error('database name missing test suffix');
                    missingSuffixError.name = 'DBTESTUTIL_DATABASE_MISSING_SUFFIX';
                    missingSuffixError.database = connectionConfig.database;
                    missingSuffixError.databaseMustEndWith = this.options.databaseMustEndWith;
                    return callback(missingSuffixError);
                }

                // The test suite should check to see if it's running against the prod server and refuse to run if it is for safety
                if (_.includes(this.options.hostBlacklist, connectionConfig.host)) {
                    const hostBlacklistedError = new Error('host must not appear in hostBlacklist');
                    hostBlacklistedError.name = 'DBTESTUTIL_HOST_BLACKLISTED';
                    hostBlacklistedError.host = connectionConfig.host;
                    hostBlacklistedError.hostBlacklist = this.options.hostBlacklist;
                    return callback(hostBlacklistedError);
                }

                callback();
            },

            /*
             * Create the database
             */
            (callback) => {

                const conn = mysql.createConnection(_.omit(connectionConfig, ['database']));
                conn.query('CREATE DATABASE ?? CHARACTER SET ?? COLLATE ??;', [ connectionConfig.database, this.options.charset, this.options.collate ], (err, result) => {
                    conn.end();
                    if (err) {
                        const dbCreateError = new Error('could not create database');
                        dbCreateError.name = 'DBTESTUTIL_DB_CREATE';
                        dbCreateError.inner = err;
                        return callback(dbCreateError);
                    }

                    callback();
                });
            },

            /*
             * Set Self Destruct -- do this *before* schema load so that if there is a load issue, the database still gets cleaned up.
             */
            (callback) => {
                if (!_.isString(connectionConfig.selfDestruct)) { // skip
                    return callback();
                }

                const conn = mysql.createConnection(connectionConfig);

                async.eachSeries([{
                    sql: 'CREATE EVENT ?? ON SCHEDULE AT ? DO DROP DATABASE ??',
                    values: [
                        `${connectionConfig.database}_self_destruct`,
                        moment().add(moment.duration(connectionConfig.selfDestruct)).toDate(),
                        connectionConfig.database,
                    ],
                }, {
                    sql: 'SET GLOBAL event_scheduler = ON',
                }], (query, callback) => {
                    conn.query(query, (err) => {
                        if (err) {
                            const dbEventSetupError = new Error('could not create event to self destruct database');
                            dbEventSetupError.name = 'DBTESTUTIL_DB_EVENT';
                            dbEventSetupError.database = connectionConfig.database;
                            dbEventSetupError.inner = err;
                            return callback(dbEventSetupError);
                        }
                        callback();
                    });
                }, (err) => {
                    conn.end();
                    callback(err);
                });
            },

            /*
             * Load SQL File(s)
             */
            (callback) => {
                async.eachSeries(sqlFiles, (sqlFile, callback) => {

                    const args = [
                        `--default-character-set=${this.options.charset}`,
                        '--user', connectionConfig.user,
                    ];

                    if (connectionConfig.socketPath) {          // when present, take priority over host/port config T3511
                        args.push('--socket');
                        args.push(connectionConfig.socketPath);
                    } else {
                        args.push('--host');
                        args.push(connectionConfig.host);
                        args.push('--port');
                        args.push(connectionConfig.port);
                    }

                    if (connectionConfig.password) {
                        args.push(`-p${connectionConfig.password}`);
                    }

                    args.push(connectionConfig.database);

                    const proc = child_process.spawn(this.options.mysql, args);

                    let stdout = '';
                    proc.stdout.on('data', (data) => stdout += data);

                    let stderr = '';
                    proc.stderr.on('data', (data) => stdout += data);

                    proc.on('close', (code) => {
                        if (code !== 0) {
                            const mysqlCommandError = new Error('problem executing mysql command');
                            mysqlCommandError.name = 'DBTESTUTIL_MYSQL_CMD';
                            mysqlCommandError.code = code;
                            mysqlCommandError.stdout = stdout;
                            mysqlCommandError.stderr = stderr;
                            mysqlCommandError.cmd = this.options.mysql;
                            mysqlCommandError.args = args;
                            return callback(mysqlCommandError);
                        }
                        callback();
                    });

                    fs.createReadStream(sqlFile).pipe(proc.stdin);

                }, callback);
            },


        ], callback);
    }

    static makeDatabaseName(stem, suffix, separator) {
        return [
            stem || 'dbtestutil',
            uuid.v1().split('-')[0],
            suffix || 'test'
        ].join(separator || '_');
    }
}

module.exports = DbTestUtil;
