'use strict';
const http = require('http')
const url = require('url')
const lib = require('http-helper-functions')

const MAPWIHORGID = '/bWFwd2lk-'

function getOrgID(req, res, orgName, callback){
  lib.sendInternalRequestThen(req, res, '/orgs;'+orgName, 'GET', null, {}, function(clientRes) {
    lib.getClientResponseBody(clientRes, function(body) {
      if (clientRes.statusCode !== 200)
        lib.internalError(res, `unable to retrieve orgID. statusCode = ${clientRes.statusCode} url: /orgs;${orgName} body: ${body}`)
      else {
          var org = JSON.parse(body)
          callback(`${org.kvmRing}:${org.kvmKeyspace}:${org.tenantID}`)
      }
    })
  })
}

function resolveOrgThenForward(req, res, orgName, remainder, buffer) {
  function sendInternal(url, body) {
    lib.sendInternalRequestThen(req, res, url, req.method, body, req.headers, function (clientRes) {
      lib.getClientResponseBuffer(clientRes, function(buffer) {
        delete clientRes.headers.connection
        delete clientRes.headers['content-length']
        lib.respond(req, res, clientRes.statusCode, clientRes.headers, buffer)
      })
    })
  }  
  getOrgID(req, res, orgName, function(orgID) {
    var url = `${MAPWIHORGID}${orgID}${remainder}` 
    if (buffer)
      sendInternal(url, buffer)
    else
      lib.getServerPostBuffer(req, function(buffer) {
        sendInternal(url, buffer)
      })
  })
}

function verifyMapOrg(req, res, map, callback) {
  if (typeof map.org != 'string')
    return lib.badRequest(res, `invalid JSON: "org" property not set or not a string: ${map.org}`)
  var parsedOrg = url.parse(map.org)
  if (!parsedOrg.pathname.startsWith('/v1/o/'))
    return lib.badRequest(res, `org URL path must begin with /v1/o/ : ${map.org}`)
  var pathSplit = parsedOrg.pathname.split('/')
  if (pathSplit.length != 4)
    return lib.badRequest(res, `org URL path must be of form  /v1/o/{orgname} : ${map.org}`)
  callback(pathSplit[pathSplit.length - 1])
}

function requestHandler(req, res) {
  if (req.url == '/maps') {
    if (req.method == 'POST')
      lib.getServerPostBuffer(req, function(buffer) {
        var map = JSON.parse(buffer)
        verifyMapOrg(req, res, map, function(orgName) {
          resolveOrgThenForward(req, res, orgName, '', buffer)
        })
      })
    else
      lib.methodNotAllowed(req, res, ['POST'])
  }
  else {
    var req_url = url.parse(req.url);
    if (req_url.pathname.startsWith('/maps;')) { /* url of form /maps;{org-name}:{map-name}... */
      let splitPath = req_url.pathname.split('/')
      let orgName = splitPath[1].substring('maps;'.length).split(':')[0]
      resolveOrgThenForward(req, res, orgName, req_url.pathname.substring(`/maps;${orgName}`.length))
    } else
      lib.notFound(req, res)
  }
}

var port = process.env.PORT;
http.createServer(requestHandler).listen(port, function() {
  console.log(`server is listening on ${port}`);
});
