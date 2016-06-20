"use strict";

var path = require('path');
var _ = require('lodash');
var exec = require('child_process').exec;
var fmtr = require('fmtr');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var fs = require('fs');
var log = require('ssi-logger');

module.exports = function DbTestUtil(options) {

    if (!(this instanceof DbTestUtil)) {
        return new DbTestUtil(options);
    }

    var daemons = []; // daemon process list (used to kill them when killLocalMySql() is called)

    options = _.defaultsDeep({}, options, {
        mysql_local_port: 3307,                 // default for production is 3306
        mysqld: 'mysqld',
        mysql: 'mysql',
        mysqladmin: 'mysqladmin',
        mysql_tzinfo_to_sql: 'mysql_tzinfo_to_sql',
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

    options.mysql_data_dir = path.resolve(options.mysql_data_dir);

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

        _.forEach([
            options.mysql_data_dir,
            options.mysql_data_dir + path.sep + 'data',
            options.mysql_data_dir + path.sep + 'tmp',
            options.mysql_data_dir + path.sep + 'slave_load_tmp',
            options.mysql_data_dir + path.sep + 'secure_file_priv',
            options.mysql_data_dir + path.sep + 'innodb_data_home',
            options.mysql_data_dir + path.sep + 'innodb_log_group_home',
        ], function (dir) {
            log('DEBUG', 'mkdir -p %s', dir);
            mkdirp.sync(dir);
        });

        var mysqld_args = _.reduce({
            'user': options.system_user,
            'basedir': options.mysql_base_dir,
            'datadir': options.mysql_data_dir + path.sep + 'data',
            'tmpdir': options.mysql_data_dir + path.sep + 'tmp',
            'slave-load-tmpdir': options.mysql_data_dir + path.sep + 'slave_load_tmp',
            'secure-file-priv': options.mysql_data_dir + path.sep + 'secure_file_priv',
            'innodb_data_home_dir': options.mysql_data_dir + path.sep + 'innodb_data_home',
            'innodb_log_group_home_dir': options.mysql_data_dir + path.sep + 'innodb_log_group_home',
            'port': options.mysql_local_port,
            'socket': options.mysql_socket,
            'pid-file': options.mysql_data_dir + path.sep + 'mysqld.pid'
        }, function (result, value, key) {
            return result + ' --' + key + '=' + value + ' ';
        }, '') + ' ' + options.mysqld_args;

        run([
            { command: fmtr('${mysqld} --initialize-insecure ' + mysqld_args + ' >  ${mysql_data_dir}/dbtestutil.out 2>&1', options) },   // install DB
            { command: fmtr('${mysqld} --daemonize           ' + mysqld_args + ' >> ${mysql_data_dir}/dbtestutil.out 2>&1', options), daemon: true },   // start mysqld
            { command: fmtr('${mysql_tzinfo_to_sql}  ${zoneinfo_dir} | ${mysql} --socket=${mysql_socket} ${mysql_dash_u} mysql', options) },   // load timezones
            { command: fmtr('${mysql} --socket=${mysql_socket} ${mysql_dash_u} < ${sql_file} >> ${mysql_data_dir}/dbtestutil.out 2>&1', options), skip: options.sql_file === null }    // execute user supplied SQL
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
            { command: fmtr('${mysql} --socket=${mysql_socket} ${mysql_dash_u} < ${sql_file} >> ${mysql_data_dir}/dbtestutil.out 2>&1', options), skip: options.sql_file === null },       // execute user supplied SQL
            { command: fmtr('${mysqladmin} --port=${mysql_local_port} --socket=${mysql_socket} ${mysql_dash_u} shutdown >> ${mysql_data_dir}/dbtestutil.out 2>&1', options) }
        ], function (err) {
            _.forEach(daemons, function (daemon) {
                log('DEBUG', 'Sending SIGTERM to pid=%s', daemon.pid);
                daemon.kill('SIGTERM');
            });
            daemons = [];
            callback(err);
        });

    };

    return this;
};
