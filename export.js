var https = require('https');
var async = require('async');
var querystring = require('querystring');
var _ = require('lodash');
var request = require('request');
var config = require('./config.json');

var
  endpoint = 'https://api.github.com',
  pageSize = 100,
  username = config.username,
  password = config.password,
  repos = config.repos,
  fields = config.fields,
  lastDays = config.lastDays,
  sinceDate = new Date(Date.now() - 86400 * lastDays * 1000),
  filterOptions = _.merge(config.filter, {
    since: sinceDate.toISOString()
  }),
  headers = {
    'User-Agent': username + ' - Github issue exporter',
    'Accept': 'application/vnd.github.v3+json'
  };

async.map(repos, function (repo, cb) {
  getIssues(repo, filterOptions, cb);
}, function (err, results) {
  var csv = '';

  results.forEach(function (issues, index) {
    var repo = repos[index];

    issues = issues.filter(function (issue) {
      // filter issues closed before specified date
      // they still might be returned by GitHub because of changes made to them
      if (Date.parse(issue.closed_at) < sinceDate) {
        return false;
      }

      // filter PRs
      if (issue.pull_request) {
        return false;
      }

      return true;
    });

    csv += exportToCsv(issues, fields, [repo]);
  });

  console.log(csv);
})

/**
 * @param {Array} records
 * @param {Array} fields
 * @param {Array} [prependData]
 * @return {String}
 */
function exportToCsv(records, fields, prependData) {
  prependData = prependData || [];

  var
    csvRecords,
    csv;

  csvRecords = records.map(function (record) {
    var csvRecord;
    csvRecord = _.pick(record, fields);
    csvRecord = _.values(csvRecord);
    csvRecord = prependData.concat(csvRecord);
    csvRecord = csvRecord.map(function (value) {
      if (value === null) return '""';
      value = value.replace('"', '\'');
      value = '"' + value + '"';
      return value;
    });

    return csvRecord.join(',');
  });

  csv = csvRecords.join('\n');
  if (csv) csv += '\n';
  return csv;
}

/**
 * @param {String} repo
 */
function getRepoEndpoint(repo) {
  return endpoint + '/repos/' + repo;
}

/**
 * @param {String} repo
 * @param {Object} [options]
 * @param {Function} cb
 */
function getIssues(repo, options, cb) {
  if (!cb) {
    cb = options;
    options = {};
  }

  var
    url = getRepoEndpoint(repo) + '/issues',
    urlOptions = _.clone(options),
    page = 0,
    issues = [],
    fetchedIssuesCount = 0;

  urlOptions.per_page = pageSize;

  async.doWhilst(function (cb) {
    urlOptions.page = ++page;
    var query = querystring.stringify(urlOptions);
    query = '?' + query || '';

    request({
      url: url + query,
      auth: {
        username: username,
        password: password
      },
      headers: headers
    }, function (err, res, body) {
      var fetchedIssues;
      if (err) return cb(err);
      if (res.statusCode === 200) {
        fetchedIssues = JSON.parse(body);
        fetchedIssuesCount = fetchedIssues.length;
        issues = issues.concat(fetchedIssues);
      }

      cb();
    });

  }, function () {
    return fetchedIssuesCount === pageSize;

  }, function (err) {
    cb(err, issues);
  });
}
