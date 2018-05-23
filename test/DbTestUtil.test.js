"use strict";

const DbTestUtil = require('../');
const _ = require('lodash');
const async = require('async');
const expect = require('expect.js');
const fs = require('fs');
const mysql = require('mysql');
const path = require('path');

const conf = JSON.parse(fs.readFileSync(path.join(__dirname, 'db.conf')).toString());

describe('DbTestUtil', function () {
    it('should be a constructor', function () {
        expect(DbTestUtil).to.be.a('function');
    });

    describe('createTestDb(connectionConfig, sqlFiles, callback)', function () {

        it('should callback with DBTESTUTIL_DATABASE_MISSING_SUFFIX if database does not end with the right prefix', function (done) {

            const dbTestUtil = new DbTestUtil({
                databaseMustEndWith: '_test',
            });

            async.each([
                'foo',
                '',
                'test_case',
            ], (testcase, callback) => {

                dbTestUtil.createTestDb({
                    database: testcase,
                }, [], (err) => {
                    expect(err).to.be.an(Error);
                    expect(err.name).to.be('DBTESTUTIL_DATABASE_MISSING_SUFFIX');
                    callback();
                });

            }, done);

        });

        it('should callback with DBTESTUTIL_HOST_BLACKLISTED if host is blacklisted', function (done) {

            const dbTestUtil = new DbTestUtil({
                databaseMustEndWith: '_test',
                hostBlacklist: ['localhost', '127.0.0.1', 'example.org'],
            });

            async.each([
                'localhost',
                '127.0.0.1',
                'example.org',
            ], (testcase, callback) => {

                dbTestUtil.createTestDb({
                    database: 'dbtestutil_1234_test',
                    host: testcase,
                }, [], (err) => {
                    expect(err).to.be.an(Error);
                    expect(err.name).to.be('DBTESTUTIL_HOST_BLACKLISTED');
                    callback();
                });

            }, done);

        });

        it('should callback with DBTESTUTIL_DB_CREATE if database with the same an already exists', function (done) {
            const dbTestUtil = new DbTestUtil();
            const database = DbTestUtil.makeDatabaseName('dbtestutil');
            dbTestUtil.createTestDb(_.defaultsDeep({}, conf, { database: database }), [], (err) => {
                expect(err).to.be(null);
                dbTestUtil.createTestDb(_.defaultsDeep({}, conf, { database: database }), [], (err) => {
                    expect(err).to.be.an(Error);
                    expect(err.name).to.be('DBTESTUTIL_DB_CREATE');
                    done();
                });
            });
        });

        it('should callback with DBTESTUTIL_MYSQL_CMD on bad SQL file', function (done) {
            const dbTestUtil = new DbTestUtil();
            dbTestUtil.createTestDb(_.defaultsDeep({}, conf, { database: DbTestUtil.makeDatabaseName('dbtestutil') }), [
                path.join(__dirname, 'schema.sql'),
                path.join(__dirname, 'corpus.sql'),
                path.join(__dirname, 'bad.sql'),
            ], (err) => {
                expect(err).to.be.an(Error);
                expect(err.name).to.be('DBTESTUTIL_MYSQL_CMD');
                done();
            });
        });

        it('should work', function (done) {
            const dbTestUtil = new DbTestUtil();
            const connectionConfig = _.defaultsDeep({}, conf, {
                database: DbTestUtil.makeDatabaseName('dbtestutil'),
            });

            dbTestUtil.createTestDb(connectionConfig, [ path.join(__dirname, 'schema.sql'), path.join(__dirname, 'corpus.sql') ], (err) => {
                expect(err).to.be(null);
                const conn = mysql.createConnection(connectionConfig);
                conn.query('SELECT * FROM messages ORDER BY message ASC;', (err, result) => {
                    conn.end();
                    if (err) {
                        done(err);
                    }
                    expect(result).to.eql([{ message: 'Bonjour' }, { message: 'Hello' }]);
                    done();
                });
            });
        });

    });

    describe('.makeDatabaseName(stem, suffix, separator)', function () {
        it('should generate a unique database name', function () {
            const a = DbTestUtil.makeDatabaseName('foobar');
            const b = DbTestUtil.makeDatabaseName('foobar');
            expect(a).to.match(/^foobar_[0-9a-f]{8}_test$/);
            expect(b).to.match(/^foobar_[0-9a-f]{8}_test$/);
            expect(a).not.to.equal(b);

            const c = DbTestUtil.makeDatabaseName('foobar', 'tst', '__');
            expect(c).to.match(/^foobar__[0-9a-f]{8}__tst$/);
        });
    });
});
