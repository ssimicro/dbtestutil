"use strict";

var _ = require('lodash');
var exec = require('child_process').exec;
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var fs = require('fs');
var log = require('ssi-logger');

module.exports = function DbTestUtil(options) {

    if (!(this instanceof DbTestUtil)) {
        return new DbTestUtil(options);
    }

    // awesome string formatting: fmt('${some_property}', someObject);
    var fmt = function fmt(str, obj) {
        return _.template(str, { interpolate: /\$\{([^\}]+)\}/gm })(obj);
    };

    var daemons = []; // daemon process list (used to kill them when killLocalMySql() is called)

    options = _.defaults({}, options, {
        mysql_local_port: 3307,                 // default for production is 3306
        mysqld: 'mysqld',
        mysql: 'mysql',
        mysql_tzinfo_to_sql: 'mysql_tzinfo_to_sql',
        mysql_install_db: 'mysql_install_db',
        mysql_base_dir: '/usr/local',
        mysql_data_dir: './mysql-local',
        mysql_settle_delay: 3000,
        mysql_host: '127.0.0.1',
        mysql_dash_u: options.mysql_create_grant_tables ? ' -u root ' : '',
        mysql_socket: '/tmp/mysqltest.sock',
        mysql_create_grant_tables: false,
        mysqld_args: '',
        zoneinfo_dir: '/usr/share/zoneinfo',
        system_user: process.env.USER
    });

    if (!options.mysql_create_grant_tables) {
        options.mysqld_args += ' --skip-grant-tables ';
    }

    log('DEBUG', 'DbTestUtil Configured', options);

    function run(cmds, callback) {
        var cmd = cmds.shift();
        if (!cmd) {
            callback();
            return;
        } else if (cmd.skip) {
            run(cmds, callback);
            return;
        }

        log('DEBUG', cmd.command);
        var p = exec(cmd.command);
        var down = function () { p.kill('SIGTERM'); };
        process.on('exit', down);
        p.on('exit', function (err) {
            process.removeListener('exit', down);
            if (!cmd.daemon) {
                setTimeout(function () {
                    if (err) {
                        callback(err);
                        return;
                    }
                    run(cmds, callback);
                }, 1000);
            } else {
                daemons = _.without(daemons, p);
            }
        });
        if (cmd.daemon) {
            daemons.push(p);
            setTimeout(function () {
                run(cmds, callback);
            }, options.mysql_settle_delay);
        }
    }

    this.startLocalMySql = function startLocalMySql(sql_file, callback) {

        if (arguments.length === 1) { // no sql_file supplied
            callback = sql_file;
            sql_file = null;
        }

        options.sql_file = sql_file;

        log('DEBUG', 'Starting local MySQL Instance');

        log('DEBUG', 'rm -rf %s', options.mysql_data_dir);
        rimraf.sync(options.mysql_data_dir);

        log('DEBUG', 'mkdir -p %s', options.mysql_data_dir);
        mkdirp.sync(options.mysql_data_dir);

        run([
            { command: fmt('${mysql_install_db} --datadir=${mysql_data_dir} --basedir=${mysql_base_dir} --user=${system_user} >> ${mysql_data_dir}/dbSqlCmd.out 2>&1', options) },   // install DB
            { command: fmt('${mysqld} --datadir=${mysql_data_dir} --port=${mysql_local_port} --socket=${mysql_socket} ${mysqld_args} --pid-file=${mysql_data_dir}/mysqld.pid --user=${system_user}', options), daemon: true },   // start mysqld
            { command: fmt('${mysql_tzinfo_to_sql}  ${zoneinfo_dir} | ${mysql} --socket=${mysql_socket} ${mysql_dash_u} mysql', options) },   // load timezones
            { command: fmt('${mysql} --socket=${mysql_socket} ${mysql_dash_u} < ${sql_file} >> ${mysql_data_dir}/dbSqlCmd.out 2>&1', options), skip: options.sql_file === null }    // execute user supplied SQL
        ], callback);
    };


    this.killLocalMySql = function killLocalMySql(sql_file, callback) {

        if (arguments.length === 1) { // no sql_file supplied
            callback = sql_file;
            sql_file = null;
        }

        options.sql_file = sql_file;

        log('DEBUG', 'Stopping local MySQL Instance');

        run([
            { command: fmt('${mysql} --socket=${mysql_socket} ${mysql_dash_u} < ${sql_file} >> ${mysql_data_dir}/dbSqlCmd.out 2>&1', options), skip: options.sql_file === null }       // execute user supplied SQL
        ], function (err) {
            _.each(daemons, function (daemon) {
                log('DEBUG', 'Sending SIGTERM to pid=%s', daemon.pid);
                daemon.kill('SIGTERM');
            });
            daemons = [];
            callback(err);
        });

    };

    return this;
};
